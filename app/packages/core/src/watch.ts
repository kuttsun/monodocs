import { existsSync, statSync, watch as fsWatch, type FSWatcher } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { buildSite, resolveOutputs } from "./build.js";
import { loadConfig } from "./config.js";
import type { BuildOptions, BuildResult } from "./types.js";
import { t } from "./messages.js";
import { MonodocsError } from "./diagnostics.js";

/** 連続したファイルイベントをまとめる待ち時間。 */
const DEBOUNCE_MS = 150;

export type WatchCallbacks = {
  /** ビルド成功時（初回ビルドを含む）。 */
  onRebuild?: (result: BuildResult) => void;
  /** ビルド失敗時。監視は継続する。 */
  onError?: (error: Error) => void;
};

export type WatchHandle = {
  /** 監視を停止する。 */
  close: () => void;
};

/**
 * 入力ディレクトリと設定ファイルを監視し、変更のたびに再ビルドする。
 *
 * 初回に 1 度ビルドし、その後 `fs.watch`（可能なら recursive）でソース・設定の
 * 変更を検出してデバウンス付きで再ビルドする。ビルドの結果・エラーは
 * コールバックで通知し、監視自体は止めない。
 */
export async function watchSite(
  options: BuildOptions = {},
  callbacks: WatchCallbacks = {},
): Promise<WatchHandle> {
  const cwd = process.cwd();
  const config = await loadConfig(options, cwd);
  const inputPath = isAbsolute(config.inputDir) ? config.inputDir : resolve(cwd, config.inputDir);
  // 生成物への書き込みでイベントが発火し再ビルドが連鎖するのを避けるため、
  // 出力ファイルへの変更イベントは無視する（出力が入力配下にある場合の対策）。
  // both では html / pdf の両方が生成されるため、resolveOutputs で実際の出力集合を得る
  // （config.outputFile は both のときディレクトリになりうる）。
  const outputs = resolveOutputs(config, cwd);
  const outputFiles = new Set<string>([outputs.html, outputs.pdf].filter((p): p is string => !!p));

  // 入力が無ければ監視を確立できないため、ここで失敗させる
  // （CLI 側で「Watching…」と表示したまま無反応になるのを防ぐ）。
  if (!existsSync(inputPath)) {
    throw new MonodocsError("input/not-found", t("build.inputNotFound", { path: config.inputDir }));
  }
  const inputIsFile = statSync(inputPath).isFile();

  let timer: ReturnType<typeof setTimeout> | null = null;
  let building = false;
  let queued = false;

  async function rebuild(): Promise<void> {
    // ビルド中の変更は 1 回分だけ後続に積む（連打を 1 回にまとめる）。
    if (building) {
      queued = true;
      return;
    }
    building = true;
    try {
      // 監視先の更新はビルドより先に行う。設定でテーマを差し替えた直後は新テーマが
      // まだ壊れていてビルドが失敗しうるが、その修正を拾えなければテーマ制作に使えない。
      await syncThemeWatch();
      const result = await buildSite(options);
      callbacks.onRebuild?.(result);
    } catch (error) {
      callbacks.onError?.(error as Error);
    } finally {
      building = false;
      if (queued) {
        queued = false;
        void rebuild();
      }
    }
  }

  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void rebuild();
    }, DEBOUNCE_MS);
  }

  /**
   * baseDir 配下で発生したファイルイベントを処理する listener を作る。
   * `only` を渡すと、その名前のファイルの変更だけを通す（単一ファイル入力のとき、
   * 同じディレクトリにある他のファイルはこの監視の関心事ではない）。
   */
  function makeListener(
    baseDir: string,
    only?: string,
  ): (event: string, filename: string | Buffer | null) => void {
    return (_event, filename) => {
      // 出力ファイル自身への書き込みは無視（自己再ビルドループ防止）。
      if (filename) {
        const name = filename.toString();
        const changed = resolve(baseDir, name);
        if (outputFiles.has(changed)) return;
        // 名前が分かる場合だけ絞り込む。分からない環境では取りこぼすより再ビルドする。
        if (only !== undefined && name !== only) return;
      }
      schedule();
    };
  }

  const watchers = new Set<FSWatcher>();
  /** 監視を開始する。確立できない場合は例外を投げる（recursive は非対応時にフォールバック）。 */
  function startWatch(
    target: string,
    baseDir: string,
    recursive: boolean,
    only?: string,
  ): FSWatcher {
    try {
      const watcher = fsWatch(target, { recursive }, makeListener(baseDir, only));
      watchers.add(watcher);
      return watcher;
    } catch (error) {
      // 一部環境は recursive 非対応。トップレベルのみ監視へフォールバックする。
      if (recursive) return startWatch(target, baseDir, false, only);
      throw error;
    }
  }

  // カスタムテーマ（絶対パス指定）のディレクトリ監視。テーマ制作中は style.css / app.js の
  // 変更をそのままプレビューへ反映したいため。組み込みテーマは実行ファイルに同梱されるので
  // 対象外。設定でテーマを変更できるので、監視対象は再ビルドのたびに見直す。
  let themeWatcher: FSWatcher | null = null;
  let watchedTheme: string | null = null;

  async function syncThemeWatch(): Promise<void> {
    let theme: string;
    try {
      theme = (await loadConfig(options, cwd)).theme;
    } catch {
      // 設定が一時的に壊れている場合は現在の監視を維持する（次の再ビルドで見直す）。
      return;
    }
    const target = isAbsolute(theme) && existsSync(theme) ? theme : null;
    if (target === watchedTheme) return;

    if (themeWatcher) {
      themeWatcher.close();
      watchers.delete(themeWatcher);
      themeWatcher = null;
    }
    watchedTheme = target;
    if (!target) return;
    try {
      themeWatcher = startWatch(target, target, true);
    } catch (error) {
      // テーマ監視は best-effort。失敗しても入力と設定の監視は続ける。
      callbacks.onError?.(error as Error);
    }
  }

  // 入力の監視は必須。確立できなければ watchSite ごと失敗させる。
  //
  // A single-file input is watched through its directory rather than directly. `fs.watch` follows
  // the inode, and an editor that saves by writing a temporary file and renaming it over the
  // original leaves the watcher holding the replaced inode: the first save arrives and every one
  // after it is silent. Watching the directory and filtering by name survives that.
  if (inputIsFile) {
    const parent = dirname(inputPath);
    startWatch(parent, parent, false, basename(inputPath));
  } else {
    startWatch(inputPath, inputPath, true);
  }
  // 設定ファイルの監視は best-effort（失敗しても入力監視は継続する）。
  if (config.configFilePath && existsSync(config.configFilePath)) {
    try {
      startWatch(config.configFilePath, dirname(config.configFilePath), false);
    } catch (error) {
      callbacks.onError?.(error as Error);
    }
  }
  await syncThemeWatch();

  // 初回ビルド。
  await rebuild();

  return {
    close() {
      if (timer) clearTimeout(timer);
      for (const w of watchers) w.close();
    },
  };
}

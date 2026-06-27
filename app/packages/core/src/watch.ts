import { existsSync, watch as fsWatch, type FSWatcher } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { buildSite } from "./build.js";
import { loadConfig } from "./config.js";
import type { BuildOptions, BuildResult } from "./types.js";

/** 既定の設定ファイル名（CLI / 設定読み込みと揃える）。 */
const DEFAULT_CONFIG_FILE = "single-docs.config.yml";
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
  const inputDir = isAbsolute(config.inputDir) ? config.inputDir : resolve(cwd, config.inputDir);
  const configPath = resolve(cwd, options.configFile ?? DEFAULT_CONFIG_FILE);
  // 生成物への書き込みでイベントが発火し再ビルドが連鎖するのを避けるため、
  // 出力ファイルへの変更イベントは無視する（出力が入力配下にある場合の対策）。
  const outputFile = isAbsolute(config.outputFile)
    ? config.outputFile
    : resolve(cwd, config.outputFile);

  // 入力ディレクトリが無ければ監視を確立できないため、ここで失敗させる
  // （CLI 側で「Watching…」と表示したまま無反応になるのを防ぐ）。
  if (!existsSync(inputDir)) {
    throw new Error(`Input directory not found: ${config.inputDir}`);
  }

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

  /** baseDir 配下で発生したファイルイベントを処理する listener を作る。 */
  function makeListener(
    baseDir: string,
  ): (event: string, filename: string | Buffer | null) => void {
    return (_event, filename) => {
      // 出力ファイル自身への書き込みは無視（自己再ビルドループ防止）。
      if (filename) {
        const changed = resolve(baseDir, filename.toString());
        if (changed === outputFile) return;
      }
      schedule();
    };
  }

  const watchers: FSWatcher[] = [];
  /** 監視を開始する。確立できない場合は例外を投げる（recursive は非対応時にフォールバック）。 */
  function startWatch(target: string, baseDir: string, recursive: boolean): void {
    try {
      watchers.push(fsWatch(target, { recursive }, makeListener(baseDir)));
    } catch (error) {
      // 一部環境は recursive 非対応。トップレベルのみ監視へフォールバックする。
      if (recursive) {
        startWatch(target, baseDir, false);
        return;
      }
      throw error;
    }
  }

  // 入力ディレクトリの監視は必須。確立できなければ watchSite ごと失敗させる。
  startWatch(inputDir, inputDir, true);
  // 設定ファイルの監視は best-effort（失敗しても入力監視は継続する）。
  if (existsSync(configPath)) {
    try {
      startWatch(configPath, dirname(configPath), false);
    } catch (error) {
      callbacks.onError?.(error as Error);
    }
  }

  // 初回ビルド。
  await rebuild();

  return {
    close() {
      if (timer) clearTimeout(timer);
      for (const w of watchers) w.close();
    },
  };
}

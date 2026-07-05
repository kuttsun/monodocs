import { existsSync } from "node:fs";

/**
 * ヘッドレスブラウザ（`puppeteer-core` + システム Chromium）の共通起動処理。
 * Mermaid pre-render（{@link file://./mermaidPrerender.ts}）と PDF 出力
 * （{@link file://./renderPdf.ts}）で共有する。`puppeteer-core` は optionalDependency の
 * ため型に依存せず最小 shape で扱い、動的 import する。
 */

/** Chromium の実行パス候補（`PUPPETEER_EXECUTABLE_PATH` が無いとき順に探索）。 */
const CHROMIUM_CANDIDATES = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
];

/**
 * ヘッドレスブラウザの**環境／セットアップ**エラー（`puppeteer-core` 不在・Chromium 不在・
 * ブラウザ起動失敗）。図／ページ単位の描画エラーと区別し、ビルドを止める（fail fast）ための
 * 基底型。Mermaid pre-render の {@link file://./mermaidPrerender.ts MermaidPrerenderSetupError}
 * はこれを継承する。
 */
export class BrowserSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserSetupError";
  }
}

// puppeteer-core は optionalDependency のため、型に依存せず最小 shape で扱う。
export interface PageLike {
  setContent(html: string, options?: { waitUntil?: string | string[] }): Promise<void>;
  addScriptTag(opts: { content: string }): Promise<unknown>;
  evaluate(fn: string): Promise<unknown>;
  waitForFunction(
    fn: string,
    options?: { timeout?: number; polling?: string | number },
  ): Promise<unknown>;
  pdf(options: Record<string, unknown>): Promise<Uint8Array>;
}
export interface BrowserLike {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}
interface PuppeteerLike {
  launch(opts: { headless: boolean; executablePath: string; args: string[] }): Promise<BrowserLike>;
}

/** Chromium の実行パスを解決する。見つからなければ {@link BrowserSetupError} を投げる。 */
export function resolveChromiumPath(): string {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (fromEnv) return fromEnv;
  const found = CHROMIUM_CANDIDATES.find((p) => existsSync(p));
  if (found) return found;
  throw new BrowserSetupError(
    "ヘッドレスブラウザには Chromium が必要です。PUPPETEER_EXECUTABLE_PATH を設定するか、" +
      "Chromium をインストールしてください（開発用 Docker では Dockerfile.dev を参照）。",
  );
}

async function importPuppeteer(): Promise<PuppeteerLike> {
  let mod: unknown;
  try {
    mod = await import("puppeteer-core");
  } catch {
    throw new BrowserSetupError(
      "ヘッドレスブラウザには puppeteer-core が必要です。`pnpm add puppeteer-core` で追加して" +
        "ください（node_modules を同梱しないバンドル版 CLI＝単一 .cjs / 単一実行ファイルでは" +
        "利用できません。パッケージインストール版を使ってください）。",
    );
  }
  return ((mod as { default?: PuppeteerLike }).default ?? (mod as PuppeteerLike)) as PuppeteerLike;
}

/**
 * Chromium をヘッドレス起動する。`puppeteer-core` / Chromium 不在・起動失敗時は
 * {@link BrowserSetupError} を投げる（fail fast）。ブラウザの close は呼び出し側の責務。
 */
export async function launchBrowser(): Promise<BrowserLike> {
  const puppeteer = await importPuppeteer();
  // resolveChromiumPath は BrowserSetupError を投げる（try の外で fail fast）。
  const executablePath = resolveChromiumPath();
  try {
    return await puppeteer.launch({
      headless: true,
      executablePath,
      // Docker/CI では root 実行のため sandbox を無効化する（信頼できる入力前提）。
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  } catch (error) {
    throw new BrowserSetupError(
      `ヘッドレスブラウザの起動に失敗しました: ${(error as Error).message}`,
    );
  }
}

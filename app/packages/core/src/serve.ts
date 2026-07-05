import { createServer, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { loadConfig } from "./config.js";
import { resolveOutputs } from "./build.js";
import { watchSite, type WatchHandle } from "./watch.js";
import type { BuildOptions, BuildResult } from "./types.js";

/** ライブリロード用の SSE エンドポイント。 */
const LIVE_RELOAD_PATH = "/__monodocs-livereload";
const DEFAULT_PORT = 4173;
const DEFAULT_HOST = "127.0.0.1";

export type ServeOptions = BuildOptions & {
  port?: number;
  host?: string;
};

export type ServeCallbacks = {
  /** 再ビルド成功時（初回ビルドを含む）。 */
  onRebuild?: (result: BuildResult) => void;
  /** 再ビルド失敗時。 */
  onError?: (error: Error) => void;
};

export type ServeHandle = {
  url: string;
  port: number;
  host: string;
  close: () => Promise<void>;
};

/** ブラウザ側で SSE に接続し、reload 通知で再読み込みする小さなスクリプト。 */
function liveReloadScript(): string {
  return (
    `<script>(function(){` +
    `try{` +
    `var es=new EventSource(${JSON.stringify(LIVE_RELOAD_PATH)});` +
    `es.onmessage=function(e){if(e.data==="reload")location.reload();};` +
    `}catch(err){}` +
    `})();</script>`
  );
}

/** 生成 HTML の </body> 直前にライブリロードスクリプトを差し込む。 */
function injectLiveReload(html: string): string {
  const script = liveReloadScript();
  const idx = html.lastIndexOf("</body>");
  return idx === -1 ? html + script : html.slice(0, idx) + script + html.slice(idx);
}

/**
 * ドキュメントをビルドしてローカル HTTP サーバーで配信し、変更を監視して
 * ライブリロードする。サーバー停止用のハンドルを返す。
 */
export async function serveSite(
  options: ServeOptions = {},
  callbacks: ServeCallbacks = {},
): Promise<ServeHandle> {
  const cwd = process.cwd();
  // serve はプレビュー用途なので、設定が pdf / both でも HTML を配信する（PDF を毎回
  // 生成しない）。HTML の出力先を決め、その場所へ format=html で固定ビルドさせる。
  let outputFile: string;
  if (options.outputFile) {
    // 明示 -o は HTML ファイルとして尊重する（serve は HTML を配信するため）。
    outputFile = isAbsolute(options.outputFile)
      ? options.outputFile
      : resolve(cwd, options.outputFile);
  } else {
    // -o 未指定なら設定どおりに解決し、出力パスの意味（both のディレクトリ扱い等）を保つ。
    // both は resolved.html（例: dist/manual.html）、pdf は PDF と同じ場所の manual.html を使う。
    const baseConfig = await loadConfig(options, cwd);
    const resolved = resolveOutputs(baseConfig, cwd);
    outputFile = resolved.html ?? join(resolved.pdf ? dirname(resolved.pdf) : cwd, "manual.html");
  }
  // 実ビルドは HTML に固定し、上で決めた場所へ出力させる（pdf / both でも Chromium 不使用）。
  const serveOptions: ServeOptions = { ...options, format: "html", outputFile };

  const port = options.port ?? DEFAULT_PORT;
  const host = options.host ?? DEFAULT_HOST;

  let html = "";
  const clients = new Set<ServerResponse>();

  async function reload(): Promise<void> {
    html = injectLiveReload(await readFile(outputFile, "utf8"));
  }

  function broadcastReload(): void {
    for (const res of clients) res.write("data: reload\n\n");
  }

  // 監視 + 再ビルド。初回ビルドは watchSite 内で完了する。serveOptions（format 固定）で
  // ビルドさせることで、pdf / both 設定でも HTML のみを生成・配信する。
  const watcher: WatchHandle = await watchSite(serveOptions, {
    onRebuild: (result) => {
      void reload().then(broadcastReload);
      callbacks.onRebuild?.(result);
    },
    onError: (error) => callbacks.onError?.(error),
  });

  // 初回 HTML を確実に読み込んでからサーバーを起動する。
  await reload();

  const server: Server = createServer((req, res) => {
    if (req.url === LIVE_RELOAD_PATH) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("retry: 1000\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;

  return {
    url: `http://${host}:${actualPort}/`,
    port: actualPort,
    host,
    async close() {
      watcher.close();
      for (const res of clients) res.end();
      clients.clear();
      await new Promise<void>((res) => server.close(() => res()));
    },
  };
}

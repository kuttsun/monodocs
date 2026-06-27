import { createServer, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { loadConfig } from "./config.js";
import { watchSite, type WatchHandle } from "./watch.js";
import type { BuildOptions, BuildResult } from "./types.js";

/** ライブリロード用の SSE エンドポイント。 */
const LIVE_RELOAD_PATH = "/__single-docs-livereload";
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
  const config = await loadConfig(options, cwd);
  const outputFile = isAbsolute(config.outputFile)
    ? config.outputFile
    : resolve(cwd, config.outputFile);

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

  // 監視 + 再ビルド。初回ビルドは watchSite 内で完了する。
  const watcher: WatchHandle = await watchSite(options, {
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

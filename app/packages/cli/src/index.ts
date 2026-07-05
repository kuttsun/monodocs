#!/usr/bin/env node
import { spawn } from "node:child_process";
import { Command } from "commander";
import { buildSite, serveSite, validateSite, watchSite, type OutputFormat } from "@monodocs/core";

/** 既定のブラウザで URL を開く（プラットフォーム別。失敗しても致命的ではない）。 */
function openBrowser(url: string): void {
  const platform = process.platform;
  const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => {
      console.warn(`warning: could not open browser (${command}).`);
    });
    child.unref();
  } catch {
    console.warn("warning: could not open browser.");
  }
}

/** ビルド結果の警告とサマリを標準出力へ表示する共通処理。 */
function reportBuild(result: { pages: number; outputs: string[]; warnings: string[] }): void {
  for (const warning of result.warnings) {
    console.warn(`warning: ${warning}`);
  }
  console.log(`✓ Generated ${result.pages} page(s) -> ${result.outputs.join(", ")}`);
}

const program = new Command();

program
  .name("monodocs")
  .description("複数の Markdown / AsciiDoc から単一 HTML / PDF を生成する")
  .version("0.0.0");

program
  .command("build")
  .description("ドキュメントをビルドして単一 HTML / PDF を生成する")
  .argument("[input]", "入力ディレクトリ（既定: ./docs）")
  .option(
    "-o, --output <path>",
    "出力先（html: ファイル / pdf: ファイル / both: ディレクトリ。既定: ./dist/manual.html）",
  )
  .option("-c, --config <file>", "設定ファイル（既定: monodocs.config.yml があれば使用）")
  .option("-f, --format <format>", "出力形式 html | pdf | both（既定: html）")
  .action(
    async (
      input: string | undefined,
      options: { output?: string; config?: string; format?: string },
    ) => {
      try {
        const result = await buildSite({
          inputDir: input,
          outputFile: options.output,
          configFile: options.config,
          format: options.format as OutputFormat | undefined,
        });
        reportBuild(result);
      } catch (error) {
        console.error(`error: ${(error as Error).message}`);
        process.exitCode = 1;
      }
    },
  );

program
  .command("watch")
  .description("入力・設定ファイルの変更を監視して再ビルドする")
  .argument("[input]", "入力ディレクトリ（既定: ./docs）")
  .option("-o, --output <file>", "出力ファイル（既定: ./dist/manual.html）")
  .option("-c, --config <file>", "設定ファイル（既定: monodocs.config.yml があれば使用）")
  .action(async (input: string | undefined, options: { output?: string; config?: string }) => {
    const opts = { inputDir: input, outputFile: options.output, configFile: options.config };
    try {
      await watchSite(opts, {
        onRebuild: reportBuild,
        onError: (error) => console.error(`error: ${error.message}`),
      });
      console.log("Watching for changes… (Ctrl+C to stop)");
    } catch (error) {
      console.error(`error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  });

program
  .command("serve")
  .description("ローカルサーバーで配信し、変更を監視してライブリロードする")
  .argument("[input]", "入力ディレクトリ（既定: ./docs）")
  .option("-o, --output <file>", "出力ファイル（既定: ./dist/manual.html）")
  .option("-c, --config <file>", "設定ファイル（既定: monodocs.config.yml があれば使用）")
  .option("-p, --port <port>", "ポート番号（既定: 4173）", (v) => Number(v))
  .option("-H, --host <host>", "ホスト（既定: 127.0.0.1）")
  .option("--open", "起動時に既定のブラウザで開く")
  .action(
    async (
      input: string | undefined,
      options: {
        output?: string;
        config?: string;
        port?: number;
        host?: string;
        open?: boolean;
      },
    ) => {
      try {
        const handle = await serveSite(
          {
            inputDir: input,
            outputFile: options.output,
            configFile: options.config,
            port: options.port,
            host: options.host,
          },
          {
            onRebuild: (result) => {
              for (const warning of result.warnings) console.warn(`warning: ${warning}`);
              console.log(`✓ Rebuilt ${result.pages} page(s)`);
            },
            onError: (error) => console.error(`error: ${error.message}`),
          },
        );
        console.log(`Serving at ${handle.url} (Ctrl+C to stop)`);
        if (options.open) openBrowser(handle.url);
        process.on("SIGINT", () => {
          void handle.close().then(() => process.exit(0));
        });
      } catch (error) {
        console.error(`error: ${(error as Error).message}`);
        process.exitCode = 1;
      }
    },
  );

program
  .command("validate")
  .description("リンク切れ・画像欠落・タイトル欠落などを検出する（出力は書き出さない）")
  .argument("[input]", "入力ディレクトリ（既定: ./docs）")
  .option("-c, --config <file>", "設定ファイル（既定: monodocs.config.yml があれば使用）")
  .action(async (input: string | undefined, options: { config?: string }) => {
    const result = await validateSite({ inputDir: input, configFile: options.config });
    for (const error of result.errors) console.error(`error: ${error}`);
    for (const warning of result.warnings) console.warn(`warning: ${warning}`);

    const total = result.errors.length + result.warnings.length;
    if (total === 0) {
      console.log(`✓ No issues found (${result.pages} page(s)).`);
      return;
    }
    console.error(
      `✗ ${result.errors.length} error(s), ${result.warnings.length} warning(s) in ${result.pages} page(s).`,
    );
    process.exitCode = 1;
  });

// トップレベル await は使わない（単一実行ファイル化のため CJS バンドルにする都合）。
program.parseAsync(process.argv).catch((error) => {
  console.error(`error: ${(error as Error).message}`);
  process.exit(1);
});

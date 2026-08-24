#!/usr/bin/env node
import { spawn } from "node:child_process";
import { Command, CommanderError } from "commander";
import {
  buildSite,
  type Diagnostic,
  initSite,
  MESSAGE_LANGS,
  resolveMessageLang,
  serveSite,
  setMessageLang,
  t,
  type MessageKey,
  validateSite,
  watchSite,
  type OutputFormat,
} from "@monodocs/core";
import packageJson from "../package.json" with { type: "json" };
import { REPORT_FORMATS, renderReport, resolveReportFormat } from "./report.js";

declare const __MONODOCS_VERSION__: string;

// The published CJS bundle replaces this constant at build time. The unbundled
// development entry point reads the same package manifest as its fallback.
const CLI_VERSION =
  typeof __MONODOCS_VERSION__ === "string" ? __MONODOCS_VERSION__ : packageJson.version;

/**
 * メッセージ言語を、Commander が引数を解釈する前に確定させる。
 *
 * `--help` の文言も、引数の解釈中に出るエラーも、この時点ではもう決まっていないといけない。
 * Commander の action まで待つと、`monodocs --lang ja --help` が英語のヘルプを出してしまう。
 * そのため argv を自分で先読みする。`LANG` / `LC_ALL` は意図的に見ない（ビルドログが、
 * それを作ったマシンに依存しないようにするため）。
 */
function applyMessageLang(argv: string[]): void {
  let flag: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    // `--` から先はすべて位置引数。読み続けると、`-- --lang=fr` のような名前の入力
    // ディレクトリを言語指定と取り違える。
    if (arg === "--") break;
    // 値の無い `--lang` は「空で指定された」。既定へ落とさず拒否させる。
    if (arg === "--lang") flag = argv[i + 1] ?? "";
    else if (arg?.startsWith("--lang=")) flag = arg.slice("--lang=".length);
  }
  try {
    setMessageLang(resolveMessageLang({ flag, env: process.env.MONODOCS_LANG }));
  } catch (error) {
    // Commander が引数を読む前なので、その入口には乗らない。ここで monodocs のエラーとして
    // 出して終える。素通しにすると Node のスタックトレースになり、対応する値も読み取れない。
    printError((error as Error).message);
    process.exit(1);
  }
}

/** 既定のブラウザで URL を開く（プラットフォーム別。失敗しても致命的ではない）。 */
function openBrowser(url: string): void {
  const platform = process.platform;
  const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => {
      printWarning(t("cli.browserOpenFailed", { command }));
    });
    child.unref();
  } catch {
    printWarning(t("cli.browserOpenFailedNoCommand"));
  }
}

function printWarning(message: string): void {
  console.warn(t("cli.warningPrefix", { message }));
}

function printError(message: string): void {
  console.error(t("cli.errorPrefix", { message }));
}

/** ビルド結果の警告とサマリを標準出力へ表示する共通処理。 */
function reportBuild(result: { pages: number; outputs: string[]; warnings: Diagnostic[] }): void {
  for (const warning of result.warnings) printWarning(warning.message);
  console.log(t("cli.generated", { pages: result.pages, outputs: result.outputs.join(", ") }));
}

applyMessageLang(process.argv);

const program = new Command();

/**
 * Commander が自前で生成する見出しとオプション説明も同じカタログを通す。
 * 説明文だけ訳して `Usage:` / `Options:` / `Commands:` を英語のまま残すと、
 * どちらの言語でもないヘルプ画面になる。
 */
program.configureHelp({
  styleTitle: (title) => {
    const map: Record<string, string> = {
      "Usage:": t("cli.help.usage"),
      "Options:": t("cli.help.options"),
      "Commands:": t("cli.help.commands"),
      "Arguments:": t("cli.help.arguments"),
    };
    return map[title] ?? title;
  },
});

program
  .name("monodocs")
  .description(t("cli.description"))
  .version(CLI_VERSION, "-V, --version", t("cli.help.versionOption"))
  .helpOption("-h, --help", t("cli.help.helpOption"))
  .option("--lang <lang>", t("cli.opt.lang", { supported: MESSAGE_LANGS.join(" | ") }))
  // Commander が自前で足す help サブコマンドの説明も、既定のままでは英語で残る。
  .helpCommand("help [command]", t("cli.help.helpCommand"));

// First in the list because it is the first command run: it produces the configuration and the
// page every other command then works on.
program
  .command("init")
  .description(t("cli.init.description"))
  .helpOption("-h, --help", t("cli.help.helpOption"))
  .action(async () => {
    try {
      const result = await initSite();
      console.log(t("cli.created", { files: result.created.join(", ") }));
    } catch (error) {
      printError((error as Error).message);
      process.exitCode = 1;
    }
  });

program
  .command("build")
  .description(t("cli.build.description"))
  .argument("[input]", t("cli.arg.input"))
  .option("-o, --output <path>", t("cli.build.opt.output"))
  .option("-c, --config <file>", t("cli.opt.config"))
  .option("-f, --format <format>", t("cli.build.opt.format"))
  .helpOption("-h, --help", t("cli.help.helpOption"))
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
          generatorVersion: CLI_VERSION,
        });
        reportBuild(result);
      } catch (error) {
        printError((error as Error).message);
        process.exitCode = 1;
      }
    },
  );

program
  .command("watch")
  .description(t("cli.watch.description"))
  .argument("[input]", t("cli.arg.input"))
  .option("-o, --output <file>", t("cli.watch.opt.output"))
  .option("-c, --config <file>", t("cli.opt.config"))
  .helpOption("-h, --help", t("cli.help.helpOption"))
  .action(async (input: string | undefined, options: { output?: string; config?: string }) => {
    const opts = {
      inputDir: input,
      outputFile: options.output,
      configFile: options.config,
      generatorVersion: CLI_VERSION,
    };
    try {
      await watchSite(opts, {
        onRebuild: reportBuild,
        onError: (error) => printError(error.message),
      });
      console.log(t("cli.watching"));
    } catch (error) {
      printError((error as Error).message);
      process.exitCode = 1;
    }
  });

program
  .command("serve")
  .description(t("cli.serve.description"))
  .argument("[input]", t("cli.arg.input"))
  .option("-o, --output <file>", t("cli.watch.opt.output"))
  .option("-c, --config <file>", t("cli.opt.config"))
  .option("-p, --port <port>", t("cli.serve.opt.port"), (v) => Number(v))
  .option("-H, --host <host>", t("cli.serve.opt.host"))
  .option("--open", t("cli.serve.opt.open"))
  .helpOption("-h, --help", t("cli.help.helpOption"))
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
            generatorVersion: CLI_VERSION,
          },
          {
            onRebuild: (result) => {
              for (const warning of result.warnings) printWarning(warning.message);
              console.log(t("cli.rebuilt", { pages: result.pages }));
            },
            onError: (error) => printError(error.message),
          },
        );
        console.log(t("cli.serving", { url: handle.url }));
        if (options.open) openBrowser(handle.url);
        process.on("SIGINT", () => {
          void handle.close().then(() => process.exit(0));
        });
      } catch (error) {
        printError((error as Error).message);
        process.exitCode = 1;
      }
    },
  );

program
  .command("validate")
  .description(t("cli.validate.description"))
  .argument("[input]", t("cli.arg.input"))
  .option("-c, --config <file>", t("cli.opt.config"))
  .option(
    "--format <format>",
    t("cli.validate.opt.format", { supported: REPORT_FORMATS.join(" | ") }),
  )
  .option("--strict", t("cli.validate.opt.strict"))
  .helpOption("-h, --help", t("cli.help.helpOption"))
  .action(
    async (
      input: string | undefined,
      options: { config?: string; format?: string; strict?: boolean },
    ) => {
      const format = resolveReportFormat(options.format);
      const result = await validateSite({ inputDir: input, configFile: options.config });
      // The same exit code in either format: an error fails the command, and a warning fails it
      // only under `--strict`.
      const report = renderReport(result, format, { strict: options.strict === true });
      for (const line of report.lines) {
        if (line.channel === "out") console.log(line.text);
        else if (line.channel === "warn") console.warn(line.text);
        else console.error(line.text);
      }
      if (report.failed) process.exitCode = 1;
    },
  );

/**
 * Commander 自身が出す解析エラーを訳す。
 *
 * 見出しを差し替えるだけでは足りない。綴りを間違えたオプション名を打つのは日常的で、そのとき
 * 出るのは Commander の英語のメッセージである。既定では Commander がその場で `process.exit` を
 * 呼ぶので、下の `.catch()` にも届かない。`exitOverride` で捕まえて訳す。
 *
 * 訳すのは実際に当たる 4 つに絞る。文言の中の対象名（オプション名・コマンド名）は引用符から
 * 取り出す。Commander が付ける候補提示のような、こちらが組み立て直せない部分を持つものは、
 * Commander の文言のまま出す（訳したふりをして情報を削るより読める）。
 */
const COMMANDER_MESSAGES: Record<string, MessageKey> = {
  "commander.unknownOption": "cli.unknownOption",
  "commander.unknownCommand": "cli.unknownCommand",
  "commander.missingArgument": "cli.missingArgument",
  "commander.optionMissingArgument": "cli.optionMissingArgument",
};

function handleCommanderError(error: CommanderError): never {
  // help と version は失敗ではない。Commander は同じ経路でこれらも投げる。
  if (error.exitCode === 0) process.exit(0);
  const key = COMMANDER_MESSAGES[error.code];
  const target = /'([^']*)'/.exec(error.message)?.[1];
  printError(key && target !== undefined ? t(key, { value: target }) : error.message);
  process.exit(error.exitCode || 1);
}

for (const command of [program, ...program.commands]) command.exitOverride();

// トップレベル await は使わない（単一実行ファイル化のため CJS バンドルにする都合）。
program.parseAsync(process.argv).catch((error) => {
  if (error instanceof CommanderError) handleCommanderError(error);
  printError((error as Error).message);
  process.exit(1);
});

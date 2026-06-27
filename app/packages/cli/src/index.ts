#!/usr/bin/env node
import { Command } from "commander";
import { buildSite, validateSite, type OutputFormat } from "@single-docs/core";

const program = new Command();

program
  .name("single-docs")
  .description("複数の Markdown / AsciiDoc から単一 HTML / PDF を生成する")
  .version("0.0.0");

program
  .command("build")
  .description("ドキュメントをビルドして単一 HTML を生成する")
  .argument("[input]", "入力ディレクトリ（既定: ./docs）")
  .option("-o, --output <file>", "出力ファイル（既定: ./dist/manual.html）")
  .option("-c, --config <file>", "設定ファイル（既定: single-docs.config.yml があれば使用）")
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
        for (const warning of result.warnings) {
          console.warn(`warning: ${warning}`);
        }
        console.log(`✓ Generated ${result.pages} page(s) -> ${result.outputs.join(", ")}`);
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
  .option("-c, --config <file>", "設定ファイル（既定: single-docs.config.yml があれば使用）")
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

await program.parseAsync(process.argv);

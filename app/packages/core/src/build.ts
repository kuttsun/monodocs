import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import type { BuildOptions, BuildResult, SourceFormat } from "./types.js";
import { loadConfig } from "./config.js";
import { scanSourceFiles } from "./scan.js";
import { markdownRenderer } from "./sources/markdown/renderer.js";
import { asciidocRenderer } from "./sources/asciidoc/renderer.js";
import { buildPages } from "./pipeline/buildPages.js";
import { buildSidebar } from "./pipeline/buildSidebar.js";
import { renderSingleHtml } from "./pipeline/renderSingleHtml.js";

/**
 * 入力ディレクトリの Markdown / AsciiDoc 群から単一 HTML を生成する。
 *
 * v0.2 では Markdown / AsciiDoc 混在の単一 HTML 出力に対応。
 * PDF（--format pdf/both）は v0.5 で対応予定。
 */
export async function buildSite(options: BuildOptions = {}): Promise<BuildResult> {
  const cwd = process.cwd();
  const config = await loadConfig(options, cwd);

  if (config.format !== "html") {
    throw new Error(`Output format "${config.format}" is not supported yet (only "html" in v0.1).`);
  }

  const inputDir = isAbsolute(config.inputDir) ? config.inputDir : resolve(cwd, config.inputDir);
  if (!existsSync(inputDir)) {
    throw new Error(`Input directory not found: ${config.inputDir}`);
  }

  const extensions = new Map<string, SourceFormat>();
  for (const ext of config.markdownExtensions) extensions.set(ext.toLowerCase(), "markdown");
  for (const ext of config.asciidocExtensions) extensions.set(ext.toLowerCase(), "asciidoc");

  const sources = await scanSourceFiles(inputDir, { extensions, exclude: config.exclude });
  if (sources.length === 0) {
    throw new Error(`No Markdown / AsciiDoc files found in: ${config.inputDir}`);
  }

  const { pages, warnings } = await buildPages(sources, [markdownRenderer, asciidocRenderer]);
  const sidebar = buildSidebar(pages);
  const html = await renderSingleHtml({
    title: config.title,
    pages,
    sidebar,
    theme: config.theme,
  });

  const outputFile = isAbsolute(config.outputFile)
    ? config.outputFile
    : resolve(cwd, config.outputFile);
  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, html, "utf8");

  return { outputs: [outputFile], pages: pages.length, warnings };
}

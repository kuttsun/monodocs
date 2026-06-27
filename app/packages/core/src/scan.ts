import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import picomatch from "picomatch";
import type { SourceFile } from "./types.js";
import { detectFormat } from "./sources/detectFormat.js";

export type ScanOptions = {
  /** 収集対象の拡張子（小文字・ドット付き）。 */
  extensions: string[];
  /** 除外する glob パターン（入力ディレクトリからの相対パスに対して評価）。 */
  exclude: string[];
};

/**
 * 入力ディレクトリを再帰的に走査し、対象のソースファイルを収集する。
 * 内容も読み込み、相対パス順にソートして返す。
 */
export async function scanSourceFiles(
  inputDir: string,
  options: ScanOptions,
): Promise<SourceFile[]> {
  const isExcluded = picomatch(options.exclude, { dot: true });
  const extensions = new Set(options.extensions.map((e) => e.toLowerCase()));
  const files: SourceFile[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!extensions.has(extname(entry.name).toLowerCase())) continue;

      const rel = relative(inputDir, abs).split(sep).join("/");
      if (isExcluded(rel)) continue;

      const format = detectFormat(rel);
      if (format === undefined) continue;

      const raw = await readFile(abs, "utf8");
      files.push({ absolutePath: abs, relativePath: rel, raw, format });
    }
  }

  await walk(inputDir);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return files;
}

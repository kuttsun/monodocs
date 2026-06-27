import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import picomatch from "picomatch";
import type { SourceFile, SourceFormat } from "./types.js";

export type ScanOptions = {
  /** 拡張子（小文字・ドット付き）→ ソース形式 のマップ。設定値から構築する。 */
  extensions: Map<string, SourceFormat>;
  /** 除外する glob パターン（入力ディレクトリからの相対パスに対して評価）。 */
  exclude: string[];
};

/**
 * 入力ディレクトリを再帰的に走査し、対象のソースファイルを収集する。
 * 形式は設定由来の拡張子マップで判定するため、カスタム拡張子にも追従する。
 * 内容も読み込み、相対パス順にソートして返す。
 */
export async function scanSourceFiles(
  inputDir: string,
  options: ScanOptions,
): Promise<SourceFile[]> {
  const isExcluded = picomatch(options.exclude, { dot: true });
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

      const format = options.extensions.get(extname(entry.name).toLowerCase());
      if (format === undefined) continue;

      const rel = relative(inputDir, abs).split(sep).join("/");
      if (isExcluded(rel)) continue;

      const raw = await readFile(abs, "utf8");
      files.push({ absolutePath: abs, relativePath: rel, raw, format });
    }
  }

  await walk(inputDir);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return files;
}

import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join, relative, sep } from "node:path";
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

/**
 * Read one named file as a source, or return undefined when no renderer claims its extension.
 *
 * The exclude patterns are deliberately not applied: naming a file is an explicit choice, so a
 * `_draft.md` passed on the command line is a page the reader asked for, not a fragment. Its own
 * name becomes the relative path, which makes the directory holding it the base for links and
 * images — the same relationship a scanned file has to the input directory.
 */
export async function readSourceFile(
  filePath: string,
  options: { extensions: Map<string, SourceFormat> },
): Promise<SourceFile | undefined> {
  const format = options.extensions.get(extname(filePath).toLowerCase());
  if (format === undefined) return undefined;
  const raw = await readFile(filePath, "utf8");
  return { absolutePath: filePath, relativePath: basename(filePath), raw, format };
}

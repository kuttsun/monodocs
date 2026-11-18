import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join, relative, sep } from "node:path";
import picomatch from "picomatch";
import type { SourceFile, SourceFormat } from "./types.js";

export type ScanOptions = {
  /** 拡張子（小文字・ドット付き）→ ソース形式 のマップ。設定値から構築する。 */
  extensions: Map<string, SourceFormat>;
  /**
   * Glob patterns selecting what may become a page, relative to the root. Empty means everything
   * under the root is a candidate, which is what every configuration before v0.12 got.
   */
  include?: string[];
  /** 除外する glob パターン（ルートからの相対パスに対して評価）。 */
  exclude: string[];
};

/**
 * Whether a directory can still contain a match for one of the include patterns.
 *
 * Without this, `root: "."` on a repository walks `node_modules` and `.git` to decide that nothing
 * in them was wanted. `picomatch.scan` gives each pattern its static prefix — `docs` for `docs/**`,
 * the whole path for a literal `README.md`, and nothing for `**\/*.md` — and a directory is worth
 * entering when it is on the same branch as one of those prefixes.
 */
function makeDirectoryFilter(include: string[]): (relativeDir: string) => boolean {
  // An author's escape (`docs/\\(old\\)`) stays in the base `picomatch.scan` gives; the directory
  // it names is the one without it.
  const bases = include.map((pattern) => picomatch.scan(pattern).base.replace(/\\(.)/g, "$1"));
  // A pattern with no static prefix can match at any depth, so nothing can be pruned.
  if (bases.some((base) => base === "")) return () => true;
  return (dir) =>
    bases.some((base) => base === dir || base.startsWith(`${dir}/`) || dir.startsWith(`${base}/`));
}

/**
 * `pattern` with `(`, `)`, and `+` escaped. A character the author already escaped is left alone; a
 * backslash escaped itself (`\\\\(`) protects nothing, so the `(` after it is escaped too.
 */
export function literalGroups(pattern: string): string {
  return pattern.replace(/\\[\s\S]|[()+]/g, (found) => (found.length === 2 ? found : `\\${found}`));
}

/**
 * ルートディレクトリを再帰的に走査し、対象のソースファイルを収集する。
 * 形式は設定由来の拡張子マップで判定するため、カスタム拡張子にも追従する。
 * 内容も読み込み、相対パス順にソートして返す。
 *
 * `include` は候補を選び、`exclude` はそこから引く。順序は include → exclude で固定である
 * （12.5）。下書きを除くパターンが、たまたまそれを含む include に打ち消されないため。
 */
export async function scanSourceFiles(
  rootDir: string,
  options: ScanOptions,
): Promise<SourceFile[]> {
  const include = options.include ?? [];
  // Extended globs are off: picomatch compiles one such as `+(*a)` into a regular expression that
  // backtracks exponentially on a crafted path (GHSA-fc5q-39xc-vjpf, unpatched in 4.0.7), and
  // monodocs never documented them. `(`, `)`, and `+` are matched as the characters they are, as a
  // file name such as `notes (old).md` needs, which also keeps a group written plainly from taking a
  // `+`. Braces still expand (`*.{md,adoc}`). This closes the advisory's path, not every slow glob:
  // a long run of stars is slow too, and the configuration is trusted input, as the documents are
  // (docs/architecture.md, Security Boundaries).
  const glob = { dot: true, noextglob: true };
  const isIncluded = include.length > 0 ? picomatch(include.map(literalGroups), glob) : undefined;
  const mayHoldMatch = include.length > 0 ? makeDirectoryFilter(include) : undefined;
  const isExcluded = picomatch(options.exclude.map(literalGroups), glob);
  const files: SourceFile[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      const rel = relative(rootDir, abs).split(sep).join("/");
      if (entry.isDirectory()) {
        if (mayHoldMatch && !mayHoldMatch(rel)) continue;
        await walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;

      const format = options.extensions.get(extname(entry.name).toLowerCase());
      if (format === undefined) continue;

      if (isIncluded && !isIncluded(rel)) continue;
      if (isExcluded(rel)) continue;

      const raw = await readFile(abs, "utf8");
      files.push({ absolutePath: abs, relativePath: rel, raw, format });
    }
  }

  await walk(rootDir);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return files;
}

/**
 * Read one named file as a source, or return undefined when no renderer claims its extension.
 *
 * The exclude patterns are deliberately not applied: naming a file is an explicit choice, so a
 * `_draft.md` passed on the command line is a page the reader asked for, not a fragment. Its path
 * relative to the root becomes its relative path — the same relationship a scanned file has to the
 * directory it was found in.
 */
export async function readSourceFile(
  filePath: string,
  options: { extensions: Map<string, SourceFormat>; rootDir: string },
): Promise<SourceFile | undefined> {
  const format = options.extensions.get(extname(filePath).toLowerCase());
  if (format === undefined) return undefined;
  const raw = await readFile(filePath, "utf8");
  const rel = relative(options.rootDir, filePath).split(sep).join("/");
  return {
    absolutePath: filePath,
    relativePath: rel === "" || rel.startsWith("..") ? basename(filePath) : rel,
    raw,
    format,
  };
}

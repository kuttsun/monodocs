import { existsSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { loadConfig, type ResolvedConfig } from "../config.js";
import { MonodocsError } from "../diagnostics.js";
import { t } from "../messages.js";
import type { BuildOptions, DiffOptions } from "../types.js";

/**
 * Naming the earlier version (roadmap 7.3.1).
 *
 * `diff.dir` is the earlier version's counterpart of the current directory, so every path the
 * command line names is mapped through it, and the earlier configuration is then found by the rule
 * `loadConfig` applies to the new one. Every path the earlier version resolves stays inside
 * `diff.tree`; one that leaves it, or a mapped path that version does not have, is an error, never
 * a fall back to defaults.
 */

/** The name the earlier version goes by in messages: the label, else the directory as given. */
export function earlierLabel(diff: DiffOptions): string {
  return diff.label ?? diff.dir;
}

/**
 * `path` read through its links. A path that does not exist yet — an earlier version's root before
 * its files are written — is read through the links of the nearest directory above it that does, so
 * it compares with a tree under a linked temporary directory as the files will.
 */
function real(path: string): string {
  const absolute = resolve(path);
  if (existsSync(absolute)) return realpathSync(absolute);
  const parent = dirname(absolute);
  return parent === absolute ? absolute : join(real(parent), basename(absolute));
}

/** Whether `path` is `tree` or inside it, both read through their links. */
function inside(path: string, tree: string): boolean {
  const rel = relative(real(tree), real(path));
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

/** `path` as the earlier version's counterpart: the same place relative to `diff.dir`. */
export function mapToEarlier(path: string, cwd: string, diff: DiffOptions): string {
  const rel = relative(cwd, resolve(cwd, path));
  // Another drive on Windows has no relative path, so it has no counterpart either.
  return isAbsolute(rel) ? rel : resolve(resolve(cwd, diff.dir), rel);
}

/** `path` for a message: relative to the earlier version's directory when it is inside it. */
function shown(path: string, diff: DiffOptions, cwd: string): string {
  const dir = resolve(cwd, diff.dir);
  const rel = relative(dir, path);
  return rel === "" ? "." : isAbsolute(rel) ? path : rel.split(sep).join("/");
}

/**
 * The earlier version's directory, and the tree it may read. `diff/dir-not-found` when the
 * directory is not one, since a typo there would otherwise read as a version with no pages.
 */
export function earlierRoots(diff: DiffOptions, cwd: string): { dir: string; tree: string } {
  const dir = resolve(cwd, diff.dir);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new MonodocsError("diff/dir-not-found", t("diff.dirNotFound", { path: diff.dir }));
  }
  return { dir, tree: resolve(cwd, diff.tree ?? diff.dir) };
}

/**
 * The options the earlier version is loaded with: the input argument and `-c` mapped through
 * `diff.dir`. A mapped path that leaves `diff.tree` is `diff/outside-version`, and so is one the
 * earlier version does not have — both name the path, and neither falls back to a default.
 */
export function earlierBuildOptions(
  options: BuildOptions,
  cwd: string,
  diff: DiffOptions,
): BuildOptions {
  const { tree } = earlierRoots(diff, cwd);
  const label = earlierLabel(diff);
  const map = (path: string | undefined): string | undefined => {
    if (path === undefined) return undefined;
    const mapped = mapToEarlier(path, cwd, diff);
    if (!inside(mapped, tree)) {
      throw new MonodocsError("diff/outside-version", t("diff.outsideVersion", { path, label }));
    }
    if (!existsSync(mapped)) {
      throw new MonodocsError(
        "diff/outside-version",
        t("diff.missingInVersion", { path: shown(mapped, diff, cwd), label }),
      );
    }
    return mapped;
  };
  return { inputDir: map(options.inputDir), configFile: map(options.configFile) };
}

/**
 * The earlier version's configuration, found from its own directory by the rule the new one is
 * found by, with every path it resolves — the file itself, `input`, `root` — checked to stay inside
 * `diff.tree`.
 */
export async function loadEarlierConfig(
  options: BuildOptions,
  cwd: string,
  diff: DiffOptions,
): Promise<ResolvedConfig> {
  const { dir, tree } = earlierRoots(diff, cwd);
  const config = await loadConfig(earlierBuildOptions(options, cwd, diff), dir);
  const label = earlierLabel(diff);
  for (const path of [config.configFilePath, config.inputDir, config.rootDir]) {
    if (path === undefined) continue;
    const absolute = resolve(dir, path);
    if (!inside(absolute, tree)) {
      throw new MonodocsError(
        "diff/outside-version",
        t("diff.outsideVersion", { path: shown(absolute, diff, cwd), label }),
      );
    }
  }
  return config;
}

/**
 * Refuse a difference asked of what does not output one yet (roadmap 7.3.1): a PDF, from `-f` or
 * `output.format`, and `diff.pdf`, which is stage 2's.
 */
export function assertDiffSupported(config: ResolvedConfig, diff: DiffOptions): void {
  if (diff.pdf !== undefined) {
    throw new MonodocsError("diff/unsupported", t("diff.unsupportedPdf"));
  }
  if (config.format !== "html") {
    throw new MonodocsError(
      "diff/unsupported",
      t("diff.unsupportedFormat", { format: config.format }),
    );
  }
}

/** Refuse `diff` in a command that does not take it, rather than ignore it. */
export function assertNoDiff(options: BuildOptions, command: string): void {
  if (options.diff !== undefined) {
    throw new MonodocsError("diff/unsupported", t("diff.unsupportedCommand", { command }));
  }
}

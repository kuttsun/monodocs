import { existsSync, lstatSync, readlinkSync, realpathSync, type Stats, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { defaultConfigPath, loadConfig, type ResolvedConfig } from "../config.js";
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

/** How many links a path is read through before it is taken to loop, as Linux's `ELOOP` is. */
const MAX_LINKS = 40;

/**
 * `path` read through its links. A path that does not exist yet — an earlier version's root before
 * its files are written — is read through the links of the nearest directory above it that does, so
 * it compares with a tree under a linked temporary directory as the files will. A link whose target
 * is not there is read through too: where it points is where the version would read.
 */
function real(path: string, depth = 0): string {
  const absolute = resolve(path);
  // The system's own: Node's JavaScript version shortens a `..` after a link before reading it.
  if (existsSync(absolute)) return realpathSync.native(absolute);
  const parent = dirname(absolute);
  if (parent === absolute) return absolute;
  // The link's target is read from where the link really is, as the file system reads it.
  const realParent = real(parent, depth);
  if (entry(absolute)?.isSymbolicLink() && depth < MAX_LINKS) {
    // One name at a time, each read through its links before a `..` after it is taken.
    let at = realParent;
    const target = readlinkSync(absolute);
    if (isAbsolute(target)) at = parse(target).root;
    // `\\` separates names on Windows only; on POSIX it is a character of one.
    for (const name of target.split(process.platform === "win32" ? /[\\/]/ : "/")) {
      if (name === "" || name === ".") continue;
      at = name === ".." ? dirname(at) : real(join(at, name), depth + 1);
    }
    return at;
  }
  return join(realParent, basename(absolute));
}

/**
 * What is at `path` itself, a link not followed; undefined when nothing is — including when a
 * directory on the way is a file, which `throwIfNoEntry` alone would still throw for.
 */
function entry(path: string): Stats | undefined {
  try {
    return lstatSync(path, { throwIfNoEntry: false });
  } catch {
    return undefined;
  }
}

/** Whether something is at `path`, a link whose target is missing included. */
function present(path: string): boolean {
  return entry(path) !== undefined;
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

/**
 * `path` for a message: relative to the earlier version's tree when it is inside it — for a ref,
 * the path in the repository, which says more than `.` would from a directory that version lacks.
 */
function shown(path: string, diff: DiffOptions, cwd: string): string {
  const rel = relative(resolve(cwd, diff.tree ?? diff.dir), path);
  return rel === "" ? "." : isAbsolute(rel) ? path : rel.split(sep).join("/");
}

/**
 * The earlier version's directory, and the tree it may read. `diff/dir-not-found` when the tree is
 * not a directory, since a typo there would otherwise read as a version with no pages. `diff.dir`
 * itself need not exist: the current directory may be one the earlier version did not have, and
 * then every path mapped into it is reported as missing from that version.
 */
export function earlierRoots(diff: DiffOptions, cwd: string): { dir: string; tree: string } {
  const tree = resolve(cwd, diff.tree ?? diff.dir);
  if (!existsSync(tree) || !statSync(tree).isDirectory()) {
    throw new MonodocsError(
      "diff/dir-not-found",
      t("diff.dirNotFound", { path: diff.tree ?? diff.dir }),
    );
  }
  return { dir: resolve(cwd, diff.dir), tree };
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
 * `diff.tree`, and its input checked to be there: a version whose document directory was later
 * renamed is reported, not compared with nothing.
 */
export async function loadEarlierConfig(
  options: BuildOptions,
  cwd: string,
  diff: DiffOptions,
  {
    requireInput = true,
  }: {
    /** False only to learn the root before its files are written, as the CLI does for a ref. */
    requireInput?: boolean;
  } = {},
): Promise<ResolvedConfig> {
  const { dir, tree } = earlierRoots(diff, cwd);
  const earlierOptions = earlierBuildOptions(options, cwd, diff);
  const label = earlierLabel(diff);
  // A configuration file that is a link out of the tree is not there for `loadConfig`, which would
  // build with the defaults; it is the version's file, and it leaves the version.
  const candidate = earlierOptions.configFile ?? defaultConfigPath(earlierOptions, dir);
  if (present(candidate) && !inside(candidate, tree)) {
    throw new MonodocsError(
      "diff/outside-version",
      t("diff.outsideVersion", { path: shown(candidate, diff, cwd), label }),
    );
  }
  let config: ResolvedConfig;
  try {
    config = await loadConfig(earlierOptions, dir);
  } catch (error) {
    // An input that disagrees with a root out of the tree is the root leaving the version first:
    // the root is read on its own, from the same file, to say so.
    if (!(error instanceof MonodocsError) || error.code !== "config/input-outside-root")
      throw error;
    const { rootDir } = await loadConfig({ configFile: candidate }, dir);
    if (!inside(resolve(dir, rootDir), tree)) {
      throw new MonodocsError(
        "diff/outside-version",
        t("diff.outsideVersion", { path: shown(resolve(dir, rootDir), diff, cwd), label }),
      );
    }
    throw error;
  }
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
  const input = resolve(dir, config.inputDir);
  if (requireInput && !existsSync(input)) {
    throw new MonodocsError(
      "diff/outside-version",
      t("diff.missingInVersion", { path: shown(input, diff, cwd), label }),
    );
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

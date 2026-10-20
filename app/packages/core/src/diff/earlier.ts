import { existsSync, lstatSync, readlinkSync, realpathSync, type Stats, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
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

/**
 * The `root` and `input` a configuration file writes, resolved against it — `input` only when
 * `withInput`, since an input argument takes its place as it does in `loadConfig`. Nothing when the
 * file is not there or cannot be read as an object, which `loadConfig` then reports in its words.
 */
async function writtenPaths(file: string, withInput: boolean): Promise<string[]> {
  if (!existsSync(file)) return [];
  let parsed: unknown;
  try {
    parsed = parseYaml(await readFile(file, "utf8"));
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null) return [];
  const { root, input } = parsed as { root?: unknown; input?: unknown };
  return [root, withInput ? input : undefined]
    .filter((value): value is string => typeof value === "string")
    .map((value) => resolve(dirname(file), value));
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
  // The file's own `root` and `input` are checked before `loadConfig` reads them: it checks that
  // they agree with each other, and a pair that leaves the version would be reported as that
  // disagreement instead of as leaving.
  for (const path of await writtenPaths(candidate, earlierOptions.inputDir === undefined)) {
    if (!inside(path, tree)) {
      throw new MonodocsError(
        "diff/outside-version",
        t("diff.outsideVersion", { path: shown(path, diff, cwd), label }),
      );
    }
  }
  // A key a major release removed is read as its replacement: every version that used it would
  // otherwise be impossible to compare against, and its author cannot rewrite it (7.3.2).
  const config = await inEarlierVersion(diff, cwd, () =>
    loadConfig(earlierOptions, dir, { translateRemovedKeys: true }),
  );
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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Run `run` for the earlier version, with every path of its tree in an error it throws shown as
 * `label:path` — `v1.2:monodocs.config.yml` — rather than as the temporary directory a ref was
 * extracted to, which means nothing to the author and is gone once the build ends (7.3.2).
 */
export async function inEarlierVersion<T>(
  diff: DiffOptions,
  cwd: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    // An error that is not monodocs' own — the file system, Asciidoctor — is still the earlier
    // version's, and gets the code any foreign error gets (27.3).
    if (!(error instanceof Error)) throw error;
    const code = error instanceof MonodocsError ? error.code : "internal/unexpected";
    const label = earlierLabel(diff);
    const tree = resolve(cwd, diff.tree ?? diff.dir);
    const bases = [...new Set([real(tree), tree])].sort((a, b) => b.length - a.length);
    let message = error.message;
    for (const base of bases) {
      // The tree, alone or followed by a path in it, up to where the sentence goes on — a quote,
      // a space, or a full stop that ends it. The path is written with `/`, as monodocs writes one.
      const pattern = new RegExp(
        `${escapeRegExp(base)}(?:${escapeRegExp(sep)}([^\\s"'\`,;)]*?))?(?=$|[\\s"'\`,;:)]|\\.(?:\\s|$))`,
        "g",
      );
      message = message.replace(
        pattern,
        (_match, path: string | undefined) =>
          `${label}:${path === undefined || path === "" ? "." : path.split(sep).join("/")}`,
      );
    }
    // Every error says it is the earlier version's, a path in it or not: a route collision or a
    // configuration value would otherwise read as one in the new version.
    const source = error instanceof MonodocsError ? error.source : {};
    throw new MonodocsError(code, t("diff.inEarlier", { label, message }), source);
  }
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

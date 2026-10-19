import { spawn } from "node:child_process";
import { mkdir, mkdtemp, realpath } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import {
  type BuildOptions,
  defaultConfigPath,
  type DiffOptions,
  loadEarlierConfig,
  mapToEarlier,
  MonodocsError,
  t,
} from "@monodocs/core";

/**
 * `--diff-from <ref>`: the earlier version, as the files a checkout of that ref would give
 * (roadmap 7.3.1).
 *
 * core only takes a directory, so the CLI writes the earlier version's files into a temporary one.
 * `git archive` is not used: it drops files marked `export-ignore`, which the author saw in that
 * version. A temporary index (`GIT_INDEX_FILE`), filled by `read-tree` and written out by
 * `checkout-index`, gives every file and applies `eol` conversion; with `GIT_WORK_TREE` at the empty
 * temporary directory, git reads `.gitattributes` from that index — the earlier version's — not from
 * today's working tree. The repository's own index, working tree, and refs are untouched.
 *
 * Only what the earlier version reads is written: its configuration file, then the files under its
 * root. A documentation directory often shares its repository with code, and writing out the whole
 * tree would fetch every LFS object in it. Whether the mapped input is a file, and whether the
 * configuration is there, are asked of the temporary index, since those files do not exist yet.
 */

/** What {@link extractEarlierVersion} gives: the `diff` core takes, and how to remove its files. */
export type EarlierVersion = {
  diff: DiffOptions;
  /** Removes the temporary directory. Safe to call more than once. */
  dispose: () => void;
};

type GitResult = { code: number; stdout: Buffer; stderr: string };

/** An index entry's mode for a submodule, which a checkout leaves as an empty directory. */
const GITLINK_MODE = "160000";

/** An index entry's mode for a symbolic link, whose content is the path it points to. */
const SYMLINK_MODE = "120000";

/** How many links a path is read through before it is taken to loop, as Linux's `ELOOP` is. */
const MAX_LINKS = 40;

/**
 * Run git. Its messages are read in the C locale, so that whether the current directory is a
 * repository can be told from what git says, whatever language the machine speaks.
 */
function git(
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; input?: Buffer; ref: string },
): Promise<GitResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("git", args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env, LC_ALL: "C" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(
        error.code === "ENOENT"
          ? new MonodocsError(
              "diff/git-unavailable",
              t("diff.gitUnavailable", { ref: options.ref }),
            )
          : error,
      );
    });
    child.on("close", (code) => {
      resolvePromise({
        code: code ?? 1,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr).toString("utf8").trim(),
      });
    });
    child.stdin.on("error", () => {
      // git may exit before reading its input; the exit code reports why.
    });
    child.stdin.end(options.input);
  });
}

function gitFailed(ref: string, result: GitResult): MonodocsError {
  return new MonodocsError(
    "diff/git-failed",
    t("diff.gitFailed", { ref, detail: result.stderr || `exit ${result.code}` }),
  );
}

/** The work tree's top and the current directory's path inside it, as git reports them. */
async function locate(cwd: string, ref: string): Promise<{ top: string; prefix: string }> {
  const result = await git(["rev-parse", "--show-toplevel", "--show-prefix"], { cwd, ref });
  if (result.code !== 0) {
    // Inside `.git`, or in a bare repository, git is in a repository but not in a work tree, and
    // there is no checkout to stand for either.
    if (/not a git repository|must be run in a work tree/i.test(result.stderr)) {
      throw new MonodocsError("diff/not-a-repository", t("diff.notARepository", { ref }));
    }
    throw gitFailed(ref, result);
  }
  const [top = "", prefix = ""] = result.stdout.toString("utf8").split("\n");
  return { top: resolve(top), prefix };
}

/** What git says, in the C locale, of a revision it cannot resolve. */
const REF_NOT_FOUND =
  /no upstream configured|no such branch|has no upstream|log for '[^']*' only|unknown revision|bad revision|ambiguous argument|invalid object name|not a valid object name|needed a single revision/i;

/** The commit `ref` names; in a shallow clone, the message says how to fetch the history. */
async function resolveCommit(top: string, ref: string): Promise<string> {
  const result = await git(
    ["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`],
    { cwd: top, ref },
  );
  if (result.code === 0) return result.stdout.toString("utf8").trim();
  // `--quiet` makes a name that is not a commit a silent failure — exit 1, or 128 for a reflog entry
  // past its end — and git still speaks for a name it cannot read, such as `@{upstream}` with none
  // set. Anything else it says is another failure, a broken object store or a permission, and is
  // quoted rather than called a bad name.
  if (result.stderr !== "" && !REF_NOT_FOUND.test(result.stderr)) throw gitFailed(ref, result);
  const shallow = await git(["rev-parse", "--is-shallow-repository"], { cwd: top, ref });
  const isShallow = shallow.code === 0 && shallow.stdout.toString("utf8").trim() === "true";
  throw new MonodocsError(
    "diff/ref-not-found",
    t(isShallow ? "diff.refNotFoundShallow" : "diff.refNotFound", { ref }),
  );
}

/** An index entry: its mode, its object, and its path as git wrote it, to hand back byte for byte. */
type IndexEntry = { mode: string; object: string; raw: Buffer };

/**
 * The temporary index's entries, keyed by path, root-relative with `/`. The key is decoded as
 * UTF-8 to compare with paths on this side; the raw bytes are what `checkout-index` is given, so a
 * name that is not UTF-8 is still found.
 */
function parseIndex(listing: Buffer): Map<string, IndexEntry> {
  const entries = new Map<string, IndexEntry>();
  let start = 0;
  while (start < listing.length) {
    let end = listing.indexOf(0, start);
    if (end === -1) end = listing.length;
    const record = listing.subarray(start, end);
    start = end + 1;
    const tab = record.indexOf(0x09);
    if (tab === -1) continue;
    const raw = record.subarray(tab + 1);
    // `<mode> <object> <stage>`
    const [mode = "", object = ""] = record.subarray(0, tab).toString("latin1").split(" ");
    entries.set(raw.toString("utf8"), { mode, object, raw });
  }
  return entries;
}

/**
 * Write the earlier version of `ref` into a temporary directory, for `options` as the command line
 * gave them. The caller disposes of it whether the build succeeds or not; a failure here disposes
 * of it before throwing.
 */
export async function extractEarlierVersion(
  ref: string,
  options: BuildOptions,
  {
    cwd = process.cwd(),
    onTemporary,
  }: {
    cwd?: string;
    /** Called once the temporary directory exists, so a Ctrl+C before this returns removes it. */
    onTemporary?: (dispose: () => void) => void;
  } = {},
): Promise<EarlierVersion> {
  const { top, prefix } = await locate(cwd, ref);
  const commit = await resolveCommit(top, ref);

  // Read through its links once: on macOS the temporary directory is under `/var`, a link to
  // `/private/var`, and a path compared through one and not the other would leave the tree.
  const temp = await realpath(await mkdtemp(join(tmpdir(), "monodocs-diff-")));
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    rmSync(temp, { recursive: true, force: true });
  };
  onTemporary?.(dispose);
  try {
    const tree = join(temp, "tree");
    // The earlier version's counterpart of the current directory. Made only if that version has
    // it: one made up would pass for an input that version lacks.
    const dir = join(tree, ...prefix.split("/").filter(Boolean));
    await mkdir(tree);
    const env = { GIT_INDEX_FILE: join(temp, "index"), GIT_WORK_TREE: tree };
    // Paths are root-relative and run from the top: with the work tree elsewhere, a relative
    // pathspec would lose the subdirectory it was meant in, and `--literal-pathspecs` keeps a
    // directory named with `[` or `*` from being read as a glob.
    const run = async (args: string[], input?: Buffer) => {
      const result = await git(["--literal-pathspecs", ...args], { cwd: top, env, input, ref });
      if (result.code !== 0) throw gitFailed(ref, result);
      return result;
    };

    await run(["read-tree", commit]);
    const index = parseIndex((await run(["ls-files", "-z", "-s"])).stdout);
    // On a file system that ignores case, git does too, and so does every path the new version's
    // build reads: `Docs` finds `docs/`. The earlier version's paths are matched the same way.
    const ignoreCase =
      (await git(["config", "--bool", "core.ignorecase"], { cwd: top, ref })).stdout
        .toString("utf8")
        .trim() === "true";
    const fold = (path: string) => (ignoreCase ? path.toLowerCase() : path);
    const byFolded = new Map([...index.keys()].map((path) => [fold(path), path]));

    /** `path` relative to the tree with `/`, or undefined when it is not inside it. */
    const inTree = (path: string): string | undefined => {
      const rel = relative(tree, path);
      if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) return undefined;
      return rel.split(sep).join("/");
    };
    /** The entries under a directory, `""` being the whole tree, as the index spells them. */
    const entriesUnder = (rel: string): string[] => {
      const under = rel === "" ? "" : `${fold(rel)}/`;
      return [...index.keys()].filter((path) => fold(path).startsWith(under));
    };
    const writeOut = async (paths: string[]) => {
      const files: Buffer[] = [];
      for (const path of paths) {
        const entry = index.get(path)!;
        // A submodule's contents are not extracted: it appears as an empty directory, as in a
        // checkout without `--recurse-submodules`.
        if (entry.mode === GITLINK_MODE) await mkdir(join(tree, path), { recursive: true });
        else files.push(entry.raw, Buffer.of(0));
      }
      if (files.length === 0) return;
      await run(["checkout-index", "-f", "-z", "--stdin"], Buffer.concat(files));
    };
    /**
     * `rel` as the index has it, read through every link on the way as a checkout would: a link is
     * written out, and the path continues from its target. Undefined when the path leaves the tree,
     * which core reports; a cycle stops where the file system would.
     */
    const follow = async (rel: string, depth = 0): Promise<string | undefined> => {
      const parts = rel === "" ? [] : rel.split("/");
      for (let i = 1; i <= parts.length; i++) {
        const path = byFolded.get(fold(parts.slice(0, i).join("/")));
        const entry = path === undefined ? undefined : index.get(path)!;
        if (entry?.mode !== SYMLINK_MODE || path === undefined) continue;
        await writeOut([path]);
        if (depth >= MAX_LINKS) return undefined;
        const written = (await run(["cat-file", "blob", entry.object])).stdout.toString("utf8");
        // A link git recorded on Windows may be written with `\`; on POSIX that is a character.
        const target = process.platform === "win32" ? written.replace(/\\/g, "/") : written;
        // An absolute target is not the earlier version's; core reports it when it reads it.
        if (posix.isAbsolute(target) || /^[A-Za-z]:/.test(target)) return undefined;
        const next = posix
          .normalize(posix.join(posix.dirname(path), target, ...parts.slice(i)))
          .split("/")
          .filter((part) => part !== "" && part !== ".")
          .join("/");
        if (next === ".." || next.startsWith("../")) return undefined;
        return follow(next, depth + 1);
      }
      return byFolded.get(fold(rel)) ?? rel;
    };
    /** Make `path` exist when the earlier version has it: a file written out, a directory made. */
    const materialize = async (path: string) => {
      const inside = inTree(path);
      const rel = inside === undefined ? undefined : await follow(inside);
      if (rel === undefined) return;
      if (index.has(rel)) return writeOut([rel]);
      if (entriesUnder(rel).length > 0) await mkdir(join(tree, rel), { recursive: true });
    };
    /**
     * Write out everything under the root, and under every directory a link in it reaches while
     * staying under the root. A link out of the root is written as the link alone: the build reads
     * nothing through it — the scan does not follow links, and an image or include whose real path
     * leaves the root is refused — so its target is not fetched.
     */
    const writeRoot = async (path: string) => {
      const inside = inTree(path);
      const root = inside === undefined ? undefined : await follow(inside);
      if (root === undefined) return;
      const underRoot = (rel: string) =>
        root === "" || fold(rel) === fold(root) || fold(rel).startsWith(`${fold(root)}/`);
      const seen = new Set<string>();
      const walk = async (rel: string) => {
        if (seen.has(rel)) return;
        seen.add(rel);
        const paths = entriesUnder(rel);
        await writeOut(paths);
        for (const link of paths.filter((p) => index.get(p)!.mode === SYMLINK_MODE)) {
          const target = await follow(link);
          if (target !== undefined && underRoot(target)) await walk(target);
        }
      };
      await walk(root);
    };

    await materialize(dir);
    const diff: DiffOptions = { dir, tree, label: ref };
    const mappedInput =
      options.inputDir === undefined ? undefined : mapToEarlier(options.inputDir, cwd, diff);
    if (mappedInput !== undefined) await materialize(mappedInput);
    await materialize(
      options.configFile === undefined
        ? defaultConfigPath({ inputDir: mappedInput }, dir)
        : mapToEarlier(options.configFile, cwd, diff),
    );

    // The earlier configuration decides the root; core checks that it stays inside the tree.
    // Whether its own `input` names a file is asked of the index too: made to exist, it is read
    // again, so a file's directory is its root and a `root` naming a file is refused.
    const first = await loadEarlierConfig(options, cwd, diff, { requireInput: false });
    await materialize(resolve(dir, first.inputDir));
    await materialize(resolve(dir, first.rootDir));
    const config = await loadEarlierConfig(options, cwd, diff);
    await writeRoot(resolve(dir, config.rootDir));
    return { diff, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

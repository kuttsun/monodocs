import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
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
    if (/not a git repository/i.test(result.stderr)) {
      throw new MonodocsError("diff/not-a-repository", t("diff.notARepository", { ref }));
    }
    throw gitFailed(ref, result);
  }
  const [top = "", prefix = ""] = result.stdout.toString("utf8").split("\n");
  return { top: resolve(top), prefix };
}

/** The commit `ref` names; in a shallow clone, the message says how to fetch the history. */
async function resolveCommit(top: string, ref: string): Promise<string> {
  const result = await git(
    ["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`],
    { cwd: top, ref },
  );
  if (result.code === 0) return result.stdout.toString("utf8").trim();
  const shallow = await git(["rev-parse", "--is-shallow-repository"], { cwd: top, ref });
  const isShallow = shallow.code === 0 && shallow.stdout.toString("utf8").trim() === "true";
  throw new MonodocsError(
    "diff/ref-not-found",
    t(isShallow ? "diff.refNotFoundShallow" : "diff.refNotFound", { ref }),
  );
}

/** The temporary index's entries: each path, root-relative with `/`, and its mode. */
function parseIndex(listing: Buffer): Map<string, string> {
  const entries = new Map<string, string>();
  for (const record of listing.toString("utf8").split("\0")) {
    if (record === "") continue;
    const tab = record.indexOf("\t");
    entries.set(record.slice(tab + 1), record.slice(0, record.indexOf(" ")));
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

  const temp = await mkdtemp(join(tmpdir(), "monodocs-diff-"));
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    rmSync(temp, { recursive: true, force: true });
  };
  onTemporary?.(dispose);
  try {
    const tree = join(temp, "tree");
    // The earlier version's counterpart of the current directory. Made even when that version has
    // no such directory, so a missing input is reported as missing, not as a missing version.
    const dir = join(tree, ...prefix.split("/").filter(Boolean));
    await mkdir(dir, { recursive: true });
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

    /** `path` relative to the tree with `/`, or undefined when it is not inside it. */
    const inTree = (path: string): string | undefined => {
      const rel = relative(tree, path);
      if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) return undefined;
      return rel.split(sep).join("/");
    };
    const writeOut = async (paths: string[]) => {
      const files = paths.filter((path) => index.get(path) !== GITLINK_MODE);
      // A submodule's contents are not extracted: it appears as an empty directory, as in a
      // checkout without `--recurse-submodules`.
      for (const path of paths) {
        if (index.get(path) === GITLINK_MODE) await mkdir(join(tree, path), { recursive: true });
      }
      if (files.length === 0) return;
      await run(
        ["checkout-index", "-f", "-z", "--stdin"],
        Buffer.from(files.map((path) => `${path}\0`).join(""), "utf8"),
      );
    };
    /** Make `path` exist when the earlier version has it: a file written out, a directory made. */
    const materialize = async (path: string) => {
      const rel = inTree(path);
      if (rel === undefined) return;
      if (index.has(rel)) return writeOut([rel]);
      const under = rel === "" ? "" : `${rel}/`;
      for (const entry of index.keys()) {
        if (entry.startsWith(under)) return void (await mkdir(path, { recursive: true }));
      }
    };

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
    const config = await loadEarlierConfig(options, cwd, diff);
    const root = inTree(resolve(dir, config.rootDir));
    if (root !== undefined) {
      const under = root === "" ? "" : `${root}/`;
      await writeOut([...index.keys()].filter((path) => path.startsWith(under)));
    }
    return { diff, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

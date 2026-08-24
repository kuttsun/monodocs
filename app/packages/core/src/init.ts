import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DEFAULT_CONFIG_FILE } from "./config.js";
import { t } from "./messages.js";
import { MonodocsError } from "./diagnostics.js";

/**
 * The first page, at the path the default `input` already points at. Written with forward slashes
 * because it is also what gets printed back to the author; `resolve` accepts them on Windows too.
 */
const FIRST_PAGE = "docs/index.md";

export type InitResult = {
  /** What was written, relative to the directory `init` ran in, in the order it was written. */
  created: string[];
};

/**
 * Write a configuration and a first page that build without editing.
 *
 * The pair is the point: a configuration alone has nothing to bundle, and a page alone leaves the
 * author guessing at the file name a build looks for. What they get is a short commented starting
 * point rather than a dump of every key — a dump would need regenerating with every option added,
 * and it teaches the reader to keep keys they have not understood.
 *
 * **It refuses rather than overwrites.** Running a scaffolding command in a directory that already
 * holds work is an ordinary mistake, and its cost is somebody's writing. Both files are checked
 * before either is written, so a run that stops cannot leave half a scaffold behind for the author
 * to work out.
 */
export async function initSite(cwd: string = process.cwd()): Promise<InitResult> {
  const targets = [
    { path: DEFAULT_CONFIG_FILE, content: t("init.configTemplate") },
    { path: FIRST_PAGE, content: t("init.pageTemplate") },
  ];

  const found = targets.filter((target) => existsSync(resolve(cwd, target.path)));
  if (found.length > 0) {
    throw new MonodocsError(
      "init/exists",
      t("init.exists", { paths: found.map((target) => target.path).join(", ") }),
    );
  }

  for (const target of targets) {
    const full = resolve(cwd, target.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, target.content, "utf8");
  }

  return { created: targets.map((target) => target.path) };
}

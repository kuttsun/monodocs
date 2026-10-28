import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// With no inotify instance left for the user (`fs.inotify.max_user_instances`, shared with every
// other program they run), Node 22 on Linux throws EMFILE for a plain watch but returns a recursive
// watch that never reports anything, with no error (#215). The fake reproduces exactly that.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const watch = (_target: string, options?: unknown) => {
    const recursive =
      typeof options === "object" &&
      options !== null &&
      "recursive" in options &&
      options.recursive;
    if (!recursive) {
      throw Object.assign(new Error("EMFILE: too many open files, watch"), { code: "EMFILE" });
    }
    return Object.assign(new EventEmitter(), { close() {}, ref() {}, unref() {} });
  };
  return { ...actual, watch, default: { ...actual, watch } };
});

const { watchSite } = await import("./watch");

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-watch-inotify-"));
  await mkdir(join(dir, "docs"), { recursive: true });
  await writeFile(join(dir, "docs", "index.md"), "# Home\n");
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe.runIf(process.platform === "linux")("watch with no inotify instance left", () => {
  it("fails with EMFILE rather than watching nothing", async () => {
    await expect(
      watchSite({ inputDir: join(dir, "docs"), outputFile: join(dir, "out.html") }),
    ).rejects.toMatchObject({ code: "EMFILE" });
  });
});

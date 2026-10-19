import { CommanderError } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProgram } from "./program";

/** The options that name an earlier version exist on `build` alone (roadmap 7.3.1). */
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

async function run(...args: string[]): Promise<string[]> {
  const errors: string[] = [];
  vi.spyOn(console, "error").mockImplementation((message: string) => void errors.push(message));
  await createProgram().parseAsync(["node", "monodocs", ...args]);
  return errors;
}

describe("--diff-from and --diff-from-dir", () => {
  it("cannot be used together", async () => {
    const errors = await run("build", "--diff-from", "v1", "--diff-from-dir", "../v1");
    expect(errors.join("\n")).toContain("--diff-from and --diff-from-dir");
    expect(process.exitCode).toBe(1);
  });

  it("are refused with a PDF before git is run", async () => {
    vi.stubEnv("PATH", "");
    const errors = await run("build", "-f", "pdf", "--diff-from", "v1");
    expect(errors.join("\n")).toContain("HTML only");
    vi.unstubAllEnvs();
  });

  it("are unknown to watch, serve, and validate", async () => {
    // Commander prints its own line before throwing; the code is what is checked.
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    for (const command of ["watch", "serve", "validate"]) {
      for (const option of ["--diff-from", "--diff-from-dir"]) {
        await expect(
          createProgram().parseAsync(["node", "monodocs", command, option, "v1"]),
        ).rejects.toMatchObject({
          code: "commander.unknownOption",
        } satisfies Partial<CommanderError>);
      }
    }
  });
});

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateSite } from "./build";
import { DIAGNOSTIC_CODES, MonodocsError, toDiagnostic, warn } from "./diagnostics";

const SRC = fileURLToPath(new URL(".", import.meta.url));
const CLI_SRC = join(SRC, "../../cli/src");

async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      out.push(...(await sourceFiles(full)));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

/** Comments are not code: an example in prose must not answer for the source. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

describe("the diagnostic code set", () => {
  it("is unique, sorted, and spelled one way", () => {
    expect(new Set(DIAGNOSTIC_CODES).size).toBe(DIAGNOSTIC_CODES.length);
    // Sorted because the list is read by people deciding what to filter on, and a code appended
    // wherever it was written turns that list into a pile.
    expect([...DIAGNOSTIC_CODES]).toEqual([...DIAGNOSTIC_CODES].sort());
    for (const code of DIAGNOSTIC_CODES) {
      expect(code, code).toMatch(/^[a-z][a-z-]*\/[a-z][a-z-]*$/);
    }
  });

  it("carries no code nothing reports", async () => {
    // A code that no source emits is a promise to a consumer that nothing keeps. The registry's
    // own declaration is removed before the search, or every code would find itself.
    const files = await sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(20);
    const sources = await Promise.all(
      files.map(async (file) => {
        const source = await readFile(file, "utf8");
        return file.endsWith(`${sep}diagnostics.ts`)
          ? source.replace(/export const DIAGNOSTIC_CODES = \[[\s\S]*?\] as const;/, "")
          : source;
      }),
    );
    const emitted = sources.join("\n");
    const unused = DIAGNOSTIC_CODES.filter((code) => !emitted.includes(`"${code}"`));
    expect(unused).toEqual([]);
  });
});

describe("every error monodocs raises carries a code", () => {
  it("finds no error thrown outside the model", async () => {
    // `new Error(...)` produces a finding with no identity: `validate --format json` would have to
    // report it as an untyped sentence, which is what the model exists to remove. Subclasses are
    // allowed — they extend MonodocsError and fix a code of their own.
    const files = [...(await sourceFiles(SRC)), ...(await sourceFiles(CLI_SRC))];
    expect(files.some((f) => f.split(sep).join("/").endsWith("/cli/src/index.ts"))).toBe(true);

    const offenders: string[] = [];
    for (const file of files) {
      const scannable = withoutComments(await readFile(file, "utf8"));
      // `new` is optional and rejecting a promise is throwing with extra steps; both spellings
      // produce a finding with no identity, so both are caught.
      const pattern = /(?:throw\s+(?:new\s+)?Error\(|reject\(\s*(?:new\s+)?Error\()/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(scannable)) !== null) {
        const line = scannable.slice(0, match.index).split("\n").length;
        offenders.push(`${relative(SRC, file)}:${line}`);
      }
    }
    expect(
      offenders,
      `these throw an error with no diagnostic code:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("reports a caught error with the code it was thrown with", () => {
    const diagnostic = toDiagnostic(
      new MonodocsError("input/not-found", "no such input", {
        path: "docs",
      }),
    );
    expect(diagnostic).toEqual({
      code: "input/not-found",
      severity: "error",
      path: "docs",
      message: "no such input",
    });
  });

  it("gives a foreign error a code rather than none", () => {
    // A Puppeteer stack or a dependency's failure reaches the same boundary. A consumer filtering
    // on codes must not be able to lose a finding by it having none.
    expect(toDiagnostic(new TypeError("boom"))).toEqual({
      code: "internal/unexpected",
      severity: "error",
      message: "boom",
    });
    expect(toDiagnostic("not even an error").code).toBe("internal/unexpected");
  });

  it("leaves out what nothing knows", () => {
    // An empty `path` in a serialised report reads as a fact about the root of the input.
    expect(warn("page/no-title", "m")).toEqual({
      code: "page/no-title",
      severity: "warning",
      message: "m",
    });
    expect(Object.keys(warn("link/unresolved", "m", { path: "a.md", line: 3 }))).toEqual([
      "code",
      "severity",
      "message",
      "path",
      "line",
    ]);
  });
});

/** Order two diagnostics the same way whichever list they came from. */
function byCode(
  a: { code: string; message: string },
  b: { code: string; message: string },
): number {
  return a.code.localeCompare(b.code) || a.message.localeCompare(b.message);
}

describe("what a build reports", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "monodocs-diagnostics-"));
    const docs = join(dir, "docs");
    await mkdir(docs, { recursive: true });
    await writeFile(
      join(docs, "index.md"),
      "# Home\n\nA line.\n\nA [broken link](nope.md) and an ![image](nope.png).\n",
    );
    await writeFile(join(docs, "untitled.md"), "No heading here.\n");
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("gives every finding a code and a severity", async () => {
    const result = await validateSite({ inputDir: join(dir, "docs") });
    expect(result.diagnostics.length).toBeGreaterThan(0);
    for (const diagnostic of result.diagnostics) {
      expect(DIAGNOSTIC_CODES, diagnostic.message).toContain(diagnostic.code);
      expect(["error", "warning"], diagnostic.message).toContain(diagnostic.severity);
      expect(diagnostic.message, diagnostic.code).not.toBe("");
    }
    // The two halves are the same set, split — a caller reading one of them reads no less. Compared
    // as sets rather than counted: dropping one finding and duplicating another keeps the count.
    expect([...result.errors, ...result.warnings].sort(byCode)).toEqual(
      [...result.diagnostics].sort(byCode),
    );
  });

  it("keeps the position it already knew instead of flattening it into prose", async () => {
    const result = await validateSite({ inputDir: join(dir, "docs") });
    const link = result.diagnostics.find((d) => d.code === "link/unresolved");
    expect(link).toBeDefined();
    // `formatSourceRef` had been composing exactly this into a sentence and dropping the parts.
    expect(link?.path).toBe("index.md");
    expect(link?.line).toBe(5);
    expect(link?.message).toContain("index.md:5");

    const image = result.diagnostics.find((d) => d.code === "image/not-found");
    expect(image?.path).toBe("index.md");
    const title = result.diagnostics.find((d) => d.code === "page/no-title");
    expect(title?.path).toBe("untitled.md");
  });

  it("reports a build that could not run as one error carrying its code", async () => {
    const result = await validateSite({ inputDir: join(dir, "does-not-exist") });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("input/not-found");
    expect(result.warnings).toEqual([]);
    expect(result.pages).toBe(0);
  });

  it("keeps what it had found when something later stops the run", async () => {
    // A deprecated key is still deprecated when a route collision ends the build. Dropping it
    // would make the report depend on which problem happened to be the fatal one.
    const root = await mkdtemp(join(tmpdir(), "monodocs-diagnostics-fatal-"));
    const docs = join(root, "docs");
    await mkdir(join(docs, "a"), { recursive: true });
    await writeFile(join(docs, "a.md"), "# A\n");
    await writeFile(join(docs, "a", "index.md"), "# Also A\n");
    const configFile = join(root, "monodocs.config.yml");
    await writeFile(configFile, "sidebar:\n  exclude:\n    - nothing-matches.md\n");
    try {
      const result = await validateSite({ inputDir: docs, configFile });
      expect(result.diagnostics.map((d) => d.code)).toEqual([
        "config/deprecated-key",
        "page/duplicate-route",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

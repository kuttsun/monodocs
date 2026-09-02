import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSite, validateSite } from "./build";

/**
 * Asciidoctor's safe mode confines `include::` to the base directory, and monodocs relies on that
 * (roadmap.md 17.3). Measured, it confines it **lexically**: `../` and an absolute path are both
 * refused, and a symbolic link inside the tree pointing outside it is followed — which is what
 * Asciidoctor documents, and what makes architecture.md's claim that safe mode "prevents external
 * access" too strong. This is the check that closes it (17.5).
 */
let dir: string;
let root: string;
let outside: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-include-"));
  root = join(dir, "root");
  outside = join(dir, "outside");
  await mkdir(root, { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, "secret.adoc"), "SECRET-FROM-OUTSIDE\n");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function build(): Promise<string> {
  const out = join(dir, "out.html");
  await buildSite({ inputDir: root, outputFile: out, format: "html" });
  return readFile(out, "utf8");
}

describe("an include that escapes the input root", () => {
  it("is refused when it reaches outside through a symbolic link to a file", async () => {
    await symlink(join(outside, "secret.adoc"), join(root, "linked.adoc"));
    await writeFile(join(root, "a.adoc"), "= A\n\ninclude::linked.adoc[]\n");

    await expect(build()).rejects.toThrow(/resolves outside the input root/i);
  });

  it("is refused when it reaches outside through a symbolic link to a directory", async () => {
    await symlink(outside, join(root, "linkeddir"));
    await writeFile(join(root, "a.adoc"), "= A\n\ninclude::linkeddir/secret.adoc[]\n");

    await expect(build()).rejects.toThrow(/resolves outside the input root/i);
  });

  it("names the target and the path it resolved to", async () => {
    await symlink(join(outside, "secret.adoc"), join(root, "linked.adoc"));
    await writeFile(join(root, "a.adoc"), "= A\n\ninclude::linked.adoc[]\n");

    await expect(build()).rejects.toThrow(/linked\.adoc/);
    await expect(build()).rejects.toThrow(/secret\.adoc/);
  });

  it("is refused through a nested include, not only at the top level", async () => {
    await symlink(join(outside, "secret.adoc"), join(root, "linked.adoc"));
    await writeFile(join(root, "middle.adoc"), "include::linked.adoc[]\n");
    await writeFile(join(root, "a.adoc"), "= A\n\ninclude::middle.adoc[]\n");

    await expect(build()).rejects.toThrow(/resolves outside the input root/i);
  });

  it("is reported by validate as an error, with its own code", async () => {
    await symlink(join(outside, "secret.adoc"), join(root, "linked.adoc"));
    await writeFile(join(root, "a.adoc"), "= A\n\ninclude::linked.adoc[]\n");

    const result = await validateSite({ inputDir: root });
    const found = result.diagnostics.filter((d) => d.code === "include/outside-input");

    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe("error");
    expect(found[0]?.message).toMatch(/resolves outside the input root/i);
  });

  /**
   * Without the check the content is not merely reachable — it lands in the output. This asserts
   * the hole rather than the fix, by pointing the build at a root that legitimately contains both.
   */
  it("would otherwise have put the outside content in the document", async () => {
    await symlink(join(outside, "secret.adoc"), join(root, "linked.adoc"));
    await writeFile(join(root, "a.adoc"), "= A\n\ninclude::linked.adoc[]\n");

    // Rooted at the parent, the link no longer escapes, and the content is included — which is what
    // safe mode alone allowed even when the root was `root/`.
    const out = join(dir, "out.html");
    await buildSite({ inputDir: dir, outputFile: out, format: "html" });

    expect(await readFile(out, "utf8")).toContain("SECRET-FROM-OUTSIDE");
  });
});

describe("the four ways a first attempt let outside content through", () => {
  it("is not fooled by a //// inside a listing block", async () => {
    await symlink(join(outside, "secret.adoc"), join(root, "linked.adoc"));
    await writeFile(join(root, "a.adoc"), "= A\n\n----\n////\n----\n\ninclude::linked.adoc[]\n");

    await expect(build()).rejects.toThrow(/resolves outside the input root/i);
  });

  it("finds an include inside a one-line conditional", async () => {
    await symlink(join(outside, "secret.adoc"), join(root, "linked.adoc"));
    await writeFile(join(root, "a.adoc"), "= A\n\nifndef::not-set[include::linked.adoc[]]\n");

    await expect(build()).rejects.toThrow(/resolves outside the input root/i);
  });

  it("accepts a ] inside the target, which Asciidoctor does", async () => {
    await symlink(join(outside, "secret.adoc"), join(root, "we]ird.adoc"));
    await writeFile(join(root, "a.adoc"), "= A\n\ninclude::we]ird.adoc[]\n");

    await expect(build()).rejects.toThrow(/resolves outside the input root/i);
  });

  /**
   * Asciidoctor does not resolve symbolic links, so the directory it resolves the next level
   * against is the lexical one. Resolving the real path and recursing from there looked at
   * `root/sub/evil.adoc`, which does not exist, while Asciidoctor read `root/evil.adoc`.
   */
  it("keeps the lexical directory when a link leads to the next include", async () => {
    await mkdir(join(root, "sub"), { recursive: true });
    await writeFile(join(root, "sub", "part.adoc"), "include::evil.adoc[]\n");
    await symlink(join(root, "sub", "part.adoc"), join(root, "link.adoc"));
    await symlink(join(outside, "secret.adoc"), join(root, "evil.adoc"));
    await writeFile(join(root, "index.adoc"), "= A\n\ninclude::link.adoc[]\n");

    await expect(build()).rejects.toThrow(/resolves outside the input root/i);
  });

  it("is not hidden by a BOM or by lone carriage returns", async () => {
    await symlink(join(outside, "secret.adoc"), join(root, "linked.adoc"));
    await writeFile(join(root, "a.adoc"), "\uFEFF= A\r\rinclude::linked.adoc[]\r");

    await expect(build()).rejects.toThrow(/resolves outside the input root/i);
  });
});

describe("what the check leaves alone", () => {
  it("allows an include that stays inside the root", async () => {
    await mkdir(join(root, "sub"), { recursive: true });
    await writeFile(join(root, "sub", "part.adoc"), "Shared paragraph.\n");
    await writeFile(join(root, "a.adoc"), "= A\n\ninclude::sub/part.adoc[]\n");

    expect(await build()).toContain("Shared paragraph.");
  });

  it("allows a symbolic link that stays inside the root", async () => {
    await mkdir(join(root, "sub"), { recursive: true });
    await writeFile(join(root, "sub", "part.adoc"), "Shared paragraph.\n");
    await symlink(join(root, "sub", "part.adoc"), join(root, "part.adoc"));
    await writeFile(join(root, "a.adoc"), "= A\n\ninclude::part.adoc[]\n");

    expect(await build()).toContain("Shared paragraph.");
  });

  /**
   * A lexical escape was already refused by safe mode, but as an "Unresolved directive" paragraph
   * left in the output rather than as a build that stops. The check reaches it first now, so the
   * two ways of leaving the root are refused the same way and say the same thing. That is a
   * behaviour change for a document that carried a broken `../` include and built anyway.
   */
  it("refuses a lexical escape too, rather than leaving a broken paragraph in the output", async () => {
    await writeFile(join(root, "a.adoc"), "= A\n\ninclude::../outside/secret.adoc[]\n");

    await expect(build()).rejects.toThrow(/resolves outside the input root/i);
  });

  it("does not choke on an include that does not exist", async () => {
    await writeFile(join(root, "a.adoc"), "= A\n\ninclude::missing.adoc[]\n");

    expect(await build()).toContain("Unresolved directive");
  });

  it("does not follow itself round a cycle", async () => {
    await writeFile(join(root, "a.adoc"), "= A\n\ninclude::b.adoc[]\n");
    await writeFile(join(root, "b.adoc"), "include::a.adoc[]\n");

    // Asciidoctor stops the recursion itself; the check must not spin before reaching it.
    await expect(build()).resolves.toBeTypeOf("string");
  });

  /**
   * Deliberately over-approximated. Modelling `////` meant tracking block structure, and the first
   * attempt got it wrong in the permissive direction: a `////` inside a listing block put the
   * checker into a comment state Asciidoctor was not in, and the include after it leaked. No block
   * structure is modelled now, so an include inside a comment block is checked like any other.
   */
  it("checks an include inside a comment block too, rather than modelling block structure", async () => {
    await symlink(join(outside, "secret.adoc"), join(root, "linked.adoc"));
    await writeFile(join(root, "a.adoc"), "= A\n\n////\ninclude::linked.adoc[]\n////\n\nBody.\n");

    await expect(build()).rejects.toThrow(/resolves outside the input root/i);
  });

  /**
   * A target built from an attribute cannot be resolved without running Asciidoctor, so it is
   * skipped rather than guessed at. The limitation is the price of not taking the directive over,
   * and it is written down in roadmap.md 17.5 rather than left to be discovered.
   */
  it("skips a target built from an attribute reference", async () => {
    await mkdir(join(root, "sub"), { recursive: true });
    await writeFile(join(root, "sub", "part.adoc"), "Shared paragraph.\n");
    await writeFile(
      join(root, "a.adoc"),
      "= A\n:partsdir: sub\n\ninclude::{partsdir}/part.adoc[]\n",
    );

    expect(await build()).toContain("Shared paragraph.");
  });

  it("does not recurse into an include Asciidoctor does not read as AsciiDoc", async () => {
    // A code sample showing AsciiDoc syntax. Asciidoctor puts the `.rb` contents in a listing block
    // without preprocessing them, so the `include::` inside it is text rather than a directive.
    await symlink(join(outside, "secret.adoc"), join(root, "linked.adoc"));
    await writeFile(join(root, "sample.rb"), "# demo\ninclude::linked.adoc[]\n");
    await writeFile(
      join(root, "a.adoc"),
      "= A\n\n[source,ruby]\n----\ninclude::sample.rb[]\n----\n",
    );

    expect(await build()).toContain("demo");
  });

  it("honours the backslash that makes the directive literal", async () => {
    await symlink(join(outside, "secret.adoc"), join(root, "linked.adoc"));
    await writeFile(join(root, "a.adoc"), "= A\n\n\\include::linked.adoc[]\n");

    expect(await build()).toContain("include::linked.adoc[]");
  });

  it("leaves a target whose first character is a space, which is not a directive", async () => {
    await symlink(join(outside, "secret.adoc"), join(root, "linked.adoc"));
    await writeFile(join(root, "a.adoc"), "= A\n\ninclude:: linked.adoc[]\n");

    expect(await build()).toBeTypeOf("string");
  });

  it("leaves a Markdown-only document untouched", async () => {
    await writeFile(join(root, "a.md"), "# A\n\nBody.\n");

    expect(await build()).toContain("Body.");
  });
});

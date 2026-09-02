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

describe("the ways a static scan of the source text used to let content through", () => {
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
});

describe("safe mode recovering a path out of the jail", () => {
  /**
   * Safe mode does not refuse a target that climbs out of the jail — it **recovers** it by dropping
   * the `..` and reads the recovered path instead ("include file has illegal reference to ancestor
   * of jail; recovering automatically"). A check that resolved the target the plain way looked at a
   * path that does not exist, skipped it, and let Asciidoctor read a symbolic link out of the tree.
   */
  it("checks the path Asciidoctor recovers, not the one the target spells", async () => {
    await mkdir(join(root, "docs"), { recursive: true });
    await symlink(join(outside, "secret.adoc"), join(root, "docs", "linked.adoc"));
    await writeFile(join(root, "docs", "a.adoc"), "= A\n\ninclude::../linked.adoc[]\n");

    await expect(build()).rejects.toThrow(/resolves outside the input root/i);
  });

  it("allows the recovered path when it stays inside the root", async () => {
    await mkdir(join(root, "sub"), { recursive: true });
    // `../part.adoc` from a jail of `root/sub` recovers to `root/sub/part.adoc`, which is inside.
    await writeFile(join(root, "sub", "_part.adoc"), "Recovered paragraph.\n");
    await writeFile(join(root, "sub", "a.adoc"), "= A\n\ninclude::../_part.adoc[]\n");

    expect(await build()).toContain("Recovered paragraph.");
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
   * A lexical escape is not an escape. Safe mode recovers it into the jail rather than refusing it,
   * so `../outside/secret.adoc` from a jail of the root becomes `root/outside/secret.adoc` — a path
   * that does not exist here, which Asciidoctor reports as a missing include. There is nothing for
   * the boundary to refuse, and an earlier version of it refused this only because it resolved the
   * target differently from Asciidoctor.
   */
  it("leaves a lexical escape to safe mode, which recovers it into the jail", async () => {
    await writeFile(join(root, "a.adoc"), "= A\n\ninclude::../outside/secret.adoc[]\n");

    const html = await build();

    expect(html).not.toContain("SECRET-FROM-OUTSIDE");
    expect(html).toContain("Unresolved directive");
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
   * The check is asked at the moment Asciidoctor is about to read an include, so an include inside
   * a comment block is never offered to it — Asciidoctor does not read one. No block structure is
   * modelled, so there is nothing to get wrong and no false refusal to accept.
   */
  it("leaves an include inside a comment block alone, because Asciidoctor never reads it", async () => {
    await symlink(join(outside, "secret.adoc"), join(root, "linked.adoc"));
    await writeFile(join(root, "a.adoc"), "= A\n\n////\ninclude::linked.adoc[]\n////\n\nBody.\n");

    expect(await build()).toContain("Body.");
  });

  it("leaves an include inside a false conditional alone", async () => {
    await symlink(join(outside, "secret.adoc"), join(root, "linked.adoc"));
    await writeFile(
      join(root, "a.adoc"),
      "= A\n\nifdef::nope[]\ninclude::linked.adoc[]\nendif::[]\n\nBody.\n",
    );

    expect(await build()).toContain("Body.");
  });

  /**
   * `handles` is given the **expanded** target, so a target built from an attribute reference is
   * checked like any other. The static scan it replaced could not resolve one and had to skip it,
   * which was the hole it documented rather than closed.
   */
  it("checks a target built from an attribute reference, because it arrives expanded", async () => {
    await symlink(join(outside, "secret.adoc"), join(root, "linked.adoc"));
    await writeFile(
      join(root, "a.adoc"),
      "= A\n:partsdir: .\n\ninclude::{partsdir}/linked.adoc[]\n",
    );

    await expect(build()).rejects.toThrow(/resolves outside the input root/i);
  });

  it("still resolves an attribute-built target that stays inside", async () => {
    await mkdir(join(root, "sub"), { recursive: true });
    await writeFile(join(root, "sub", "part.adoc"), "Shared paragraph.\n");
    await writeFile(
      join(root, "a.adoc"),
      "= A\n:partsdir: sub\n\ninclude::{partsdir}/part.adoc[]\n",
    );

    expect(await build()).toContain("Shared paragraph.");
  });

  it("leaves a code sample quoting an include alone, because Asciidoctor does not read it", async () => {
    // Asciidoctor puts the `.rb` contents in a listing block without preprocessing them, so the
    // `include::` inside it is never offered to the check.
    await symlink(join(outside, "secret.adoc"), join(root, "linked.adoc"));
    await writeFile(join(root, "sample.rb"), "# demo\ninclude::linked.adoc[]\n");
    await writeFile(
      join(root, "a.adoc"),
      "= A\n\n[source,ruby]\n----\ninclude::sample.rb[]\n----\n",
    );

    expect(await build()).toContain("demo");
  });

  it("keeps lines= and tag= working, because a safe include is left to Asciidoctor", async () => {
    // `_`-prefixed so it is a fragment rather than a page of its own, which would put every line
    // of it in the bundle and make the assertions meaningless.
    await writeFile(
      join(root, "_part.adoc"),
      "line one\nline two\n// tag::a[]\ntagged line\n// end::a[]\nline five\n",
    );
    await writeFile(
      join(root, "a.adoc"),
      "= A\n\ninclude::_part.adoc[lines=2]\n\n== T\n\ninclude::_part.adoc[tag=a]\n",
    );

    const html = await build();
    expect(html).toContain("line two");
    expect(html).toContain("tagged line");
    expect(html).not.toContain("line five");
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

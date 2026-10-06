// Generates src/themes/mermaid-notices.txt: the third-party notices for the prebuilt Mermaid runtime
// (mermaid/dist/mermaid.min.js) that `mermaid.runtime: inline` embeds in the output HTML.
//
// The runtime is a single file mermaid's own build produced from mermaid's own lockfile, so what it
// contains is not what node_modules resolves: it carries versions this repository does not install,
// and two versions of some packages. The component list is therefore read from the runtime's source
// map — the packages its sources come from, and the packages esbuild names in the path comments of
// the pre-bundled chunks inside it (@mermaid-js/parser) — and each component's licence is read from
// that exact version: from the pnpm store when it is installed, otherwise from its npm tarball,
// checked against the registry's integrity hash (roadmap 21.3).
//
// A source map cannot see inside a package that ships its own pre-built file: roughjs's rollup
// bundle carries four packages, cytoscape's carries three of its devDependencies, and some files
// carry code copied in with its own licence. So a component with a large or pre-built source must be
// audited at its exact version in PREBUILT_AUDITED, which names what it carries, and every runtime
// dependency of every component must be listed or explained in NOT_IN_RUNTIME. Either gap fails the
// run rather than leaving a notice out.
//
//   node scripts/generate-mermaid-notices.mjs           rewrite the notices (may use the network)
//   node scripts/generate-mermaid-notices.mjs --check   exit 1 if the components listed in the
//                                                       notices are not the runtime's (offline)
//
// After a mermaid upgrade, run without --check and commit the result.
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const NOTICES_FILE = new URL("../src/themes/mermaid-notices.txt", import.meta.url);
const require = createRequire(new URL("../src/themes/mermaid.ts", import.meta.url));
const mermaidDir = dirname(require.resolve("mermaid/package.json"));
// LICENSE, LICENSE.txt, LICENSE-MIT, NOTICE.md…, but not a script such as license-update.mjs.
const LICENSE_FILE_RE = /^(licen[sc]e|copying|notice)([-.][a-z0-9]+)?(\.(md|txt|markdown))?$/i;
const SEP = "=".repeat(80);
const SUB = "-".repeat(80);

/**
 * Components with a source over 20 KB, minified, or under bundled/, build/ or umd/, audited by hand
 * at the version named: `bundled` lists the packages the file carries (its own build picked their
 * versions, so each is named by the range it declares and the version its licence text is read
 * from), and `vendored` describes code copied into it under another licence. An empty entry records
 * that the file was read and carries only the package's own code.
 */
const PREBUILT_AUDITED = {
  "@upsetjs/venn.js@2.0.0": {
    // build/venn.esm.js inlines fmin (nelderMead, conjugateGradient, bisect, zeros), patched by venn.js.
    bundled: [{ name: "fmin", version: "0.0.4", declared: "0.0.4, patched by venn.js" }],
  },
  // Inside the pre-bundled parser, single files over 20 KB of the package's own code.
  "chevrotain@11.1.2": {},
  "langium@4.2.1": {},
  "vscode-jsonrpc@8.2.0": {},
  "vscode-languageserver-protocol@3.17.5": {},
  "vscode-languageserver-types@3.17.5": {},
  "cose-base@1.0.3": {}, // requires layout-base rather than carrying it
  "cose-base@2.2.0": {},
  "cytoscape@3.34.0": {
    // dist/cytoscape.esm.mjs inlines these devDependencies.
    bundled: [
      { name: "gl-matrix", version: "3.4.3", declared: "^3.4.3" },
      { name: "heap", version: "0.2.7", declared: "^0.2.7" },
      { name: "lodash", version: "4.17.21", declared: "^4.17.21" },
    ],
    vendored: [
      "dist/cytoscape.esm.mjs also contains code under the MIT License whose authors it names:",
      "  Promises/A+ 1.1.1 Thenable — Copyright (c) 2013-2014 Ralf S. Engelschall (http://engelschall.com)",
      "  Bezier curve function generator — Copyright Gaetan Renaudeau",
      "  Runge-Kutta spring physics function generator, adapted from Framer.js — copyright Koen Bok",
      "  Event object based on jQuery events (https://github.com/jquery/jquery/blob/master/src/event.js)",
      "    — Copyright OpenJS Foundation and other contributors",
      "The MIT License text is reproduced above.",
    ],
    // "Explained by Blindman67 at https://stackoverflow.com/a/44856925" cites an explanation of
    // the technique; the code there is not copied.
  },
  "cytoscape-cose-bilkent@4.1.0": {}, // a webpack UMD of its own code; requires cose-base
  "cytoscape-fcose@2.2.0": {}, // requires cose-base rather than carrying it
  "dagre-d3-es@7.0.14": {},
  "dayjs@1.11.21": {},
  "dompurify@3.4.12": {},
  "js-yaml@4.3.0": {},
  "katex@0.16.47": {},
  "layout-base@1.0.2": {},
  "layout-base@2.0.1": {
    vendored: [
      "layout-base.js also contains code adopted, with changes, from JamaJS",
      "(https://github.com/dragonfly-ai/JamaJS), under the Apache License, Version 2.0. The file",
      "carries the licence's full text, which is reproduced in this document under the Apache-2.0",
      "components.",
    ],
    apache: true,
  },
  "marked@16.3.0": {},
  "mermaid@11.17.2": {
    // src/utils.ts copies entity-decode's browser decoder ("source: …/entity-decode/blob/v2.0.1").
    bundled: [
      {
        name: "entity-decode",
        version: "2.0.1",
        copied: "into src/utils.ts, from the version its source comment names",
        // The upstream LICENSE leaves the holder blank; package.json names the author.
        notice: "The copyright holder left blank above is the package's author, shrpne.",
      },
    ],
  },
  // Inside the pre-bundled parser: lib/esm/index.mjs is a webpack bundle carrying path-browserify.
  "vscode-uri@3.1.0": {
    bundled: [
      {
        name: "path-browserify",
        version: "1.0.1",
        declared: "^1.0.1 (devDependency)",
        // index.js is Node.js's path module, and keeps Node's notice in a header the bundle dropped.
        notice:
          "index.js is the path module extracted from Node.js v8.11.1, under the MIT License above:\n" +
          "  Copyright Joyent, Inc. and other Node contributors.",
      },
    ],
  },
  "roughjs@4.6.6": {
    // bundled/rough.esm.js is a rollup bundle of roughjs and its four dependencies.
    bundled: [
      { name: "hachure-fill", version: "0.5.2", declared: "^0.5.2" },
      { name: "path-data-parser", version: "0.1.0", declared: "^0.1.0" },
      { name: "points-on-curve", version: "0.2.0", declared: "^0.2.0" },
      { name: "points-on-path", version: "0.2.1", declared: "^0.2.1" },
    ],
  },
};

/**
 * Lines in mermaid's and the parser's own sources that cite where code came from. Those sources are
 * not in the store and are not judged by needsAudit; they are audited by hand with each mermaid
 * version (the mermaid@<version> entry above goes stale and forces it), and this list is printed on
 * generation as the place to start.
 */
export function ownSourceCitations(map) {
  const cites = [];
  const re =
    /(source:|adapted from|ported from|copied from|taken from|copyright|licen[cs]ed under)/i;
  map.sources.forEach((source, i) => {
    const content = map.sourcesContent?.[i] ?? "";
    let at = source;
    for (const line of content.split("\n")) {
      const mark = /^\/\/ (\S+\.[cm]?[jt]s)$/.exec(line);
      if (mark) at = mark[1];
      else if (!storeRef(at) && /^\s*(\/\/|\/?\*)/.test(line) && re.test(line))
        cites.push(`${at}: ${line.trim().slice(0, 140)}`);
    }
  });
  return cites;
}

/** Whether a source is one a component's own build may have filled with other code. */
function needsAudit(file, content, inEsbuildChunk = false) {
  const bundlerTrace =
    /__webpack_require__|\/\*{3}\/|createCommonjsModule|getDefaultExportFromCjs|function require[A-Z]\w* \(\)|typeof exports *=== *['"]object['"] *&& *typeof module/;
  if (bundlerTrace.test(content)) return true;
  // Inside mermaid's own esbuild chunk, __commonJS is esbuild wrapping the section's own module.
  if (!inEsbuildChunk && /__commonJS/.test(content)) return true;
  // Minified code runs to tens of thousands of characters a line; a long declaration does not.
  if (content.split("\n").some((line) => line.length > 10_000)) return true;
  return (
    content.length > 20_000 || /\.min\.js$/.test(file) || /(^|\/)(bundled|build|umd)\//.test(file)
  );
}

/** Declared dependencies that are not in the runtime, each with the reason. */
const NOT_IN_RUNTIME = {
  mermaid: { "@types/d3": "type declarations" },
  "@mermaid-js/parser": { "@chevrotain/types": "type declarations" },
  "@chevrotain/gast": { "@chevrotain/types": "type declarations" },
  chevrotain: {
    "@chevrotain/types": "type declarations",
    "@chevrotain/cst-dts-gen": "absent from the parser chunk's esbuild path comments",
  },
  langium: { "vscode-languageserver": "absent from the parser chunk's esbuild path comments" },
  "d3-delaunay": { delaunator: "only src/index.js is in the runtime; Delaunay is tree-shaken" },
  "d3-dsv": { rw: "command-line tools", commander: "command-line tools", "iconv-lite": "same" },
  "js-yaml": { argparse: "the command-line tool" },
  katex: { commander: "the command-line tool" },
  "entity-decode": { he: "its Node entry; the browser decoder mermaid copied uses the DOM" },
  fmin: { contour_plot: "fmin's plotting demos; venn.js's bundle has no contour code" },
  fastdom: { strictdom: "fastdom-strict.js, which the runtime does not import" },
  "@iconify/utils": Object.fromEntries(
    [
      "@antfu/install-pkg",
      "@antfu/utils",
      "@iconify/types",
      "debug",
      "globals",
      "kolorist",
      "local-pkg",
      "mlly",
    ].map((d) => [
      d,
      "only lib/icon, lib/icon-set, lib/svg and lib/customisations are in the runtime",
    ]),
  ),
};

/** Licence files left out on purpose: dompurify is dual-licensed and monodocs elects Apache-2.0. */
const EXCLUDED_FILES = { dompurify: ["LICENSE-MPL"] };

/** Packages whose published tarball has no licence file and states it in its README instead. */
const LICENCE_IN_README = new Set(["fastdom"]);

/** The last `.pnpm/<key>/node_modules/<name>/<file>` in a path, as { name, version, patched, file }. */
function storeRef(path) {
  const all = [
    ...path.matchAll(/\.pnpm\/([^/]+)\/node_modules\/(@[^/]+\/[^/]+|[^/]+)\/?([^\s]*)/g),
  ];
  if (all.length === 0) return null;
  const [, key, name, file] = all[all.length - 1];
  // A store key is `<name with / as +>@<version>`, then a peer or patch suffix.
  const prefix = `${name.replace("/", "+")}@`;
  if (!key.startsWith(prefix)) throw new Error(`unexpected store key ${key} for ${name}`);
  const rest = key.slice(prefix.length);
  return { name, version: /^[^_(]+/.exec(rest)[0], patched: rest.includes("patch_hash="), file };
}

/** The label a component carries in the notices, which is also what --check compares. */
function labelOf(c) {
  if (c.bundledIn) return `${c.name}@${c.version} (bundled inside ${labelOf(c.bundledIn)})`;
  const at = c.version ? `@${c.version}` : ` (built with mermaid@${c.builtWith})`;
  return `${c.name}${at}${c.patched ? " (patched by mermaid)" : ""}`;
}

/** Every component the runtime contains, sorted. */
export function componentsOf(map, mermaidVersion) {
  const found = new Map();
  const unaudited = new Set();
  const add = (path, content, inEsbuildChunk) => {
    const ref = storeRef(path);
    if (!ref) return;
    const id = `${ref.name}@${ref.version}`;
    found.set(id, {
      name: ref.name,
      version: ref.version,
      patched: ref.patched || Boolean(found.get(id)?.patched),
    });
    if (needsAudit(ref.file, content, inEsbuildChunk) && !PREBUILT_AUDITED[id]) {
      unaudited.add(`${id} (${ref.file})`);
    }
  };
  map.sources.forEach((source, i) => {
    const content = map.sourcesContent?.[i];
    if (content == null && storeRef(source))
      throw new Error(`${source}: no sourcesContent to audit`);
    add(source, content ?? "");
    // Pre-bundled chunks keep esbuild's `// <path>` comments naming where each part came from; each
    // section up to the next comment is that part's code, and is audited as its own source.
    // Sections are bounded by every path comment, the chunk's own src/ files included.
    const marks = [...(content ?? "").matchAll(/^\/\/ (\S+\.[cm]?[jt]s)$/gm)];
    marks.forEach((m, k) => {
      const section = content.slice(m.index + m[0].length, marks[k + 1]?.index ?? content.length);
      add(m[1], section, true);
    });
  });
  found.set("mermaid", { name: "mermaid", version: mermaidVersion, patched: false });
  // The parser is built from mermaid's repository in the same release, and mermaid depends on it by
  // range, so the bundle does not say which published version it equals. It is named by the release
  // it was built with.
  if (map.sources.some((s) => s.includes("/parser/dist/"))) {
    found.set("@mermaid-js/parser", {
      name: "@mermaid-js/parser",
      builtWith: mermaidVersion,
      patched: false,
    });
  }
  if (unaudited.size > 0) {
    throw new Error(
      "components with a large or pre-built source that PREBUILT_AUDITED does not cover at this " +
        `version; read each file and record what it carries:\n  ${[...unaudited].join("\n  ")}`,
    );
  }
  const present = new Set([...found.values()].map((c) => `${c.name}@${c.version}`));
  const stale = Object.keys(PREBUILT_AUDITED).filter((id) => !present.has(id));
  if (stale.length > 0) {
    throw new Error(
      `PREBUILT_AUDITED lists components the runtime no longer has: ${stale.join(", ")}`,
    );
  }
  for (const parent of [...found.values()]) {
    for (const b of PREBUILT_AUDITED[`${parent.name}@${parent.version}`]?.bundled ?? []) {
      found.set(`${b.name}@${b.version} in ${labelOf(parent)}`, {
        name: b.name,
        version: b.version,
        declared: b.declared,
        copied: b.copied,
        notice: b.notice,
        bundledIn: parent,
        patched: false,
      });
    }
  }
  return [...found.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || labelOf(a).localeCompare(labelOf(b)),
  );
}

/** The component labels a notices file lists: the lines between each SEP and SUB. */
export function listedComponents(text) {
  return [...text.matchAll(new RegExp(`^${SEP}\\n([\\s\\S]*?)\\n${SUB}$`, "gm"))]
    .flatMap((m) => m[1].split("\n"))
    .map((line) => line.split("  —  ")[0]);
}

/** Top-level files of an npm tarball (`package/<file>`), as name → Buffer. */
function topLevelFiles(tgz) {
  const tar = gunzipSync(tgz);
  const files = new Map();
  let paxPath;
  for (let off = 0; off + 512 <= tar.length;) {
    const header = tar.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const field = (start, len) =>
      header
        .subarray(start, start + len)
        .toString("utf8")
        .replace(/\0.*$/s, "");
    const size = parseInt(field(124, 12).trim() || "0", 8);
    const type = field(156, 1);
    const data = tar.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === "x") {
      // A pax header carries the next entry's path when it does not fit the ustar fields.
      paxPath = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(data.toString("utf8"))?.[1];
      continue;
    }
    const prefix = field(345, 155);
    const name = (paxPath ?? (prefix ? `${prefix}/` : "") + field(0, 100)).replace(/^\.\//, "");
    paxPath = undefined;
    const parts = name.split("/");
    if ((type === "0" || type === "") && parts.length === 2) files.set(parts[1], data);
  }
  return files;
}

async function fetchOk(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

/** { pkg, files } for a package directory: package.json, and its top-level files' names → text. */
async function fromDir(dir) {
  const files = new Map();
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (LICENSE_FILE_RE.test(entry.name) || /^readme(\.[^.]*)?$/i.test(entry.name)) {
      files.set(entry.name, await readFile(join(dir, entry.name), "utf8"));
    }
  }
  return { pkg: JSON.parse(await readFile(join(dir, "package.json"), "utf8")), files };
}

/** The pnpm store entries of exactly `name@version`. */
function storeEntries(entries, name, version) {
  const prefix = `${name.replace("/", "+")}@${version}`;
  return entries.filter(
    (e) => e === prefix || e.startsWith(`${prefix}_`) || e.startsWith(`${prefix}(`),
  );
}

/** { pkg, files } for exactly `name@version`: from the pnpm store, else from the registry. */
async function fetchPackage(storeDir, entries, name, version) {
  for (const entry of storeEntries(entries, name, version)) {
    const found = await fromDir(join(storeDir, entry, "node_modules", name)).catch(() => null);
    if (found?.pkg.version === version) return found;
  }
  const meta = await (await fetchOk(`https://registry.npmjs.org/${name}/${version}`)).json();
  const tgz = Buffer.from(await (await fetchOk(meta.dist.tarball)).arrayBuffer());
  const [algo, digest] = meta.dist.integrity.split("-");
  if (createHash(algo).update(tgz).digest("base64") !== digest) {
    throw new Error(`${name}@${version}: tarball does not match the registry's integrity`);
  }
  const files = new Map();
  for (const [f, data] of topLevelFiles(tgz)) {
    if (f === "package.json" || LICENSE_FILE_RE.test(f) || /^readme(\.[^.]*)?$/i.test(f)) {
      files.set(f, data.toString("utf8"));
    }
  }
  return { pkg: JSON.parse(files.get("package.json")), files };
}

function licenseOf(pkg) {
  if (typeof pkg.license === "string") return pkg.license;
  if (pkg.license && typeof pkg.license === "object") return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type).join(" OR ");
  return "UNKNOWN";
}

// A package with no `license` field (khroma) is named by its licence file's heading, and only when
// the heading is unambiguous, as scripts/bundle.mjs does for THIRD-PARTY-NOTICES.txt.
function inferLicense(text) {
  const head = text?.slice(0, 400) ?? "";
  if (/\bMIT License\b/i.test(head)) return "MIT";
  if (/\bISC License\b/i.test(head)) return "ISC";
  if (/\bApache License\b/i.test(head)) return "Apache-2.0";
  return "UNKNOWN";
}

/** Every licence and notice file of a package, joined; NOTICE files are kept for Apache-2.0. */
function licenceText(label, { pkg, files }) {
  const excluded = EXCLUDED_FILES[pkg.name] ?? [];
  const texts = [];
  for (const f of [...files.keys()].sort()) {
    if (!LICENSE_FILE_RE.test(f) || excluded.includes(f)) continue;
    const text = files.get(f).replace(/\r\n?/g, "\n").trim();
    if (text && !texts.includes(text)) texts.push(text);
  }
  if (texts.length === 0 && LICENCE_IN_README.has(pkg.name)) {
    const readme = [...files.entries()].find(([f]) => /^readme/i.test(f))?.[1] ?? "";
    const section = /^#+\s*Licen[sc]e\s*\n([\s\S]*?)(?=\n#+\s|(?![\s\S]))/im.exec(
      readme.replace(/\r\n?/g, "\n"),
    );
    if (section) texts.push(`(From the package's README.)\n\n${section[1].trim()}`);
  }
  if (texts.length === 0) throw new Error(`${label}: no licence text found`);
  return texts.join(`\n\n${SUB}\n\n`);
}

export async function render(components, mermaidVersion) {
  const marker = `${sep}.pnpm${sep}`;
  const at = mermaidDir.lastIndexOf(marker);
  if (at === -1) throw new Error(`mermaid is not installed by pnpm (${mermaidDir})`);
  const storeDir = mermaidDir.slice(0, at + marker.length);
  const entries = await readdir(storeDir);
  const names = new Set(components.map((c) => c.name));
  const parserDir = join(dirname(mermaidDir), "@mermaid-js", "parser");
  // Components whose licence text is identical (most of d3, say) share one block, so the text the
  // output carries once per diagram document is not repeated dozens of times.
  const blocks = new Map();
  const unexplained = [];
  for (const c of components) {
    let found;
    let note = "";
    if (c.bundledIn) {
      found = await fetchPackage(storeDir, entries, c.name, c.version);
      note = c.copied
        ? `(Copied by ${labelOf(c.bundledIn)} ${c.copied}.)\n\n`
        : `(Declared by ${labelOf(c.bundledIn)} as ${c.declared}; its build chose the version, and ` +
          `the licence text is ${c.name}@${c.version}'s.)\n\n`;
    } else if (c.version) {
      found = await fetchPackage(storeDir, entries, c.name, c.version);
    } else {
      found = await fromDir(parserDir);
      note = `(Licence text from ${c.name}@${found.pkg.version}.)\n\n`;
    }
    for (const dep of Object.keys(found.pkg.dependencies ?? {})) {
      if (names.has(dep) || NOT_IN_RUNTIME[c.name]?.[dep]) continue;
      unexplained.push(`${labelOf(c)} → ${dep}`);
    }
    const audit = c.version ? PREBUILT_AUDITED[`${c.name}@${c.version}`] : undefined;
    const vendored = audit?.vendored ? `\n\n${SUB}\n\n${audit.vendored.join("\n")}` : "";
    const extra = c.notice ? `\n\n${c.notice}` : "";
    const body = note + licenceText(labelOf(c), found) + extra + vendored;
    let license = licenseOf(found.pkg);
    if (license === "UNKNOWN") license = inferLicense(body);
    const block = blocks.get(body) ?? { labels: [], body };
    block.labels.push(`${labelOf(c)}  —  ${license}`);
    blocks.set(body, block);
  }
  if (unexplained.length > 0) {
    throw new Error(
      "dependencies the notices neither list nor explain; add each to PREBUILT_AUDITED or " +
        `NOT_IN_RUNTIME:\n  ${unexplained.join("\n  ")}`,
    );
  }
  const header = [
    `Third-party notices for the Mermaid runtime (mermaid@${mermaidVersion}) embedded in this file.`,
    `Generated by monodocs from the runtime's source map. Components: ${components.length}.`,
    "The runtime below also keeps the licence comments its own build preserved.",
    "",
    ...(names.has("dompurify")
      ? [
          'Note: "dompurify" is dual-licensed under "MPL-2.0 OR Apache-2.0"; monodocs elects the',
          "Apache-2.0 terms.",
          "",
        ]
      : []),
  ].join("\n");
  // Vendored code that refers to the Apache-2.0 text relies on another component carrying it.
  const needsApache = components.some((c) => PREBUILT_AUDITED[`${c.name}@${c.version}`]?.apache);
  if (needsApache && ![...blocks.keys()].some((b) => /Apache License\s+Version 2\.0/.test(b))) {
    throw new Error("vendored Apache-2.0 code refers to a licence text no component carries");
  }
  const text = [...blocks.values()]
    .map((b) => `${SEP}\n${b.labels.join("\n")}\n${SUB}\n${b.body}\n`)
    .join("\n");
  return `${header}\n${text}`;
}

async function main() {
  const { version } = JSON.parse(await readFile(join(mermaidDir, "package.json"), "utf8"));
  const map = JSON.parse(await readFile(join(mermaidDir, "dist/mermaid.min.js.map"), "utf8"));
  const components = componentsOf(map, version);
  if (process.argv.includes("--check")) {
    const listed = listedComponents(await readFile(NOTICES_FILE, "utf8").catch(() => ""));
    const expected = components.map(labelOf);
    if ([...listed].sort().join("\n") !== [...expected].sort().join("\n")) {
      const missing = expected.filter((l) => !listed.includes(l));
      const extra = listed.filter((l) => !expected.includes(l));
      console.error(
        "mermaid-notices.txt does not list the Mermaid runtime's components; run " +
          "scripts/generate-mermaid-notices.mjs\n" +
          `  missing: ${missing.join(", ") || "-"}\n  not in the runtime: ${extra.join(", ") || "-"}`,
      );
      process.exit(1);
    }
    return;
  }
  await writeFile(NOTICES_FILE, await render(components, version), "utf8");
  const cites = ownSourceCitations(map);
  if (cites.length > 0) {
    console.log(`mermaid's own sources cite (audit by hand):\n  ${cites.join("\n  ")}`);
  }
  console.log(`mermaid-notices: ${fileURLToPath(NOTICES_FILE)} (${components.length} components)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

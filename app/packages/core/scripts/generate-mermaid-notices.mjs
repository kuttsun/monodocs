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
// A source map cannot see inside a package that ships its own pre-built file (roughjs's rollup
// bundle), so every runtime dependency of every component has to be accounted for in BUNDLED_INSIDE
// or NOT_IN_RUNTIME below; one that is in neither fails the run rather than leaving a notice out.
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
const LICENSE_FILE_RE = /^(licen[sc]e|copying|notice)([-.][^/]*)?$/i;
const SEP = "=".repeat(80);
const SUB = "-".repeat(80);

/** Dependencies a component carries inside its own pre-built file, invisible to the source map. */
const BUNDLED_INSIDE = {
  // bundled/rough.esm.js is a rollup bundle of roughjs and these four.
  roughjs: ["hachure-fill", "path-data-parser", "points-on-curve", "points-on-path"],
};

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

/** The last `.pnpm/<key>/node_modules/<name>` in a path, as { name, version, patched }. */
function storeRef(path) {
  const all = [...path.matchAll(/\.pnpm\/([^/]+)\/node_modules\/(@[^/]+\/[^/]+|[^/]+)/g)];
  if (all.length === 0) return null;
  const [, key, name] = all[all.length - 1];
  // A store key is `<name with / as +>@<version>`, then a peer or patch suffix.
  const prefix = `${name.replace("/", "+")}@`;
  if (!key.startsWith(prefix)) throw new Error(`unexpected store key ${key} for ${name}`);
  const rest = key.slice(prefix.length);
  return { name, version: /^[^_(]+/.exec(rest)[0], patched: rest.includes("patch_hash=") };
}

/** The label a component carries in the notices, which is also what --check compares. */
function labelOf(c) {
  if (c.bundledIn) return `${c.name} (bundled inside ${labelOf(c.bundledIn)})`;
  const at = c.version ? `@${c.version}` : ` (built with mermaid@${c.builtWith})`;
  return `${c.name}${at}${c.patched ? " (patched by mermaid)" : ""}`;
}

/** Every component the runtime contains, sorted. */
export function componentsOf(map, mermaidVersion) {
  const found = new Map();
  const add = (path) => {
    const ref = storeRef(path);
    if (!ref) return;
    const id = `${ref.name}@${ref.version}`;
    found.set(id, { ...ref, patched: ref.patched || Boolean(found.get(id)?.patched) });
  };
  map.sources.forEach((source, i) => {
    add(source);
    // Pre-bundled chunks keep esbuild's `// <path>` comments naming where each part came from.
    for (const m of (map.sourcesContent?.[i] ?? "").matchAll(/^\/\/ (\S*node_modules\/\S+)$/gm)) {
      add(m[1]);
    }
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
  for (const parent of [...found.values()]) {
    for (const name of BUNDLED_INSIDE[parent.name] ?? []) {
      found.set(`${name} in ${labelOf(parent)}`, { name, bundledIn: parent, patched: false });
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
  for (const f of await readdir(dir)) {
    if (LICENSE_FILE_RE.test(f) || /^readme(\.[^.]*)?$/i.test(f)) {
      files.set(f, await readFile(join(dir, f), "utf8"));
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
      // pnpm links a package's dependencies beside it, at the versions its ranges resolved to.
      const [entry] = storeEntries(entries, c.bundledIn.name, c.bundledIn.version);
      if (!entry) throw new Error(`${labelOf(c)}: ${labelOf(c.bundledIn)} is not installed`);
      found = await fromDir(join(storeDir, entry, "node_modules", c.name));
      const range = (await fromDir(join(storeDir, entry, "node_modules", c.bundledIn.name))).pkg
        .dependencies[c.name];
      note = `(Declared by ${labelOf(c.bundledIn)} as ${range}; licence text from ${c.name}@${found.pkg.version}.)\n\n`;
    } else if (c.version) {
      found = await fetchPackage(storeDir, entries, c.name, c.version);
    } else {
      found = await fromDir(parserDir);
      note = `(Licence text from ${c.name}@${found.pkg.version}.)\n\n`;
    }
    if (!c.bundledIn) {
      for (const dep of Object.keys(found.pkg.dependencies ?? {})) {
        if (names.has(dep) || BUNDLED_INSIDE[c.name]?.includes(dep)) continue;
        if (NOT_IN_RUNTIME[c.name]?.[dep]) continue;
        unexplained.push(`${labelOf(c)} → ${dep}`);
      }
    }
    const body = note + licenceText(labelOf(c), found);
    let license = licenseOf(found.pkg);
    if (license === "UNKNOWN") license = inferLicense(body);
    const block = blocks.get(body) ?? { labels: [], body };
    block.labels.push(`${labelOf(c)}  —  ${license}`);
    blocks.set(body, block);
  }
  if (unexplained.length > 0) {
    throw new Error(
      "dependencies the notices neither list nor explain; add each to BUNDLED_INSIDE or " +
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
  console.log(`mermaid-notices: ${fileURLToPath(NOTICES_FILE)} (${components.length} components)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

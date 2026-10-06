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
//   node scripts/generate-mermaid-notices.mjs           rewrite the notices (may use the network)
//   node scripts/generate-mermaid-notices.mjs --check   exit 1 if the components listed in the
//                                                       notices are not the runtime's (offline)
//
// After a mermaid upgrade, run without --check and commit the result.
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const NOTICES_FILE = new URL("../src/themes/mermaid-notices.txt", import.meta.url);
const require = createRequire(new URL("../src/themes/mermaid.ts", import.meta.url));
const mermaidDir = dirname(require.resolve("mermaid/package.json"));
const LICENSE_FILE_RE = /^(licen[sc]e|copying|notice)(\.[^.]*)?$/i;
const SEP = "=".repeat(80);
const SUB = "-".repeat(80);

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
  return [...found.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || labelOf(a).localeCompare(labelOf(b)),
  );
}

/** The component labels a notices file lists, in order: the lines between each SEP and SUB. */
export function listedComponents(text) {
  return [...text.matchAll(new RegExp(`^${SEP}\\n([\\s\\S]*?)\\n${SUB}$`, "gm"))]
    .flatMap((m) => m[1].split("\n"))
    .map((line) => line.split("  —  ")[0]);
}

/** Top-level files of an npm tarball (`package/<file>`), as name → Buffer. */
function topLevelFiles(tgz) {
  const tar = gunzipSync(tgz);
  const files = new Map();
  for (let off = 0; off + 512 <= tar.length;) {
    const header = tar.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const field = (start, len) =>
      header
        .subarray(start, start + len)
        .toString("utf8")
        .replace(/\0.*$/s, "");
    const prefix = field(345, 155);
    const name = (prefix ? `${prefix}/` : "") + field(0, 100);
    const size = parseInt(field(124, 12).trim() || "0", 8);
    const type = field(156, 1);
    const parts = name.split("/");
    if ((type === "0" || type === "") && parts.length === 2) {
      files.set(parts[1], tar.subarray(off + 512, off + 512 + size));
    }
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

async function fromDir(dir) {
  const file = (await readdir(dir)).sort().find((f) => LICENSE_FILE_RE.test(f));
  return {
    pkg: JSON.parse(await readFile(join(dir, "package.json"), "utf8")),
    text: file ? await readFile(join(dir, file), "utf8") : null,
  };
}

/** { pkg, text } for exactly `name@version`: from the pnpm store, else from the registry. */
async function fetchPackage(storeDir, entries, name, version) {
  const prefix = `${name.replace("/", "+")}@${version}`;
  for (const entry of entries) {
    if (entry !== prefix && !entry.startsWith(`${prefix}_`) && !entry.startsWith(`${prefix}(`)) {
      continue;
    }
    const found = await fromDir(join(storeDir, entry, "node_modules", name)).catch(() => null);
    if (found?.pkg.version === version) return found;
  }
  const meta = await (await fetch(`https://registry.npmjs.org/${name}/${version}`)).json();
  if (!meta.dist?.tarball) throw new Error(`${name}@${version}: not found in the npm registry`);
  const tgz = Buffer.from(await (await fetch(meta.dist.tarball)).arrayBuffer());
  const [algo, digest] = meta.dist.integrity.split("-");
  if (createHash(algo).update(tgz).digest("base64") !== digest) {
    throw new Error(`${name}@${version}: tarball does not match the registry's integrity`);
  }
  const files = topLevelFiles(tgz);
  const file = [...files.keys()].sort().find((f) => LICENSE_FILE_RE.test(f));
  return {
    pkg: JSON.parse(files.get("package.json").toString("utf8")),
    text: file ? files.get(file).toString("utf8") : null,
  };
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

export async function render(components, mermaidVersion) {
  const storeDir = mermaidDir.slice(0, mermaidDir.lastIndexOf("/.pnpm/") + "/.pnpm/".length);
  const entries = await readdir(storeDir);
  // Components whose licence text is identical (most of d3, say) share one block, so the text the
  // output carries once per diagram document is not repeated dozens of times.
  const blocks = new Map();
  for (const c of components) {
    const { pkg, text } = c.version
      ? await fetchPackage(storeDir, entries, c.name, c.version)
      : // The parser's licence is read from the copy pnpm links beside mermaid.
        await fromDir(join(dirname(mermaidDir), c.name));
    let license = licenseOf(pkg);
    if (license === "UNKNOWN") license = inferLicense(text);
    const body =
      text?.replace(/\r\n?/g, "\n").trim() ||
      `(No licence file in the published package; declared licence: ${license})`;
    const block = blocks.get(body) ?? { labels: [], body };
    block.labels.push(`${labelOf(c)}  —  ${license}`);
    blocks.set(body, block);
  }
  const header = [
    `Third-party notices for the Mermaid runtime (mermaid@${mermaidVersion}) embedded in this file.`,
    `Generated by monodocs from the runtime's source map. Components: ${components.length}.`,
    "",
    'Note: "dompurify" is dual-licensed under "MPL-2.0 OR Apache-2.0"; monodocs elects the',
    "Apache-2.0 terms.",
    "",
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

// monodocs CLI を依存込みの単一 CJS ファイルにバンドルする。
//
// 単一実行ファイル（SEA）の入力になるほか、`node dist/monodocs.cjs ...` として
// そのまま実行もできる（ホストに node があれば任意ディレクトリを配信できる）。
//
// テーマアセット（template.html / style.css / app.js）と mermaid inline ランタイムは
// 実行時にファイルシステムから読むため、バンドル単体では参照できない。そこで banner で
// `globalThis.__MONODOCS_ASSETS__` に埋め込み、loadTheme / mermaidRuntimeScript が
// それを優先して使う（src 側の埋め込みフォールバックは themes/index.ts を参照）。
import { build } from "esbuild";
import { createRequire } from "node:module";
import { chmod, copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const coreSrc = resolve(appRoot, "packages/core/src");
const themeDir = resolve(coreSrc, "themes/default");
const entry = resolve(appRoot, "packages/cli/src/index.ts");
const cliDir = resolve(appRoot, "packages/cli");
const cliPackage = JSON.parse(await readFile(resolve(cliDir, "package.json"), "utf8"));
const packageDistDir = resolve(cliDir, "dist");
const outfile = resolve(packageDistDir, "monodocs.cjs");
const legacyDistDir = resolve(appRoot, "dist");

// 既定テーマのアセットを読み込んで埋め込む。
const [template, style, appJs] = await Promise.all([
  readFile(resolve(themeDir, "template.html"), "utf8"),
  readFile(resolve(themeDir, "style.css"), "utf8"),
  readFile(resolve(themeDir, "app.js"), "utf8"),
]);

// mermaid の inline ランタイム（config の mermaid.runtime: inline 用。既定 cdn では未使用）。
// node_modules を持たないホストでも inline を選べるよう同梱する。
const require = createRequire(resolve(coreSrc, "themes/mermaid.ts"));
const mermaidInline = await readFile(require.resolve("mermaid/dist/mermaid.min.js"), "utf8");

const assets = {
  themes: { default: { template, style, appJs } },
  mermaidInline,
};

await mkdir(dirname(outfile), { recursive: true });

const result = await build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "cjs", // SEA は CommonJS の main を要求する
  target: "node22",
  outfile,
  // cjs 出力では import.meta.url が空になり、fileURLToPath が読み込み時に throw する。
  // 実行ファイル自身のパスから URL を作って代替する（埋め込みアセット優先なので通常は未使用だが、
  // モジュール読み込み時の評価で壊れないようにする）。
  banner: {
    js:
      `globalThis.__MONODOCS_ASSETS__=${JSON.stringify(assets)};` +
      `var __monodocsImportMetaUrl=require("node:url").pathToFileURL(__filename).href;`,
  },
  define: {
    "import.meta.url": "__monodocsImportMetaUrl",
    __MONODOCS_VERSION__: JSON.stringify(cliPackage.version),
  },
  // puppeteer-core は optionalDependency で mermaid.mode: pre-render のときだけ動的 import する。
  // バンドルには含めない（Chromium 起動用に実体ファイルを要し、自己完結バンドルに載せられない）。
  // → このバンドル（単一 .cjs / SEA）は node_modules を持たないため pre-render 非対応。
  //   実行時に import("puppeteer-core") が失敗し、mermaidPrerender.ts が案内メッセージを出す。
  external: ["puppeteer-core"],
  // dist の tsc ビルドに依存せず、core を src から直接バンドルする。
  alias: { "@monodocs/core": resolve(coreSrc, "index.ts") },
  logLevel: "info",
  metafile: true,
});

const bytes = Object.values(result.metafile.outputs).reduce((n, o) => n + o.bytes, 0);
await chmod(outfile, 0o755);
console.log(`bundle: ${outfile} (${(bytes / 1024 / 1024).toFixed(1)} MiB)`);

// --- 第三者ライセンス表記（THIRD-PARTY-NOTICES.txt）の生成 ---
//
// 単一 .cjs / SEA は依存を埋め込んで再配布するため、MIT / BSD / Apache 等が課す
// 「著作権表示と許諾文を配布物に保持する」義務を満たす必要がある（node_modules を
// 個別に配布する通常の npm 公開と違い、埋め込み配布では自前で添付するしかない）。
//
// esbuild の metafile から「実際にバンドルへ取り込まれた」パッケージだけを集約し、
// 各パッケージの LICENSE 文を連結する。mermaid inline ランタイム（mermaidInline として
// アセット埋め込み。内部に dompurify を含む）は esbuild のグラフに現れないため明示追加する。

// 実行時にファイル名から拡張子を除いた形で LICENSE / COPYING / NOTICE を拾う。
const LICENSE_FILE_RE = /^(licen[sc]e|copying|notice)(\.[^.]*)?$/i;

// metafile の input パス（cwd 相対）から、取り込まれた各パッケージのディレクトリを抽出する。
// pnpm の `.pnpm/<pkg>@<ver>/node_modules/<pkg>/...` でも最後の `node_modules/` を境に解決できる。
function packageDirsFromMetafile(metafile) {
  const dirs = new Set();
  const marker = "node_modules/";
  for (const input of Object.keys(metafile.inputs)) {
    const idx = input.lastIndexOf(marker);
    if (idx === -1) continue;
    const after = input.slice(idx + marker.length).split("/");
    const name = after[0].startsWith("@") ? `${after[0]}/${after[1]}` : after[0];
    dirs.add(resolve(process.cwd(), input.slice(0, idx + marker.length) + name));
  }
  return dirs;
}

function spdxOf(pkg) {
  if (typeof pkg.license === "string") return pkg.license;
  if (pkg.license && typeof pkg.license === "object") return pkg.license.type ?? "UNKNOWN";
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type).join(" OR ");
  return "UNKNOWN";
}

// `license` フィールドを持たないパッケージ（例: khroma）でも、同梱 LICENSE の見出しから
// 代表的なライセンスを補って UNKNOWN 表記を避ける。ヘッダが明確なときだけ昇格する（誤判定回避）。
function inferLicenseFromText(text) {
  if (!text) return null;
  const head = text.slice(0, 400);
  if (/\bMIT License\b/i.test(head)) return "MIT";
  if (/\bISC License\b/i.test(head)) return "ISC";
  if (/\bApache License\b/i.test(head)) return "Apache-2.0";
  if (/\bBSD 3-Clause\b/i.test(head)) return "BSD-3-Clause";
  if (/\bBSD 2-Clause\b/i.test(head)) return "BSD-2-Clause";
  return null;
}

function repoUrlOf(pkg) {
  if (pkg.homepage) return pkg.homepage;
  const r = pkg.repository;
  if (typeof r === "string") return r;
  if (r && typeof r === "object" && r.url) return r.url;
  return "";
}

async function readLicenseText(pkgDir) {
  let entries;
  try {
    entries = await readdir(pkgDir);
  } catch {
    return null;
  }
  const file = entries.find((f) => LICENSE_FILE_RE.test(f));
  if (!file) return null;
  try {
    return (await readFile(resolve(pkgDir, file), "utf8")).trim();
  } catch {
    return null;
  }
}

async function collectNotices(pkgDirs) {
  const seen = new Map();
  for (const dir of pkgDirs) {
    let pkg;
    try {
      pkg = JSON.parse(await readFile(resolve(dir, "package.json"), "utf8"));
    } catch {
      continue;
    }
    const key = `${pkg.name}@${pkg.version}`;
    if (seen.has(key)) continue;
    const text = await readLicenseText(dir);
    let license = spdxOf(pkg);
    if (license === "UNKNOWN") license = inferLicenseFromText(text) ?? "UNKNOWN";
    seen.set(key, { name: pkg.name, version: pkg.version, license, url: repoUrlOf(pkg), text });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function pkgNameAt(dir) {
  try {
    return JSON.parse(await readFile(resolve(dir, "package.json"), "utf8")).name;
  } catch {
    return null;
  }
}

// `fromDir` のパッケージが依存する `name` のディレクトリを解決する。
// pnpm（`.pnpm/<parent>@<ver>/node_modules/<dep>` の兄弟）/ npm・yarn（ネスト）双方の
// レイアウトを候補で順に試し、最後にエントリ解決からの遡り（exports 制約に注意）で補完する。
async function resolveDependencyDir(fromDir, name) {
  const candidates = [resolve(fromDir, "node_modules", name), resolve(dirname(fromDir), name)];
  for (const c of candidates) {
    if ((await pkgNameAt(c)) === name) return c;
  }
  let entryDir;
  try {
    entryDir = dirname(createRequire(resolve(fromDir, "package.json")).resolve(name));
  } catch {
    return null;
  }
  for (let i = 0; i < 12; i++) {
    if ((await pkgNameAt(entryDir)) === name) return entryDir;
    const parent = dirname(entryDir);
    if (parent === entryDir) break;
    entryDir = parent;
  }
  return null;
}

// `rootDir` のパッケージの本番依存ツリー（dependencies / optionalDependencies）を辿り、
// 到達する全パッケージのディレクトリを集める。
async function collectDependencyTree(rootDir) {
  const found = new Set();
  const queue = [rootDir];
  while (queue.length) {
    const dir = queue.shift();
    if (found.has(dir)) continue;
    let pkg;
    try {
      pkg = JSON.parse(await readFile(resolve(dir, "package.json"), "utf8"));
    } catch {
      continue;
    }
    found.add(dir);
    const deps = { ...pkg.dependencies, ...pkg.optionalDependencies };
    for (const name of Object.keys(deps)) {
      const depDir = await resolveDependencyDir(dir, name);
      if (depDir && !found.has(depDir)) queue.push(depDir);
    }
  }
  return found;
}

// mermaid inline ランタイム（mermaid/dist/mermaid.min.js）は mermaid の依存を prebundle した
// 単一ファイル。esbuild のグラフに現れないため、mermaid の本番依存ツリー全体を辿って明示追加する
// （d3 / cytoscape / katex / dagre / roughjs / dompurify など）。
const mermaidDir = dirname(require.resolve("mermaid/package.json"));
const embeddedDirs = await collectDependencyTree(mermaidDir);

const notices = await collectNotices(
  new Set([...packageDirsFromMetafile(result.metafile), ...embeddedDirs]),
);

const sep = "=".repeat(80);
const sub = "-".repeat(80);
const header = [
  "monodocs THIRD-PARTY SOFTWARE NOTICES",
  "",
  "The monodocs single-file distribution (dist/monodocs.cjs and the SEA binary)",
  "embeds the following third-party open-source components. Each component is",
  "distributed under its own license, reproduced below.",
  "",
  `Generated: ${new Date().toISOString().slice(0, 10)}`,
  `Components: ${notices.length}`,
  "",
  'Note: "dompurify" is dual-licensed under "MPL-2.0 OR Apache-2.0";',
  "monodocs elects the Apache-2.0 terms.",
  "",
].join("\n");

const body = notices
  .map((n) => {
    const meta = [`${n.name}@${n.version}  —  ${n.license}`, n.url].filter(Boolean).join("\n");
    const text = n.text ?? `(No license file bundled; declared license: ${n.license})`;
    return `${sep}\n${meta}\n${sub}\n${text}\n`;
  })
  .join("\n");

const noticesFile = resolve(cliDir, "THIRD-PARTY-NOTICES.txt");
await writeFile(noticesFile, `${header}\n${body}\n`, "utf8");
console.log(`notices: ${noticesFile} (${notices.length} components)`);

// Keep the existing development/SEA entry point available while the published
// npm artifact is assembled from packages/cli.
await mkdir(legacyDistDir, { recursive: true });
await copyFile(outfile, resolve(legacyDistDir, "monodocs.cjs"));
await chmod(resolve(legacyDistDir, "monodocs.cjs"), 0o755);
await copyFile(noticesFile, resolve(legacyDistDir, "THIRD-PARTY-NOTICES.txt"));

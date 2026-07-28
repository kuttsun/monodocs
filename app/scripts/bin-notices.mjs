// 単一実行ファイルに同梱したソフトウェアのライセンス通知をまとめる。
//
// SEA バイナリは npm 依存だけでなく **Node.js ランタイム本体** も内包した再配布物であり、
// MIT / BSD / Apache などは再配布時に著作権表示とライセンス本文を添えることを求める。
// バイナリ単体では通知を読めないため、リリースへ添付する 1 ファイルに集約する。
//
// 出力: dist/monodocs-NOTICES.txt（`pnpm build:bin` が bundle → sea の後に実行する）
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "..");
const distDir = resolve(appDir, "dist");
const out = resolve(distDir, "monodocs-NOTICES.txt");

/** ビルドに使った node の LICENSE を探す（バイナリへ複製する実体そのもののライセンス）。 */
function nodeLicensePath() {
  const binDir = dirname(process.execPath);
  // Windows は <install>/node.exe、Linux/macOS は <install>/bin/node に置かれる。
  const candidates = [resolve(binDir, "LICENSE"), resolve(binDir, "..", "LICENSE")];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `Node.js LICENSE not found next to ${process.execPath}; ` +
        "the standalone binary embeds the Node.js runtime and must ship its license",
    );
  }
  return found;
}

function read(path, what) {
  if (!existsSync(path)) {
    throw new Error(`${what} not found: ${path}`);
  }
  return readFileSync(path, "utf8").trimEnd();
}

const separator = "=".repeat(80);
const sections = [
  [
    "monodocs STANDALONE BINARY — LICENSE NOTICES",
    "",
    "The standalone binary embeds the monodocs CLI, its third-party npm dependencies,",
    "and the Node.js runtime. Each component keeps its own license, reproduced below.",
    "",
    `Node.js: ${process.version} (${process.platform}-${process.arch})`,
  ].join("\n"),
  ["monodocs", separator, read(resolve(appDir, "..", "LICENSE"), "monodocs LICENSE")].join("\n"),
  ["Node.js runtime", separator, read(nodeLicensePath(), "Node.js LICENSE")].join("\n"),
  read(resolve(distDir, "THIRD-PARTY-NOTICES.txt"), "third-party notices"),
];

writeFileSync(out, `${sections.join(`\n\n${separator}\n\n`)}\n`);
console.log(`notices: ${out} (${(readFileSync(out).length / 1024).toFixed(0)} KiB)`);

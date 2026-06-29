// バンドル済み CJS（scripts/bundle.mjs の出力）を Node 22 の Single Executable
// Application（SEA）として単一ネイティブバイナリに固める。
//
// ビルドに使った node バイナリを複製し、SEA blob を postject で注入する。
// 出力 `dist/monodocs` はホストに node が無くても単体で動く（ビルド環境と同じ OS/arch 向け）。
//
// 参考: https://nodejs.org/api/single-executable-applications.html
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inject } from "postject";

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, "..", "dist");
const bundle = resolve(distDir, "monodocs.cjs");
const blob = resolve(distDir, "monodocs.blob");
const seaConfig = resolve(distDir, "sea-config.json");
const binOut = resolve(distDir, "monodocs");

// SEA 設定。main はバンドル済み CJS。useSnapshot/useCodeCache は実行 node 依存があるため無効化。
writeFileSync(
  seaConfig,
  JSON.stringify(
    {
      main: bundle,
      output: blob,
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: false,
    },
    null,
    2,
  ),
);

// 1) blob を生成する。
console.log("sea: generating blob ...");
execFileSync(process.execPath, ["--experimental-sea-config", seaConfig], { stdio: "inherit" });

// 2) ビルドに使った node バイナリを複製する。
console.log(`sea: copying node (${process.execPath}) -> ${binOut}`);
copyFileSync(process.execPath, binOut);
chmodSync(binOut, 0o755);

// 3) blob を実行ファイルへ注入する（Node が定める固定 sentinel fuse を使う）。
// macOS では postject の既定セグメント（__POSTJECT）ではなく、Node の SEA ローダが
// 参照する NODE_SEA セグメントへ注入する必要がある（Linux/Windows では無視される）。
console.log("sea: injecting blob with postject ...");
await inject(binOut, "NODE_SEA_BLOB", readFileSync(blob), {
  sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  machoSegmentName: "NODE_SEA",
});

const sizeMiB = (readFileSync(binOut).length / 1024 / 1024).toFixed(1);
console.log(`binary: ${binOut} (${sizeMiB} MiB)`);

// tsc はソース以外のアセット（.html / .css / .js）を dist へコピーしないため、
// テーマアセットを dist にコピーする。
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../src/themes");
const dest = resolve(here, "../dist/themes");

if (!existsSync(src)) {
  console.error(`copy-theme: source not found: ${src}`);
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
// .ts は tsc がコンパイル済みなので、アセット（.html/.css/.js）のみコピーする。
cpSync(src, dest, {
  recursive: true,
  filter: (s) => !s.endsWith(".ts"),
});

console.log(`copy-theme: ${src} -> ${dest}`);

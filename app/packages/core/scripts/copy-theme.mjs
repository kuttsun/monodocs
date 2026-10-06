// tsc does not copy non-source assets to dist, so the theme assets and the Mermaid runtime notices
// are copied here.
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
// tsc has compiled the .ts files; copy everything else, which is the theme's .html/.css/.js and the
// Mermaid runtime notices (.txt).
cpSync(src, dest, {
  recursive: true,
  filter: (s) => !s.endsWith(".ts"),
});

console.log(`copy-theme: ${src} -> ${dest}`);

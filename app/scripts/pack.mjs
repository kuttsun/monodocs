// Assemble the publishable npm package in a clean staging directory.
// The development CLI remains a private workspace package because its source
// imports @monodocs/core. The generated package contains only the bundled CLI
// and its optional Puppeteer dependency, so no workspace protocol leaks into
// the tarball.
import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { bundleExternals } from "./externals.mjs";

const here = resolve(fileURLToPath(new URL(".", import.meta.url)));
const appRoot = resolve(here, "..");
const cliDir = resolve(appRoot, "packages/cli");
const stageDir = resolve(appRoot, "dist/npm/monodocs");

const [developmentPackage, publishOverrides, corePackage] = await Promise.all([
  readFile(resolve(cliDir, "package.json"), "utf8").then(JSON.parse),
  readFile(resolve(cliDir, "package.publish.json"), "utf8").then(JSON.parse),
  readFile(resolve(appRoot, "packages/core/package.json"), "utf8").then(JSON.parse),
]);

// The externals are absent from the bundle, so users resolve them from the manifest published
// here rather than from the workspace. Take each range from packages/core, which is where the
// dependency is actually declared and where CI resolves the version it exercises. Writing the
// range out by hand here as well used to be the norm, and the two copies drifted apart every
// time a dependency bump touched only one of them.
if (publishOverrides.optionalDependencies) {
  throw new Error(
    "package.publish.json must not declare optionalDependencies: they are generated from " +
      "packages/core/package.json. Remove the entry and bump the range there instead.",
  );
}

const optionalDependencies = {};
for (const name of bundleExternals) {
  const range = corePackage.optionalDependencies?.[name];
  if (!range) {
    throw new Error(
      `packages/core must declare ${name} in optionalDependencies because the bundle keeps it ` +
        "external; otherwise the published package never installs it.",
    );
  }
  optionalDependencies[name] = range;
}

const publishPackage = {
  name: developmentPackage.name,
  version: developmentPackage.version,
  description: developmentPackage.description,
  license: developmentPackage.license,
  author: developmentPackage.author,
  homepage: developmentPackage.homepage,
  repository: developmentPackage.repository,
  bugs: developmentPackage.bugs,
  keywords: developmentPackage.keywords,
  ...publishOverrides,
  optionalDependencies,
};

const requiredArtifacts = [
  resolve(cliDir, "dist/monodocs.cjs"),
  resolve(cliDir, "LICENSE"),
  resolve(cliDir, "README.md"),
  resolve(cliDir, "README.ja.md"),
  resolve(cliDir, "THIRD-PARTY-NOTICES.txt"),
];

for (const artifact of requiredArtifacts) {
  try {
    await access(artifact);
  } catch {
    throw new Error(`missing package artifact: ${artifact}. Run \`pnpm bundle\` first.`);
  }
}

await rm(stageDir, { recursive: true, force: true });
await mkdir(resolve(stageDir, "dist"), { recursive: true });

await Promise.all([
  cp(resolve(cliDir, "dist/monodocs.cjs"), resolve(stageDir, "dist/monodocs.cjs")),
  cp(resolve(cliDir, "LICENSE"), resolve(stageDir, "LICENSE")),
  cp(resolve(cliDir, "README.md"), resolve(stageDir, "README.md")),
  cp(resolve(cliDir, "README.ja.md"), resolve(stageDir, "README.ja.md")),
  cp(resolve(cliDir, "THIRD-PARTY-NOTICES.txt"), resolve(stageDir, "THIRD-PARTY-NOTICES.txt")),
  writeFile(resolve(stageDir, "package.json"), `${JSON.stringify(publishPackage, null, 2)}\n`),
]);

console.log(`npm package staging directory: ${stageDir}`);

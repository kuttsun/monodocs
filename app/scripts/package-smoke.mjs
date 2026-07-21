// Pack the staged npm package, install it into a clean temporary project, and
// exercise the published CLI path. This intentionally avoids workspace links.
import { spawn, spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const appRoot = resolve(import.meta.dirname, "..");
const stagedPackage = resolve(appRoot, "dist/npm/monodocs");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npmRunOptions = process.platform === "win32" ? { shell: true } : {};
const temporaryRoot = await mkdtemp(join(tmpdir(), "monodocs-package-smoke-"));
const installRoot = resolve(temporaryRoot, "install");
let serveProcess;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: appRoot,
    encoding: "utf8",
    env: process.env,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      [
        `command failed (${result.status}): ${command} ${args.join(" ")}`,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result.stdout;
}

function fetchStatus(url) {
  return new Promise((resolveStatus, rejectStatus) => {
    const req = request(url, (response) => {
      response.resume();
      resolveStatus(response.statusCode);
    });
    req.once("error", rejectStatus);
    req.setTimeout(2_000, () => req.destroy(new Error("serve readiness probe timed out")));
    req.end();
  });
}

async function waitForServe(child, output) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `serve exited before becoming ready (${child.exitCode ?? child.signalCode})\n${output()}`,
      );
    }
    const match = /Serving at (http:\/\/[^\s]+)/.exec(output());
    if (match) {
      try {
        if ((await fetchStatus(match[1])) === 200) return;
      } catch {
        // The listener can be announced just before it accepts the first request.
      }
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`serve did not become ready within 20 seconds\n${output()}`);
}

async function stopServe(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGINT");
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await new Promise((resolveExit) => child.once("exit", resolveExit));
  }
}

try {
  const packOutput = run(
    npm,
    ["pack", "--json", "--pack-destination", temporaryRoot, stagedPackage],
    npmRunOptions,
  );
  const packResult = JSON.parse(packOutput);
  if (!Array.isArray(packResult) || !packResult[0]?.filename) {
    throw new Error(`npm pack did not report a tarball filename: ${packOutput}`);
  }

  const tarball = resolve(temporaryRoot, packResult[0].filename);
  const tarballBytes = (await stat(tarball)).size;
  const installStarted = Date.now();
  run(npm, ["install", "--prefix", installRoot, "--no-audit", "--no-fund", tarball], npmRunOptions);
  const installSeconds = ((Date.now() - installStarted) / 1000).toFixed(1);

  const cli = resolve(installRoot, "node_modules/monodocs/dist/monodocs.cjs");
  const packageJson = JSON.parse(
    await readFile(resolve(installRoot, "node_modules/monodocs/package.json"), "utf8"),
  );
  const example = resolve(appRoot, "../examples/en");
  const markdownExample = resolve(temporaryRoot, "markdown");
  const markdownOutput = resolve(temporaryRoot, "markdown.html");
  const htmlOutput = resolve(temporaryRoot, "manual.html");
  const pdfOutput = resolve(temporaryRoot, "manual.pdf");
  const prerenderOutput = resolve(temporaryRoot, "manual-prerender.html");
  const prerenderConfig = resolve(temporaryRoot, "prerender.yml");
  const serveOutput = resolve(temporaryRoot, "serve.html");

  const versionOutput = run(
    npm,
    ["exec", "--prefix", installRoot, "--", "monodocs", "--version"],
    npmRunOptions,
  );
  if (versionOutput.trim() !== packageJson.version) {
    throw new Error(`unexpected CLI version: ${versionOutput.trim()}`);
  }
  run(npm, ["exec", "--prefix", installRoot, "--", "monodocs", "--help"], npmRunOptions);
  await Promise.all([
    access(resolve(installRoot, "node_modules/monodocs/LICENSE")),
    access(resolve(installRoot, "node_modules/monodocs/THIRD-PARTY-NOTICES.txt")),
  ]);

  await mkdir(markdownExample);
  await writeFile(resolve(markdownExample, "index.md"), "# Package smoke\n\nMarkdown input.\n");
  run(process.execPath, [cli, "build", markdownExample, "-o", markdownOutput]);
  run(process.execPath, [cli, "validate", example]);
  run(process.execPath, [cli, "build", example, "-o", htmlOutput]);
  if (!(await readFile(htmlOutput, "utf8")).includes("<!doctype html>")) {
    throw new Error("installed CLI did not generate the expected HTML document");
  }

  await writeFile(prerenderConfig, "mermaid:\n  mode: pre-render\n");
  run(process.execPath, [cli, "build", example, "-c", prerenderConfig, "-o", prerenderOutput]);
  if (!(await readFile(prerenderOutput, "utf8")).includes("<svg")) {
    throw new Error("installed CLI did not generate a pre-rendered Mermaid SVG");
  }

  run(process.execPath, [cli, "build", example, "--format", "pdf", "-o", pdfOutput]);
  const pdfMagic = (await readFile(pdfOutput)).subarray(0, 5).toString("latin1");
  if (pdfMagic !== "%PDF-") throw new Error(`invalid PDF header: ${pdfMagic}`);

  let serveLog = "";
  serveProcess = spawn(
    process.execPath,
    [cli, "serve", example, "--host", "127.0.0.1", "--port", "0", "-o", serveOutput],
    { cwd: temporaryRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  serveProcess.stdout.on("data", (chunk) => (serveLog += chunk));
  serveProcess.stderr.on("data", (chunk) => (serveLog += chunk));
  await waitForServe(serveProcess, () => serveLog);
  await stopServe(serveProcess);

  console.log(
    `package smoke passed: ${packageJson.name}@${packageJson.version}, ` +
      `${(tarballBytes / 1024 / 1024).toFixed(1)} MiB tarball, ${installSeconds}s install`,
  );
} finally {
  if (serveProcess) await stopServe(serveProcess);
  await rm(temporaryRoot, { recursive: true, force: true });
}

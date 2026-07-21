import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const stageDir = resolve(appRoot, "dist/npm/monodocs");
const fixtureDir = resolve(appRoot, "../examples/en");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const temporaryRoot = await mkdtemp(join(tmpdir(), "monodocs-npm-smoke-"));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: appRoot,
    encoding: "utf8",
    shell: process.platform === "win32" && command === npmCommand,
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.status !== 0) {
    if (options.capture) {
      process.stderr.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
    }
    const detail = result.error ? `: ${result.error.message}` : "";
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}${detail}`);
  }
  return result.stdout ?? "";
}

function runCli(cli, args) {
  run(process.execPath, [cli, ...args]);
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : undefined;
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  if (!port) throw new Error("Failed to reserve a port for the serve smoke test");
  return port;
}

async function waitForHttp(url, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`serve exited before responding (status ${child.exitCode})`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok && (await response.text()).includes("<!doctype html>")) return;
    } catch {
      // The server may still be starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`serve did not respond at ${url}`);
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
  if (!child.kill("SIGTERM")) return;
  const stoppedGracefully = await Promise.race([
    exited.then(() => true),
    new Promise((resolveDelay) => setTimeout(() => resolveDelay(false), 5_000)),
  ]);
  if (!stoppedGracefully && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await exited;
  }
}

try {
  const packOutput = run(
    npmCommand,
    ["pack", stageDir, "--pack-destination", temporaryRoot, "--json"],
    { capture: true },
  );
  const [packResult] = JSON.parse(packOutput);
  if (!packResult?.filename) throw new Error("npm pack did not report a tarball filename");

  const expectedFiles = [
    "LICENSE",
    "README.md",
    "THIRD-PARTY-NOTICES.txt",
    "dist/monodocs.cjs",
    "package.json",
  ];
  const actualFiles = packResult.files.map(({ path }) => path).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles.sort())) {
    throw new Error(`Unexpected npm package files: ${actualFiles.join(", ")}`);
  }

  const tarball = join(temporaryRoot, basename(packResult.filename));
  const installRoot = join(temporaryRoot, "install");
  const installStarted = performance.now();
  run(npmCommand, ["install", "--prefix", installRoot, tarball]);
  const installSeconds = (performance.now() - installStarted) / 1000;

  const packageRoot = join(installRoot, "node_modules/monodocs");
  const cli = join(packageRoot, "dist/monodocs.cjs");
  const packageJson = await readFile(join(packageRoot, "package.json"), "utf8");
  if (packageJson.includes("workspace:*"))
    throw new Error("Published package contains workspace:* dependencies");

  const outputDir = join(temporaryRoot, "output");
  const markdownFixtureDir = join(temporaryRoot, "markdown");
  const markdownOutput = join(outputDir, "markdown.html");
  const htmlOutput = join(outputDir, "manual.html");
  const pdfOutput = join(outputDir, "manual.pdf");
  const prerenderOutput = join(outputDir, "pre-render.html");
  const prerenderConfig = join(temporaryRoot, "pre-render.yml");
  await writeFile(prerenderConfig, "mermaid:\n  mode: pre-render\n");
  await mkdir(markdownFixtureDir);
  await writeFile(join(markdownFixtureDir, "index.md"), "# Package smoke\n\nMarkdown input.\n");

  runCli(cli, ["--version"]);
  runCli(cli, ["--help"]);
  runCli(cli, ["validate", fixtureDir]);
  runCli(cli, ["build", markdownFixtureDir, "-o", markdownOutput]);
  runCli(cli, ["build", fixtureDir, "-o", htmlOutput]);
  runCli(cli, ["build", fixtureDir, "--format", "pdf", "-o", pdfOutput]);
  runCli(cli, ["build", fixtureDir, "-c", prerenderConfig, "-o", prerenderOutput]);

  const pdfHeader = (await readFile(pdfOutput)).subarray(0, 5).toString("latin1");
  if (pdfHeader !== "%PDF-") throw new Error(`Invalid PDF header: ${pdfHeader}`);
  const prerenderedHtml = await readFile(prerenderOutput, "utf8");
  if (!prerenderedHtml.includes('<figure class="mermaid"><svg')) {
    throw new Error("Pre-rendered Mermaid SVG not found");
  }

  const port = await reservePort();
  const server = spawn(
    process.execPath,
    [cli, "serve", fixtureDir, "--host", "127.0.0.1", "--port", String(port)],
    { cwd: appRoot, stdio: ["ignore", "pipe", "pipe"] },
  );
  let serverOutput = "";
  server.stdout.on("data", (chunk) => (serverOutput += chunk));
  server.stderr.on("data", (chunk) => (serverOutput += chunk));
  try {
    await waitForHttp(`http://127.0.0.1:${port}/`, server);
  } catch (error) {
    process.stderr.write(serverOutput);
    throw error;
  } finally {
    await stopChild(server);
  }

  const tarballSize = (await stat(tarball)).size;
  console.log(
    `npm package smoke test passed: ${tarballSize} bytes packed, ${packResult.unpackedSize} bytes unpacked, ` +
      `${installSeconds.toFixed(1)}s install`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

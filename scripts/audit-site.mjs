#!/usr/bin/env node
// `npm audit` for site/, failing on every advisory but those listed below.
//
// npm has no counterpart of pnpm's `auditConfig.ignoreGhsas`, and `--omit=dev` would hide everything:
// every site dependency is a dev dependency, since the site never ships. So this runs `npm audit
// --json` in the current directory and fails when any advisory remains once the listed ones are set
// aside. Each listed advisory has its reason and removal condition in docs/development.md, beside
// the app's, and the quarterly review re-checks it. A run npm could not finish fails too.
//
// Usage (from site/): node ../scripts/audit-site.mjs
import { spawnSync } from "node:child_process";

/** Advisories set aside, each with its reason in docs/development.md. */
const IGNORED = new Map([
  // picomatch ReDoS through single-branch repeated extglobs, with no patched version; the site's
  // copy is under vite, a build tool that does not ship.
  ["GHSA-fc5q-39xc-vjpf", "picomatch, no patched version; under vite, which does not ship"],
]);

const run = spawnSync("npm", ["audit", "--json"], {
  encoding: "utf8",
  shell: process.platform === "win32",
});
let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error(`npm audit did not report: ${run.stderr || run.stdout}`);
  process.exit(1);
}
if (report.error !== undefined) {
  // The reason is in the report's message when the error itself is empty (an unreachable registry).
  console.error(`npm audit failed: ${report.message ?? ""} ${JSON.stringify(report.error)}`.trim());
  process.exit(1);
}
// A report of another shape — a future npm's — is not read as a clean one.
if (report.auditReportVersion !== 2 || typeof report.vulnerabilities !== "object") {
  console.error(`npm audit gave a report this script does not read: ${run.stdout.slice(0, 500)}`);
  process.exit(1);
}

// Each advisory, once, with the packages it reaches.
const advisories = new Map();
for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via) {
    if (typeof via !== "object") continue;
    const ghsa = /GHSA-[\w-]+/.exec(via.url ?? "")?.[0] ?? `npm:${via.source}`;
    const entry = advisories.get(ghsa) ?? { title: via.title, severity: via.severity, packages: [] };
    entry.packages.push(via.name);
    advisories.set(ghsa, entry);
  }
}

let remaining = 0;
for (const [ghsa, { title, severity, packages }] of advisories) {
  const reason = IGNORED.get(ghsa);
  const line = `${ghsa} (${severity}) ${title} — ${[...new Set(packages)].join(", ")}`;
  if (reason === undefined) {
    remaining++;
    console.error(`advisory: ${line}`);
  } else console.log(`ignored: ${line} (${reason})`);
}
if (remaining > 0) {
  console.error(`${remaining} advisory(ies) not set aside; see docs/maintenance.md.`);
  process.exit(1);
}
console.log(`npm audit: no advisory but those set aside (${advisories.size}).`);

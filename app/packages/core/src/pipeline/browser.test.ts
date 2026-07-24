import { describe, expect, it } from "vitest";

import { chromiumCandidates } from "./browser";

describe("chromiumCandidates", () => {
  it("returns Windows Chrome, Chromium and Edge paths on win32", () => {
    const env = {
      ProgramFiles: "C:\\Program Files",
      "ProgramFiles(x86)": "C:\\Program Files (x86)",
      LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local",
    } as NodeJS.ProcessEnv;
    const candidates = chromiumCandidates("win32", env);

    // Google Chrome: machine-wide and per-user installs.
    expect(candidates).toContain("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
    expect(candidates).toContain(
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    );
    expect(candidates).toContain(
      "C:\\Users\\me\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe",
    );
    // Chromium and the Edge fallback.
    expect(candidates).toContain("C:\\Program Files\\Chromium\\Application\\chrome.exe");
    expect(candidates).toContain(
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    );
    // Chrome is preferred over the Edge fallback.
    const chrome = candidates.findIndex((p) =>
      p.endsWith("Google\\Chrome\\Application\\chrome.exe"),
    );
    const edge = candidates.findIndex((p) => p.endsWith("Edge\\Application\\msedge.exe"));
    expect(chrome).toBeGreaterThanOrEqual(0);
    expect(edge).toBeGreaterThan(chrome);
  });

  it("falls back to default program directories and omits per-user paths when LOCALAPPDATA is unset", () => {
    const candidates = chromiumCandidates("win32", {} as NodeJS.ProcessEnv);
    expect(candidates).toContain("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
    expect(candidates.some((p) => p.includes("AppData"))).toBe(false);
  });

  it("returns Linux paths by default", () => {
    const candidates = chromiumCandidates("linux", {} as NodeJS.ProcessEnv);
    expect(candidates).toContain("/usr/bin/google-chrome");
    expect(candidates).toContain("/usr/bin/chromium");
    expect(candidates.every((p) => p.startsWith("/usr/bin/"))).toBe(true);
  });
});

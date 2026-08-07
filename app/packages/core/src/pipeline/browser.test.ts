import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_MESSAGE_LANG, setMessageLang } from "../messages";

import { chromiumCandidates, isStandaloneBinary, puppeteerMissingMessage } from "./browser";

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

describe("puppeteerMissingMessage", () => {
  afterEach(() => setMessageLang(DEFAULT_MESSAGE_LANG));

  // 単一実行ファイルの利用者は Node.js もパッケージマネージャも持たない前提なので、
  // `pnpm add` / `npm install puppeteer-core` を案内しても直せない。npm 版へ誘導する。
  it("tells a standalone-binary user to switch to the npm package, not to install anything", () => {
    const message = puppeteerMissingMessage(true);

    expect(message).toContain("single-executable");
    expect(message).toContain("npm install -g monodocs");
    expect(message).not.toContain("pnpm add");
    expect(message).not.toContain("npm install puppeteer-core");
  });

  it("tells everyone else how to install the missing optional dependency", () => {
    const message = puppeteerMissingMessage(false);

    expect(message).toContain("puppeteer-core");
    expect(message).toContain("optional dependency");
    expect(message).toContain("pnpm add puppeteer-core");
    expect(message).not.toContain("single-executable");
  });
});

describe("puppeteerMissingMessage（日本語）", () => {
  afterEach(() => setMessageLang(DEFAULT_MESSAGE_LANG));

  // 案内の中身が二者で違うことは言語に依らない性質なので、日本語でも同じ形を確かめる。
  it("keeps the two audiences apart in Japanese too", () => {
    setMessageLang("ja");
    expect(puppeteerMissingMessage(true)).toContain("単一実行ファイル");
    expect(puppeteerMissingMessage(true)).not.toContain("pnpm add");
    expect(puppeteerMissingMessage(false)).toContain("pnpm add puppeteer-core");
    expect(puppeteerMissingMessage(false)).not.toContain("単一実行ファイル");
  });
});

describe("isStandaloneBinary", () => {
  // テストは通常の Node.js で走るため SEA ではない。判定に失敗しても throw せず
  // false を返すこと（案内自体は必ず出せること）を確かめる。
  it("reports false when running under a normal Node.js process", async () => {
    await expect(isStandaloneBinary()).resolves.toBe(false);
  });
});

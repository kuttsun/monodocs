import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite } from "../../build";
import { loadTheme } from "../index";

/**
 * The search box's clear button (v0.16, roadmap 22.6). Whether the browser still
 * draws its own ×, where the button sits, and whether Tab reaches it are a real engine's answers:
 * happy-dom draws nothing and reports zero for every box. Chromium only when it is present, like
 * layout.test.ts. Firefox and Safari are looked at by a person during the beta.
 */
const chromium =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) =>
    existsSync(p),
  );

let dir: string;
let html: string;
let browser: Browser;

/** Build a two-page document, its config holding `config`, and return the HTML. */
async function build(name: string, config: string): Promise<string> {
  const docs = join(dir, name);
  await mkdir(docs, { recursive: true });
  await writeFile(join(docs, "index.md"), "# Home\n\nInstall the tool first.\n");
  await writeFile(join(docs, "guide.md"), "# Guide\n\nInstall it, then configure it.\n");
  if (config) await writeFile(join(docs, "monodocs.config.yml"), config);
  const out = join(dir, `${name}.html`);
  await buildSite({ inputDir: docs, outputFile: out, format: "html" });
  return readFile(out, "utf8");
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "monodocs-search-clear-"));
  html = await build("en", "");
  if (!chromium) return;
  const puppeteer = (await import("puppeteer-core")).default;
  browser = await puppeteer.launch({
    headless: true,
    executablePath: chromium,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function open(width: number): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 800 });
  await page.setContent(html, { waitUntil: "load" });
  return page;
}

/** The input's box and the button's, or null for a button that takes no space. */
async function boxes(page: Page) {
  return page.evaluate(() => {
    const rect = (id: string) => {
      const r = document.getElementById(id)!.getBoundingClientRect();
      return r.width > 0 && r.height > 0
        ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width }
        : null;
    };
    const input = document.getElementById("search-input")!;
    return {
      input: rect("search-input")!,
      button: rect("search-clear"),
      paddingRight: parseFloat(getComputedStyle(input).paddingRight),
      viewport: window.innerWidth,
    };
  });
}

/**
 * Whether anything is drawn in the search box right of a one-letter query, where a browser puts its
 * own ×, with the theme's button made invisible. `control` deletes the theme's rule that hides the
 * ×, so a Chromium that stopped drawing one by default would fail the control rather than pass the
 * probe.
 */
async function nativeCancelDrawn(page: Page, control: boolean): Promise<boolean> {
  await page.evaluate((control) => {
    // Hidden, not removed: the rules that hide the × apply only while the button is there.
    const button = document.getElementById("search-clear");
    if (button) button.style.visibility = "hidden";
    if (control) {
      for (const sheet of document.styleSheets) {
        const rules = sheet.cssRules;
        for (let i = rules.length - 1; i >= 0; i--) {
          if (rules[i]!.cssText.includes("::-webkit-search-cancel-button")) sheet.deleteRule(i);
        }
      }
    }
    const input = document.getElementById("search-input") as HTMLInputElement;
    input.value = "a";
    input.focus();
  }, control);
  await page.hover("#search-input");
  const clip = await page.evaluate(() => {
    const r = document.getElementById("search-input")!.getBoundingClientRect();
    // Everything right of the one-letter query, inside the border and clear of the rounded
    // corners: the browser draws its × at the end of the content box, before the padding.
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return {
      x: r.left + 2 * rem,
      y: r.top + 4,
      width: r.width - 2 * rem - 4,
      height: r.height - 8,
    };
  });
  const shot = await page.screenshot({ clip, encoding: "base64" });
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = `data:image/png;base64,${src}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    for (let i = 4; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) if (Math.abs(data[i + c]! - data[c]!) > 8) return true;
    }
    return false;
  }, shot);
}

describe("the clear button's name", () => {
  it("comes from the label table, and html.labels replaces it", async () => {
    expect(html).toMatch(/id="search-clear"[^>]*aria-label="Clear search"/);
    const ja = await build("ja", "lang: ja\n");
    expect(ja).toMatch(/id="search-clear"[^>]*aria-label="検索語を消去"/);
    const own = await build("own", 'html:\n  labels:\n    clearSearch: "Reset"\n');
    expect(own).toMatch(/id="search-clear"[^>]*aria-label="Reset"[^>]*title="Reset"/);
  }, 60_000);
});

describe.skipIf(!chromium)("search clear button (real Chromium)", () => {
  it("no longer lets the browser draw its own ×", async () => {
    const page = await open(1280);
    try {
      // Chromium answers getComputedStyle for this pseudo-element with the input's own style, so
      // the × is looked for in pixels: the free part of a focused, hovered box with a query, the
      // theme's button taken away. The control deletes the theme's rule, which proves both that
      // the probe would see the × and that Chromium draws one without the rule.
      expect(await nativeCancelDrawn(page, false)).toBe(false);
      expect(await nativeCancelDrawn(page, true)).toBe(true);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("shows only while the box holds a query, inside the box's right edge", async () => {
    const page = await open(1280);
    try {
      expect((await boxes(page)).button).toBeNull();
      await page.type("#search-input", "install");
      const { input, button, paddingRight } = await boxes(page);
      expect(button).not.toBeNull();
      // Inside the box's right edge, over padding kept free for it, so the query never runs
      // under it.
      expect(button!.left).toBeGreaterThanOrEqual(input.left);
      expect(button!.right).toBeLessThanOrEqual(input.right);
      expect(button!.top).toBeGreaterThanOrEqual(input.top);
      expect(button!.bottom).toBeLessThanOrEqual(input.bottom);
      expect(paddingRight).toBeGreaterThanOrEqual(input.right - button!.left);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("is reached by Tab from the box and pressed with Enter, the focus going back", async () => {
    const page = await open(1280);
    try {
      await page.type("#search-input", "install");
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.activeElement?.id)).toBe("search-clear");
      await page.keyboard.press("Enter");
      const after = await page.evaluate(() => ({
        value: (document.getElementById("search-input") as HTMLInputElement).value,
        focus: document.activeElement?.id,
        results: document.getElementById("search-results")!.hidden,
      }));
      expect(after).toEqual({ value: "", focus: "search-input", results: true });
      expect((await boxes(page)).button).toBeNull();
    } finally {
      await page.close();
    }
  }, 60_000);

  it("sits inside the box in the drawer on a narrow screen, and leaves the drawer open", async () => {
    const page = await open(375);
    try {
      await page.click("#sidebar-show");
      // The drawer slides in; measure and click once it has arrived.
      await page.waitForFunction(
        () => getComputedStyle(document.getElementById("sidebar")!).transform === "none",
      );
      await page.type("#search-input", "install");
      const { input, button, viewport } = await boxes(page);
      expect(button).not.toBeNull();
      expect(button!.left).toBeGreaterThanOrEqual(input.left);
      expect(button!.right).toBeLessThanOrEqual(input.right);
      expect(input.right).toBeLessThanOrEqual(viewport);
      await page.click("#search-clear");
      const after = await page.evaluate(() => ({
        open: document.body.classList.contains("sidebar-open"),
        focus: document.activeElement?.id,
      }));
      expect(after).toEqual({ open: true, focus: "search-input" });
    } finally {
      await page.close();
    }
  }, 60_000);

  it("grows for a finger on a touch screen, still inside the box and clear of the query", async () => {
    const page = await browser.newPage();
    try {
      // hasTouch and isMobile make Chromium match `pointer: coarse`.
      await page.setViewport({ width: 375, height: 800, hasTouch: true, isMobile: true });
      await page.setContent(html, { waitUntil: "load" });
      expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      await page.tap("#sidebar-show");
      await page.waitForFunction(
        () => getComputedStyle(document.getElementById("sidebar")!).transform === "none",
      );
      await page.type("#search-input", "install");
      const { input, button, paddingRight } = await boxes(page);
      expect(button!.width).toBeGreaterThanOrEqual(31);
      expect(button!.left).toBeGreaterThanOrEqual(input.left);
      expect(button!.right).toBeLessThanOrEqual(input.right);
      expect(paddingRight).toBeGreaterThanOrEqual(input.right - button!.left);
      await page.tap("#search-clear");
      const after = await page.evaluate(() => ({
        value: (document.getElementById("search-input") as HTMLInputElement).value,
        open: document.body.classList.contains("sidebar-open"),
        focus: document.activeElement?.id,
      }));
      expect(after).toEqual({ value: "", open: true, focus: "search-input" });
    } finally {
      await page.close();
    }
  }, 60_000);

  it("leaves the browser's × to a theme template from before 0.16, which has no button", async () => {
    // A theme replaces template.html alone and takes the default style.css. Its search box has
    // no wrapper and no button, so the rules that hide the × and make room for the button must
    // not reach it: the reader keeps the only pointer route to clearing the box.
    const { template } = await loadTheme("default");
    const old = template
      .replace(/<button\s+id="search-clear"[\s\S]*?<\/button>\s*/, "")
      .replace(/<div class="search-field">\s*([\s\S]*?\/>)\s*<\/div>/, "$1");
    expect(old).not.toContain("search-clear");
    expect(old).not.toContain("search-field");
    const theme = join(dir, "old-theme");
    await mkdir(theme, { recursive: true });
    await writeFile(join(theme, "template.html"), old);
    const built = await build("old", `html:\n  theme: ${theme}\n`);
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800 });
      await page.setContent(built, { waitUntil: "load" });
      expect(await nativeCancelDrawn(page, false)).toBe(true);
      const padding = await page.evaluate(
        () => getComputedStyle(document.getElementById("search-input")!).paddingRight,
      );
      expect(parseFloat(padding)).toBeLessThan(12);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("leaves the browser's × to a template that keeps the wrapper and leaves the button out", async () => {
    const { template } = await loadTheme("default");
    const wrapped = template.replace(/<button\s+id="search-clear"[\s\S]*?<\/button>\s*/, "");
    expect(wrapped).not.toContain("search-clear");
    expect(wrapped).toContain('class="search-field"');
    const theme = join(dir, "wrapped-theme");
    await mkdir(theme, { recursive: true });
    await writeFile(join(theme, "template.html"), wrapped);
    const built = await build("wrapped", `html:\n  theme: ${theme}\n`);
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800 });
      await page.setContent(built, { waitUntil: "load" });
      expect(await nativeCancelDrawn(page, false)).toBe(true);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("clears the highlight in the body of the page a result opened", async () => {
    const page = await open(1280);
    try {
      await page.type("#search-input", "install");
      await page.keyboard.press("Enter");
      await page.waitForSelector("#content mark.search-hit");
      await page.click("#search-clear");
      const left = await page.evaluate(
        () => document.querySelectorAll("#content mark.search-hit").length,
      );
      expect(left).toBe(0);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("is not printed", async () => {
    const page = await open(1280);
    try {
      await page.type("#search-input", "install");
      await page.emulateMediaType("print");
      expect((await boxes(page)).button).toBeNull();
    } finally {
      await page.close();
    }
  }, 60_000);
});

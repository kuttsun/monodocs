import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite } from "../../build";

/**
 * サイドバーの到達可能性は CSS のレイアウト計算そのものなので、happy-dom の client テストでは
 * 検出できない（高さもスクロール量も 0 のまま通る）。実 Chromium が要るため、
 * build.pdf.test.ts と同じく存在するときだけ動かす。
 */
const chromium =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) =>
    existsSync(p),
  );

let dir: string;
let html: string;

beforeAll(async () => {
  if (!chromium) return;
  dir = await mkdtemp(join(tmpdir(), "monodocs-layout-"));
  const docs = join(dir, "docs");
  await mkdir(docs, { recursive: true });
  // 目次がサイドバーより高くなる程度のページ数（それ以下だとスクロールが起きず、
  // 「ツール類が流れない」ことを確かめられない）。
  for (let i = 0; i < 24; i++) {
    await writeFile(join(docs, `page-${String(i).padStart(2, "0")}.md`), `# Page ${i}\n\nBody.\n`);
  }
  const out = join(dir, "docs.html");
  await buildSite({ inputDir: docs, outputFile: out, format: "html" });
  html = await readFile(out, "utf8");
}, 60_000);

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

/**
 * viewport の高さごとに、サイドバーの検索欄と目次の最後の項目へ到達できるかを測る。
 * 到達可能性は要素の矩形ではなく elementFromPoint で判定する。矩形は祖先の overflow による
 * クリップを反映しないため、画面外に隠れた要素でも viewport 内の座標を返してしまう。
 */
async function probe(height: number) {
  const puppeteer = (await import("puppeteer-core")).default;
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromium as string,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height });
    await page.setContent(html, { waitUntil: "load" });
    return await page.evaluate(() => {
      const sidebar = document.getElementById("sidebar") as HTMLElement;
      const nav = document.getElementById("sidebar-nav") as HTMLElement;
      const input = document.getElementById("search-input") as HTMLElement;

      const hittable = (el: Element) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
        const hit = document.elementFromPoint(x, y);
        return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
      };

      // 読者が実際に行えるスクロールだけを行う。overflow: hidden の要素は scrollTop を
      // 代入すれば動くが、読者にはその手段がない。
      const userScrollable = (el: HTMLElement) => {
        const oy = getComputedStyle(el).overflowY;
        return (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight;
      };
      if (userScrollable(nav)) nav.scrollTop = nav.scrollHeight;

      const links = nav.querySelectorAll("a");
      const lastItemAfterNavScroll = hittable(links[links.length - 1]);
      const searchAfterNavScroll = hittable(input);

      // 目次だけでは足りない高さのときの逃げ道（サイドバー全体のスクロール）。
      if (userScrollable(sidebar)) sidebar.scrollTop = sidebar.scrollHeight;
      const lastItemAfterSidebarScroll = hittable(links[links.length - 1]);

      return {
        navScrolls: userScrollable(nav),
        sidebarScrolls: userScrollable(sidebar),
        lastItemAfterNavScroll,
        searchAfterNavScroll,
        lastItemAfterSidebarScroll,
      };
    });
  } finally {
    await browser.close();
  }
}

/**
 * 検索ショートカットを押した後、実際に検索欄へフォーカスが入るか。閉じたサイドバーの
 * 検索欄は不可視で focus() を受け付けないため、クライアントは先にサイドバーを開く。
 * happy-dom はこの前提（可視性）を持たないので、開く処理を落としても素通りしてしまう。
 */
async function shortcutProbe(
  viewport: { width: number; height: number },
  keys: { key: string; ctrl?: boolean },
) {
  const puppeteer = (await import("puppeteer-core")).default;
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromium as string,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.setContent(html, { waitUntil: "load" });
    // 広い画面では常設のサイドバーを畳んでおく（狭い画面のドロワーは既定で閉じている）。
    if (viewport.width > 768) await page.click("#sidebar-toggle");
    // 前提そのものを測る。閉じたサイドバーの検索欄は直接 focus() しても受け付けない。
    // これが成り立たない環境では、後続の assert は何も保証しない。
    const focusableWhileClosed = await page.evaluate(() => {
      const input = document.getElementById("search-input") as HTMLElement;
      input.focus();
      return document.activeElement === input;
    });
    if (keys.ctrl) await page.keyboard.down("Control");
    await page.keyboard.press(keys.key);
    if (keys.ctrl) await page.keyboard.up("Control");
    const focused = await page.evaluate(() => document.activeElement?.id ?? null);
    return { focusableWhileClosed, focused };
  } finally {
    await browser.close();
  }
}

describe.skipIf(!chromium)("default theme sidebar layout（実 Chromium）", () => {
  it("keeps the search box in place while the navigation tree scrolls to its end", async () => {
    // 目次がサイドバーより高くなる高さ。ここが本来の動作。
    const r = await probe(600);
    expect(r.navScrolls).toBe(true);
    expect(r.sidebarScrolls).toBe(false);
    expect(r.lastItemAfterNavScroll).toBe(true);
    // 目次を末尾まで送っても検索欄は定位置に残る。
    expect(r.searchAfterNavScroll).toBe(true);
  }, 60_000);

  it("keeps the navigation tree reachable on a viewport too short for the column", async () => {
    // ヘッダーとツール列だけで埋まる高さ。ここでは目次を潰さず、サイドバー全体を
    // スクロールさせて到達可能性を優先する（拡大表示の読者が行き着く状態）。
    const r = await probe(120);
    expect(r.sidebarScrolls).toBe(true);
    expect(r.lastItemAfterSidebarScroll).toBe(true);
  }, 60_000);

  it("lands focus in the search box from a collapsed sidebar", async () => {
    // 広い画面で畳んだサイドバーは display: none。
    const r = await shortcutProbe({ width: 1280, height: 800 }, { key: "/" });
    expect(r.focusableWhileClosed).toBe(false);
    expect(r.focused).toBe("search-input");
  }, 60_000);

  it("lands focus in the search box from a closed drawer", async () => {
    // 狭い画面の閉じたドロワーは visibility: hidden。
    const r = await shortcutProbe({ width: 390, height: 700 }, { key: "k", ctrl: true });
    expect(r.focusableWhileClosed).toBe(false);
    expect(r.focused).toBe("search-input");
  }, 60_000);
});

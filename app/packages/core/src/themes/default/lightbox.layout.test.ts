import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSite } from "../../build";

/**
 * How large a diagram ends up in the lightbox is CSS layout (aspect-ratio, padding, viewport
 * units), which happy-dom does not compute. Like layout.test.ts, this runs only where a real
 * Chromium exists.
 */
const chromium =
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) =>
    existsSync(p),
  );

const SLOT = "<p>DIAGRAM_SLOT</p>";

let dir: string;
let html: string;

beforeAll(async () => {
  if (!chromium) return;
  dir = await mkdtemp(join(tmpdir(), "monodocs-lightbox-"));
  const docs = join(dir, "docs");
  await mkdir(docs, { recursive: true });
  await writeFile(join(docs, "index.md"), "# Diagram\n\nDIAGRAM_SLOT\n");
  const out = join(dir, "docs.html");
  await buildSite({ inputDir: docs, outputFile: out, format: "html" });
  html = await readFile(out, "utf8");
  expect(html).toContain(SLOT);
}, 60_000);

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

/**
 * Opens a diagram with the given viewBox and measures the dialog. Pre-render-shaped by default.
 * - `client`: shaped as the client runtime leaves it, the SVG in the `<pre>` that held the source.
 * - `scheme`: the mark the build puts on a diagram pre-rendered in a dark theme.
 * - `dark`: the reader has chosen the dark theme, set on the root as the theme toggle sets it.
 */
async function open(
  viewBox: [number, number],
  title: string,
  options: { client?: boolean; scheme?: "dark"; dark?: boolean } = {},
) {
  const [w, h] = viewBox;
  const tag = options.client ? "pre" : "figure";
  const scheme = options.scheme ? ` data-monodocs-scheme="${options.scheme}"` : "";
  const svg =
    `<svg id="mermaid-0" width="100%" viewBox="0 0 ${w} ${h}" style="max-width: ${w}px;">` +
    (title ? `<title>${title}</title>` : "") +
    `<rect width="${w}" height="${h}" fill="#888"></rect></svg>`;
  const puppeteer = (await import("puppeteer-core")).default;
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromium as string,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setContent(html.replace(SLOT, `<${tag} class="mermaid"${scheme}>${svg}</${tag}>`), {
      waitUntil: "load",
    });
    if (options.dark) {
      await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    }
    const inPageColor = await page.evaluate(
      () => getComputedStyle(document.querySelector("#content .mermaid > svg")!).backgroundColor,
    );
    await page.click("#content .mermaid");
    return await page.evaluate((inPageColor) => {
      const dialog = document.getElementById("image-lightbox") as HTMLDialogElement;
      const rect = document.querySelector("#image-lightbox-diagram svg")!.getBoundingClientRect();
      return {
        inPageColor,
        panelColor: getComputedStyle(document.getElementById("image-lightbox-diagram")!)
          .backgroundColor,
        pageColor: getComputedStyle(document.body).backgroundColor,
        open: dialog.open,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
        dialogScrolls: dialog.scrollHeight > dialog.clientHeight,
      };
    }, inPageColor);
  } finally {
    await browser.close();
  }
}

describe.skipIf(!chromium)("diagram lightbox layout (real Chromium)", () => {
  it.each([
    ["very tall", [100, 2500] as [number, number], ""],
    ["very wide", [2500, 100] as [number, number], ""],
    ["captioned", [400, 300] as [number, number], "Flow"],
  ])(
    "fits a %s diagram in the viewport without collapsing it",
    async (_name, box, title) => {
      const r = await open(box, title);
      expect(r.open).toBe(true);
      // The padding must not eat the diagram: the drawn box keeps the diagram's proportions.
      expect(r.width).toBeGreaterThan(10);
      expect(r.height).toBeGreaterThan(10);
      expect(r.width / r.height).toBeCloseTo(box[0] / box[1], 1);
      expect(r.right).toBeLessThanOrEqual(1280);
      expect(r.bottom).toBeLessThanOrEqual(800);
      expect(r.dialogScrolls).toBe(false);
    },
    60_000,
  );

  // Mermaid's light theme draws edges near-black (#213): on a dark page, a diagram in it gets the
  // backing a figure's image does, in the page and in the dialog. One pre-rendered in a dark theme
  // stays on the page's background.
  const WHITE = "rgb(255, 255, 255)";
  const NONE = "rgba(0, 0, 0, 0)";
  const DARK_BG = "rgb(13, 17, 23)";
  it.each([
    ["client-drawn, light mode", { client: true }, NONE, WHITE],
    ["client-drawn, dark mode", { client: true, dark: true }, WHITE, WHITE],
    ["pre-rendered in the light theme, dark mode", { dark: true }, WHITE, WHITE],
    ["pre-rendered in a dark theme, dark mode", { scheme: "dark", dark: true }, NONE, DARK_BG],
  ] as const)(
    "puts a %s diagram on the right background",
    async (_name, options, inPage, panel) => {
      const r = await open([400, 300], "", options);
      expect(r.open).toBe(true);
      expect(r.pageColor).toBe(options.dark ? DARK_BG : WHITE);
      expect(r.inPageColor).toBe(inPage);
      expect(r.panelColor).toBe(panel);
    },
    60_000,
  );
});

/** Where `openImage` serves a slow SVG from. */
const SLOW_URL = "http://slow.test/diagram.svg";

/** The picture's fill, a color nothing else on the screen has, to find it in a screenshot by. */
const FILL = [0x00, 0xc0, 0x60];
const FILL_HEX = "#00c060";

/**
 * An SVG image, embedded as the build embeds it, with the given root attributes. The picture is
 * drawn in the SVG's own units, not in percentages, so it only fills the dialog if the image is
 * scaled, and not merely its viewport widened.
 */
function svgImage(attributes: string, box: [number, number], alt: string) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>` +
    `<rect width="${box[0]}" height="${box[1]}" fill="${FILL_HEX}"/></svg>`;
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  return `<p><img src="${src}"${alt ? ` alt="${alt}"` : ""}></p>`;
}

/**
 * Opens the page's image in a viewport of the given size and measures the picture as drawn: the
 * picture is found in a screenshot, by its fill, so what is measured is what the reader sees.
 * - `raster`: a raster image of this size is drawn in the page first.
 * - `resizeTo`: the viewport is resized to this, with the dialog open, before the measuring.
 * - `slowSvg`: this SVG is served from `SLOW_URL` after a delay, and the image is opened before
 *   it has loaded, so only its load can size it.
 * - `dark`: the reader has chosen the dark theme, set on the root as the theme toggle sets it.
 * - `actualSize`: the size button is pressed this many times once the image is sized, from the
 *   keyboard, so it is reached as a keyboard user reaches it.
 * - `reopen`: the dialog is closed with Escape and the image opened again before the measuring.
 * - `resizeAfter`: the viewport is resized to this after the size button is pressed.
 */
async function openImage(
  content: string,
  viewport: [number, number],
  options: {
    raster?: [number, number];
    resizeTo?: [number, number];
    slowSvg?: string;
    dark?: boolean;
    actualSize?: number;
    reopen?: boolean;
    resizeAfter?: [number, number];
  } = {},
) {
  const { raster, resizeTo, slowSvg, dark, actualSize, reopen, resizeAfter } = options;
  const puppeteer = (await import("puppeteer-core")).default;
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromium as string,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: viewport[0], height: viewport[1] });
    if (slowSvg) {
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        if (request.url() !== SLOW_URL) return void request.continue();
        setTimeout(
          () => void request.respond({ contentType: "image/svg+xml", body: slowSvg }),
          1000,
        );
      });
    }
    await page.setContent(html.replace(SLOT, content), {
      waitUntil: slowSvg ? "domcontentloaded" : "load",
    });
    if (dark) {
      await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    }
    if (raster) {
      await page.evaluate(
        async ([w, h], fill) => {
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = fill;
          ctx.fillRect(0, 0, w, h);
          const img = document.querySelector<HTMLImageElement>("#content img")!;
          img.src = canvas.toDataURL("image/png");
          await img.decode();
        },
        raster,
        FILL_HEX,
      );
    }
    // Whether the dialog's image was hidden while it loaded, rather than an empty panel shown.
    let hiddenWhileLoading: boolean | null = null;
    if (slowSvg) {
      // Still loading, the image has no box to click on yet.
      hiddenWhileLoading = await page.evaluate(() => {
        const img = document.querySelector<HTMLImageElement>("#content img")!;
        if (img.complete) throw new Error("the image loaded before it was opened");
        img.click();
        const preview = document.getElementById("image-lightbox-image")!;
        return getComputedStyle(preview).visibility === "hidden";
      });
    } else {
      await page.click("#content img");
    }
    // The image in the dialog is sized once it has loaded.
    await page.evaluate(() =>
      (document.getElementById("image-lightbox-image") as HTMLImageElement).decode(),
    );
    const frames = () =>
      page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      );
    if (resizeTo) {
      // Let the image's load settle first, so only the resize can refit it.
      await frames();
      await page.setViewport({ width: resizeTo[0], height: resizeTo[1] });
      await frames();
    }
    // Focused once: a press must leave the focus on the button, for the next one.
    if (actualSize) await page.focus("#image-lightbox-size");
    for (let i = 0; i < (actualSize ?? 0); i++) {
      await page.keyboard.press("Enter");
      await frames();
    }
    if (resizeAfter) {
      await page.setViewport({ width: resizeAfter[0], height: resizeAfter[1] });
      await frames();
    }
    const sizeButtonFocused = await page.evaluate(
      () => document.activeElement === document.getElementById("image-lightbox-size"),
    );
    const focusedId = await page.evaluate(() => document.activeElement?.id ?? null);
    if (reopen) {
      await page.keyboard.press("Escape");
      await frames();
      await page.click("#content img");
      await frames();
    }
    const shot = await page.screenshot({ encoding: "base64" });
    const measured = await page.evaluate(
      async (png, fill) => {
        const dialog = document.getElementById("image-lightbox") as HTMLDialogElement;
        const preview = document.getElementById("image-lightbox-image")!;
        const caption = document.getElementById("image-lightbox-caption")!;
        const bitmap = await createImageBitmap(
          await (await fetch(`data:image/png;base64,${png}`)).blob(),
        );
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        const pixel = (x: number, y: number) => {
          const i = (Math.round(y) * bitmap.width + Math.round(x)) * 4;
          return [data[i], data[i + 1], data[i + 2]];
        };
        let left = Infinity;
        let top = Infinity;
        let right = -1;
        let bottom = -1;
        for (let y = 0; y < bitmap.height; y++) {
          for (let x = 0; x < bitmap.width; x++) {
            if (!fill.every((c, k) => Math.abs(pixel(x, y)[k] - c) <= 2)) continue;
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x + 1);
            bottom = Math.max(bottom, y + 1);
          }
        }
        const panel = preview.getBoundingClientRect();
        const captionRect = caption.getBoundingClientRect();
        return {
          open: dialog.open,
          width: right - left,
          height: bottom - top,
          right,
          bottom,
          // How far the panel reaches beyond the picture, on each axis.
          panelMarginX: panel.width - (right - left),
          panelMarginY: panel.height - (bottom - top),
          // What is drawn between the picture and the panel's edge, beside and below it.
          beside: pixel(left - 8, (top + bottom) / 2),
          below: pixel((left + right) / 2, bottom + 8),
          panelColor: getComputedStyle(preview).backgroundColor,
          pageColor: getComputedStyle(document.body).backgroundColor,
          inPageImageColor: getComputedStyle(document.querySelector("#content img")!)
            .backgroundColor,
          inlineImageColor: document.querySelector("#inline-icon")
            ? getComputedStyle(document.querySelector("#inline-icon")!).backgroundColor
            : null,
          captionTop: caption.hidden ? null : captionRect.top,
          captionLines: caption.hidden
            ? 0
            : Math.round(captionRect.height / parseFloat(getComputedStyle(caption).lineHeight)),
          dialogScrolls: dialog.scrollHeight > dialog.clientHeight,
          // The picture's size from layout, which a screenshot cannot give once it is larger
          // than the viewport, and where it starts in the dialog's scrolled content.
          layoutWidth: panel.width - 32,
          layoutHeight: panel.height - 32,
          scrolledLeft: panel.left + dialog.scrollLeft,
          scrolledTop: panel.top + dialog.scrollTop,
          scrollX: dialog.scrollWidth - dialog.clientWidth,
          scrollY: dialog.scrollHeight - dialog.clientHeight,
          scrollLeft: dialog.scrollLeft,
          scrollTop: dialog.scrollTop,
          sizeButton: (() => {
            const button = document.getElementById("image-lightbox-size")!;
            return button.hidden ? null : button.textContent;
          })(),
        };
      },
      shot,
      FILL,
    );
    return { ...measured, hiddenWhileLoading, sizeButtonFocused, focusedId };
  } finally {
    await browser.close();
  }
}

type Measured = Awaited<ReturnType<typeof openImage>>;

/** What holds for any image in the dialog, whatever its kind and size. */
function expectPanelAndFit(r: Measured, [w, h]: [number, number], [vw, vh]: [number, number]) {
  expect(r.open).toBe(true);
  expect(r.width / r.height).toBeCloseTo(w / h, 1);
  expect(r.right).toBeLessThanOrEqual(vw);
  expect(r.bottom).toBeLessThanOrEqual(vh);
  expect(r.dialogScrolls).toBe(false);
  // The panel fits the picture with its padding alone, leaving no band beside it, and is drawn
  // in the page's background, opaque, rather than letting the backdrop through.
  // A picture scaled to a fractional size blends its edge pixels with the panel, so the fill
  // found is up to a pixel short on each side.
  expect(Math.abs(r.panelMarginX - 32)).toBeLessThanOrEqual(3);
  expect(Math.abs(r.panelMarginY - 32)).toBeLessThanOrEqual(3);
  expect(r.panelColor).toMatch(/^rgb\(/);
  const panel = r.panelColor.match(/\d+/g)!.map(Number);
  for (const sample of [r.beside, r.below]) {
    sample.forEach((c, k) => expect(Math.abs(c - panel[k])).toBeLessThanOrEqual(2));
  }
  // The caption sits just under the panel, not at the foot of the dialog.
  if (r.captionTop !== null) {
    expect(r.captionTop - r.bottom).toBeGreaterThanOrEqual(16);
    expect(r.captionTop - r.bottom).toBeLessThanOrEqual(30);
  }
}

const LONG_ALT =
  "Architecture of the build: sources are read, rendered by their format, normalized into pages, " +
  "and written out as one HTML file with its search index, navigation, and embedded images";

describe.skipIf(!chromium)("image lightbox layout (real Chromium)", () => {
  it.each([
    // A draw.io export at 100%, which the dialog used to show at exactly this size (#210).
    [
      "fixed-size",
      'width="444px" height="392px" viewBox="0 0 444 392"',
      [444, 392],
      "Diagram",
      [1280, 800],
    ],
    ["tall viewBox-only", 'viewBox="0 0 100 400"', [100, 400], "Diagram", [1280, 800]],
    ["uncaptioned", 'width="200" height="300" viewBox="0 0 200 300"', [200, 300], "", [1280, 800]],
    ["tall, with a wrapping caption,", 'viewBox="0 0 100 400"', [100, 400], LONG_ALT, [1280, 800]],
    [
      "wide, on a narrow screen with a wrapping caption,",
      'width="444" height="200"',
      [444, 200],
      LONG_ALT,
      [375, 667],
    ],
  ])(
    "scales a %s SVG image up to the viewport on a panel, keeping its proportions",
    async (_name, attributes, box, alt, viewport) => {
      const [vw, vh] = viewport as [number, number];
      const [w, h] = box as [number, number];
      const r = await openImage(svgImage(attributes as string, [w, h], alt as string), [vw, vh]);
      expectPanelAndFit(r, [w, h], [vw, vh]);
      // Larger than in the page: one side or the other reaches most of the dialog.
      expect(Math.max(r.width / vw, r.height / vh)).toBeGreaterThan(0.6);
      if (alt === LONG_ALT) expect(r.captionLines).toBeGreaterThan(1);
    },
    60_000,
  );

  it("sizes an image opened before it has loaded once it loads", async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="444" height="392" viewBox="0 0 444 392">' +
      `<rect width="444" height="392" fill="${FILL_HEX}"/></svg>`;
    const r = await openImage(`<p><img src="${SLOW_URL}" alt="Diagram"></p>`, [1280, 800], {
      slowSvg: svg,
    });
    expect(r.hiddenWhileLoading).toBe(true);
    expectPanelAndFit(r, [444, 392], [1280, 800]);
    expect(r.height / 800).toBeGreaterThan(0.6);
  }, 60_000);

  it.each([
    ["light", false, "rgba(0, 0, 0, 0)"],
    ["dark", true, "rgb(255, 255, 255)"],
  ])(
    "draws an image on white in %s mode, in the dialog and in the page",
    async (_name, dark, inPage) => {
      // A figure, marked as the build marks one, and an icon in a sentence after it.
      const figure = svgImage(
        'width="444" height="392" viewBox="0 0 444 392"',
        [444, 392],
        "Diagram",
      ).replace("<p>", '<p data-monodocs-figure="center">');
      const icon = svgImage('width="16" height="16" viewBox="0 0 16 16"', [16, 16], "icon")
        .replace("<p><img", '<p>Text with <img id="inline-icon"')
        .replace("></p>", "> in it.</p>");
      const r = await openImage(figure + icon, [1280, 800], { dark: dark as boolean });
      expectPanelAndFit(r, [444, 392], [1280, 800]);
      // Images are drawn for a light background, so the panel stays white on a dark page.
      expect(r.panelColor).toBe("rgb(255, 255, 255)");
      expect(r.pageColor === "rgb(255, 255, 255)").toBe(!dark);
      // In the page, only a figure in dark mode needs a backing: in light mode the page is white
      // already.
      expect(r.inPageImageColor).toBe(inPage);
      // An icon in a sentence gets none, where a white box would stand out.
      expect(r.inlineImageColor).toBe("rgba(0, 0, 0, 0)");
    },
    60_000,
  );

  it("shows a small raster image at its own size, on a panel", async () => {
    const r = await openImage('<p><img alt="Photo"></p>', [1280, 800], { raster: [120, 80] });
    expectPanelAndFit(r, [120, 80], [1280, 800]);
    expect(r.width).toBe(120);
    expect(r.height).toBe(80);
  }, 60_000);

  it.each([
    ["narrower", [700, 500]],
    ["wider", [1600, 1000]],
  ])(
    "refits an open image when the window is made %s",
    async (_name, size) => {
      const [vw, vh] = size as [number, number];
      const r = await openImage('<p><img alt="Photo"></p>', [1280, 800], {
        raster: [3000, 1000],
        resizeTo: [vw, vh],
      });
      expectPanelAndFit(r, [3000, 1000], [vw, vh]);
      // The picture follows the new width, rather than keeping the size it opened at.
      expect(r.width).toBeLessThan(vw);
      expect(r.width).toBeGreaterThan(vw * 0.8);
    },
    60_000,
  );

  // Fit to screen and actual size (#211).
  describe("switching between fit to screen and actual size", () => {
    it("offers no switch for a small raster image, already at its own size", async () => {
      const r = await openImage('<p><img alt="Photo"></p>', [1280, 800], { raster: [120, 80] });
      expect(r.sizeButton).toBeNull();
    }, 60_000);

    it.each([
      ["wide", [3000, 1000]],
      ["tall", [400, 3000]],
    ])(
      "shows a %s raster image pixel for pixel, scrolling, with all of it in reach",
      async (_name, size) => {
        const [w, h] = size as [number, number];
        const fitted = await openImage('<p><img alt="Photo"></p>', [1280, 800], { raster: [w, h] });
        expect(fitted.sizeButton).toBe("Actual size");
        const r = await openImage('<p><img alt="Photo"></p>', [1280, 800], {
          raster: [w, h],
          actualSize: 1,
        });
        expect(r.sizeButton).toBe("Fit to screen");
        expect(r.layoutWidth).toBe(w);
        expect(r.layoutHeight).toBe(h);
        // The dialog scrolls along the side that does not fit, and the picture's start is not
        // cut off before the scroll's start.
        if (w > 1280) expect(r.scrollX).toBeGreaterThan(0);
        if (h > 800) expect(r.scrollY).toBeGreaterThan(0);
        expect(r.scrolledLeft).toBeGreaterThanOrEqual(0);
        expect(r.scrolledTop).toBeGreaterThanOrEqual(0);
        // It opens on the middle of the picture.
        expect(Math.abs(r.scrollLeft - r.scrollX / 2)).toBeLessThanOrEqual(1);
        expect(Math.abs(r.scrollTop - r.scrollY / 2)).toBeLessThanOrEqual(1);
      },
      60_000,
    );

    it("fits the image to the screen again on a second press", async () => {
      const r = await openImage('<p><img alt="Photo"></p>', [1280, 800], {
        raster: [3000, 1000],
        actualSize: 2,
      });
      expectPanelAndFit(r, [3000, 1000], [1280, 800]);
      expect(r.sizeButton).toBe("Actual size");
      expect(r.sizeButtonFocused).toBe(true);
    }, 60_000);

    it("opens the next image fitted to the screen", async () => {
      const r = await openImage('<p><img alt="Photo"></p>', [1280, 800], {
        raster: [3000, 1000],
        actualSize: 1,
        reopen: true,
      });
      expectPanelAndFit(r, [3000, 1000], [1280, 800]);
      expect(r.sizeButton).toBe("Actual size");
    }, 60_000);

    // The size an SVG gives itself is what the build records on its <img>; the width the build
    // or an author gives the <img> is how it shows in the page, not its actual size.
    it.each([
      ["fixed-size", 'width="444px" height="392px" viewBox="0 0 444 392"', "", [444, 392]],
      ["viewBox-only", 'viewBox="0 0 100 400"', ' width="100"', [100, 400]],
      [
        "author-narrowed",
        'width="444" height="392" viewBox="0 0 444 392"',
        ' width="200"',
        [444, 392],
      ],
    ])(
      "shows a %s SVG image at the size it gives itself, centred",
      async (_name, attributes, imgWidth, size) => {
        const [w, h] = size as [number, number];
        const content = svgImage(attributes as string, [w, h], "Diagram").replace(
          "<img ",
          `<img${imgWidth} data-monodocs-svg-size="${w} ${h}" `,
        );
        const r = await openImage(content, [1280, 800], { actualSize: 1 });
        expect(r.sizeButton).toBe("Fit to screen");
        expect(r.sizeButtonFocused).toBe(true);
        expect(r.width).toBe(w);
        expect(r.height).toBe(h);
        expect(r.dialogScrolls).toBe(false);
        expect(Math.abs(r.right - r.width / 2 - 640)).toBeLessThanOrEqual(2);
      },
      60_000,
    );

    it("shows an SVG image larger than the screen at its size, scrolling, with all of it in reach", async () => {
      const content = svgImage('width="2000" height="1500"', [2000, 1500], "Diagram").replace(
        "<img ",
        '<img data-monodocs-svg-size="2000 1500" ',
      );
      const r = await openImage(content, [1280, 800], { actualSize: 1 });
      expect(r.sizeButton).toBe("Fit to screen");
      expect(r.layoutWidth).toBe(2000);
      expect(r.layoutHeight).toBe(1500);
      expect(r.scrollX).toBeGreaterThan(0);
      expect(r.scrollY).toBeGreaterThan(0);
      expect(r.scrolledLeft).toBeGreaterThanOrEqual(0);
      expect(r.scrolledTop).toBeGreaterThanOrEqual(0);
    }, 60_000);

    it("moves the focus to the close button when a resize makes the switch go", async () => {
      const r = await openImage('<p><img alt="Photo"></p>', [1280, 800], {
        raster: [1400, 900],
        actualSize: 1,
        resizeAfter: [1800, 1200],
      });
      expect(r.sizeButton).toBeNull();
      expect(r.focusedId).toBe("image-lightbox-close");
      expectPanelAndFit(r, [1400, 900], [1800, 1200]);
    }, 60_000);

    it("offers no switch for an SVG image whose own size the build did not record", async () => {
      // A remote SVG, or one written as a data URI, with only a viewBox: the browser's natural
      // size for it is a rounded default, not a size to show.
      const r = await openImage(
        svgImage('viewBox="0 0 100 400"', [100, 400], "Diagram"),
        [1280, 800],
      );
      expectPanelAndFit(r, [100, 400], [1280, 800]);
      expect(r.sizeButton).toBeNull();
    }, 60_000);
  });

  it("shrinks a large raster image to the viewport, on a panel", async () => {
    const r = await openImage('<p><img alt="Photo"></p>', [1280, 800], { raster: [3000, 1000] });
    expectPanelAndFit(r, [3000, 1000], [1280, 800]);
    expect(r.width).toBeLessThan(1280);
    expect(r.width).toBeGreaterThan(1280 * 0.8);
  }, 60_000);
});

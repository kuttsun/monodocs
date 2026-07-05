import { describe, expect, it } from "vitest";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  type PDFObject,
} from "pdf-lib";
import type { SidebarNode } from "../types";
import {
  addOutline,
  collectDests,
  remapDests,
  sidebarToOutline,
  type PdfOutlineNode,
} from "./pdfOutline";

describe("sidebarToOutline", () => {
  it("maps folders to parents and pages to dest nodes (page-{id})", () => {
    const sidebar: SidebarNode[] = [
      { type: "page", title: "Top", route: "/", pageId: "index" },
      {
        type: "dir",
        title: "setup",
        path: "setup",
        children: [
          { type: "page", title: "Install", route: "/setup/install", pageId: "setup-install" },
        ],
      },
    ];
    expect(sidebarToOutline(sidebar)).toEqual([
      { title: "Top", dest: "page-index", children: [] },
      {
        title: "setup",
        children: [{ title: "Install", dest: "page-setup-install", children: [] }],
      },
    ]);
  });
});

describe("collectDests / remapDests", () => {
  const tree: PdfOutlineNode[] = [
    { title: "Top", dest: "page-index", children: [] },
    {
      title: "setup",
      children: [{ title: "Install", dest: "page-setup-install", children: [] }],
    },
  ];

  it("collects page dests in order (folders have none)", () => {
    expect(collectDests(tree)).toEqual(["page-index", "page-setup-install"]);
  });

  it("remaps dests via the surrogate map and keeps folder dests undefined", () => {
    const map = new Map([
      ["page-index", "mdpdf-0"],
      ["page-setup-install", "mdpdf-1"],
    ]);
    expect(remapDests(tree, map)).toEqual([
      { title: "Top", dest: "mdpdf-0", children: [] },
      {
        title: "setup",
        dest: undefined,
        children: [{ title: "Install", dest: "mdpdf-1", children: [] }],
      },
    ]);
  });
});

/** catalog /Dests に名前付き宛先を持つ最小 PDF を作る（Chromium 出力を模す）。 */
async function pdfWithDests(names: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const ctx = doc.context;
  const destsMap = new Map<PDFName, PDFObject>();
  for (const name of names) {
    const page = doc.addPage();
    const dest = PDFArray.withContext(ctx);
    dest.push(page.ref);
    dest.push(PDFName.of("XYZ"));
    dest.push(PDFNumber.of(0));
    dest.push(PDFNumber.of(100));
    dest.push(PDFNumber.of(0));
    destsMap.set(PDFName.of(name), dest);
  }
  doc.catalog.set(PDFName.of("Dests"), PDFDict.fromMapWithContext(destsMap, ctx));
  return doc.save();
}

/** /Outlines を First/Next で走査してタイトル文字列を集める（ネストは "> " 接頭辞）。 */
function outlineTitles(doc: PDFDocument): string[] {
  const outlines = doc.catalog.lookup(PDFName.of("Outlines"));
  if (!(outlines instanceof PDFDict)) return [];
  const titles: string[] = [];
  const walk = (firstRef: PDFObject | undefined, depth: number) => {
    let ref = firstRef;
    while (ref) {
      const item = doc.context.lookup(ref);
      if (!(item instanceof PDFDict)) break;
      const t = item.lookup(PDFName.of("Title"));
      const text = t instanceof PDFHexString ? t.decodeText() : "";
      titles.push("  ".repeat(depth) + text);
      walk(item.get(PDFName.of("First")), depth + 1);
      ref = item.get(PDFName.of("Next"));
    }
  };
  walk(outlines.get(PDFName.of("First")), 0);
  return titles;
}

describe("addOutline", () => {
  const tree: PdfOutlineNode[] = [
    { title: "トップ", dest: "mdpdf-0", children: [] },
    {
      title: "setup",
      children: [
        { title: "Install", dest: "mdpdf-1", children: [] },
        { title: "Config", dest: "mdpdf-2", children: [] },
      ],
    },
  ];

  it("attaches a folder→page outline and sets UseOutlines", async () => {
    const base = await pdfWithDests(["mdpdf-0", "mdpdf-1", "mdpdf-2"]);
    const out = await addOutline(base, tree);
    const doc = await PDFDocument.load(out);

    expect(outlineTitles(doc)).toEqual(["トップ", "setup", "  Install", "  Config"]);

    const outlines = doc.catalog.lookup(PDFName.of("Outlines"), PDFDict);
    expect(outlines.lookup(PDFName.of("Count"), PDFNumber).asNumber()).toBe(4);
    // ビューアでしおりパネルを開く。
    const pageMode = doc.catalog.lookup(PDFName.of("PageMode"));
    expect(pageMode instanceof PDFName && pageMode.asString()).toBe("/UseOutlines");

    // フォルダ（dest 無し）は最初の子孫ページの宛先へ飛ぶ。
    const setup = doc.context.lookup(outlines.get(PDFName.of("First")));
    const setupNext =
      setup instanceof PDFDict ? doc.context.lookup(setup.get(PDFName.of("Next"))) : undefined;
    expect(setupNext instanceof PDFDict && setupNext.has(PDFName.of("Dest"))).toBe(true);
  });

  it("returns the original bytes when there are no destinations", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const base = await doc.save();
    const out = await addOutline(base, tree);
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.catalog.lookup(PDFName.of("Outlines"))).toBeUndefined();
  });

  it("returns the original bytes for an empty outline", async () => {
    const base = await pdfWithDests(["mdpdf-0"]);
    const out = await addOutline(base, []);
    expect(out).toBe(base);
  });
});

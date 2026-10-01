import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber } from "pdf-lib";
import { buildPdfCover, prependCover } from "./pdfCover";

/** A PDF whose pages can be told apart by their width. */
async function pdfWithWidths(widths: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const width of widths) doc.addPage([width, 800]);
  return doc.save();
}

describe("buildPdfCover", () => {
  it("prints the title, the version and date, and the authors", () => {
    const cover = buildPdfCover({
      title: "Spec",
      parts: { version: "Version 1.2", date: "2026-08-22", authors: ["Docs Team", "QA"] },
      lang: "en",
      pageLabel: "Cover",
    });
    expect(cover.fragment).toContain(">Spec</h1>");
    expect(cover.fragment).toContain("<p>Version 1.2</p><p>2026-08-22</p>");
    expect(cover.fragment).toContain("<p>Docs Team</p><p>QA</p>");
    expect(cover.html).toContain('<html lang="en">');
    expect(cover.html).toContain(cover.fragment);
    expect(cover.pageLabel).toBe("Cover");
  });

  it("leaves out the lines the document says nothing about", () => {
    const cover = buildPdfCover({
      title: "Spec",
      parts: { authors: [] },
      lang: "en",
      pageLabel: "Cover",
    });
    expect(cover.fragment).not.toContain("monodocs-cover-meta");
    expect(cover.fragment).not.toContain("monodocs-cover-authors");
  });

  it("escapes every value rather than inserting it as markup", () => {
    const cover = buildPdfCover({
      title: "<b>Spec</b>",
      parts: { version: "<i>1</i>", date: "a & b", authors: ["<script>x</script>"] },
      lang: 'en" onload="x',
      pageLabel: "Cover",
    });
    expect(cover.html).not.toContain("<b>");
    expect(cover.html).not.toContain("<i>");
    expect(cover.html).not.toContain("<script>");
    expect(cover.html).not.toContain('" onload="');
    expect(cover.fragment).toContain("&lt;b&gt;Spec&lt;/b&gt;");
    expect(cover.fragment).toContain("a &amp; b");
  });
});

describe("prependCover", () => {
  it("puts the cover sheets in front of the body, in order", async () => {
    const out = await prependCover(
      await pdfWithWidths([500, 501, 502]),
      await pdfWithWidths([300, 301]),
      "Cover",
    );
    const doc = await PDFDocument.load(out);
    expect(doc.getPages().map((page) => page.getWidth())).toEqual([300, 301, 500, 501, 502]);
  });

  it("labels the cover and numbers the body from 1", async () => {
    const out = await prependCover(
      await pdfWithWidths([500, 501]),
      await pdfWithWidths([300]),
      "表紙",
    );
    const doc = await PDFDocument.load(out);
    const labels = doc.catalog.lookup(PDFName.of("PageLabels"));
    expect(labels).toBeInstanceOf(PDFDict);
    const nums = (labels as PDFDict).lookup(PDFName.of("Nums"));
    expect(nums).toBeInstanceOf(PDFArray);
    const array = nums as PDFArray;
    expect((array.lookup(0) as PDFNumber).asNumber()).toBe(0);
    const cover = array.lookup(1) as PDFDict;
    expect((cover.lookup(PDFName.of("P")) as PDFHexString).decodeText()).toBe("表紙");
    expect(cover.lookup(PDFName.of("S"))).toBeUndefined();
    expect((array.lookup(2) as PDFNumber).asNumber()).toBe(1);
    const body = array.lookup(3) as PDFDict;
    expect((body.lookup(PDFName.of("S")) as PDFName).asString()).toBe("/D");
    expect((body.lookup(PDFName.of("St")) as PDFNumber).asNumber()).toBe(1);
  });

  it("keeps the body's page objects, so destinations into the body still land on them", async () => {
    // A named destination like the ones Chromium writes for the outline and internal links.
    const bodyDoc = await PDFDocument.create();
    bodyDoc.addPage([500, 800]);
    const target = bodyDoc.addPage([501, 800]);
    const dests = bodyDoc.context.obj({});
    dests.set(PDFName.of("p"), bodyDoc.context.obj([target.ref, PDFName.of("XYZ"), 0, 800, 0]));
    bodyDoc.catalog.set(PDFName.of("Dests"), dests);

    const out = await prependCover(await bodyDoc.save(), await pdfWithWidths([300]), "Cover");
    const doc = await PDFDocument.load(out);
    const dest = (doc.catalog.lookup(PDFName.of("Dests")) as PDFDict).lookup(
      PDFName.of("p"),
    ) as PDFArray;
    const index = doc.getPages().findIndex((page) => page.ref === dest.get(0));
    expect(index).toBe(2);
    expect(doc.getPage(index).getWidth()).toBe(501);
  });
});

describe("prependCover with structure it does not merge", () => {
  it("untags the cover rather than leave it pointing into the body's structure", async () => {
    // A cover page claiming a parent-tree key while neither document has a structure tree: the
    // key would otherwise be resolved against whatever the body holds under it.
    const coverDoc = await PDFDocument.create();
    coverDoc.addPage([300, 800]).node.set(PDFName.of("StructParents"), PDFNumber.of(0));
    const out = await prependCover(await pdfWithWidths([500]), await coverDoc.save(), "Cover");
    const doc = await PDFDocument.load(out);
    expect(doc.getPage(0).node.lookup(PDFName.of("StructParents"))).toBeUndefined();
  });
});

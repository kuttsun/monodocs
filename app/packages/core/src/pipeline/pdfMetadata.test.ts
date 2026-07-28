import { describe, expect, it } from "vitest";
import { PDFBool, PDFDocument, PDFDict, PDFName } from "pdf-lib";
import { setPdfMetadata } from "./pdfMetadata";

/** Chromium 相当の初期状態（タイトル無し・別ツール名）の PDF を作る。 */
async function samplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.setCreator("Mozilla/5.0 HeadlessChrome/150.0.0.0");
  return doc.save();
}

async function read(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return { title: doc.getTitle(), creator: doc.getCreator(), producer: doc.getProducer() };
}

describe("setPdfMetadata", () => {
  it("sets the document title and the generating tool", async () => {
    const out = await setPdfMetadata(await samplePdf(), {
      title: "社内マニュアル",
      generator: "monodocs v1.2.3",
    });

    expect(await read(out)).toEqual({
      title: "社内マニュアル",
      // ブラウザの UA 文字列と pdf-lib の既定値を置き換える。
      creator: "monodocs v1.2.3",
      producer: "monodocs v1.2.3",
    });
  });

  it("asks viewers to show the title instead of the file name", async () => {
    const out = await setPdfMetadata(await samplePdf(), { title: "社内マニュアル" });
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    const prefs = doc.catalog.lookup(PDFName.of("ViewerPreferences"));
    expect(prefs).toBeInstanceOf(PDFDict);
    expect((prefs as PDFDict).lookup(PDFName.of("DisplayDocTitle"))).toBe(PDFBool.True);
  });

  it("keeps the pages intact", async () => {
    const out = await setPdfMetadata(await samplePdf(), { title: "T" });
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(1);
  });

  it("returns the input untouched when there is nothing to set", async () => {
    const original = await samplePdf();
    const out = await setPdfMetadata(original, { title: "  ", generator: undefined });
    expect(out).toBe(original);
  });
});

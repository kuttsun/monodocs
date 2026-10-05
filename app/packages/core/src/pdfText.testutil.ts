/**
 * Reading text back out of a generated PDF, shared by the tests that make a claim about what is
 * drawn on a sheet. Not a test file itself, and excluded from the build (`tsconfig.json`).
 */

/**
 * The text drawn on one page, read back through each font's ToUnicode map, since the fonts are
 * subsets and a glyph code means nothing on its own. Handles both `<hex> Tj` and `[...] TJ`, and
 * follows `Do` into form XObjects: a blended box such as the watermark is drawn inside a
 * transparency group, with fonts of its own.
 */
export async function pageText(bytes: Uint8Array, index: number): Promise<string> {
  const { PDFDocument, PDFRawStream, PDFArray, PDFDict, PDFName, PDFRef, decodePDFRawStream } =
    await import("pdf-lib");
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPages()[index]!;
  const resolve = (obj: unknown) => (obj instanceof PDFRef ? doc.context.lookup(obj) : obj);
  const decodeStream = (st: unknown): string =>
    st instanceof PDFRawStream
      ? Buffer.from(decodePDFRawStream(st).decode()).toString("latin1")
      : "";
  const contentText = (obj: unknown): string => {
    const list = obj instanceof PDFArray ? obj.asArray().map(resolve) : [resolve(obj)];
    return list.map(decodeStream).join("\n");
  };
  const codeMap = (font: InstanceType<typeof PDFDict>): Map<number, string> => {
    const map = new Map<number, string>();
    const ref = font.get(PDFName.of("ToUnicode"));
    if (!ref) return map;
    const cmap = decodeStream(resolve(ref));
    for (const m of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const e of m[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        map.set(parseInt(e[1]!, 16), String.fromCodePoint(parseInt(e[2]!.slice(0, 4), 16)));
      }
    }
    for (const m of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const e of m[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        const lo = parseInt(e[1]!, 16);
        const hi = parseInt(e[2]!, 16);
        const dst = parseInt(e[3]!.slice(0, 4), 16);
        for (let c = lo; c <= hi; c++) map.set(c, String.fromCodePoint(dst + (c - lo)));
      }
    }
    return map;
  };
  const dictOf = (obj: unknown) => {
    const d = resolve(obj);
    return d instanceof PDFDict ? d : undefined;
  };

  const read = (raw: string, resources: InstanceType<typeof PDFDict> | undefined): string => {
    const fonts = new Map<string, Map<number, string>>();
    const fontDict = dictOf(resources?.get(PDFName.of("Font")));
    for (const key of fontDict?.keys() ?? []) {
      const f = dictOf(fontDict!.get(key));
      if (f) fonts.set(key.asString().replace(/^\//, ""), codeMap(f));
    }
    const xobjects = dictOf(resources?.get(PDFName.of("XObject")));
    let current: Map<number, string> | undefined;
    let text = "";
    const decode = (hex: string) => {
      // Chromium's subset fonts use two-byte codes.
      for (let i = 0; i + 3 < hex.length; i += 4) {
        text += current?.get(parseInt(hex.slice(i, i + 4), 16)) ?? "";
      }
    };
    for (const m of raw.matchAll(
      /\/([A-Za-z0-9+.-]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]*)>\s*Tj|\[([^\]]*)\]\s*TJ|\/([A-Za-z0-9+.-]+)\s+Do\b/g,
    )) {
      if (m[1] !== undefined) current = fonts.get(m[1]);
      else if (m[2] !== undefined) decode(m[2]);
      else if (m[3] !== undefined)
        for (const h of m[3].matchAll(/<([0-9A-Fa-f]*)>/g)) decode(h[1]!);
      else if (m[4] !== undefined) {
        const form = resolve(xobjects?.get(PDFName.of(m[4])));
        if (
          form instanceof PDFRawStream &&
          form.dict.get(PDFName.of("Subtype"))?.toString() === "/Form"
        ) {
          text += read(decodeStream(form), dictOf(form.dict.get(PDFName.of("Resources"))));
        }
      }
    }
    return text;
  };
  return read(contentText(page.node.Contents()), page.node.Resources());
}

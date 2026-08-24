import { describe, expect, it } from "vitest";
import {
  documentAuthor,
  documentFooterLine,
  documentKeywords,
  documentSubject,
} from "./documentMeta";
import { resolveLabels } from "./labels";

const EN = resolveLabels("en").labels;
const JA = resolveLabels("ja").labels;

const FULL = { version: "1.2", date: "2026-08-22", authors: ["Docs Team", "QA"] };

describe("the line a document says about itself", () => {
  it("names the version, the date, and the authors", () => {
    expect(documentFooterLine(FULL, EN)).toBe("Version 1.2 · 2026-08-22 · Docs Team · QA");
  });

  it("takes the word for the version from the document's label table", () => {
    // The footer is chrome, so it follows `lang` (23.4) — and `html.labels` can replace it, which
    // is what makes a language monodocs does not ship possible.
    expect(documentFooterLine(FULL, JA)).toBe("バージョン 1.2 · 2026-08-22 · Docs Team · QA");
    expect(documentFooterLine(FULL, { ...EN, version: "Rev." })).toContain("Rev. 1.2");
  });

  it("omits what the document does not say", () => {
    expect(documentFooterLine({ version: "1.2" }, EN)).toBe("Version 1.2");
    expect(documentFooterLine({ date: "2026-08-22" }, EN)).toBe("2026-08-22");
    expect(documentFooterLine({ authors: ["A"] }, EN)).toBe("A");
    // Nothing said is an empty line, and the caller drops the element rather than printing a
    // separator with nothing on either side of it.
    expect(documentFooterLine({}, EN)).toBe("");
    expect(documentFooterLine({ version: "  ", authors: ["", " "] }, EN)).toBe("");
  });
});

describe("what reaches the PDF's document properties", () => {
  it("puts the authors in Author, as one field, because PDF has one", () => {
    expect(documentAuthor(FULL)).toBe("Docs Team, QA");
    expect(documentAuthor({})).toBe("");
    expect(documentAuthor({ authors: ["A", "  ", "B"] })).toBe("A, B");
  });

  it("says in Subject what this is a version of, and when", () => {
    expect(documentSubject(FULL, EN)).toBe("Version 1.2 (2026-08-22)");
    expect(documentSubject({ version: "1.2" }, EN)).toBe("Version 1.2");
    expect(documentSubject({ date: "2026-08-22" }, EN)).toBe("2026-08-22");
    expect(documentSubject({}, EN)).toBe("");
    // The authors are not repeated here: Author is where a viewer looks for them.
    expect(documentSubject(FULL, EN)).not.toContain("Docs Team");
  });

  it("puts the values as written in Keywords, without the label", () => {
    // A search over a folder of PDFs matches "1.2", not "Version 1.2".
    expect(documentKeywords(FULL)).toEqual(["1.2", "2026-08-22"]);
    expect(documentKeywords({ date: "2026-08-22" })).toEqual(["2026-08-22"]);
    expect(documentKeywords({})).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { isValidLanguageTag, LABEL_KEYS, resolveLabels } from "./labels";

describe("isValidLanguageTag", () => {
  it("accepts tags a document may legitimately declare", () => {
    // 同梱の表があるかとは無関係。`<html lang>` は文書の言語を表明できなければならない。
    for (const tag of ["en", "ja", "en-GB", "ja-JP", "fr", "zh-Hant-TW", "de-CH-1901", "x-pig"]) {
      expect(isValidLanguageTag(tag), tag).toBe(true);
    }
  });

  it("accepts grandfathered tags, which the Intl grammar rejects", () => {
    // BCP 47 としては妥当なのに Intl.getCanonicalLocales は投げる。ここを任せきりにすると、
    // lang: i-klingon の文書がビルドできない。
    for (const tag of ["i-klingon", "en-GB-oed", "sgn-BE-FR", "zh-min-nan", "I-NAVAJO"]) {
      expect(isValidLanguageTag(tag), tag).toBe(true);
    }
  });

  it("rejects what is not a language tag, rather than writing it into the attribute", () => {
    for (const tag of ["", "e", "english!", "en_US", "日本語", "en-", "-en", "a".repeat(101)]) {
      expect(isValidLanguageTag(tag), tag).toBe(false);
    }
  });
});

describe("resolveLabels", () => {
  it("ships a complete table for every language it claims to ship", () => {
    for (const lang of ["en", "ja"]) {
      const { labels, warning } = resolveLabels(lang);
      expect(warning).toBeUndefined();
      // 半分だけ訳された表は、その言語の読者にとって表が無いより悪い。
      for (const key of LABEL_KEYS) {
        expect(labels[key], `${lang}.${key}`).toBeTruthy();
      }
    }
  });

  it("gives a Japanese document Japanese labels", () => {
    expect(resolveLabels("ja").labels.tocTitle).toBe("このページの内容");
    expect(resolveLabels("en").labels.tocTitle).toBe("On this page");
  });

  it("matches on the primary subtag, case-insensitively", () => {
    for (const tag of ["ja-JP", "JA", "ja-Jpan-JP"]) {
      expect(resolveLabels(tag).labels.tocTitle, tag).toBe("このページの内容");
      expect(resolveLabels(tag).warning, tag).toBeUndefined();
    }
    expect(resolveLabels("en-GB").labels.tocTitle).toBe("On this page");
  });

  it("falls back to English and warns, naming the tag, rather than rejecting the document", () => {
    // 拒否すると、フランス語の文書がビルドを通すためだけに自分を英語だと偽ることになる。
    const { labels, warning } = resolveLabels("fr");
    expect(labels.tocTitle).toBe("On this page");
    expect(warning).toContain('"fr"');
    expect(warning).toContain("en");
  });

  it("falls back for a tag that has no primary subtag to match", () => {
    // 私用のみのタグにも grandfathered の i-* にも、照合先の主言語サブタグが無い。
    expect(resolveLabels("x-klingon").warning).toContain("x-klingon");
    expect(resolveLabels("i-klingon").warning).toContain("i-klingon");
    // 主言語サブタグはあるが表が無いもの。ここも同じ扱い。
    expect(resolveLabels("sgn-BE-FR").warning).toContain("sgn-BE-FR");
  });

  it("applies overrides on top of the chosen table, leaving the rest of it alone", () => {
    const { labels } = resolveLabels("ja", { tocTitle: "目次", copy: "複製" });
    expect(labels.tocTitle).toBe("目次");
    expect(labels.copy).toBe("複製");
    // 差し替えたのは 2 つだけ。残りは ja の表のまま。
    expect(labels.noResults).toBe("該当なし");
  });

  it("applies overrides on top of the fallback table too", () => {
    const { labels, warning } = resolveLabels("fr", { tocTitle: "Sur cette page" });
    expect(labels.tocTitle).toBe("Sur cette page");
    expect(labels.noResults).toBe("No results");
    // 上書きしても、表が無いこと自体は伝える（他のラベルは英語のままなので）。
    expect(warning).toBeDefined();
  });
});

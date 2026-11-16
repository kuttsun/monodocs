import { describe, expect, it } from "vitest";
import { tokenize } from "./tokens";

const texts = (s: string) => tokenize(s).map((t) => t.text);

describe("tokenize", () => {
  it("makes each Han character, hiragana, and katakana a token of its own", () => {
    expect(texts("設定ファイルの既定値を変更した。")).toEqual([
      ..."設定ファイルの既定値を変更した",
      "。",
    ]);
    expect(tokenize("設").map((t) => t.kind)).toEqual(["cjk"]);
    // 々, 〆, ヵ, ヶ with the Han characters; ー and ｰ with the kana.
    expect(texts("人々〆切ヵ月ヶ所コーヒーｺｰﾋｰ")).toEqual([..."人々〆切ヵ月ヶ所コーヒーｺｰﾋｰ"]);
    expect(tokenize("々〆ーｰ").every((t) => t.kind === "cjk")).toBe(true);
  });

  it("makes a run of letters, digits, and _ in any other script one token", () => {
    expect(texts("The build embeds no timestamp of its own.")).toEqual([
      "The",
      " ",
      "build",
      " ",
      "embeds",
      " ",
      "no",
      " ",
      "timestamp",
      " ",
      "of",
      " ",
      "its",
      " ",
      "own",
      ".",
    ]);
    expect(texts("snake_case2 ＡＢＣ123 Ελληνικά кириллица")).toEqual([
      "snake_case2",
      " ",
      "ＡＢＣ123",
      " ",
      "Ελληνικά",
      " ",
      "кириллица",
    ]);
    // Digits next to Japanese are a word of their own; the Japanese around them are not.
    expect(texts("2026年10月")).toEqual(["2026", "年", "10", "月"]);
    // A Devanagari word, its conjunct included, is one run, and so is a Myanmar or Tai Tham word
    // whose spacing marks start clusters of their own.
    expect(texts("क्षमा करें")).toEqual(["क्षमा", " ", "करें"]);
    expect(texts("မြန်မာ စာ")).toEqual(["မြန်မာ", " ", "စာ"]);
    expect(texts("ᨠᩣ")).toEqual(["ᨠᩣ"]);
    // SOFT HYPHEN and WORD JOINER stay inside their word.
    expect(texts("hyph\u00ADen\u2060ated x")).toEqual(["hyph\u00ADen\u2060ated", " ", "x"]);
  });

  it("makes a run of whitespace one token, and any other character one each", () => {
    expect(texts("a  \tb")).toEqual(["a", "  \t", "b"]);
    expect(tokenize("  \t").map((t) => t.kind)).toEqual(["space"]);
    expect(texts("(a)--b")).toEqual(["(", "a", ")", "-", "-", "b"]);
    expect(texts("、。！")).toEqual(["、", "。", "！"]);
  });

  it("never splits a grapheme cluster", () => {
    expect(texts("👩‍💻👍🏽🇯🇵")).toEqual(["👩‍💻", "👍🏽", "🇯🇵"]);
    // A keycap and a modified letter are emoji, tokens of their own beside letters and digits.
    expect(texts("1️⃣2 abc1️⃣#️⃣")).toEqual(["1️⃣", "2", " ", "abc", "1️⃣", "#️⃣"]);
    expect(texts("a🏽b")).toEqual(["a🏽", "b"]);
    // A combining mark joins the cluster it follows, and so the word.
    expect(texts("café ok")).toEqual(["café", " ", "ok"]);
    expect(texts("ｶﾞｲﾄﾞ")).toEqual(["ｶﾞ", "ｲ", "ﾄﾞ"]);
    // A Prepend character joins the cluster after it, and takes the class of what it precedes:
    // ARABIC NUMBER SIGN before digits is one number.
    expect(texts("؀1234 x")).toEqual(["؀1234", " ", "x"]);
  });

  it("compares text as written, without normalizing it", () => {
    // Decomposed and precomposed forms are different text, and stay so: the comparison sees
    // what the author wrote.
    expect(texts("é")).toEqual(["é"]);
    expect(texts("é")).toEqual(["é"]);
    expect(tokenize("")).toEqual([]);
  });
});

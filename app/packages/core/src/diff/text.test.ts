import { describe, expect, it } from "vitest";
import { diffText, formatDifference } from "./text";

const diff = (a: string, b: string) => formatDifference(diffText(a, b));

describe("diffText", () => {
  // The examples roadmap 7.3.6 measured on 2026-10-14 with a prototype of these rules.
  it.each([
    [
      "設定ファイルの既定値を変更した。",
      "設定ファイルの初期値を変更した。",
      "設定ファイルの[-既定-]{+初期+}値を変更した。",
    ],
    [
      "The build embeds no timestamp of its own.",
      "The build embeds no date of its own.",
      "The build embeds no [-timestamp-]{+date+} of its own.",
    ],
    [
      "Set the output directory before running the build.",
      "Set the output folder before starting the build.",
      "Set the output [-directory-]{+folder+} before [-running-]{+starting+} the build.",
    ],
    [
      "出力を書き出さずに検証する",
      "出力を書き出さずに、ビルド時と同じ処理で検証する",
      "出力を書き出さずに{+、ビルド時と同じ処理で+}検証する",
    ],
    [
      "設定を読み込んで出力先を決める",
      "入力を読んで出力の形式を定める",
      "[-設定-]{+入力+}を読[-み込-]んで出力[-先を決-]{+の形式を定+}める",
    ],
  ])("writes %s → %s as recorded", (oldText, newText, expected) => {
    expect(diff(oldText, newText)).toBe(expected);
  });

  it("shows a paragraph that keeps less than half of itself whole", () => {
    expect(
      diffText("旧版の設定で組み、新版の見た目で出す。", "新版の設定で組み直し、旧版と比べる。"),
    ).toEqual({
      whole: true,
    });
    // At half exactly it is still compared.
    expect(diff("abcd efgh", "abcd wxyz")).toBe("abcd [-efgh-]{+wxyz+}");
  });

  it("absorbs a one-character equal run between two changes, and one of only punctuation", () => {
    // `を` alone between two changes joins them (the last recorded example shows it).
    expect(diff("先を決めてから出力する", "後を定めてから出力する")).toBe(
      "[-先を決-]{+後を定+}めてから出力する",
    );
    // Two characters between them stay.
    expect(diff("aa bb cc", "xx bb yy")).toBe("[-aa-]{+xx+} bb [-cc-]{+yy+}");
    // Only whitespace and punctuation between them: absorbed, however long.
    expect(diff("keep one, — two here", "keep uno, — dos here")).toBe(
      "keep [-one, — two-]{+uno, — dos+} here",
    );
    // An equal run at either end is not between two changes, and stays.
    expect(diff("a。b", "a。c")).toBe("a。[-b-]{+c+}");
  });

  it("writes a change's deletion before its insertion, and keeps grapheme clusters whole", () => {
    expect(diff("I like 🍎 a lot", "I like 🍌 a lot")).toBe("I like [-🍎-]{+🍌+} a lot");
    expect(diff("नमस्ते दुनिया", "नमस्ते क्षमा")).toBe("नमस्ते [-दुनिया-]{+क्षमा+}");
    expect(diff("same", "same")).toBe("same");
  });

  it("shows text added to or taken from an empty side whole", () => {
    expect(diffText("", "new")).toEqual({ whole: true });
    expect(diffText("old", "")).toEqual({ whole: true });
  });
});

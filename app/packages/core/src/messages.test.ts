import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_MESSAGE_LANG,
  getMessageLang,
  MESSAGE_KEYS,
  MESSAGE_LANGS,
  resolveMessageLang,
  setMessageLang,
  t,
} from "./messages";

afterEach(() => setMessageLang(DEFAULT_MESSAGE_LANG));

describe("resolveMessageLang", () => {
  it("defaults to English", () => {
    expect(resolveMessageLang({})).toBe("en");
    expect(resolveMessageLang({ flag: undefined, env: undefined })).toBe("en");
    // 空文字は「指定していない」と同じ扱い（MONODOCS_LANG= と書いた場合）。
    expect(resolveMessageLang({ env: "" })).toBe("en");
  });

  it("lets the flag win over the environment variable", () => {
    expect(resolveMessageLang({ flag: "en", env: "ja" })).toBe("en");
    expect(resolveMessageLang({ flag: "ja", env: "en" })).toBe("ja");
    expect(resolveMessageLang({ env: "ja" })).toBe("ja");
  });

  it("rejects an unsupported value, naming the supported ones", () => {
    // 黙ってフォールバックすると、指定したのに効いていないという最も気づきにくい失敗になる。
    expect(() => resolveMessageLang({ flag: "fr" })).toThrow(/"fr"/);
    expect(() => resolveMessageLang({ flag: "fr" })).toThrow(/en, ja/);
    expect(() => resolveMessageLang({ env: "de" })).toThrow(/"de"/);
  });

  it("accepts a differently-cased value", () => {
    expect(resolveMessageLang({ flag: "JA" })).toBe("ja");
  });

  it("rejects an explicitly empty flag rather than falling through to the default", () => {
    // `--lang=` を既定へ落とすと、環境変数まで打ち消したうえで黙って英語になる。
    // 指定したのに効いていない、という最も気づきにくい失敗をここで止める。
    expect(() => resolveMessageLang({ flag: "" })).toThrow(/supported/);
    expect(() => resolveMessageLang({ flag: "", env: "ja" })).toThrow(/supported/);
  });
});

describe("the catalogue", () => {
  it("is complete in every shipped language", () => {
    for (const lang of MESSAGE_LANGS) {
      setMessageLang(lang);
      for (const key of MESSAGE_KEYS) {
        expect(t(key), `${lang}.${key}`).toBeTruthy();
      }
    }
  });

  it("keeps the same placeholders in every language", () => {
    // 片方の言語だけプレースホルダを落とすと、その言語でだけ値が消えた文になる。
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
    for (const key of MESSAGE_KEYS) {
      setMessageLang("en");
      const en = placeholders(t(key));
      setMessageLang("ja");
      expect(placeholders(t(key)), key).toEqual(en);
    }
  });

  it("substitutes parameters and leaves an unknown placeholder alone", () => {
    setMessageLang("en");
    expect(t("build.inputNotFound", { path: "./docs" })).toBe("Input directory not found: ./docs");
    // 値の無いプレースホルダは消さずに残す。消すと文が壊れて原因が読めなくなる。
    expect(t("build.inputNotFound")).toContain("{path}");
  });

  it("switches every message together", () => {
    setMessageLang("ja");
    expect(getMessageLang()).toBe("ja");
    expect(t("build.inputNotFound", { path: "x" })).toBe("入力ディレクトリが見つかりません: x");
  });
});

/**
 * カタログの外に新しい文字列が生えたら落ちる検査。
 *
 * 25.6 が求めているのは「monodocs が出す文字列を漏れなく覆う」ことで、それは一度揃えれば済む
 * 話ではない。次に追加される 1 件を捕まえる仕掛けが無ければ、カタログは静かに穴が開く。
 *
 * 判定はソースの走査。`throw new Error(...)` / `warnings.push(...)` / `console.*(...)` /
 * Commander の `.description(...)` などの引数が文字列リテラルで始まっていれば、それは
 * カタログを通っていない。`t(...)` か変数を渡していれば通っている。
 */
const SRC = fileURLToPath(new URL(".", import.meta.url));
const CLI_SRC = join(SRC, "../../cli/src");

/**
 * 監視対象。第 1 引数が文字列リテラルなら未カタログとみなすもの。
 * `\w*Error` にしてあるのは、`BrowserSetupError` や `MermaidPrerenderSetupError` のような
 * 独自の派生を取りこぼさないため。名前を列挙する形にすると、次に増えた 1 つを見逃す。
 */
const FIRST_ARG_EMITTERS = [
  "throw new \\w*Error\\(",
  "warnings\\.(?:push|unshift)\\(",
  "errors\\.push\\(",
  "console\\.\\w+\\(",
  "process\\.std(?:out|err)\\.write\\(",
  "\\.description\\(",
];

/**
 * 第 2 引数が説明文になるもの。Commander の `.option("-o, --output <path>", "説明")` では
 * 第 1 引数のフラグ表記は文字列リテラルで正しいので、そこを咎めてはいけない。
 */
const SECOND_ARG_EMITTERS = ["\\.(?:option|argument|helpOption|helpCommand|addHelpText)\\("];

const STRING_LITERAL = "(?:\"[^\"]*\"|'[^']*'|`[^`]*`)";

async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      out.push(...(await sourceFiles(full)));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("every emitted string goes through the catalogue", () => {
  it("finds no message built outside it", async () => {
    const files = [...(await sourceFiles(SRC)), ...(await sourceFiles(CLI_SRC))];
    // 走査できていなければ、この検査は何も見ずに通ってしまう。まず対象があることを確かめる。
    expect(files.length).toBeGreaterThan(20);
    // Windows では join() が \\ を返すので、比較の前に区切りを揃える。
    const posix = (f: string) => f.split(sep).join("/");
    expect(files.some((f) => posix(f).endsWith("/cli/src/index.ts"))).toBe(true);

    // ファイル全体に対して掛ける。行ごとに見ると、引数を次の行に書いた呼び出しを見逃す。
    const patterns = [
      new RegExp(`(?:${FIRST_ARG_EMITTERS.join("|")})\\s*(["'\`])`, "g"),
      new RegExp(`(?:${SECOND_ARG_EMITTERS.join("|")})\\s*${STRING_LITERAL}\\s*,\\s*(["'\`])`, "g"),
    ];
    const offenders: string[] = [];

    for (const file of files) {
      // messages.ts はカタログそのもの。ここだけは文字列リテラルで書く。
      if (posix(file).endsWith("/messages.ts")) continue;
      const source = await readFile(file, "utf8");
      // コメントは対象外（説明の中に例を書くことがある）。
      const scannable = source
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
        .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(scannable)) !== null) {
          const line = scannable.slice(0, match.index).split("\n").length;
          offenders.push(`${relative(SRC, file)}:${line}: ${match[0].replace(/\s+/g, " ")}`);
        }
      }
    }

    expect(offenders, `these emit a literal instead of t(...):\n${offenders.join("\n")}`).toEqual(
      [],
    );
  });
});

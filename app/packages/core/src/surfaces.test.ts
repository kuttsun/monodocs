import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createProgram } from "../../cli/src/program";
import {
  buildConfigFileSchema,
  DEFAULT_EXCLUDE,
  loadConfig,
  PDF_DENSITY_PRESETS,
  type PdfDensity,
  type ResolvedConfig,
} from "./config";
import { DIAGNOSTIC_CODES, DIAGNOSTICS_SCHEMA_VERSION } from "./diagnostics";
import { DEFAULT_MESSAGE_LANG, resolveMessageLang } from "./messages";
import { DEFAULT_PDF_FOOTER, EMPTY_PDF_BAND } from "./pipeline/pdfBands";
import { toPageId, toRoute } from "./route";
import { DEFAULT_HOST, DEFAULT_PORT } from "./serve";
import { REQUIRED_TEMPLATE_TOKENS } from "./themes/index";
import { resolveReportFormat } from "../../cli/src/report";

/**
 * The page that enumerates what 1.0 freezes (roadmap 12.4, v0.16), in both languages, against what
 * the code defines: every configuration key the schema accepts and its default, every command and
 * option the CLI defines, and every diagnostic code — each way, so that neither can have what the
 * other lacks.
 */
const PAGES = {
  en: readFileSync(new URL("../../../../site/docs/surfaces.md", import.meta.url), "utf8"),
  ja: readFileSync(new URL("../../../../site/ja/docs/surfaces.md", import.meta.url), "utf8"),
};

/** The section of a page under a heading with this anchor, up to the next `## `. */
function section(page: string, anchor: string): string {
  const start = page.indexOf(`{#${anchor}}`);
  expect(start).toBeGreaterThan(-1);
  // Up to the next heading of either level, so a subsection is a section of its own.
  const end = page.slice(start).search(/\n###? /);
  return page.slice(start, end === -1 ? undefined : start + end);
}

/** The rows of a section's table, as their cells. */
function rows(text: string): string[][] {
  return text
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| ---"))
    .slice(1)
    .map((line) =>
      line
        .slice(2, -2)
        .split(" | ")
        .map((cell) => cell.trim()),
    );
}

/**
 * Every key of the configuration schema, as a dotted path. A key whose value is a choice between
 * a value and an object (`pdf.density`), or a list (`sidebar.items`), is listed itself and so is
 * every key inside it: a list's items as `sidebar.items[].path`. A list that holds the same items
 * again (`children`) is listed once, as a key, rather than walked forever.
 */
function schemaKeys(): string[] {
  const keys = new Set<string>();
  const walking = new Set<unknown>();
  const walk = (schema: unknown, path: string) => {
    const def =
      (schema as { _def?: Record<string, unknown>; def?: Record<string, unknown> })._def ??
      (schema as { def?: Record<string, unknown> }).def!;
    const type = (def.typeName ?? def.type) as string;
    if (
      ["ZodOptional", "optional", "ZodNullable", "nullable", "ZodDefault", "default"].includes(type)
    ) {
      return walk(def.innerType, path);
    }
    if (["ZodEffects", "pipe", "transform"].includes(type)) return walk(def.schema ?? def.in, path);
    if (type === "ZodLazy" || type === "lazy") {
      // The getter builds its schema anew on every call, so the lazy itself is what recurs.
      if (walking.has(schema)) return void keys.add(path);
      walking.add(schema);
      walk((def.getter as () => unknown)(), path);
      walking.delete(schema);
      return;
    }
    if (type === "ZodObject" || type === "object") {
      const shape = (
        typeof def.shape === "function" ? (def.shape as () => object)() : def.shape
      ) as Record<string, unknown>;
      for (const key of Object.keys(shape)) walk(shape[key], path ? `${path}.${key}` : key);
      return;
    }
    if (["ZodUnion", "union", "ZodDiscriminatedUnion"].includes(type)) {
      keys.add(path);
      const options = (def.options as unknown[] | Map<unknown, unknown>) ?? [];
      for (const option of options instanceof Map ? options.values() : options) {
        walk(option, path);
      }
      // The path itself was added above; an option that is a plain value adds it again.
      return;
    }
    if (type === "ZodArray" || type === "array") {
      keys.add(path);
      const element = def.element ?? def.type;
      const inner =
        (element as { _def?: Record<string, unknown>; def?: Record<string, unknown> })._def ??
        (element as { def?: Record<string, unknown> }).def!;
      const innerType = (inner.typeName ?? inner.type) as string;
      if (!["ZodString", "string", "ZodEnum", "enum"].includes(innerType)) {
        walk(element, `${path}[]`);
        keys.delete(`${path}[]`);
      }
      return;
    }
    keys.add(path);
  };
  walk(buildConfigFileSchema(), "");
  return [...keys];
}

/**
 * Each key's default, written as the page writes it, from a configuration with no file. A key whose
 * default the resolved configuration does not hold as a value is written from what it does hold.
 */
function expectedDefaults(
  r: ResolvedConfig,
  cwd: string,
  outputs: { pdf: string; both: string },
  densityObject: { empty: PdfDensity; compact: PdfDensity },
  singleFile: ResolvedConfig,
): Record<string, string> {
  const code = (v: unknown) => `\`${Array.isArray(v) ? `[${v.join(", ")}]` : String(v)}\``;
  const unset = (v: unknown) =>
    v === undefined || (Array.isArray(v) && v.length === 0) ? "unset" : code(v);
  const labels = Object.fromEntries(
    schemaKeys()
      .filter((k) => k.startsWith("html.labels."))
      .map((k) => [
        k,
        r.labelOverrides && Object.keys(r.labelOverrides).length === 0 ? "from `lang`" : "?",
      ]),
  );
  return {
    title: code(r.title),
    lang: code(r.lang),
    fontCheck: code(r.fontCheck),
    "document.version": unset(r.documentMetadata.version),
    "document.date": unset(r.documentMetadata.date),
    "document.authors": unset(r.documentMetadata.authors),
    input: r.inputDir === join(cwd, "docs") ? "`./docs`" : "?",
    root:
      r.rootDir === r.inputDir && singleFile.rootDir === dirname(join(cwd, "docs", "start.md"))
        ? "value of `input` (for a single file, its directory)"
        : "?",
    "output.format": code(r.format),
    // The default depends on the format, so all three are written.
    "output.path":
      r.outputFile === join(cwd, "dist", "docs.html") &&
      outputs.pdf === join(cwd, "dist", "docs.pdf") &&
      outputs.both === join(cwd, "dist")
        ? "`./dist/docs.html` (`./dist/docs.pdf` for `pdf`, `./dist` for `both`)"
        : "?",
    "sources.markdown.extensions": code(r.markdownExtensions),
    "sources.asciidoc.extensions": code(r.asciidocExtensions),
    "sources.asciidoc.attributes": Object.keys(r.asciidocAttributes).length === 0 ? "unset" : "?",
    "sources.include": unset(r.include),
    // The list a document adds to the defaults is empty, and the defaults are on.
    "sources.exclude": r.exclude.length === DEFAULT_EXCLUDE.length ? "`[]`" : "?",
    "sources.excludeDefaults": code(DEFAULT_EXCLUDE.every((p) => r.exclude.includes(p))),
    "sources.lineBreak": code(r.lineBreak),
    "sidebar.mode": code(r.sidebarMode),
    "sidebar.items": unset(r.sidebarItems),
    // An item's keys have no default: an item is written whole or not at all.
    "sidebar.items[].title": "unset",
    "sidebar.items[].path": "unset",
    "sidebar.items[].children": "unset",
    "sidebar.exclude": "unset (deprecated; removed in 1.0)",
    "sidebar.collapseDepth": unset(r.sidebarCollapseDepth),
    ...Object.fromEntries(
      (["page", "directory"] as const).flatMap((which) => {
        const transform = r.sidebarTitleTransform[which];
        const at = `sidebar.titleTransform.${which}`;
        return [
          [at, code(transform.type)],
          // `type` tells the object's forms apart, so writing the object means writing it.
          [
            `${at}.type`,
            transform.type === "none" ? "unset (required when the object is written)" : "?",
          ],
          [`${at}.pattern`, transform.type === "none" ? "unset" : "?"],
          [`${at}.replacement`, transform.type === "none" ? "unset" : "?"],
          [`${at}.flags`, transform.type === "none" ? "unset" : "?"],
        ];
      }),
    ),
    "sidebar.titleFrom": code(r.sidebarTitleFrom),
    "sidebar.flattenSingleChild": code(r.sidebarFlattenSingleChild),
    "toc.maxLevel": code(r.tocMaxLevel),
    "numbering.sections": code(r.numberingSections),
    "figures.align": code(r.figuresAlign),
    "assets.embedImages": code(r.embedImages),
    "assets.maxInlineSize": r.maxInlineSize === 5 * 1024 * 1024 ? "`5MB`" : "?",
    "assets.onLargeImage": code(r.onLargeImage),
    "assets.budget": unset(r.budget),
    "assets.onBudget": code(r.onBudget),
    "mermaid.enabled": code(r.mermaidEnabled),
    "mermaid.mode": code(r.mermaidMode),
    "mermaid.runtime": code(r.mermaidRuntime),
    "highlight.enabled": code(r.codeHighlight),
    "math.enabled": code(r.mathEnabled),
    "html.theme": code(r.theme),
    "html.contentWidth": code(r.contentWidth),
    "html.contentWidthToggle": code(r.contentWidthToggle),
    "html.contentWidthDefault": code(r.contentWidthDefault),
    "html.imageLightbox": code(r.imageLightbox),
    "html.branding": code(r.branding),
    "html.colorScheme": code(r.colorScheme),
    ...labels,
    "pdf.pageSize": code(r.pdfPageSize),
    "pdf.margin.top": code(r.pdfMargin.top),
    "pdf.margin.right": code(r.pdfMargin.right),
    "pdf.margin.bottom": code(r.pdfMargin.bottom),
    "pdf.margin.left": code(r.pdfMargin.left),
    "pdf.printBackground": code(r.pdfPrintBackground),
    "pdf.bookmarks": code(r.pdfBookmarks),
    "pdf.header": r.pdfHeader === EMPTY_PDF_BAND ? "`false`" : "?",
    "pdf.footer":
      r.pdfFooter === DEFAULT_PDF_FOOTER &&
      DEFAULT_PDF_FOOTER.includes('class="pageNumber"') &&
      DEFAULT_PDF_FOOTER.includes('class="totalPages"')
        ? "page number / total pages"
        : "?",
    "pdf.cover.enabled": code(r.pdfCover),
    "pdf.toc.enabled": code(r.pdfToc.enabled),
    "pdf.toc.depth": code(r.pdfToc.depth),
    "pdf.watermark": r.pdfWatermark === undefined ? "`false`" : "?",
    "pdf.pageBreakLevel": code(r.pdfPageBreakLevel),
    "pdf.density":
      JSON.stringify(r.pdfDensity) === JSON.stringify(PDF_DENSITY_PRESETS.normal)
        ? "`normal`"
        : "?",
    // In the object form, `base` defaults to `normal`, and a key left out takes `base`'s value.
    "pdf.density.base":
      JSON.stringify(densityObject.empty) === JSON.stringify(PDF_DENSITY_PRESETS.normal)
        ? "`normal`"
        : "?",
    ...Object.fromEntries(
      (["fontSize", "lineHeight", "headingSpacing", "tableCellPadding"] as const).map((key) => [
        `pdf.density.${key}`,
        densityObject.compact[key] === PDF_DENSITY_PRESETS.compact[key] &&
        PDF_DENSITY_PRESETS.compact[key] !== PDF_DENSITY_PRESETS.normal[key]
          ? "from `base`"
          : "?",
      ]),
    ),
  };
}

/** The Japanese page writes these defaults in words; everything else is the same. */
const JA_WORDS: Record<string, string> = {
  unset: "未設定",
  "value of `input` (for a single file, its directory)":
    "`input` の値（単一ファイルならそのディレクトリ）",
  "unset (deprecated; removed in 1.0)": "未設定（非推奨。1.0 で削除）",
  "from `lang`": "`lang` から",
  "page number / total pages": "ページ番号 / 総ページ数",
  "unset (required when the object is written)": "未設定（オブジェクトを書くときは必須）",
  "from `base`": "`base` から",
  "`./dist/docs.html` (`./dist/docs.pdf` for `pdf`, `./dist` for `both`)":
    "`./dist/docs.html`（`pdf` は `./dist/docs.pdf`、`both` は `./dist`）",
};

describe("the surfaces 1.0 freezes (v0.16)", () => {
  it("lists every configuration key the schema accepts, and no other, in both languages", () => {
    const keys = schemaKeys().sort();
    for (const page of Object.values(PAGES)) {
      const listed = rows(section(page, "keys")).map(([key]) => key!.replace(/`/g, ""));
      expect([...listed].sort()).toEqual(keys);
    }
  });

  it("gives each key the default the code applies to a configuration with no file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "monodocs-surfaces-"));
    try {
      await mkdir(join(dir, "docs"));
      const resolved = await loadConfig({}, dir);
      const density = async (yaml: string) => {
        await writeFile(join(dir, "monodocs.config.yml"), `pdf:\n  density: ${yaml}\n`);
        const resolvedDensity = (await loadConfig({}, dir)).pdfDensity;
        await rm(join(dir, "monodocs.config.yml"));
        return resolvedDensity;
      };
      const expected = expectedDefaults(
        resolved,
        dir,
        {
          pdf: (await loadConfig({ format: "pdf" }, dir)).outputFile,
          both: (await loadConfig({ format: "both" }, dir)).outputFile,
        },
        { empty: await density("{}"), compact: await density("{ base: compact }") },
        await (async () => {
          await writeFile(join(dir, "docs", "start.md"), "# Start\n");
          return loadConfig({ inputDir: "docs/start.md" }, dir);
        })(),
      );
      expect(Object.keys(expected).sort()).toEqual(schemaKeys().sort());
      const listed = (page: string) =>
        Object.fromEntries(
          rows(section(page, "keys")).map(([key, value]) => [key!.replace(/`/g, ""), value]),
        );
      expect(listed(PAGES.en)).toEqual(expected);
      expect(listed(PAGES.ja)).toEqual(
        Object.fromEntries(
          Object.entries(expected).map(([key, value]) => [key, JA_WORDS[value] ?? value]),
        ),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("lists every command and option the CLI defines, and no other, in both languages", () => {
    const program = createProgram();
    // Commander's Help sees what `--help` prints: the help option and the help command included.
    const help = program.createHelp();
    const helpFlags = (command: typeof program) =>
      help
        .visibleOptions(command)
        .filter((o) => !command.options.includes(o))
        .map((o) => o.flags);
    const args = (command: typeof program) =>
      help
        .visibleArguments(command)
        .map((a) => {
          const name = `${a.name()}${a.variadic ? "..." : ""}`;
          return `\`${a.required ? `<${name}>` : `[${name}]`}\``;
        })
        .join(", ") || "—";
    const flags = (options: readonly { flags: string }[]) =>
      options.map((o) => `\`${o.flags}\``).join(", ") || "—";
    const commands = help.visibleCommands(program);
    const defined = [
      ["(any)", "—", flags([...program.options, ...helpFlags(program).map((f) => ({ flags: f }))])],
      ...commands.map((command) => [
        `\`${command.name()}\``,
        // Commander builds the help command's argument from a string it never registers, so
        // `visibleArguments` sees none; what it prints is read from its usage instead.
        command.name() === "help"
          ? `\`${command.usage().replace(/^\[options\]\s*/, "")}\``
          : args(command),
        flags(command.options),
      ]),
    ];
    // Every command but help takes the help option too, which the page says once.
    for (const command of commands.filter((c) => c.name() !== "help")) {
      expect(helpFlags(command), command.name()).toEqual(["-h, --help"]);
    }
    expect(rows(section(PAGES.en, "commands"))).toEqual(defined);
    expect(rows(section(PAGES.ja, "commands"))).toEqual(
      defined.map(([name, ...rest]) => [name === "(any)" ? "（共通）" : name!, ...rest]),
    );
  });

  it("lists every diagnostic code, and no other, and the schema version a job pins", () => {
    for (const page of Object.values(PAGES)) {
      const text = section(page, "diagnostics");
      const listed = [...text.matchAll(/^- `([a-z-]+\/[a-z-]+)`$/gm)].map((m) => m[1]);
      expect(listed.sort()).toEqual([...DIAGNOSTIC_CODES].sort());
      expect(text).toContain(`\`"schemaVersion": ${DIAGNOSTICS_SCHEMA_VERSION}\``);
      expect(text).toContain("](./commands#json-report)");
    }
  });

  it("gives the options' defaults and a template's required tokens as the code has them", () => {
    for (const page of Object.values(PAGES)) {
      const text = section(page, "also");
      expect(text).toContain(
        `\`validate --format\` ${page === PAGES.en ? "is" : "は"} \`${resolveReportFormat(undefined)}\``,
      );
      expect(text).toContain(
        page === PAGES.en
          ? `listens at \`${DEFAULT_HOST}\` on port \`${DEFAULT_PORT}\``
          : `\`${DEFAULT_HOST}\` のポート \`${DEFAULT_PORT}\``,
      );
      expect(text).toContain("```text\n" + REQUIRED_TEMPLATE_TOKENS.join(" ") + "\n```");
    }
  });

  it("gives the address examples the code produces", () => {
    // The rules are prose and kept by review; the examples are checked, so a change to either
    // function that the prose does not allow fails here.
    expect(toRoute("index.md")).toBe("/");
    expect(toRoute("guide/index.md")).toBe("/guide");
    expect(toRoute("Setup/API_Reference.md")).toBe("/Setup/API_Reference");
    expect(toPageId("/Setup/API_Reference")).toBe("setup-apireference");
    expect(toPageId("/foo--bar")).toBe("foo-bar");
    expect(toPageId("/")).toBe("index");
    for (const page of Object.values(PAGES)) {
      const text = section(page, "also");
      for (const example of [
        "`guide/index.md`",
        "`/guide`",
        "`/Setup/API_Reference`",
        "`setup-apireference`",
        "`/foo--bar`",
        "`foo-bar`",
      ]) {
        expect(text).toContain(example);
      }
    }
  });

  it("gives the values two defaults stand for as the code has them", () => {
    for (const page of Object.values(PAGES)) {
      const text = section(page, "values");
      expect(text).toContain(
        DEFAULT_EXCLUDE.map((p) => `\`${p}\``).join(page === PAGES.en ? ", " : "、"),
      );
      const presets = Object.fromEntries(
        rows(text).map(([name, ...values]) => [name!.replace(/`/g, ""), values]),
      );
      expect(presets).toEqual(
        Object.fromEntries(
          Object.entries(PDF_DENSITY_PRESETS).map(([name, p]) => [
            name,
            [p.fontSize, p.lineHeight, p.headingSpacing, p.tableCellPadding].map((v) => `\`${v}\``),
          ]),
        ),
      );
    }
  });

  it("gives --lang's default as the code resolves it", () => {
    expect(resolveMessageLang({})).toBe(DEFAULT_MESSAGE_LANG);
    expect(section(PAGES.en, "also")).toContain(
      `\`--lang\` follows \`MONODOCS_LANG\`, then is \`${DEFAULT_MESSAGE_LANG}\``,
    );
    expect(section(PAGES.ja, "also")).toContain(
      `\`--lang\` は \`MONODOCS_LANG\` に従い、無ければ \`${DEFAULT_MESSAGE_LANG}\``,
    );
  });
});

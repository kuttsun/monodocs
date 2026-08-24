import { describe, expect, it } from "vitest";
import { DIAGNOSTICS_SCHEMA_VERSION, type Diagnostic, type ValidateResult } from "@monodocs/core";
import { renderReport, resolveReportFormat } from "./report";

function result(diagnostics: Diagnostic[], pages = 3): ValidateResult {
  return {
    diagnostics,
    errors: diagnostics.filter((d) => d.severity === "error"),
    warnings: diagnostics.filter((d) => d.severity === "warning"),
    pages,
  };
}

const LINK: Diagnostic = {
  code: "link/unresolved",
  severity: "warning",
  message: 'Unresolved link "nope.md" in "index.md:3".',
  path: "index.md",
  line: 3,
};

const INPUT: Diagnostic = {
  code: "input/not-found",
  severity: "error",
  message: "Input not found: ./docs",
};

describe("validate --format", () => {
  it("defaults to the output every earlier release printed", () => {
    expect(resolveReportFormat(undefined)).toBe("human");
    expect(resolveReportFormat("human")).toBe("human");
    expect(resolveReportFormat("json")).toBe("json");
  });

  it("refuses a format it does not have, naming the ones it does", () => {
    // Falling back silently would print prose to a job that asked for JSON and is parsing stdout.
    expect(() => resolveReportFormat("yaml")).toThrow(/"yaml"/);
    expect(() => resolveReportFormat("yaml")).toThrow(/human \| json/);
    expect(() => resolveReportFormat("JSON")).toThrow();
  });
});

describe("the human report", () => {
  it("is unchanged: errors, then warnings, then the summary", () => {
    const { lines, failed } = renderReport(result([INPUT, LINK]), "human");
    expect(lines).toEqual([
      { channel: "err", text: "error: Input not found: ./docs" },
      { channel: "warn", text: 'warning: Unresolved link "nope.md" in "index.md:3".' },
      { channel: "err", text: "✗ 1 error(s), 1 warning(s) in 3 page(s)." },
    ]);
    expect(failed).toBe(true);
  });

  it("says so on stdout when nothing was found", () => {
    const { lines, failed } = renderReport(result([]), "human");
    expect(lines).toEqual([{ channel: "out", text: "✓ No issues found (3 page(s))." }]);
    expect(failed).toBe(false);
  });

  it("fails on a warning alone, which is why there is no --strict", () => {
    expect(renderReport(result([LINK]), "human").failed).toBe(true);
  });
});

describe("the JSON report", () => {
  it("is one object carrying a schema version and the diagnostics", () => {
    const { lines, failed } = renderReport(result([INPUT, LINK]), "json");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.channel).toBe("out");
    expect(JSON.parse(lines[0]!.text)).toEqual({
      schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
      diagnostics: [
        { code: "input/not-found", severity: "error", message: "Input not found: ./docs" },
        {
          code: "link/unresolved",
          severity: "warning",
          message: 'Unresolved link "nope.md" in "index.md:3".',
          path: "index.md",
          line: 3,
        },
      ],
    });
    expect(failed).toBe(true);
  });

  it("is alone on stdout, so a job never has to skip prose", () => {
    // Not even the summary, and not even when there is nothing to report: a stream that is
    // sometimes JSON and sometimes JSON-plus-a-sentence is not a format.
    for (const diagnostics of [[], [LINK], [INPUT]]) {
      const { lines } = renderReport(result(diagnostics), "json");
      expect(lines.every((line) => line.channel === "out")).toBe(true);
      expect(lines).toHaveLength(1);
      expect(() => JSON.parse(lines[0]!.text)).not.toThrow();
    }
  });

  it("says nothing found as an empty array rather than as an absence", () => {
    const report = JSON.parse(renderReport(result([]), "json").lines[0]!.text);
    expect(report.diagnostics).toEqual([]);
    expect(renderReport(result([]), "json").failed).toBe(false);
  });

  it("pins the schema version rather than the monodocs version", () => {
    // 12.4: this is the number a consumer pins, and it moves only when the shape does.
    expect(DIAGNOSTICS_SCHEMA_VERSION).toBe(1);
  });
});

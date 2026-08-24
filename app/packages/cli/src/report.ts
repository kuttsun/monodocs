import {
  MonodocsError,
  t,
  toDiagnosticsReport,
  type Diagnostic,
  type ValidateResult,
} from "@monodocs/core";

/**
 * What `validate` prints, decided apart from how it is printed.
 *
 * `human` is the output every earlier release produced, and it stays exactly that: the point of
 * adding a machine-readable form is that a CI job stops parsing prose, not that the prose changes.
 * Keeping the decision here rather than inline in the command lets a test assert both — that the
 * sentences and their streams did not move, and that the JSON is alone on stdout.
 */

/** What `--format` accepts. */
export const REPORT_FORMATS = ["human", "json"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export function resolveReportFormat(value: string | undefined): ReportFormat {
  if (value === undefined) return "human";
  if ((REPORT_FORMATS as readonly string[]).includes(value)) return value as ReportFormat;
  // Falling back silently would print prose to a job that asked for JSON and is parsing stdout.
  throw new MonodocsError(
    "config/invalid",
    t("cli.invalidReportFormat", { value, supported: REPORT_FORMATS.join(" | ") }),
  );
}

/**
 * One line and the stream it belongs on. `warn` is stderr as `console.warn` has always put it;
 * it is named apart from `err` so that a test can tell a warning from an error without matching
 * on the prefix in the sentence.
 */
export type ReportLine = { channel: "out" | "warn" | "err"; text: string };

export type Report = {
  lines: ReportLine[];
  /** Whether the command exits non-zero. A warning is enough, which is why there is no `--strict`. */
  failed: boolean;
};

export function renderReport(result: ValidateResult, format: ReportFormat): Report {
  const failed = result.diagnostics.length > 0;

  // JSON goes to stdout on its own: a job parsing the stream must not have to skip prose, so
  // nothing else is printed, not even the summary.
  if (format === "json") {
    const report = toDiagnosticsReport(result.diagnostics);
    return { lines: [{ channel: "out", text: JSON.stringify(report, null, 2) }], failed };
  }

  const lines: ReportLine[] = [
    ...result.errors.map((d: Diagnostic) => ({
      channel: "err" as const,
      text: t("cli.errorPrefix", { message: d.message }),
    })),
    ...result.warnings.map((d: Diagnostic) => ({
      channel: "warn" as const,
      text: t("cli.warningPrefix", { message: d.message }),
    })),
  ];

  if (!failed) {
    lines.push({ channel: "out", text: t("cli.noIssues", { pages: result.pages }) });
    return { lines, failed };
  }

  lines.push({
    channel: "err",
    text: t("cli.issues", {
      errors: result.errors.length,
      warnings: result.warnings.length,
      pages: result.pages,
    }),
  });
  return { lines, failed };
}

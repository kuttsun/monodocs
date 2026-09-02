/**
 * Diagnostics: what monodocs found, in a form something other than a person can read.
 *
 * Errors and warnings used to be strings, which worked while the only consumer was a person
 * reading a terminal. A report a CI job can act on cannot be built on them: serialising a
 * translated sentence produces a format whose fields change with the language and whose contents
 * change with any rewording, and that is the opposite of what a consumer pins (roadmap.md 12.4).
 *
 * The `code` is the promise and the `message` is the courtesy. A code is added when a check is
 * added and is not renamed afterwards, so a job that ignores `image/large` keeps ignoring exactly
 * that. The translated sentence stays in the report because the report is also read by people.
 *
 * The message catalogue and this code set are separate identities: a message key selects wording,
 * a code identifies a finding. Two messages may share a code — `font/unchecked` covers both ways
 * the font check declines to answer — and a message may have no code at all, since not everything
 * monodocs prints is a diagnostic.
 */

/**
 * Every code monodocs can report. Stable: a code is never renamed or given a different meaning,
 * and a new check brings a new code (roadmap.md 27.3).
 */
export const DIAGNOSTIC_CODES = [
  "browser/setup",
  "config/deprecated-key",
  "config/input-outside-root",
  "config/invalid",
  "config/not-found",
  "font/missing",
  "font/unchecked",
  "heading/level-skipped",
  "image/embedded-for-pdf",
  "image/large",
  "image/no-alt",
  "image/not-found",
  "image/outside-input",
  "image/too-large",
  "image/unsupported",
  "init/exists",
  "input/no-sources",
  "input/not-found",
  "input/unsupported-file",
  "internal/unexpected",
  "lang/no-label-table",
  "lang/unsupported",
  "link/unresolved",
  "link/unresolved-anchor",
  "mermaid/prerenderer-missing",
  "mermaid/render-failed",
  "page/alias-shadowed",
  "page/duplicate-alias",
  "page/duplicate-id",
  "page/duplicate-route",
  "page/no-renderer",
  "page/no-title",
  "pdf/margin-too-small",
  "sidebar/group-empty",
  "sidebar/item-duplicate",
  "sidebar/item-hidden",
  "sidebar/item-not-found",
  "sidebar/page-unlisted",
  "theme/invalid",
  "theme/not-found",
  "theme/unknown",
] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

export type DiagnosticSeverity = "error" | "warning";

/** Where a finding is, as far as the pipeline knows it. Every field is optional. */
export type DiagnosticSource = {
  /** Source file, relative to the input directory. */
  path?: string;
  /** 1-based line in that file. */
  line?: number;
  /** 1-based column in that file. */
  column?: number;
};

export type Diagnostic = DiagnosticSource & {
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  /** The translated sentence, for a person. Not stable; the code is. */
  message: string;
};

/** Drop the fields nothing knows, so that a serialised diagnostic has no empty keys in it. */
function withSource(diagnostic: Diagnostic, source: DiagnosticSource): Diagnostic {
  if (source.path !== undefined) diagnostic.path = source.path;
  if (source.line !== undefined) diagnostic.line = source.line;
  if (source.column !== undefined) diagnostic.column = source.column;
  return diagnostic;
}

/** A finding that does not stop the build. */
export function warn(
  code: DiagnosticCode,
  message: string,
  source: DiagnosticSource = {},
): Diagnostic {
  return withSource({ code, severity: "warning", message }, source);
}

/** A finding that does. Thrown as {@link MonodocsError}; this builds the reported form. */
export function fail(
  code: DiagnosticCode,
  message: string,
  source: DiagnosticSource = {},
): Diagnostic {
  return withSource({ code, severity: "error", message }, source);
}

/**
 * An error monodocs itself raised, carrying the code the report needs.
 *
 * Everything monodocs throws at a user is one of these, so that a caught error can be reported as
 * a diagnostic rather than as a sentence with no identity.
 */
export class MonodocsError extends Error {
  readonly code: DiagnosticCode;
  readonly source: DiagnosticSource;

  constructor(code: DiagnosticCode, message: string, source: DiagnosticSource = {}) {
    super(message);
    this.name = "MonodocsError";
    this.code = code;
    this.source = source;
  }
}

/**
 * Report a caught error as a diagnostic.
 *
 * An error that is not monodocs' own — a Puppeteer stack, a dependency's failure — reaches this
 * boundary too, and gets `internal/unexpected` rather than no code at all: a consumer filtering on
 * codes must not be able to lose a finding by it having none.
 */
export function toDiagnostic(error: unknown): Diagnostic {
  if (error instanceof MonodocsError) return fail(error.code, error.message, error.source);
  const message = error instanceof Error ? error.message : String(error);
  return fail("internal/unexpected", message);
}

/**
 * The schema version of the machine-readable report.
 *
 * This is what a consumer pins — not the monodocs version. The two move for different reasons: a
 * release adds checks and codes without changing the shape a job parses, and this number moves only
 * when that shape does (roadmap.md 12.4, 25.5). Adding a code, or a field nothing required before,
 * is not a change of shape.
 */
export const DIAGNOSTICS_SCHEMA_VERSION = 1;

/** What `monodocs validate --format json` prints. */
export type DiagnosticsReport = {
  schemaVersion: number;
  diagnostics: Diagnostic[];
};

export function toDiagnosticsReport(diagnostics: readonly Diagnostic[]): DiagnosticsReport {
  return { schemaVersion: DIAGNOSTICS_SCHEMA_VERSION, diagnostics: [...diagnostics] };
}

/** The messages of a set of diagnostics, in order. For a caller that only prints them. */
export function messagesOf(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => diagnostic.message);
}

/** The diagnostics of one severity, in order. */
export function bySeverity(
  diagnostics: readonly Diagnostic[],
  severity: DiagnosticSeverity,
): Diagnostic[] {
  return diagnostics.filter((diagnostic) => diagnostic.severity === severity);
}

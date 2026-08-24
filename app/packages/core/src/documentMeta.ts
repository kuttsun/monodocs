import type { Labels } from "./labels.js";

/**
 * What a document says about itself (roadmap.md 13.5).
 *
 * A specification handed to someone carries a version and a date, and often the people responsible
 * for it. A reader holding `docs.html` six months later otherwise has no way to tell what it is a
 * version of, or when it was true.
 *
 * Every field is a string monodocs does not interpret: `date` is not parsed into a calendar and
 * `version` is not compared to anything. The one thing done to the text is trimming the space around
 * it, so a value that is only whitespace counts as unset rather than as an empty line in the footer. **The build stamps no date of its own.** Filling this in
 * with the moment the build ran is the obvious version of the feature and exactly what must not
 * happen: it would make the same input produce different bytes on every run, so a committed
 * `docs.html` would show a diff whenever anyone rebuilt it (12.4). A date in the output is a date
 * the author wrote.
 */
export type DocumentMetadata = {
  version?: string;
  date?: string;
  authors?: string[];
};

/** Between the parts of the footer line. Not a comma: the parts are not a list of one kind. */
const SEPARATOR = " · ";

function trimmed(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text === undefined || text === "" ? undefined : text;
}

function authorList(metadata: DocumentMetadata): string[] {
  return (metadata.authors ?? []).map((a) => a.trim()).filter((a) => a !== "");
}

/**
 * The version with the word in front of it — "Version 1.2".
 *
 * The word comes from the document's label table, so it follows `lang` and can be replaced through
 * `html.labels` like every other piece of chrome (23.4). A bare "1.2" in a footer says nothing.
 */
function versionPhrase(version: string, labels: Labels): string {
  return `${labels.version} ${version}`;
}

/**
 * The line the branding footer carries, in HTML and in the PDF alike. Empty when the document says
 * nothing about itself, which is when the footer keeps only what it had before.
 */
export function documentFooterLine(metadata: DocumentMetadata, labels: Labels): string {
  const version = trimmed(metadata.version);
  const parts = [
    version === undefined ? undefined : versionPhrase(version, labels),
    trimmed(metadata.date),
    ...authorList(metadata),
  ].filter((part): part is string => part !== undefined);
  return parts.join(SEPARATOR);
}

/**
 * The PDF's Subject: what this document is a version of, and when. The authors are not repeated
 * here — they are the Author field, which is where a viewer and a file manager look for them.
 */
export function documentSubject(metadata: DocumentMetadata, labels: Labels): string {
  const version = trimmed(metadata.version);
  const date = trimmed(metadata.date);
  if (version === undefined) return date ?? "";
  const phrase = versionPhrase(version, labels);
  return date === undefined ? phrase : `${phrase} (${date})`;
}

/** The PDF's Author. Several authors are one field, as PDF has only the one. */
export function documentAuthor(metadata: DocumentMetadata): string {
  return authorList(metadata).join(", ");
}

/**
 * The PDF's Keywords: the version and the date as the author wrote them, without the label in
 * front. A search over a folder of PDFs matches "1.2", not "Version 1.2".
 */
export function documentKeywords(metadata: DocumentMetadata): string[] {
  return [trimmed(metadata.version), trimmed(metadata.date)].filter(
    (value): value is string => value !== undefined,
  );
}

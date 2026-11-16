/**
 * Text split into the tokens a changed block is compared in (roadmap 7.3.6).
 *
 * A token is one Han character (with 々, 〆, ヵ, ヶ), one hiragana, or one katakana (with ー and its
 * halfwidth form ｰ); a run of letters, marks, digits, and `_` in any other script; a run of
 * whitespace; or any other character — where a character is a grapheme cluster, never split. Japanese is compared
 * character by character, since a word boundary there needs a dictionary that the single CJS bundle
 * and the standalone binary would both have to carry; English word by word, since characters there
 * split words where they share letters. Which class a cluster has is read from its first code point
 * that is not Prepend, in tables generated from one Unicode version, so the tokens do not follow
 * the Node that runs the build.
 */
import { gcbOf, graphemeClusters, inRanges } from "./graphemes.js";
import { CJK_RANGES, SPACE_RANGES, WORD_RANGES } from "./unicodeTables.js";

export type TokenKind = "cjk" | "word" | "space" | "other";

export type Token = { text: string; kind: TokenKind };

/**
 * The class of a grapheme cluster, by its first code point that is not Prepend: a Prepend
 * character, such as ARABIC NUMBER SIGN, joins the cluster of what follows it, which is what it
 * stands in front of, so `؀1234` is one number rather than `؀1` and `234`.
 */
export function clusterKind(cluster: string): TokenKind {
  let cp = cluster.codePointAt(0)!;
  for (const ch of cluster) {
    cp = ch.codePointAt(0)!;
    if (gcbOf(cp) !== "Prepend") break;
  }
  if (inRanges(CJK_RANGES, cp)) return "cjk";
  if (cp === 0x5f || inRanges(WORD_RANGES, cp)) return "word";
  if (inRanges(SPACE_RANGES, cp)) return "space";
  return "other";
}

/** Splits `text` into tokens: runs of word and space clusters are one token, any other one each. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const cluster of graphemeClusters(text)) {
    const kind = clusterKind(cluster);
    const last = tokens[tokens.length - 1];
    if (last && last.kind === kind && (kind === "word" || kind === "space")) last.text += cluster;
    else tokens.push({ text: cluster, kind });
  }
  return tokens;
}

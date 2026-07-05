import {
  PDFDocument,
  PDFName,
  PDFArray,
  PDFDict,
  PDFNumber,
  PDFHexString,
  type PDFObject,
  type PDFRef,
} from "pdf-lib";
import type { SidebarNode } from "../types.js";

/**
 * PDF のしおり（アウトライン）1 ノード。HTML サイドバーと同じ フォルダ→ページ 構造を PDF に
 * 付与するために使う。`dest` は生成 PDF 内の名前付き宛先キー（{@link addOutline} が読む
 * catalog `/Dests` のキー）。フォルダノードは `dest` を持たず、最初の子孫ページの宛先に飛ぶ。
 */
export type PdfOutlineNode = { title: string; dest?: string; children: PdfOutlineNode[] };

/**
 * サイドバーツリーを PDF アウトライン用ツリーへ変換する。
 * ページの `dest` は本文 `<article>` の要素 id（`page-{page.id}`）。
 */
export function sidebarToOutline(nodes: SidebarNode[]): PdfOutlineNode[] {
  return nodes.map((n) =>
    n.type === "dir"
      ? { title: n.title, children: sidebarToOutline(n.children) }
      : { title: n.title, dest: `page-${n.pageId}`, children: [] },
  );
}

/** ツリー内の全ページ `dest` を出現順（重複なし）に集める。 */
export function collectDests(nodes: PdfOutlineNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    if (n.dest && !out.includes(n.dest)) out.push(n.dest);
    collectDests(n.children, out);
  }
  return out;
}

/** 各 `dest` を `map` の値（ASCII サロゲート名）へ置換した新しいツリーを返す。 */
export function remapDests(nodes: PdfOutlineNode[], map: Map<string, string>): PdfOutlineNode[] {
  return nodes.map((n) => ({
    title: n.title,
    dest: n.dest ? map.get(n.dest) : undefined,
    children: remapDests(n.children, map),
  }));
}

/** ノードが自身または子孫で最初に持つ `dest`（フォルダは最初の子孫ページへ飛ばす）。 */
function firstDest(node: PdfOutlineNode): string | undefined {
  if (node.dest) return node.dest;
  for (const c of node.children) {
    const d = firstDest(c);
    if (d) return d;
  }
  return undefined;
}

/** 木の総ノード数（`/Count` 用。全展開＝正の値）。 */
function countNodes(nodes: PdfOutlineNode[]): number {
  let n = 0;
  for (const x of nodes) n += 1 + countNodes(x.children);
  return n;
}

/**
 * `page.pdf()` が出力した PDF に、`outline` の フォルダ→ページ 構造を `/Outlines`（しおり）
 * として付与した新しいバイト列を返す。宛先は Chromium が内部リンクから作る catalog `/Dests`
 * を直接参照する。`/Dests` が無い・空ツリー等でしおりを作れない場合は元のバイト列を返す。
 */
export async function addOutline(
  pdfBytes: Uint8Array,
  outline: PdfOutlineNode[],
): Promise<Uint8Array> {
  if (outline.length === 0) return pdfBytes;

  const doc = await PDFDocument.load(pdfBytes);
  const ctx = doc.context;

  const destsObj = doc.catalog.lookup(PDFName.of("Dests"));
  if (!(destsObj instanceof PDFDict)) return pdfBytes;
  const dests = destsObj;

  /** 宛先名から destination 配列（`[pageRef /XYZ x y z]`）を引く。 */
  function destArray(name: string | undefined): PDFArray | undefined {
    if (!name) return undefined;
    const v = dests.lookup(PDFName.of(name));
    if (v instanceof PDFArray) return v;
    // 一部の PDF は `<< /D [...] >>` 形式で持つ。
    if (v instanceof PDFDict) {
      const d = v.lookup(PDFName.of("D"));
      if (d instanceof PDFArray) return d;
    }
    return undefined;
  }

  const outlinesRef = ctx.nextRef();

  function build(nodes: PdfOutlineNode[], parentRef: PDFRef) {
    const refs = nodes.map(() => ctx.nextRef());
    nodes.forEach((node, i) => {
      const map = new Map<PDFName, PDFObject>();
      map.set(PDFName.of("Title"), PDFHexString.fromText(node.title));
      map.set(PDFName.of("Parent"), parentRef);
      const prev = refs[i - 1];
      const next = refs[i + 1];
      if (prev) map.set(PDFName.of("Prev"), prev);
      if (next) map.set(PDFName.of("Next"), next);
      const dest = destArray(firstDest(node));
      if (dest) map.set(PDFName.of("Dest"), dest);
      if (node.children.length > 0) {
        const child = build(node.children, refs[i]!);
        map.set(PDFName.of("First"), child.first);
        map.set(PDFName.of("Last"), child.last);
        // 既定で展開（正の Count）。
        map.set(PDFName.of("Count"), PDFNumber.of(countNodes(node.children)));
      }
      ctx.assign(refs[i]!, PDFDict.fromMapWithContext(map, ctx));
    });
    return { first: refs[0]!, last: refs[refs.length - 1]! };
  }

  const top = build(outline, outlinesRef);
  const root = new Map<PDFName, PDFObject>();
  root.set(PDFName.of("Type"), PDFName.of("Outlines"));
  root.set(PDFName.of("First"), top.first);
  root.set(PDFName.of("Last"), top.last);
  root.set(PDFName.of("Count"), PDFNumber.of(countNodes(outline)));
  ctx.assign(outlinesRef, PDFDict.fromMapWithContext(root, ctx));

  doc.catalog.set(PDFName.of("Outlines"), outlinesRef);
  // ビューアでしおりパネルを既定表示にする。
  doc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));

  return doc.save();
}

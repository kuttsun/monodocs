import { PDFDocument } from "pdf-lib";

/** PDF の文書情報。 */
export type PdfMetadata = {
  /** 文書タイトル（設定の `title`）。ビューアのタイトルバーや PDF 一覧に出る。 */
  title?: string;
  /** 生成ツール名（例: `monodocs v0.6.0`）。 */
  generator?: string;
};

/**
 * 生成した PDF に文書情報を設定する。
 *
 * 既定のままだと Creator はヘッドレス Chromium の UA 文字列、Producer は後処理に使う
 * pdf-lib の名前になり、配布物として何で作られたのか分からない。タイトルも入らないため
 * ビューアではファイル名だけが手掛かりになる。
 */
export async function setPdfMetadata(
  pdfBytes: Uint8Array,
  metadata: PdfMetadata,
): Promise<Uint8Array> {
  const title = metadata.title?.trim();
  const generator = metadata.generator?.trim();
  if (!title && !generator) return pdfBytes;

  // updateMetadata の既定 (true) では、保存時に pdf-lib が Producer と更新日時を
  // 自前の値で上書きしてしまうため無効にする。
  const doc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  // showInWindowTitleBar は ViewerPreferences の DisplayDocTitle を立てる。これが無いと
  // 標準に従うビューアはタイトルではなくファイル名を表示し続ける。
  if (title) doc.setTitle(title, { showInWindowTitleBar: true });
  if (generator) {
    // Creator = 元データを作ったアプリ、Producer = PDF へ変換したもの。どちらも
    // monodocs を通しているので同じ値にする（Chromium / pdf-lib の既定値を上書き）。
    doc.setCreator(generator);
    doc.setProducer(generator);
  }
  return doc.save();
}

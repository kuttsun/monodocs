# テスト

[English](../testing.md)

## 方針

- テストランナーは [vitest](https://vitest.dev/) を使用する。
- 種類:
  - **ユニットテスト**: route 生成 / format 判定 / 各 SourceRenderer / サイドバー生成 など
  - **e2e テスト**: 一時ディレクトリに Markdown / AsciiDoc を生成し、`buildSite()` で
    単一 HTML を出力して内容を検証する
  - **クライアントテスト**: happy-dom 上でテーマの `app.js` を実行し、hash route による
    ページ切り替え（encode/decode 整合）を検証する
- 検証はすべて Docker / devcontainer 内で実行し、ホスト環境を汚さない。

## 実行方法

専用イメージ（[development.md](development.md) 参照）でホストから実行する。

```bash
scripts/app.sh pnpm test         # 一括実行（vitest run）
scripts/app.sh pnpm test:watch   # ウォッチ
scripts/app.sh pnpm ci:check     # format、build、typecheck、test、CLI bundle
scripts/app.sh pnpm package:verify # npm package artifact の build・install・smoke test
```

`docker run` を直接使う場合:

```bash
docker run --rm -v "$PWD":/work -w /work/app monodocs-dev pnpm test
```

devcontainer 内、またはコンテナのシェルに入っている場合は `app/` で `pnpm test` を直接実行できる。

## テスト結果（2026-07-28 時点）

| 項目           | 結果       |
| -------------- | ---------- |
| Test Files     | 31 passed  |
| Tests          | 287 passed |
| typecheck      | 通過       |
| format:check   | 通過       |
| package:verify | 通過       |

主なテスト対象:

- `route.test.ts` … route / page id 生成
- `sources/detectFormat.test.ts` … 拡張子からの形式判定
- `sources/meta.test.ts` … frontmatter / `:sd-*:` メタデータの正規化
- `sources/markdown/renderer.test.ts` … Markdown 変換・H1 / frontmatter 抽出・見出し/脚注の ID prefix・GFM
- `sources/asciidoc/renderer.test.ts` … AsciiDoc 変換・タイトル / `:sd-*:` 抽出・xref 書き換え
- `sources/prefixIds.ts` … 全要素 ID の prefix・アンカー書き換え（Markdown/AsciiDoc 共通。各 renderer テストで間接検証）
- `scan.test.ts` … 拡張子マップによる走査・カスタム拡張子・除外
- `pipeline/buildPages.test.ts` … route / page id の重複検知
- `pipeline/buildSidebar.test.ts` … フォルダ構造サイドバー
- `pipeline/buildSidebar.custom.test.ts` … カスタムサイドバー（`sidebar.items` の構造・順序・タイトル、`./`・バックスラッシュ区切りのパス、存在しないパスのエラー、未掲載・`hidden`・重複の警告、ページが消えたグループ、`orderPagesBySidebar` による閲覧順）
- `pipeline/postprocess.test.ts` … リンク変換（ファイル跨ぎアンカーを含む: リンク先ページの prefix 済み要素 ID への解決・percent encode されたアンカー・別ページに属する ID の誤ヒット防止・存在しないアンカーの警告付きページ先頭フォールバック）・画像 data URI 埋め込み・Mermaid 変換（client / pre-render の SVG 化・グローバル一意 id・複雑 SVG の verbatim 保持・図単位エラーのソースフォールバック・環境エラー `BrowserSetupError`（`MermaidPrerenderSetupError` を含む）の fail fast・renderer 未注入エラー）・shiki コードハイライト・admonition / GFM alert の共通構造化
- `pipeline/renderSingleHtml.test.ts` … href エンコード・HTML エスケープ・任意表示の本文幅切替と初期状態・画像 lightbox マークアップの有無・ブランディングフッターとバージョンのエスケープ・クライアント用ページデータ（目次/検索用の h2 以降の全見出しと `tocMaxLevel`）、本文やテーマ内の `{{...}}` を書き換えない 1 回走査のトークン置換
- `themes/index.test.ts` … テーマ読み込み（組み込みテーマ名、未知の名前を組み込み一覧付きで拒否、カスタムディレクトリ、ファイル単位の既定テーマフォールバック、テーマファイルが 1 つも無いディレクトリ、必須トークンが欠けたテンプレート）
- `themes/default/app.test.ts` … クライアント hash routing（happy-dom）
- `themes/default/app.search.test.ts` … v0.8 の検索（複数キーワードの AND・フィールド別の順位付け・見出しへリンクし、クリック時に hash へアンカーを残す見出し単位の結果・タイトル/見出し/抜粋の強調・`toc.maxLevel` より深い見出しは目次に出ないが検索できること・大文字小文字と全角の畳み込み・全角空白区切りのキーワード）と v0.9 の畳み込み（カタカナ／ひらがなの双方向一致・長音記号とダッシュの書き分けを同一視すること・ハイライトが元の表記のまま出ること・半角カタカナは記録済みの境界として一致しないこと）と v0.9 のキーボード操作（combobox / listbox の role と `aria-expanded`・端で回り込む上下キーとフォーカスが検索欄に残ること・`aria-activedescendant` による選択位置の伝達・クエリ変更で選択が解除されること・`Enter` で選択中の結果と未選択時の先頭を開くこと・結果が無いときは `Enter` の既定動作を妨げないこと・IME 変換中はキーを横取りしないこと（`keyCode` 229 の保険を含む）・option の ID が文書側の ID と重ならないこと）と v0.9 の本文ハイライト（結果を開くまでは強調しないこと・開いたページだけで全出現を強調すること・結果一覧と同じ畳み込みで強調すること・検索を開いている間はページを移っても強調が続くこと・Mermaid のソースやテーマが差し込んだ UI 文言、本文自身の `<mark>` に触れないこと・同じ class を持つ本文を壊さず、その中の一致はその場で入れ子に強調すること・強調数の上限（多数のノードに分かれる場合と 1 つの巨大なノードの場合）・クエリ変更と `Escape` で本文が同じ構造・同じノード数に戻ること）（happy-dom）
- `themes/default/app.mobile.test.ts` … 狭い画面のサイドバードロワー（トグルで開く、リンク追従後に閉じる、Escape と外側クリックで閉じる、広い画面では常設のまま）（happy-dom）
- `themes/default/app.v04.test.ts` … 検索・ページ内目次・前後ナビ・ダークモード・保存される本文幅トグルと設定由来の初期状態・サイドバー折りたたみ・コードブロックのコピー/折り返しトグル・画像 lightbox のマウス/キーボード/フォーカス操作とリンク付き/装飾画像の除外（happy-dom）
- `messages.test.ts` … メッセージカタログ（既定は英語、フラグが `MONODOCS_LANG` に優先、未対応の値は対応する値を挙げて拒否、同梱 2 言語がキー集合を漏れなく満たし同じプレースホルダを持つ、値の無いプレースホルダは空にせず残す）。あわせて両パッケージのソースを走査し、出力する呼び出しに `t(...)` ではなく文字列リテラルが渡されていれば落とす。カタログが静かに穴を開けないための仕掛け。走査は行単位ではなくファイル全体に掛けるので引数を次行に書いた呼び出しも見え、`Error` の派生を名前の列挙ではなくパターンで拾うので新しい派生も逃さず、Commander の `.option` / `.argument` / `.helpOption` / `.helpCommand` / `.addHelpText` は第 1 引数がリテラルで正しいため説明文の位置を見る。何も見ずに通らないよう対象ファイルがあることを先に確かめ、この 3 つの形それぞれについて、リテラルを差し込むと落ちることを確認している
- `labels.test.ts` … UI ラベルのカタログ（BCP 47 タグの受理と拒否、同梱 2 表がキー集合を漏れなく満たすこと、主言語サブタグでの大文字小文字を無視した照合、表の無いタグと照合先の無いタグはタグ名を挙げて警告しつつ英語へ落ちること、どちらの表の上にも上書きが載ること）
- `build.lang.test.ts` … 文書の言語とラベルの end-to-end（既定は英語、`lang: ja` で `<html lang="ja">` とテンプレート・`siteDataJson` 双方の日本語、表の無いタグは属性には書かれラベルだけ落ちて 1 度警告すること、`html.labels` による差し替えと未同梱言語の供給、未知のラベルキーと不正な `lang` の拒否、マークアップや引用符を含むラベルが行き先ごとにエスケープされること、テーマ保証のうち要点となる 2 段階＝カスタム `template.html` が自分の静的テキストと `<html lang>` を保ちつつトークンは解決されること、カスタム `app.js` でもラベルがデータとして届くこと）
- `build.pdfdensity.test.ts` … `pdf.density`（プリセット名の解決、`base` を土台に名指しした値だけを差し替えるオブジェクト形式、数値でも文字列でも受ける lineHeight、「数値と単位」でない値の拒否 — `calc(...)`・後続の宣言・未知のプリセット名・未知のキーを含む）。生成されたスタイルシートについては「書かれていないこと」を確認する。`relaxed` は印刷用ブロックを 1 つも足さず（文字列を名指しするのではなく、テーマ自身のブロック数と比べて確かめる）、既定は文字サイズを変えないので文字サイズの規則を書かず、1 つの値だけを指定したオブジェクトは他の値を固定しない。すべての規則がそこからの差分として書かれる画面のベースラインは宣言 3 つの手写しなので、テーマ自身のスタイルシートから読み戻して突き合わせる。スタイルシートは文字列照合ではなく CSSOM で解析する。それが、この比較を書いてあるとおりの意味にする。`@media` の中の規則は対象外なので、テーマの印刷ブロックにしか無い値が「画面の値」を満たすことはなく、コメントや重複した宣言もブラウザと同じに読まれる。同じ検査で、ルートに届く規則（`html` / `:root` / `body` のいずれか、およびその組み合わせ）が font-size を設定していないことも確認する。読者自身の基準文字サイズが残るのはそれによるからで、今テーマが書いているセレクタを列挙するのではなくパターンとして述べる。この機能が存在する理由は枚数なので、実 Chromium があるときは同じ文書を各プリセットでビルドし、pdf-lib で枚数を読み戻して、既定から両方向に 1 段ごとに枚数が確かに減ること（フィクスチャは各段でページ境界を跨ぐ大きさにしてある）、既定が文字サイズを変えずに `relaxed` より枚数を減らすこと、`normal` が無指定とまったく同じ紙に載ることを確認する
- `build.pdfbands.test.ts` … PDF のヘッダ・フッタ帯（既定でフッタにページ番号・ヘッダは空、`false` は省略ではなく空フラグメントを出す、置き換えフラグメントが両方の位置へ届く、空文字列は拒否）。帯が実際に描かれることは、実 Chromium のある環境でのみ確認する。ページ内容ストリームを復号し、`Tf` が選んだフォントの `ToUnicode` でグリフを文字へ戻して読む（演算子を数えるだけでは、差し込みが壊れて区切りだけが描かれても通ってしまう）。本文には数字を入れていないので、ページに現れる数字は帯由来しかありえず、それがそのページの番号と総数に一致することを見る。同じ側で、フッタが帯の中央に来ること、余白の警告が出ること、収まる余白と置き換えフラグメントでは黙ること、文書側のスタイルシートが本来なら押し上げるところで測定値が動かないことも確認する
- `build.fontcheck.test.ts` … フォント検査（報告がクラスタ・コードポイント・例フォント（パッケージ名ではなくフォント名）を挙げること、pre-render の所見が専用の文言になること、挙げなかった分を黙って捨てず件数で示すこと、`warn` は警告し `error` は投げること、`off` では計測すら行わないこと、基準が成り立たない場合は `error` でも警告どまりであること（所見ではなく検査が答えを出さないということなので）、測れないときは黙ること、PDF では print をエミュレートし pre-render 側ではしないこと、設定の既定が `warn` で 3 値以外を拒否すること、既定フッタのプローブがフラグメント自身から導出されること）。実際に描けるかは Chromium にしか答えられないため、実 Chromium があるときは、ラテン文字・日本語・絵文字の文書で黙ること（ここで鳴るなら既定が許容するために存在する誤検出そのもの）、開発イメージにフォントが無い文字を含む文書でその文字・コードポイント・例フォントが警告に出ること、`error` では PDF を書かずにビルドが失敗すること、`off` では黙って書き出すこと、サイドバーとページ内目次にしか無い文字は紙に載らないので報告されないこと、同じ文字を含む Mermaid 図がそれを描いた文脈で捕まることを確認する
- `themes/default/app.labels.test.ts` … core が公開したラベルをクライアントが適用すること（前後ナビ、検索の該当なし、コードブロックと画像の操作、結果一覧のいずれもが `siteDataJson` から文言を取る）。渡す値は英語の表とわざと重ねていない。英語の既定を期待すると、クライアントが自前の写しを持ち続けていても通ってしまい、この設計が消したはずのずれを検証しないため。マークアップを含むラベルは解釈されずエスケープされる（設定ファイル由来の値が `innerHTML` へ入るため）（happy-dom）
- `themes/default/app.shortcut.test.ts` … 検索欄へのショートカット（`/` と `Ctrl+K` / `⌘K` で検索欄へ移り入力済みの語を選択する、入力欄で文字を打っている間はどちらのキーも横取りしない（`⌘K` だけは例外）、IME 変換中はキーを渡す（`keyCode` 229 の保険を含む）、K の他の修飾キー組み合わせと素の `K` は割り当てない、K の物理位置はラテン文字を出さない配列でだけ拾う、AltGr で出した `/` でも効く、折りたたみ・閉じたドロワーでは先にサイドバーを開く、`Enter` で結果を開いたらドロワーを閉じ `Escape` で閉じたときは再表示ボタンへフォーカスを渡す、モーダルが開いている間は背後へフォーカスを送らない）（happy-dom）
- `themes/default/print.test.ts` … 印刷時の表の列幅（ラベルの列が紙幅の半分をはるかに下回り、文章の列より狭いままであること、表が紙幅に収まること）。`table-layout: fixed` は中身に関わらず幅を等分するが、生成された HTML を見てもそれは分からない。列幅はレイアウト計算そのものなので happy-dom は 0 を返す。`emulateMediaType("print")` の下、実 Chromium のある環境でのみ確認する
- `themes/default/layout.test.ts` … サイドバーの到達可能性（目次を末尾までスクロールしても検索欄が定位置に残ること、列が収まらない低い画面では目次を潰さずサイドバー全体のスクロールに戻ること、折りたたみ・閉じたドロワーからでも検索ショートカットで検索欄にフォーカスが入ること）。到達可能性は要素の矩形ではなくヒットテストで判定する（矩形は祖先によるクリップを反映しない）。ショートカットの 2 本は、前提である「不可視の検索欄はフォーカスを受け付けない」ことを先に測る。CSS のレイアウトそのものなので happy-dom では見えず、実 Chromium のある環境でのみ確認する
- `build.test.ts` / `build.mixed.test.ts` / `build.v03.test.ts` … e2e（Markdown / 混在 / v0.3 機能・validate）
- `build.sidebar-custom.test.ts` … e2e（カスタムサイドバーの描画と順序、前後ナビ・初期表示ページに効くページ順、未掲載ページの警告、存在しないパスに対する `validate` のエラー）
- `build.theme.test.ts` … e2e（カスタムテーマ: 設定ファイル基準の `html.theme` 解決、style だけのテーマが既定の template / client を保つこと、template と client を差し替える全面テーマ、壊れた template でビルドが失敗すること、テーマに影響されない `validate`、設定によるテーマ切り替え（一時的に壊れたテーマへの切り替えを含む）に `watch` の監視先が追従すること）
- `build.anchors.test.ts` … e2e（Markdown ↔ AsciiDoc 双方向のファイル跨ぎ見出しアンカー・脚注アンカー・存在しないアンカーの `validate` 警告）
- `build.mermaid-prerender.test.ts` … Mermaid pre-render（偽レンダラ注入で config 連携・SVG 埋め込みを検証。実 Chromium がある環境でだけ end-to-end 描画とランタイム未注入ゲートを確認）
- `build.v04.test.ts` … e2e（`watchSite` の再ビルド・`serveSite` の配信とライブリロード注入・`serveSite` が pdf/both 設定でも HTML を配信し明示 `-o` を尊重すること）
- `build.input-file.test.ts` … e2e（単一の Markdown / AsciiDoc ファイルを入力に渡した場合。そのファイル 1 ページがビルドされること、設定をそれを含むディレクトリから読むこと、相対パスの画像を同じディレクトリ基準で解決して埋め込むこと、名指しした `_` 始まりのファイルが束に入ること（除外パターンは走査の規則であって束ねる規則ではない）、`validate` でも同じ経路を通ること、対応しない拡張子は扱える拡張子を挙げて拒否すること、存在しないパスは従来どおり「見つからない」と報告すること）
- `init.test.ts` … `monodocs init`（書き出す 2 ファイルと、肝心の主張 — 書き出したものが手を入れずにビルドできること。設定ファイルだけを名指して呼び、入力も出力もそのファイルから来るようにして確かめる）。雛形については「書かれていないこと」も見る。全キーのダンプでも「設定を書き出した」という検査は通ってしまうため。あわせて、雛形がメッセージ言語に従うこと（設定する `lang` の値まで含めて。日本語の最初のページが英語を宣言したまま公開されないようにするため）を確認する。「雛形がビルドできる」ことは 2 言語を書き並べるのではなく同梱メッセージ言語すべてに対して主張する。雛形は言語ごとに手で書かれた設定とページであり、引用符の閉じ忘れや無くなったキーが現れるのは次に増える言語だからである。最後に拒否の挙動（どちらか一方でもあれば両方とも書かない、見つかったものを最初の 1 つではなくすべて名指す、既存の `docs/` ディレクトリは上書き対象として扱わない）を確認する
- `build.pdf.test.ts` … PDF 出力（v0.5。`resolveOutputs` の html/pdf/both 出力パス解決・偽 `PdfGenerator` 注入で format 分岐と設定（pageSize/margin/printBackground）連携・embedImages 上書き・しおり outline の受け渡しを browserless 検証。実 Chromium がある環境でだけ実際の PDF 生成＝`%PDF-`・`/Outlines`・`/UseOutlines`・ページ間リンクの内部リンク注釈・ファイル跨ぎ見出しアンカーがページ先頭ではなく見出し位置を指すことを確認）
- `pipeline/pdfMetadata.test.ts` … PDF の文書情報（タイトルと monodocs を Creator/Producer に設定してブラウザ・pdf-lib の既定値を置き換える、ビューア設定の DisplayDocTitle、ページを壊さない、設定が無ければ何もしない。pdf-lib のみ・browserless）
- `pipeline/pdfOutline.test.ts` … PDF しおり（`sidebarToOutline` のツリー変換・`collectDests`/`remapDests`・`addOutline` が `/Dests` を参照して フォルダ→ページ の `/Outlines` を構築し `/UseOutlines` を設定。宛先が無い/空ツリーは元 PDF を返す。pdf-lib のみで browserless）
- `config.test.ts` … 設定解決（本文幅、画像 lightbox、ブランディングの既定値と切替・`pdf` スキーマの既定値・欠落余白の補完・不正 `--format` の拒否・format 別の既定出力パスを含む）。あわせて束から何が外れるか（`sources.exclude` が既定リストを置き換えず追加すること、`sources.excludeDefaults: false` がその既定リストを外すこと、非推奨の `sidebar.exclude` が警告付きで同じく追加として効くこと、両方同時の指定を拒否すること）と、トップレベルを含むどの深さの未知キーも拒否し、エラーが検証ライブラリの issue 配列ではなくキーとそれを含むオブジェクトを名指しすることを確認する

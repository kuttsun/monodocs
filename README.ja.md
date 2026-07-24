# monodocs

[English](README.md)

複数の Markdown / AsciiDoc ファイルから、**単一の HTML または PDF** ドキュメントを生成する CLI ツールです。ドキュメントは複数ファイルに分割して管理しながら、配布時には 1 ファイルにまとめられます。

**単一ファイル配布に特化した軽量ドキュメントジェネレータ**です。

**📖 ドキュメント → [kuttsun.github.io/monodocs](https://kuttsun.github.io/monodocs/ja/)** — はじめに・コマンドオプション・設定リファレンス。[単一ファイルのライブデモ](https://kuttsun.github.io/monodocs/ja/manual.html)もあります。

## 特徴

- **単一の自己完結ファイル** — 複数の Markdown / AsciiDoc（混在可）を 1 つの HTML にまとめ、画像は data URI として埋め込む。
- **ナビゲーション自動生成** — フォルダ構造から折りたたみ可能なサイドバー目次を生成し、ファイル間リンク・AsciiDoc xref を単一 HTML 内のリンクに変換する。
- **ドキュメントサイト UX** — 全文検索・ページ内目次・前後ページナビ・ダークモードを内蔵。
- **リッチなコンテンツ** — Mermaid 図と shiki コードハイライト（ダークモードに追従）に対応。
- **PDF 出力** — しおり・ページ間リンク付きの PDF を Chromium 経由で生成。

対応記法・機能の全体像は [docs/ja/status.md](docs/ja/status.md) を参照してください。

## インストール

`monodocs` は **npm パッケージ**として配布し、Node.js 22 以上で動作します。対応対象は Linux x64 と Windows x64 です。

```bash
npm install -g monodocs
```

PDF 出力と Mermaid pre-render には、システムにインストールされた Chromium / Google Chrome が必要です（`monodocs` は自動ダウンロードしません）。Linux / Windows では標準的な配置場所から自動検出します（Windows では Chromium ベースの Microsoft Edge もフォールバックとして使います）。標準的でない場所や、自動検出の候補がない macOS などでは、`PUPPETEER_EXECUTABLE_PATH` で実行ファイルを明示してください。

| 項目                            | 初期サポート方針                              |
| ------------------------------- | --------------------------------------------- |
| 配布方法                        | npm（`npm install` / `npx`）のみ              |
| Node.js                         | 22 以上                                       |
| HTML / validate / watch / serve | Linux x64、Windows x64                        |
| PDF / pre-render                | システムにインストールされた Chromium が必要  |
| SEA 単体バイナリ                | v0.6 の対象外。npm 安定版の公開後に改めて検討 |

## クイックスタート

入力は Markdown / AsciiDoc を混在でき、フォルダ構造がそのままサイドバーになります。

```bash
monodocs build ./docs -o ./dist/manual.html           # 自己完結した単一 HTML
monodocs build ./docs --format pdf -o ./dist/doc.pdf  # PDF（要 Chromium）
monodocs serve ./docs                                 # 編集しながらライブプレビュー
monodocs validate ./docs                              # リンク切れ・画像欠落を検出
```

全コマンド・オプションと `monodocs.config.yml` の設定リファレンスは[ドキュメントサイト](https://kuttsun.github.io/monodocs/ja/docs/getting-started)を参照してください。

## プロジェクトドキュメント

開発方針・技術スタック・ロードマップ・実装状況・テストは [docs/](docs/) にまとめています。

| ドキュメント                                       | 内容                                           |
| -------------------------------------------------- | ---------------------------------------------- |
| [docs/ja/development.md](docs/ja/development.md)   | 開発方針・開発環境・ディレクトリ構成・設計     |
| [docs/ja/architecture.md](docs/ja/architecture.md) | アーキテクチャ・実装不変条件・セキュリティ境界 |
| [docs/ja/tech-stack.md](docs/ja/tech-stack.md)     | 技術スタックとバージョン方針                   |
| [docs/ja/roadmap.md](docs/ja/roadmap.md)           | 仕様・ロードマップ                             |
| [docs/ja/syntax.md](docs/ja/syntax.md)             | 対応記法と制限（Markdown / AsciiDoc）          |
| [docs/ja/status.md](docs/ja/status.md)             | 実装状況                                       |
| [docs/ja/testing.md](docs/ja/testing.md)           | テスト方針・テスト結果                         |

アプリ本体のソースは [app/](app/) にあります。

コントリビューションの手順は [CONTRIBUTING.ja.md](CONTRIBUTING.ja.md)、脆弱性を非公開で報告する方法は
[SECURITY.ja.md](SECURITY.ja.md) を参照してください。

> **入力は信頼できるものを前提とします** — 信頼できない AsciiDoc は生 HTML を出力し、開いた際にスクリプトが実行され得ます。詳細は[セキュリティ境界](docs/ja/architecture.md#セキュリティ境界)を参照してください。

## ライセンス

[MIT License](LICENSE) © 2026 kuttsun

npm 公開物の `dist/monodocs.cjs` には依存ライブラリをバンドルするため、ビルド時に第三者ライセンスを
まとめた `dist/THIRD-PARTY-NOTICES.txt` を生成し、配布物に添付します（`pnpm bundle` で出力）。
埋め込む依存はすべて寛容ライセンス（MIT / ISC / BSD /
Apache-2.0 等）で、`dompurify` のみ `MPL-2.0 OR Apache-2.0` のうち Apache-2.0 を選択しています。

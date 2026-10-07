# monodocs へのコントリビューション

[English](CONTRIBUTING.md)

Issue、文書改善、バグ修正、機能提案を歓迎します。公式の開発プラットフォームは [GitHub](https://github.com/kuttsun/monodocs) です。

## 始める前に

> [!CAUTION]
> セキュリティ脆弱性は公開 Issue ではなく [SECURITY.ja.md](SECURITY.ja.md) の手順で報告してください。

- 大きな変更は、実装前に Issue で目的と設計を相談してください。
- 小さなバグ修正や文書修正は、直接 Pull Request として提出できます。
- メンテナンスはベストエフォートで、Issue や Pull Request の応答時間は保証されません。
- コントリビューションに特定のエディタ、AI アシスタント、自動レビュー製品は必要ありません。

## リポジトリの言語方針

- 人が読む文書は英語を既定とし、通常のパス（`README.md`、`docs/development.md`）に置きます。
- 各文書に日本語版を置きます。リポジトリやパッケージのルートでは `*.ja.md`、文書ツリーでは `docs/ja/` と `site/ja/` に対応するファイルを置きます。
- 文書フレームワークが言語切替を提供する場合を除き、日英の各文書の冒頭付近に相互リンクを置きます。
- 共通の事実、手順、動作を変更する場合は、同じ変更で両言語版を更新します。
- コードコメントは英語で記述します。
- 技術識別子、コマンド、パス、コードは元の表記を保ちます。
- 個人的な言語やツールの好みを、バージョン管理対象のリポジトリ指示へ追加しないでください。

## 開発環境

開発、ビルド、テストは Docker 内で実行します。

> [!IMPORTANT]
> ホストへ Node.js や pnpm をグローバルインストールしないでください。

```bash
scripts/app.sh pnpm install
scripts/app.sh pnpm build
scripts/app.sh pnpm test
```

> [!TIP]
> VS Code Dev Containers や既存のコンテナシェルでは、`app/` で `pnpm` コマンドを直接実行できます。

セットアップの詳細とコマンドの変種は[開発ガイド](docs/ja/development.md)を参照してください。

## 必須チェック

Pull Request の提出前に検証一式を実行してください。

```bash
scripts/app.sh pnpm ci:check
```

このコマンドはフォーマット確認、ビルド、型チェック、テスト、CLI バンドル生成を実行します。npm 配布を変更した場合はパッケージも検証します。

```bash
scripts/app.sh pnpm package:verify
```

個別の Vitest ファイルやテスト名を指定する場合:

```bash
scripts/app.sh pnpm exec vitest run packages/core/src/route.test.ts
scripts/app.sh pnpm exec vitest run -t "rewrites links"
```

テスト方針と対象一覧は [docs/ja/testing.md](docs/ja/testing.md) にあります。

## 変更ガイドライン

- [docs/ja/architecture.md](docs/ja/architecture.md) に記載のアーキテクチャを維持してください。ソース形式ごとに専用のレンダラーで処理して共通の `Page` モデルへ正規化する構成と、単一ファイル出力の不変条件（グローバルに一意な要素 ID、安定したルート、全ページの到達可能性）を守ります。
- 動作を変更する場合はテストを追加または更新してください。
- 利用者向けの動作、設定、対応記法、制限を変更する場合は README と関連する `docs/` 文書を日英ともに更新してください。
- 依存関係を追加する前に、目的、バンドルサイズ、ライセンス互換性、単一ファイル配布への影響を確認してください。
- 変更範囲を絞り、無関係なフォーマット変更やリファクタリングを混在させないでください。

機能はロードマップのバージョン単位で整理します。バージョンの区切りでは `docs/status.md` / `docs/ja/status.md` と `docs/testing.md` / `docs/ja/testing.md` を更新してください。コミットメッセージは Conventional Commits の接頭辞、英語の説明、末尾の対象バージョンを使用します。

```text
feat: add search indexing (v0.4)
```

## Pull Request

Pull Request の説明には少なくとも次を含めてください。

- 変更の目的
- 主な実装変更
- 実施した検証
- 既知の制限または後続作業

## ライセンス

別途明示的な合意がない限り、コントリビューションはプロジェクトの [MIT License](LICENSE) のもとで提供されます。依存関係や第三者コードを追加する場合は、そのライセンスが配布方針と互換であることを確認してください。

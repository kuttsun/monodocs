# monodocs へのコントリビューション

monodocs への Issue、ドキュメント改善、バグ修正、機能提案を歓迎します。公式の開発基盤は
[GitHub](https://github.com/kuttsun/monodocs) です。

## はじめに

- セキュリティ上の問題は公開 Issue にせず、[SECURITY.md](SECURITY.md) の手順で報告してください。
- 大きな仕様変更は実装前に Issue で目的と設計を相談してください。
- 小さなバグ修正やドキュメント修正は、直接 Pull Request を作成して構いません。
- 保守はベストエフォートで行い、Issue や Pull Request への応答時間は保証しません。

## 開発環境

開発・ビルド・テストには Docker を使用します。ホストへの Node.js / pnpm のグローバル
インストールは不要です。

```bash
scripts/app.sh pnpm install
scripts/app.sh pnpm build
scripts/app.sh pnpm test
```

VS Code Dev Containers を使う場合や、コンテナ内のシェルで作業する場合は `app/` へ移動し、
`pnpm` コマンドを直接実行してください。詳細は [開発ガイド](docs/development.md) を参照してください。

## 変更前の確認

Pull Request を作成する前に、アプリの検証一式を実行してください。

```bash
scripts/app.sh pnpm ci:check
```

このコマンドは format check、build、typecheck、test、CLI bundle を順番に実行します。単一テストを
実行する場合は、次のように Vitest のファイルまたはテスト名を指定できます。

```bash
scripts/app.sh pnpm exec vitest run packages/core/src/route.test.ts
scripts/app.sh pnpm exec vitest run -t "rewrites links"
```

## 変更の方針

- 既存の Markdown / AsciiDoc 混在処理と、共通 `Page` モデルへの正規化を維持してください。
- 挙動を変更する場合は、対応するテストを追加または更新してください。
- 利用者向けの挙動や設定を変更する場合は、README と関連する `docs/` も更新してください。
- 依存関係を追加する場合は、用途、バンドルサイズ、ライセンス、単一ファイル配布への影響を確認してください。
- コミットメッセージは Conventional Commits の prefix を使い、英語で変更内容を記述してください。

## Pull Request

説明には、少なくとも次を含めてください。

- 変更の目的
- 主な変更点
- 実行した検証
- 既知の制限や後続作業

変更範囲を小さく保ち、無関係な整形やリファクタリングを混ぜないでください。

## ライセンス

このリポジトリへのコントリビューションは、別途明示的に合意した場合を除き、プロジェクトと同じ
[MIT License](LICENSE) の下で提供されるものとします。依存関係や第三者のコードを追加する場合は、
そのライセンスが配布方針と両立することを確認してください。

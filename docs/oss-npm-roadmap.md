# OSS・npm 公開ロードマップ

最終更新: 2026-07-13

## 1. 目的

monodocs を MIT License の OSS として公開し、次の方法で安定して導入できる状態を目指す。

```bash
npm install -g monodocs
monodocs build ./docs -o ./dist/manual.html
```

または、一時的なインストールで利用できるようにする。

```bash
npx monodocs build ./docs -o ./dist/manual.html
```

npm 公開に先行して、GitHub Releases から単体バイナリを試験配布する。利用者向け Docker
イメージは提供しない。既存の開発・テスト用 Docker 環境は維持する。

## 2. 基本方針

- ソースコードは MIT License で公開する。
- バージョンには Semantic Versioning を使用する。
- 公開済みの成果物は差し替えず、不具合は新しいバージョンで修正する。
- npm の初回公開では CLI パッケージ `monodocs` のみを公開する。
- `@monodocs/core` は内部 workspace パッケージとして維持し、CLI の公開物へバンドルする。
- npm 公開前は GitHub Releases の単体バイナリでリリース運用を検証する。
- npm 版では HTML、PDF、Mermaid pre-render を含む主要機能を提供する。
- SEA バイナリ版で利用できない機能は README と Release notes に明記する。
- リリース成果物は CI で生成し、手元で生成したバイナリを公開しない。

## 3. 現状と解決すべき課題

現在の CLI は非公開の `@monodocs/core` に `workspace:*` で依存している。

```text
monodocs CLI
  └─ @monodocs/core
```

このままでは CLI だけを npm に公開できない。初回公開では core の公開 API を確定せず、CLI の
成果物へバンドルして単一パッケージとして配布する。

また、現在の SEA バイナリは `puppeteer-core` を外部依存にしているため、次の制限がある。

| 機能                    | SEA バイナリ | npm 版の目標 |
| ----------------------- | ------------ | ------------ |
| HTML 生成               | 対応         | 対応         |
| `validate`              | 対応         | 対応         |
| `watch` / `serve`       | 対応         | 対応         |
| PDF 出力                | 非対応       | 対応         |
| Mermaid client mode     | 対応         | 対応         |
| Mermaid pre-render mode | 非対応       | 対応         |

## 4. マイルストーン

| ID  | マイルストーン       | 主な成果物                                        |
| --- | -------------------- | ------------------------------------------------- |
| M0  | 公開方針確定         | 正式リポジトリ、npm 名、所有者、対応環境          |
| M1  | OSS 基盤整備         | CONTRIBUTING、SECURITY、Issue / PR 運用           |
| M2  | CI 基盤整備          | test、typecheck、build、HTML / PDF スモークテスト |
| M3  | バイナリ試験公開     | `v0.6.0-alpha.*`、install.sh、SHA256SUMS          |
| M4  | npm パッケージ完成   | インストール可能な npm tarball                    |
| M5  | npm ベータ公開       | `monodocs@next`                                   |
| M6  | npm 安定版公開       | `monodocs@latest`                                 |
| M7  | 公開後の保守運用確立 | バージョン更新、脆弱性対応、EOL、権限棚卸し       |

## 5. M0: 公開方針の確定

### 5.1 決定事項

- [ ] 正式なソースリポジトリを GitHub または GitLab のどちらかに統一する。
- [ ] `homepage`、`repository`、`bugs`の URL を正式なリポジトリへ統一する。
- [ ] npm のパッケージ名を `monodocs` とする。
- [ ] npm registry でパッケージ名を利用できることを最終確認する。
- [ ] npm パッケージの所有者を個人または Organization のどちらにするか決める。
- [ ] npm の公開権限を持つメンテナーを決める。
- [ ] 初回は CLI のみを公開し、core は内部パッケージとして維持する方針を確定する。
- [ ] サポートする Node.js バージョンを決める。
- [ ] サポートする OS / CPU を決める。
- [ ] PDF 用 Chromium の対応・探索・設定方針を決める。
- [ ] サポート対象バージョンと EOL 方針を決める。

### 5.2 完了条件

- 公開方針が本文書または ADR に記録されている。
- パッケージ名、所有者、公開権限、正式リポジトリが確定している。
- CLI と core の公開境界が確定している。
- 対応する Node.js、OS、CPU、Chromium の範囲が明文化されている。

## 6. M1: OSS 基盤整備

### 6.1 ドキュメント

- [ ] `README.md` にインストール、基本操作、対応環境、既知の制限を記載する。
- [ ] `LICENSE` に MIT License が正しく記載されていることを確認する。
- [ ] `CONTRIBUTING.md` を追加する。
- [ ] `SECURITY.md` を追加する。
- [ ] CHANGELOG または GitHub Releases のどちらを変更履歴の正本とするか決める。
- [ ] 必要に応じて `CODE_OF_CONDUCT.md` を追加する。
- [ ] サポート範囲と SLA を提供しないことを明記する。
- [ ] コントリビューションが MIT License で提供されることを明記する。

### 6.2 リポジトリ運用

- [ ] バグ報告用 Issue template を追加する。
- [ ] 機能要望用 Issue template を追加する。
- [ ] Pull Request template を追加する。
- [ ] 脆弱性の非公開報告経路を有効化する。
- [ ] デフォルトブランチを保護する。
- [ ] CI 成功とレビューをマージ条件にする。
- [ ] Dependabot または Renovate の導入方針を決める。
- [ ] 依存関係追加時のライセンス確認ルールを定める。

### 6.3 完了条件

- 第三者が README と CONTRIBUTING だけでビルド・テストできる。
- Issue、PR、脆弱性報告の受付方法が明確になっている。
- LICENSE と第三者ライセンス表記を配布物へ含める方針が確立している。

## 7. M2: CI 基盤整備

### 7.1 Pull Request CI

すべての Pull Request で、少なくとも次を実行する。

```text
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm bundle
```

- [ ] format check を実行する。
- [ ] typecheck を実行する。
- [ ] 全テストを実行する。
- [ ] workspace 全体をビルドする。
- [ ] CLI バンドルを生成する。
- [ ] 第三者ライセンス一覧を生成・検証する。
- [ ] 依存関係変更時に既知の脆弱性を検査する。

### 7.2 スモークテスト

- [ ] `monodocs --version`を確認する。
- [ ] `monodocs --help`を確認する。
- [ ] Markdown から HTML を生成する。
- [ ] Markdown / AsciiDoc 混在文書から HTML を生成する。
- [ ] `validate`を実行する。
- [ ] Chromium がある環境で PDF を生成する。
- [ ] 生成 PDF が `%PDF-`で始まることを確認する。
- [ ] 公開予定物に LICENSE と第三者ライセンス表記が含まれることを確認する。

### 7.3 完了条件

- 壊れた成果物を main にマージできない。
- HTML と PDF の代表的な生成フローが CI で検証される。
- ライセンス表記の欠落を CI で検出できる。

## 8. M3: バイナリ試験公開

### 8.1 バージョン

バイナリ配布はプレリリースから開始する。

```text
v0.6.0-alpha.1
v0.6.0-alpha.2
```

### 8.2 対象プラットフォーム

初回は Linux x64 に限定し、CI と利用者による検証後に追加する。

1. Linux x64
2. Linux arm64
3. macOS arm64
4. Windows x64

Windows をサポートする場合は `install.ps1` とコード署名を別途検討する。

### 8.3 Release asset

```text
monodocs-v0.6.0-alpha.1-linux-x64.tar.gz
SHA256SUMS
```

アーカイブ内には次を含める。

```text
monodocs
LICENSE
THIRD-PARTY-NOTICES.txt
README.md
```

### 8.4 インストールスクリプト

- [ ] POSIX shell で `install.sh`を実装する。
- [ ] OS / CPU を判定する。
- [ ] `--version`でバージョンを固定できるようにする。
- [ ] `--install-dir`で配置先を指定できるようにする。
- [ ] 既定の配置先を `$HOME/.local/bin`とする。
- [ ] Release asset と `SHA256SUMS`を HTTPS で取得する。
- [ ] インストール前に SHA-256 を検証する。
- [ ] ハッシュ不一致時は必ず失敗させる。
- [ ] 一時ディレクトリを安全に作成・削除する。
- [ ] 暗黙に `sudo`を実行しない。
- [ ] シェル設定ファイルを自動変更しない。
- [ ] 失敗時に既存バージョンを壊さない。

### 8.5 リリースセキュリティ

- [ ] Git タグを起点に CI でビルドする。
- [ ] OS / CPU ごとの runner でバイナリを生成する。
- [ ] SHA256SUMS を生成する。
- [ ] GitHub Artifact Attestations で provenance を生成する。
- [ ] 公開済み Release asset を差し替えない。
- [ ] 不具合修正時は新しいバージョンを発行する。

### 8.6 完了条件

- Node.js がない新規環境へインストールできる。
- インストール時に SHA-256 が検証される。
- バイナリから HTML を生成できる。
- PDF と Mermaid pre-render が非対応であることが明記されている。
- Git タグ、Release、バイナリのバージョンが一致している。

## 9. M4: npm パッケージ完成

### 9.1 package metadata

- [ ] CLI の `private: true`を削除する。
- [ ] 正式なバージョンを設定する。
- [ ] `homepage`を正式な URL にする。
- [ ] `repository`を正式な URL にする。
- [ ] `bugs`を正式な Issue URL にする。
- [ ] `engines.node`を設定する。
- [ ] `bin.monodocs`を公開する実行ファイルへ向ける。
- [ ] `files`を許可リストとして定義する。
- [ ] `publishConfig.access`を設定する。
- [ ] `LICENSE`をパッケージへ含める。
- [ ] `THIRD-PARTY-NOTICES.txt`をパッケージへ含める。

### 9.2 パッケージ構造

初回公開では次の単一パッケージを目標とする。

```text
package/
├── package.json
├── README.md
├── LICENSE
├── THIRD-PARTY-NOTICES.txt
└── dist/
    └── monodocs.cjs
```

- [ ] `@monodocs/core`を公開物へバンドルする。
- [ ] 公開物から `workspace:*`依存を排除する。
- [ ] CLI の shebang と実行権限を確認する。
- [ ] テーマとクライアントアセットを公開物へ含める。
- [ ] 不要なテスト、設定、秘密情報を公開物から除外する。

### 9.3 PDF と Chromium

- [ ] npm 版から `puppeteer-core`を解決できるようにする。
- [ ] システム Chromium の探索方法を定義する。
- [ ] Chromium の明示パスを設定できるようにする。
- [ ] Chromium がない場合に具体的なエラーを表示する。
- [ ] HTML だけを使う利用者へ Chromium を自動ダウンロードしない。
- [ ] npm 版で PDF 出力を検証する。
- [ ] npm 版で Mermaid pre-render を検証する。

### 9.4 tarball 検証

公開前に npm tarball を生成し、空の環境へインストールして検証する。

```bash
npm pack
npm install -g ./monodocs-0.6.0-beta.1.tgz
monodocs --version
monodocs build ./docs -o ./dist/manual.html
monodocs build ./docs --format pdf -o ./dist/manual.pdf
```

- [ ] tarball のファイル一覧をスナップショットまたは許可リストで検証する。
- [ ] tarball だけから CLI をインストールできる。
- [ ] HTML、PDF、validate、serve を実行できる。
- [ ] パッケージサイズとインストール時間を確認する。

### 9.5 完了条件

- npm tarball だけで主要機能が動作する。
- 公開物に `workspace:*`が残っていない。
- LICENSE と第三者ライセンス表記が含まれている。
- SEA バイナリ版との機能差が文書化されている。

## 10. M5: npm ベータ公開

### 10.1 公開方法

ベータ版は `latest`ではなく `next`へ公開する。

```bash
npm publish --tag next
npm install -g monodocs@next
```

- [ ] `0.6.0-beta.1`を発行する。
- [ ] GitHub Actions の Trusted Publishing を設定する。
- [ ] 長期 npm write token を CI に保存しない。
- [ ] リリース用 Environment に承認を設定する。
- [ ] npm provenance が生成されることを確認する。
- [ ] npm アカウントで 2FA を必須にする。
- [ ] 公開権限を必要最小限のメンテナーへ限定する。

### 10.2 ベータ検証

- [ ] `npm install -g monodocs@next`を確認する。
- [ ] `npx monodocs@next`を確認する。
- [ ] サポート対象 OS でインストールする。
- [ ] サポート対象 Node.js でインストールする。
- [ ] HTML と PDF を生成する。
- [ ] Mermaid client / pre-render を確認する。
- [ ] watch / serve を確認する。
- [ ] Chromium 検出とエラー表示を確認する。
- [ ] アンインストールと再インストールを確認する。
- [ ] README の手順を新規環境で再現する。

### 10.3 完了条件

- 第三者が `monodocs@next`をインストールできる。
- 主要機能にリリースを妨げる不具合がない。
- npm 上で公開元の provenance を確認できる。
- README の導入手順が再現可能である。

## 11. M6: npm 安定版公開

### 11.1 リリース手順

1. バージョン更新 PR を作成する。
2. CHANGELOG または Release notes を更新する。
3. 全 CI を通す。
4. `npm pack`成果物を検査する。
5. tarball を新規環境へインストールしてスモークテストする。
6. PR を main へマージする。
7. `v0.6.0`タグを作成する。
8. CI で GitHub Release と Release asset を生成する。
9. CI から npm へ公開する。
10. npm から公開版を再インストールして検証する。
11. README、公式サイト、ステータス文書を更新する。

### 11.2 公開後の確認

```bash
npm install -g monodocs
monodocs --version
monodocs build ./docs -o ./dist/manual.html
```

- [ ] Git タグ、GitHub Release、npm version が一致している。
- [ ] `latest`が意図した安定版を指している。
- [ ] LICENSE と第三者ライセンス表記が含まれている。
- [ ] npm provenance を確認できる。
- [ ] HTML と PDF の公開後スモークテストが通る。
- [ ] README だけで導入・利用できる。

### 11.3 完了条件

- `npm install -g monodocs`で導入できる。
- `npx monodocs`で実行できる。
- サポート対象環境で HTML と PDF を生成できる。
- 問題発生時の修正版公開手順が確立している。

## 12. M7: 公開後の保守運用

### 12.1 バージョニング

- patch: 後方互換のバグ修正。
- minor: 後方互換の機能追加。
- major: 破壊的変更。
- `next`: プレリリース。
- `latest`: 安定版。

  0.x 期間は最新 minor を通常サポート対象とし、過去 minor は重大な脆弱性のみ対応する案を基本とする。

### 12.2 セキュリティ対応

- [ ] Critical / High の脆弱性を通常リリースより優先して対応する。
- [ ] 公開前は Security Advisory などで非公開に調整する。
- [ ] 修正版公開後に影響範囲と対処方法を案内する。
- [ ] 必要に応じて npm の問題バージョンを deprecate する。
- [ ] 公開済みバージョンを安易に unpublish しない。

### 12.3 定期作業

- [ ] 依存関係を定期更新する。
- [ ] 脆弱性アラートを確認する。
- [ ] npm maintainer 権限を定期的に棚卸しする。
- [ ] Trusted Publisher 設定を監査する。
- [ ] Node.js と Chromium の対応範囲を見直す。
- [ ] EOL バージョンを告知する。
- [ ] Issue とダウンロード状況から優先課題を見直す。

## 13. リリース共通ルール

- 同じバージョンの成果物を再生成・差し替えしない。
- 問題がある場合は新しい patch または prerelease を発行する。
- バージョンタグ、CLI の `--version`、package.json、Release asset 名を一致させる。
- 安定版を公開する前に prerelease でインストール経路を検証する。
- Release notes に機能追加、修正、破壊的変更、既知の制限を記載する。
- バイナリと npm tarball の両方に LICENSE と第三者ライセンス表記を含める。
- リリース操作は CI から行い、公開権限を最小化する。

## 14. 参考資料

- [npm package scope, access level, and visibility](https://docs.npmjs.com/package-scope-access-level-and-visibility/)
- [Creating and publishing scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)
- [Trusted publishing for npm packages](https://docs.npmjs.com/trusted-publishers/)
- [Adding dist-tags to packages](https://docs.npmjs.com/adding-dist-tags-to-packages/)
- [npm Unpublish Policy](https://docs.npmjs.com/policies/unpublish/)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- [GitHub Artifact Attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)
- [Node.js Single executable applications](https://nodejs.org/api/single-executable-applications.html)

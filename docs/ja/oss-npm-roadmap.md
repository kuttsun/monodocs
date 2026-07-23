# OSS・npm 公開ロードマップ

[English](../oss-npm-roadmap.md)

最終更新: 2026-07-18

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

初期リリースは npm パッケージのみとする。SEA 単体バイナリは npm 版の公開・運用が安定した後の
将来対応とし、v0.6 の完了条件には含めない。利用者向け Docker イメージは提供せず、既存の
開発・テスト用 Docker 環境は維持する。

## 2. 基本方針

- ソースコードは MIT License で公開する。
- GitHub を正式なソースリポジトリおよび公開基盤とする。
- GitLab は GitHub Pages への移行まで既存 Pages 配信だけに残し、新しいリリース自動化は GitHub に構築する。
- バージョンには Semantic Versioning を使用する。
- 公開済みの成果物は差し替えず、不具合は新しいバージョンで修正する。
- npm の初回公開では CLI パッケージ `monodocs` のみを公開する。
- `@monodocs/core` は内部 workspace パッケージとして維持し、CLI の公開物へバンドルする。
- npm 版では HTML、PDF、Mermaid pre-render を含む主要機能を提供する。
- v0.6 は npm パッケージのみを配布し、SEA 単体バイナリは将来の独立したマイルストーンとする。
- npm パッケージの生成と公開は CI から行い、手元で生成した成果物を公開しない。

## 3. 現状と解決すべき課題

### 3.1 GitHub への移行

ソースリポジトリ、デフォルトブランチ、package metadata は GitHub へ移行済みです。GitLab は GitHub Pages へ切り替えるまで、既存 Pages 配信だけに一時的に残します。

移行済みの項目:

- Git remote とデフォルトブランチ
- `homepage`、`repository`、`bugs` の URL
- 公式サイトと contributor 文書の repository URL
- Issue / Pull Request template
- Private vulnerability reporting
- Dependency graph、Dependabot alerts / security updates、secret scanning、push protection

M2 完了と M4 beta release までに残る GitHub 設定:

- GitHub Actions の Pull Request CI
- GitHub Releases と Artifact Attestations
- npm Trusted Publishing

移行までは `.gitlab-ci.yml` の Pages 配信を維持する。将来破棄する GitLab 固有のリリース処理は
増やさず、format、typecheck、test、build、bundle などの検証手順は package scripts として
プラットフォーム非依存に保つ。

### 3.2 npm パッケージ構造

開発用 CLI は非公開の `@monodocs/core` に `workspace:*` で依存している。

```text
monodocs CLI
  └─ @monodocs/core
```

開発用 CLI は private のままとし、release pipeline が publish manifest、bundle 済み CLI、必要な notice を含む staging directory を別に生成します。初回公開では core の公開 API を確定せず、CLI の成果物へバンドルして単一 package として配布します。

### 3.3 SEA バイナリは将来対応

現在の開発用 SEA ビルドは `puppeteer-core` を外部依存にしているため、次の制限がある。v0.6 では
SEA を利用者向けに配布せず、npm 安定版の公開後に対応機能、対象 OS / CPU、署名、インストール
方法を改めて設計する。

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
| M3  | npm パッケージ完成   | インストール可能な npm tarball                    |
| M4  | npm ベータ公開       | `monodocs@next`                                   |
| M5  | npm 安定版公開       | `monodocs@latest`                                 |
| M6  | 公開後の保守運用確立 | バージョン更新、脆弱性対応、EOL、権限棚卸し       |

SEA 単体バイナリは M5 の npm 安定版公開後に着手を判断する将来項目とし、npm 公開の前提条件にしない。

## 5. M0: 公開方針の確定

### 5.1 確定した初期方針

- npm パッケージは個人所有とし、初期メンテナーは `kuttsun` のみとする。実際に使用する npm
  アカウント名は公開作業の直前に最終確認する。
- npm 版は Node.js 22 以上を対象とする。
- npm 版の初期対応対象は Linux x64 と Windows x64 とし、ベータ公開前に GitHub Actions で
  HTML、validate、watch、serve を検証する。Linux arm64 と macOS arm64 は継続検証できる
  環境を用意した段階で追加を判断する。
- SEA 単体バイナリは v0.6 の対象外とし、npm 安定版の公開後に改めて検討する。
- Chromium は自動ダウンロードしない。`PUPPETEER_EXECUTABLE_PATH` を最優先し、未指定の場合は
  Linux の標準的な Chromium / Google Chrome の配置場所を探索する。
- 0.x 期間は最新 minor を通常サポートし、過去 minor は重大な脆弱性のみ対応する。
- 変更履歴の正本は GitHub Releases とし、重要な変更と既知の制限を Release notes に記載する。
- npm registry 上の `monodocs` の利用可否は、GitHub 移行および公開作業の直前に最終確認する。

### 5.2 決定事項

- [x] 正式な公開基盤を GitHub とし、現在の GitLab リポジトリから段階的に移行する。
- [x] GitHub への移行を完了し、正式なソースリポジトリを一本化する。
- [x] `homepage`、`repository`、`bugs`の URL を正式なリポジトリへ統一する。
- [x] npm のパッケージ名を `monodocs` とする。
- [x] npm registry でパッケージ名を利用できることを最終確認する。
- [x] npm パッケージは個人が所有する。
- [x] npm の初期メンテナーを `kuttsun` のみにする。
- [x] 初回は CLI のみを公開し、core は内部パッケージとして維持する方針を確定する。
- [x] npm 版は Node.js 22 以上をサポートする。
- [x] npm 版の初期対応対象を Linux x64 と Windows x64 とする。
- [x] SEA 単体バイナリを v0.6 の配布対象から外す。
- [x] Chromium は自動取得せず、環境変数とシステム上の実行ファイルから探索する。
- [x] 0.x のサポート対象と EOL 方針を決める。

### 5.3 完了条件

- 公開方針が本文書または ADR に記録されている。
- パッケージ名、所有者、公開権限、正式リポジトリが確定している。
- CLI と core の公開境界が確定している。
- 対応する Node.js、OS、CPU、Chromium の範囲が明文化されている。

## 6. M1: OSS 基盤整備

### 6.1 ドキュメント

- [x] `README.md` にインストール、基本操作、対応環境、既知の制限を記載する。
- [x] `LICENSE` に MIT License が正しく記載されていることを確認する。
- [x] `CONTRIBUTING.md` を追加する。
- [x] `SECURITY.md` を追加する。
- [x] GitHub Releases を変更履歴の正本とする。
- [ ] 必要に応じて `CODE_OF_CONDUCT.md` を追加する。
- [x] サポート範囲と SLA を提供しないことを明記する。
- [x] コントリビューションが MIT License で提供されることを明記する。

### 6.2 リポジトリ運用

- [x] バグ報告用 Issue template を追加する。
- [x] 機能要望用 Issue template を追加する。
- [x] Pull Request template を追加する。
- [x] 脆弱性の非公開報告経路を有効化する。
- [x] デフォルトブランチを保護する。
- [x] CI 成功とレビューをマージ条件にする。
- [ ] Dependabot または Renovate の導入方針を決める。
- [x] 依存関係追加時のライセンス確認ルールを定める。

### 6.3 完了条件

- 第三者が README と CONTRIBUTING だけでビルド・テストできる。
- Issue、PR、脆弱性報告の受付方法が明確になっている。
- LICENSE と第三者ライセンス表記を配布物へ含める方針が確立している。

## 7. M2: CI 基盤整備

### 7.1 Pull Request CI

すべての Pull Request で、少なくとも次を実行する。Linux x64 と Windows x64 の matrix を用意し、
OS 固有でない検証に加えて、Chromium を使う PDF / pre-render も両方の OS で行う。Chromium の
実行ファイルは CI で明示的に用意し、`PUPPETEER_EXECUTABLE_PATH` で指定する。

```text
pnpm install --frozen-lockfile
pnpm format:check
pnpm build
pnpm typecheck
pnpm test
pnpm bundle
```

- [x] format check を実行する。
- [x] workspace 全体をビルドする。
- [x] typecheck を実行する。
- [x] 全テストを実行する。
- [x] CLI バンドルを生成する。
- [x] 第三者ライセンス一覧を生成・検証する。
- [x] 依存関係変更時に既知の脆弱性を検査する。

### 7.2 スモークテスト

- [x] `monodocs --version`を確認する。
- [x] `monodocs --help`を確認する。
- [x] Markdown から HTML を生成する。
- [x] Markdown / AsciiDoc 混在文書から HTML を生成する。
- [x] `validate`を実行する。
- [x] Linux x64 と Windows x64 で npm 版 CLI の基本フローを実行する。
- [x] Linux x64 と Windows x64 で Chromium を指定し、PDF と Mermaid pre-render を実行する。
- [x] 生成 PDF が `%PDF-`で始まることを確認する。
- [x] 公開予定物に LICENSE と第三者ライセンス表記が含まれることを確認する。

### 7.3 完了条件

- 壊れた成果物を main にマージできない。
- HTML と PDF の代表的な生成フローが CI で検証される。
- ライセンス表記の欠落を CI で検出できる。

## 8. M3: npm パッケージ完成

### 8.1 package metadata

- [x] 開発用 CLI は private のまま保ち、別の staging directory に publish manifest を生成する。
- [x] 最初の prerelease version を設定する。
- [x] `homepage`を正式な URL にする。
- [x] `repository`を正式な URL にする。
- [x] `bugs`を正式な Issue URL にする。
- [x] `engines.node`を設定する。
- [x] `bin.monodocs`を公開する実行ファイルへ向ける。
- [x] `files`を許可リストとして定義する。
- [x] `publishConfig.access`を設定する。
- [x] `LICENSE`をパッケージへ含める。
- [x] `THIRD-PARTY-NOTICES.txt`をパッケージへ含める。

### 8.2 パッケージ構造

初回公開では次の単一パッケージを目標とする。

```text
package/
├── package.json
├── README.md
├── README.ja.md
├── LICENSE
├── THIRD-PARTY-NOTICES.txt
└── dist/
    └── monodocs.cjs
```

- [x] `@monodocs/core`を公開物へバンドルする。
- [x] 公開物から `workspace:*`依存を排除する。
- [x] CLI の shebang と実行権限を確認する。
- [x] テーマとクライアントアセットを公開物へ含める。
- [x] 不要なテスト、設定、秘密情報を公開物から除外する。

### 8.3 PDF と Chromium

- [x] npm 版から `puppeteer-core`を解決できるようにする。
- [x] システム Chromium の探索方法を定義する。
- [x] `PUPPETEER_EXECUTABLE_PATH` で Chromium の明示パスを設定できるようにする。
- [x] Chromium がない場合に具体的なエラーを表示する。
- [x] HTML だけを使う利用者へ Chromium を自動ダウンロードしない。
- [x] npm 版で PDF 出力を検証する。
- [x] npm 版で Mermaid pre-render を検証する。

### 8.4 tarball 検証

公開前に npm tarball を生成し、空の環境へインストールして検証する。

```bash
npm pack
npm install -g ./monodocs-0.6.0-beta.1.tgz
monodocs --version
monodocs build ./docs -o ./dist/manual.html
monodocs build ./docs --format pdf -o ./dist/manual.pdf
```

- [x] tarball のファイル一覧をスナップショットまたは許可リストで検証する。
- [x] tarball だけから CLI をインストールできる。
- [x] HTML、PDF、validate、serve を実行できる。
- [x] パッケージサイズとインストール時間を確認する。

2026-07-18 のローカル tarball 検証では、Node.js 22 の開発 container で `monodocs-0.6.0-beta.1.tgz` を使用しました。tarball は 3,458,538 bytes（展開後 17,608,570 bytes）で、想定した allowlist の files を含み、約 5 秒で 81 packages を install しました。`--version`、`--help`、`validate`、HTML、PDF、Mermaid pre-render、`serve` が成功し、PDF は `%PDF-` で始まりました。この検証は `pnpm package:verify` で自動化され、両対応 OS の Pull Request CI で実行されます。

### 8.5 完了条件

- npm tarball だけで主要機能が動作する。
- 公開物に `workspace:*`が残っていない。
- LICENSE と第三者ライセンス表記が含まれている。
- npm 版だけで主要機能とインストール経路が完結している。

## 9. M4: npm ベータ公開

### 9.1 公開方法

`release.yml` workflow は GitHub-hosted runner 上で GitHub Release から公開します。release tag と CLI package version の完全一致を検証し、prerelease は `next`、stable は `latest` へ割り当て、全 check と tarball 検証後に npm Trusted Publishing で公開します。repository 側の承認を適用できるよう `npm` GitHub Environment を使います。

npm Trusted Publishing は owner `kuttsun`、repository `monodocs`、workflow `release.yml`、environment `npm`、allowed action `npm publish` で設定します。ベータ版は `latest` ではなく `next` へ公開します。

```bash
npm publish --tag next
npm install -g monodocs@next
```

- [ ] `0.6.0-beta.1`を発行する。
- [x] GitHub Release 起点の publish workflow を追加する。
- [ ] GitHub Actions の Trusted Publishing を設定する。
- [ ] 長期 npm write token を CI に保存しない。
- [x] リリース用 Environment に承認を設定する。
- [ ] npm provenance が生成されることを確認する。
- [x] npm アカウントで 2FA を必須にする。
- [ ] 公開権限を必要最小限のメンテナーへ限定する。

### 9.2 ベータ検証

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

### 9.3 完了条件

- 第三者が `monodocs@next`をインストールできる。
- 主要機能にリリースを妨げる不具合がない。
- npm 上で公開元の provenance を確認できる。
- README の導入手順が再現可能である。

## 10. M5: npm 安定版公開

### 10.1 リリース手順

1. バージョン更新 PR を作成する。
2. CHANGELOG または Release notes を更新する。
3. 全 CI を通す。
4. `npm pack`成果物を検査する。
5. tarball を新規環境へインストールしてスモークテストする。
6. PR を main へマージする。
7. `v0.6.0`タグを作成する。
8. CI で GitHub Release を生成する。
9. CI から npm へ公開する。
10. npm から公開版を再インストールして検証する。
11. README、公式サイト、ステータス文書を更新する。

### 10.2 公開後の確認

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

### 10.3 完了条件

- `npm install -g monodocs`で導入できる。
- `npx monodocs`で実行できる。
- サポート対象環境で HTML と PDF を生成できる。
- 問題発生時の修正版公開手順が確立している。

## 11. M6: 公開後の保守運用

### 11.1 バージョニング

- patch: 後方互換のバグ修正。
- minor: 後方互換の機能追加。
- major: 破壊的変更。
- `next`: プレリリース。
- `latest`: 安定版。

  0.x 期間は最新 minor を通常サポート対象とし、過去 minor は重大な脆弱性のみ対応する。

### 11.2 セキュリティ対応

- [ ] Critical / High の脆弱性を通常リリースより優先して対応する。
- [ ] 公開前は Security Advisory などで非公開に調整する。
- [ ] 修正版公開後に影響範囲と対処方法を案内する。
- [ ] 必要に応じて npm の問題バージョンを deprecate する。
- [ ] 公開済みバージョンを安易に unpublish しない。

### 11.3 定期作業

- [ ] 依存関係を定期更新する。
- [ ] 脆弱性アラートを確認する。
- [ ] npm maintainer 権限を定期的に棚卸しする。
- [ ] Trusted Publisher 設定を監査する。
- [ ] Node.js と Chromium の対応範囲を見直す。
- [ ] EOL バージョンを告知する。
- [ ] Issue とダウンロード状況から優先課題を見直す。

## 12. 将来: SEA 単体バイナリ

SEA 単体バイナリは npm 安定版の公開・運用後に、利用者の需要と保守コストを確認して着手を
判断する。v0.6 のリリースを妨げる前提条件にはしない。

着手する場合は、少なくとも次を改めて決める。

- 対象 OS / CPU と各環境の CI runner
- PDF / Mermaid pre-render を含めるか、HTML 系機能だけに限定するか
- GitHub Release asset の形式、SHA-256、provenance
- POSIX `install.sh`、Windows `install.ps1`、コード署名の要否
- Node.js ランタイムを同梱することによるサイズと更新頻度
- npm 版とのバージョン対応およびサポート期間

## 13. リリース共通ルール

- 同じバージョンの成果物を再生成・差し替えしない。
- 問題がある場合は新しい patch または prerelease を発行する。
- バージョンタグ、CLI の `--version`、package.json、GitHub Release を一致させる。
- 安定版を公開する前に prerelease でインストール経路を検証する。
- Release notes に機能追加、修正、破壊的変更、既知の制限を記載する。
- npm tarball に LICENSE と第三者ライセンス表記を含める。
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

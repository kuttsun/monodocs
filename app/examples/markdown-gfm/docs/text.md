---
title: テキスト書式
order: 2
---

# テキスト書式・リンク・画像

## 強調

- イタリック: *アスタリスク* / _アンダースコア_
- 太字: **アスタリスク 2 つ** / __アンダースコア 2 つ__
- 太字イタリック: ***3 つ*** / **_混在_**
- 取り消し線（GFM）: ~~取り消し~~
- インラインコード: `const x = 1;` / バッククォートを含む場合: `` `code` ``

## リンク

- インライン: [single-docs](https://example.com/single-docs)
- タイトル付き: [ホバーで表示](https://example.com "タイトルです")
- 参照リンク: [参照スタイル][ref] と [ラベル省略][]
- 同一サイト内の別ページ: [リストのページ](lists.md)

[ref]: https://example.com/reference
[ラベル省略]: https://example.com/collapsed

## オートリンク（GFM 拡張）

- URL をそのまま: https://github.github.com/gfm/
- 山括弧で: <https://example.com>
- `www.` 始まり: www.example.com
- メール: <docs@example.com> / contact@example.com

## 画像

![single-docs ロゴ](images/logo.svg "ロゴ")

参照スタイルの画像:

![参照画像][logo]

[logo]: images/logo.svg "参照ロゴ"

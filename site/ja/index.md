---
layout: home

hero:
  name: monodocs
  # 見出しは読点で改行する。日本語見出しは折り返し位置を委ねると「ル」だけが
  # 次行に残るため、句切りを明示する（hero.text は pre-wrap で描画される）。
  text: |-
    分割管理、
    配布は1ファイル
  tagline: 分割した Markdown / AsciiDoc を単一の自己完結 HTML にまとめる軽量 CLI。汎用の形式変換ではなく「単一ファイル配布特化」を目指します。
  actions:
    - theme: brand
      text: はじめる
      link: /ja/docs/getting-started
    - theme: alt
      text: GitHub で見る
      link: https://github.com/kuttsun/monodocs

features:
  - title: 単一ファイル出力
    details: ドキュメントは複数ファイルに分割したまま、配布物はサーバ不要・ランタイム不要の自己完結 HTML 1 つにまとめます。
  - title: Markdown + AsciiDoc
    details: 形式ごとに専用 renderer で処理し、共通のページモデルへ正規化。混在もそのまま扱えます。
  - title: 読むための機能
    details: ページ内検索・目次・前後ナビ・ダークモード・印刷用レイアウトを標準搭載。
  - title: ドキュメントのセルフホスト
    details: このドキュメント自体を monodocs で単一 HTML に出力できます。ナビの「単一ファイルサンプル」をお試しください。
---

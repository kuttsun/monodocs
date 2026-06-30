import { defineConfig } from 'vitepress'

// monodocs 公式サイト
//
// URL 構成:
//   /                  英語ランディング (Hero) — 既定ロケール
//   /docs/*            英語ドキュメント
//   /ja/               日本語ランディング (Hero)
//   /ja/docs/*         日本語ドキュメント
//   /manual.html       monodocs 自身で生成した単一 HTML デモ（VitePress 管轄外・public/）
//
// 言語方針: 英語をルート(既定)ロケールにすることで、`/ja/` 以外のパスはすべて
// 英語で配信される（= 日本語以外は英語にフォールバック）。
//
// /manual.html は VitePress のルーティング外の静的アセット。同一オリジンの絶対パス
// リンクは VitePress が SPA 内部遷移として横取りし 404 を描くため、ナビからのリンクには
// 必ず target: '_blank' を付けてネイティブ遷移させ、dead link チェックからも除外する。

const repo = 'https://gitlab.com/kuttsun/monodocs'

// GitLab ロゴ（socialLinks 用のカスタム svg）。
const gitlabIcon = {
  svg: '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>GitLab</title><path d="m23.6 9.6-.03-.08-3.26-8.5a.85.85 0 0 0-.84-.54.85.85 0 0 0-.5.2.85.85 0 0 0-.28.43l-2.2 6.74H7.5L5.3 1.1A.84.84 0 0 0 4.5.55a.85.85 0 0 0-.5.2.85.85 0 0 0-.27.42L.46 9.52l-.03.08a6.05 6.05 0 0 0 2.01 7l.01.01.04.03 4.96 3.71 2.45 1.86 1.5 1.13a1 1 0 0 0 1.2 0l1.5-1.13 2.45-1.86 4.99-3.73.01-.01a6.05 6.05 0 0 0 2-7Z"/></svg>'
}

export default defineConfig({
  // GitHub / GitLab の project pages はサブパス（例 /monodocs/）で配信されるため、
  // base はビルド時に SITE_BASE で切り替える。独自ドメイン / user pages なら '/'。
  base: process.env.SITE_BASE ?? '/',

  // 拡張子なし URL。
  cleanUrls: true,

  // 開発用 README はページ化しない（/README.html を出力させない）。
  srcExclude: ['**/README.md'],

  // /manual.html・/ja/manual.html は VitePress 管轄外（public/ の静的アセット）なので dead link 対象外。
  ignoreDeadLinks: [/^\/manual\.html$/, /^\/ja\/manual\.html$/],

  head: [['meta', { name: 'theme-color', content: '#3451b2' }]],

  locales: {
    // root = English (default)
    root: {
      label: 'English',
      lang: 'en-US',
      title: 'monodocs',
      description:
        'A lightweight CLI that bundles split Markdown / AsciiDoc into a single, self-contained HTML file.',

      themeConfig: {
        nav: [
          { text: 'Home', link: '/' },
          { text: 'Guide', link: '/docs/getting-started' },
          { text: 'Single-file demo', link: '/manual.html', target: '_blank', rel: 'noopener' }
        ],

        sidebar: {
          '/docs/': [
            {
              text: 'Guide',
              items: [
                { text: 'Getting Started', link: '/docs/getting-started' },
                { text: 'Configuration', link: '/docs/configuration' }
              ]
            }
          ]
        },

        footer: {
          message: 'Released under the MIT License.',
          copyright: `Copyright © ${new Date().getFullYear()} kuttsun`
        }
      }
    },

    // /ja/ = Japanese
    ja: {
      label: '日本語',
      lang: 'ja-JP',
      title: 'monodocs',
      description:
        '分割した Markdown / AsciiDoc を単一の自己完結 HTML にまとめる軽量 CLI ツール。',

      themeConfig: {
        nav: [
          { text: 'ホーム', link: '/ja/' },
          { text: 'ガイド', link: '/ja/docs/getting-started' },
          { text: '単一ファイルデモ', link: '/ja/manual.html', target: '_blank', rel: 'noopener' }
        ],

        sidebar: {
          '/ja/docs/': [
            {
              text: 'ガイド',
              items: [
                { text: 'はじめに', link: '/ja/docs/getting-started' },
                { text: '設定ファイル', link: '/ja/docs/configuration' }
              ]
            }
          ]
        },

        footer: {
          message: 'MIT License で公開しています。',
          copyright: `Copyright © ${new Date().getFullYear()} kuttsun`
        },

        docFooter: { prev: '前のページ', next: '次のページ' },
        outline: { label: 'このページの内容' },
        darkModeSwitchLabel: 'ダークモード',
        sidebarMenuLabel: 'メニュー',
        returnToTopLabel: 'トップへ戻る',
        langMenuLabel: '言語を切り替え'
      }
    }
  },

  themeConfig: {
    // 全ロケール共通
    socialLinks: [{ icon: gitlabIcon, link: repo }],

    search: {
      provider: 'local',
      options: {
        locales: {
          ja: {
            translations: {
              button: {
                buttonText: 'ドキュメントを検索',
                buttonAriaLabel: 'ドキュメントを検索'
              },
              modal: {
                noResultsText: '結果が見つかりませんでした',
                resetButtonTitle: '入力をクリア',
                footer: {
                  selectText: '選択',
                  navigateText: '移動',
                  closeText: '閉じる'
                }
              }
            }
          }
        }
      }
    }
  }
})

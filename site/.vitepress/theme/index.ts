// Custom theme for the monodocs site.
//
// The default VitePress theme is kept as the base — only design tokens, type,
// and the home hero are replaced. `vitepress/theme-without-fonts` is used
// instead of `vitepress/theme` so the bundled Inter files are dropped and the
// faces declared in fonts.css are the only ones shipped.

import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme-without-fonts'
import Layout from './Layout.vue'
import './fonts.css'
import './style.css'

export default {
  extends: DefaultTheme,
  Layout
} satisfies Theme

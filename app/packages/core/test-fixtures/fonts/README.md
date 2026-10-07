# Test fonts

Fonts kept for tests only. They are not part of any package or output: `@monodocs/core` publishes
`dist` alone.

- `lm-math/` — Latin Modern Math 1.959 (2014-09-05), a font with an OpenType MATH table: the
  [CTAN `lm-math`](https://ctan.org/pkg/lm-math) distribution in full and unmodified, as the
  [GUST Font License](lm-math/doc/GUST-FONT-LICENSE.txt) it is distributed under (an instance of the
  [LaTeX Project Public License](https://www.latex-project.org/lppl.txt)) asks of a copy; what it
  consists of is in [`MANIFEST-Latin-Modern-Math.txt`](lm-math/doc/MANIFEST-Latin-Modern-Math.txt).
  `build.fontcheck.test.ts` sets formulas in `lm-math/opentype/latinmodern-math.otf` to check that
  the font check reports nothing of a math font; the development image has no math font, which the
  other side of that test needs.

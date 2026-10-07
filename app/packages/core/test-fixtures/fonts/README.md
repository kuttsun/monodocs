# Test fonts

Fonts kept for tests only. They are not part of any package or output: `@monodocs/core` publishes
`dist` alone.

- `latinmodern-math.otf` — Latin Modern Math 1.959 (2014-09-05), a font with an OpenType MATH
  table, from [CTAN `lm-math`](https://ctan.org/pkg/lm-math), unmodified. It is distributed under
  the GUST Font License, in [`GUST-FONT-LICENSE.txt`](GUST-FONT-LICENSE.txt). `build.fontcheck.test.ts`
  sets formulas in it to check that the font check reports nothing of a math font. The development
  image has no math font, which the other side of that test needs.

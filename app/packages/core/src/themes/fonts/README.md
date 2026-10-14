# The math font a PDF's formulas are set in

`NewCMMath-Book.otf` is New Computer Modern Math, Book weight, by Antonis Tsolomitis: the file of
that name in the [CTAN `newcomputermodern`](https://ctan.org/pkg/newcomputermodern) package,
version 8.1.1 (2026-06-22), whose `otf/` directory it comes from. The font's own version string is
4.0. monodocs loads it for a PDF build whose document has a formula, and for the Mermaid labels
pre-rendered for that PDF (roadmap 6.4).

The file is unmodified: it is taken out of the package as it is, and nothing in it is changed,
subset, converted, or renamed. Its SHA-256 is
`2ea09ebc9167b1e1a66f31390dc917f2d4004ecfca72d51b28010e4ad6becd95`. Because it is one file of the
package and not the whole of it, the [LaTeX Project Public License](lppl-1-3c.txt) counts it as a
Derived Work (clause 2), distributed under clause 6: this note is the notice of what was done to it,
and the complete, unmodified package is on CTAN at the address above.

The font is distributed under the [GUST Font License](GUST-FONT-LICENSE.txt), version 1.0, an
instance of the LaTeX Project Public License 1.3c. The rest of the package is not carried; some of
its other fonts are under the GPL with the Font Exception instead, which does not apply to this one.
Its author does not support monodocs, and nothing here says otherwise: report a problem with how
monodocs sets formulas to monodocs.

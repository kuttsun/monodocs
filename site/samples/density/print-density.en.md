# Print density

This document is built four times — once at `relaxed`, once at `normal`, once at `compact`, and once
at `tight` — from the same source, on the same paper, with the same margins. The only thing that
differs between the four PDFs is `pdf.density`, so anything you see change here is that setting and
nothing else.

## What to look at

The four values a density moves are the four that decide how many sheets a document comes out as.
Each one is on this page:

- **Type size.** How large the body text is set. It is the first thing anyone notices and the last
  lever a density should reach for, because it also lengthens the line.
- **Leading.** The distance from one baseline to the next. A stylesheet written for a screen is
  generous here, and on paper that generosity is most of what the page count is paying for.
- **The space above headings.** Air that separates one section from the next. On screen it is
  scrolled past; on paper it is bought by the sheet.
- **Table cell padding.** Invisible until a document is largely tables, at which point it decides
  whether the table fits on one page or two.

## Where the sheets come from

Between `relaxed` and `normal` the type size does not change at all. Both set the body at 16px; what
changes is the leading, the space above headings, and the padding inside table cells. The document
still comes out shorter, which is the point: a page set for reading on a screen is not merely a
smaller page set for paper, and the difference is mostly air rather than type.

Below `normal` the type does get smaller, and something else follows it. The width of the text column
is whatever `pdf.margin` leaves — a density does not narrow it — so every step down in type size is
also a step up in the number of characters on each line. At the default A4 margins, 16px is roughly
42 Japanese characters to the line, and 12px is around 56. That is a real cost, and it is why the
tighter presets are worth choosing deliberately rather than by default.

If you want the tighter type without the longer line, widen `pdf.margin` in the same change. The two
settings are separate because the right measure depends on the script the document is written in,
which is not something a preset can decide for you.

## The presets

| Preset | Type size | Leading | Above headings | Cell padding | Reads as |
| --- | --- | --- | --- | --- | --- |
| `relaxed` | 16px | 1.7 | 1.8em | 0.5rem 0.8rem | The document as it is on screen |
| `normal` | 16px | 1.45 | 0.9em | 0.35rem 0.6rem | The default: screen type, set for paper |
| `compact` | 14px | 1.35 | 0.8em | 0.3rem 0.5rem | A report meant to be handed round |
| `tight` | 12px | 1.3 | 0.6em | 0.2rem 0.35rem | An appendix nobody reads end to end |

`relaxed` is the screen setting under a name. Because it is exactly what the stylesheet already does,
asking for it writes no print rules at all — including none that would pin a font size on someone
printing this HTML from their own browser.

## Setting it

A name is usually enough:

```yaml
pdf:
  pageSize: A4
  margin: { top: 20mm, right: 15mm, bottom: 20mm, left: 15mm }
  density: compact
```

When a preset is close but not right, give an object instead. `base` names the preset to start from
and the object replaces only what it names, so changing one value does not mean copying the other
three:

```yaml
pdf:
  density:
    base: compact
    fontSize: 13px
    lineHeight: 1.4
```

## A table, for the cell padding

Cell padding is the value that is easiest to overlook and hardest to ignore once a document is mostly
tables. The rows below are here to make it visible.

| Step | Owner | Due | State | Note |
| --- | --- | --- | --- | --- |
| Collect the source documents | Documentation | Week 1 | Done | Two of them were still in a wiki |
| Agree the section order | Documentation | Week 1 | Done | Settled by the sidebar, not by the file names |
| Convert the tables | Engineering | Week 2 | Done | The wide ones needed their columns rethought |
| Draw the diagrams | Engineering | Week 2 | In progress | Mermaid, pre-rendered so the PDF needs no runtime |
| Check the fonts on the build machine | Engineering | Week 2 | Done | `fontCheck` reports what is missing before the artifact is made |
| Set the print density | Documentation | Week 3 | In progress | This document is the comparison |
| Decide the margins | Documentation | Week 3 | Open | Depends on the density above |
| Read the whole thing on paper | Review | Week 3 | Open | On the printer it will actually be printed on |
| Fix what the printing turned up | Documentation | Week 4 | Open | There is always something |
| Add the page numbers to the footer | Engineering | Week 4 | Done | Default footer; no configuration needed |
| Sign off the layout | Review | Week 4 | Open | One signature, not four |
| Hand the PDF over | Documentation | Week 4 | Open | With the source, so it can be rebuilt |

## Lists, for the leading

An ordered list runs through the same leading as the body text, so it shows the same difference:

1. Build the document at each density from the same source.
2. Print one sheet of each on the paper it will be read on, not on the screen.
3. Read the body text first, then the tables, then the headings.
4. Choose the loosest one that still fits the number of sheets you have.
5. Write the choice into `monodocs.config.yml` so the next build makes the same document.

The last step is the one that gets skipped. A density chosen once and left in the configuration is a
document that keeps its shape; a density chosen at the printer is a document that changes shape every
time somebody rebuilds it.

---
title: Search
order: 3
---

# Search

The single HTML has full-text search built in. No dictionary and no search runtime are bundled, so the
feature costs almost nothing in file size.

Type in the search box in the sidebar and the results narrow over titles, headings, and body text. Every
query below matches something that really exists in this sample, so read this page with the box open.

## Matching

Matching is case-insensitive and works on substrings, so a query does not have to be a whole word.

| Type this | It matches | What it ignores |
| --- | --- | --- |
| `INSTALL` | install | letter case |
| `stall` | install | word boundaries |
| `ＰＤＦ` | PDF | full-width against half-width |

Japanese has more spelling to absorb than English does, and the search folds katakana against hiragana, the
prolonged sound mark against the dash family, and the wave dash against the full-width tilde. The
[Japanese sample](https://kuttsun.github.io/monodocs/ja/sample.html) demonstrates those.

## Narrowing with several keywords

Separate keywords with a space and only the pages containing all of them are left.

Type `image` first and several pages line up. Add ` embedding` and only the pages containing both are
left.

## Results that matched a heading

Results are weighted by where the keyword appears: title, then heading, then body. Opening a result that
matched a heading goes to that heading rather than to the top of the page.

Type `installation`. It matches a heading in the AsciiDoc sample, and opening it starts you at that heading.

## Keyboard

The results can be worked through without leaving the box.

- `↓` and `↑`: move through the results, wrapping at both ends.
- `Enter`: open the selected result, or the top one when you have not moved yet.
- `Escape`: clear the box.

The cursor stays in the search box while you move, so you can keep typing to narrow the list. While an input
method is composing, the keys are left to it, so selecting a conversion candidate still works.

## Highlighting in the body

Opening a result also marks the keywords in the page you land on. The marks stay while the search is open,
so moving to another page does not lose them. Changing or clearing the query puts the body back as it was.

## What is deliberately not folded

- **Half-width katakana**: `ｲﾝｽﾄｰﾙ` does not find `インストール`.
- **Okurigana variants**: `引渡し` does not find `引き渡し`.
- **English stemming**: `installing` does not find a page that only says `install`. The reverse works,
  because matching is substring-based.

Each of these changes the length of the string. Highlight positions are shared with the original text, so a
fold that changes length puts the marks in the wrong place. Unifying okurigana would also need a dictionary
far too large to carry inside a single file.

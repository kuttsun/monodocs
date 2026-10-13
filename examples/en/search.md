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

Japanese has more spelling to absorb than English does, and the search folds katakana against hiragana,
half-width katakana against full-width, the prolonged sound mark against the dash family, and the wave dash
against the full-width tilde. The
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

The × button at the right of the box clears it too, along with the results and the marks in the body, and
leaves the cursor in the box.

The cursor stays in the search box while you move, so you can keep typing to narrow the list. While an input
method is composing, the keys are left to it, so selecting a conversion candidate still works.

## Highlighting in the body

Opening a result also marks the keywords in the page you land on. The marks stay while the search is open,
so moving to another page does not lose them. Changing or clearing the query puts the body back as it was.

## Loose matching

Some differences are matched by loosening the query rather than the text, with no dictionary.

- **English inflections**: a word is matched by its stem from the start of a word. `installing` also finds
  a page that only says `install`. A word whose stem is shorter than four letters is not loosened.
- **Okurigana variants**: in Japanese, up to two kana between two kanji may be there or not, so `埋込み`
  finds `埋め込み`. The Japanese sample demonstrates it.

Pages that needed the loose match are ranked after those matched as typed. The marks in the body fall on the
text as it is written in the page, not as you typed it.

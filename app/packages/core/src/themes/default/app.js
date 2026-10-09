(function () {
  "use strict";

  var data = window.__MONODOCS_DATA__ || {};
  var pages = Array.isArray(data.pages) ? data.pages : [];
  var pageByRoute = {};
  pages.forEach(function (p) {
    pageByRoute[p.route] = p;
  });
  // 前後ナビ・検索の対象は hidden を除いた閲覧順のページ。
  var navPages = pages.filter(function (p) {
    return !p.hidden;
  });
  // 古い route → 現在の route（15.5）。ページではないので pageByRoute には入れない。
  // どの実 route にも当たらなかった hash だけがここを引くので、別名がページを隠すことはない。
  var aliases = data.aliases && typeof data.aliases === "object" ? data.aliases : {};

  var STORAGE_THEME = "monodocs:theme";
  var STORAGE_CONTENT_WIDTH = "monodocs:content-width";

  // クライアントが動的に書く UI（chrome）の文言。表の選択（lang）と html.labels の適用は
  // core が行い、解決済みのものだけがここへ届く。自前の文字列をひとつも持たないのが要点で、
  // 両方が持つと、表と上書きが 2 箇所で食い違い、片方だけ差し替わった文書ができる。
  // テーマ契約上 {{siteDataJson}} はどのテンプレートにも必ずあるので、これは常に届く。
  // 静的な文言は template.html 側のトークンで解決済みで、ここには現れない。
  var LABELS = data.labels || {};
  // ページ内目次に出す見出しの最深レベル（設定由来。未指定は h3 まで）。
  var tocMaxLevel = typeof data.tocMaxLevel === "number" ? data.tocMaxLevel : 3;
  // 同一ルートへの遷移後にスクロールしたい見出し ID（あれば）。
  var pendingHeadingId = null;
  // 目次のスクロール連動ハイライト用の IntersectionObserver。
  var tocObserver = null;

  // ---- helpers ----
  function currentRoute() {
    var hash = window.location.hash || "";
    var route = hash.charAt(0) === "#" ? hash.slice(1) : hash;
    // ブラウザが hash を percent-encode する場合があるため decode して
    // 生の data-route（日本語・空白を含む）と比較できるようにする。
    try {
      route = decodeURI(route);
    } catch (e) {
      // 不正なエンコードはそのまま扱う。
    }
    return route || "/";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function scrollToHeading(id) {
    if (!id) return;
    var el = document.getElementById(id);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView();
    }
  }

  /**
   * 見出しアンカーへ遷移する。hash を書き換えて履歴に残すため、再読み込み・共有・戻るでも
   * 同じ見出しに戻れる（リンクの href とアドレスバーも一致する）。ページの切り替えと
   * スクロールは hashchange 経由の onRouteChange に任せる。すでに同じ hash のときは
   * hashchange が起きないので直接処理する。
   */
  function navigateToAnchor(id) {
    var target = "#" + encodeURI(id);
    if (window.location.hash === target) {
      onRouteChange();
      return;
    }
    window.location.hash = target;
  }

  // 見出し ID へ遷移する。ルートが異なれば先にページを切り替えてからスクロールする。
  function navigateTo(route, headingId) {
    if (currentRoute() === route) {
      scrollToHeading(headingId);
      return;
    }
    pendingHeadingId = headingId || null;
    window.location.hash = "#" + encodeURI(route);
  }

  // ---- routing ----
  function showPage(route) {
    // article のみを対象にする（#page-nav 内のリンクも data-route を持つため除外）。
    var articles = document.querySelectorAll("#content article[data-route]");
    var matched = false;
    articles.forEach(function (el) {
      var isMatch = el.getAttribute("data-route") === route;
      el.hidden = !isMatch;
      if (isMatch) matched = true;
    });

    // 該当ページが無ければ先頭ページにフォールバックする。
    if (!matched && articles.length > 0) {
      articles.forEach(function (el, i) {
        el.hidden = i !== 0;
      });
      route = articles[0].getAttribute("data-route");
    }

    var links = document.querySelectorAll("#sidebar-nav a[data-route]");
    var activeLink = null;
    links.forEach(function (a) {
      var isActive = a.getAttribute("data-route") === route;
      a.classList.toggle("active", isActive);
      if (isActive) activeLink = a;
    });
    // 現在ページが折りたたまれたディレクトリ内にあれば、その親を開く。
    expandAncestors(activeLink);

    renderToc(route);
    renderPageNav(route);

    var content = document.getElementById("content");
    if (content) content.scrollTop = 0;
    window.scrollTo(0, 0);

    // 表示中ページの Mermaid を描画する（非表示時は描画できないため切替時に実行）。
    if (typeof window.__sdRenderMermaid === "function") window.__sdRenderMermaid();

    // Keep marking the keywords in the body while the search that opened a result stays open.
    applyBodyHighlight();

    // 検索・目次から見出し指定で遷移してきた場合はその位置へスクロールする。
    if (pendingHeadingId) {
      scrollToHeading(pendingHeadingId);
      pendingHeadingId = null;
    }
  }

  // サイドバーリンクの祖先にある折りたたみ済みディレクトリをすべて開く。
  function expandAncestors(link) {
    if (!link) return;
    var node = link.parentElement;
    while (node && node.id !== "sidebar-nav") {
      if (node.classList && node.classList.contains("sidebar-dir")) {
        node.classList.remove("collapsed");
      }
      node = node.parentElement;
    }
  }

  /** hash を decode して返す（route 判定用。未設定なら ""）。 */
  function rawHash() {
    var hash = window.location.hash || "";
    var h = hash.charAt(0) === "#" ? hash.slice(1) : hash;
    try {
      h = decodeURI(h);
    } catch (e) {
      // 不正なエンコードはそのまま扱う。
    }
    return h;
  }

  /**
   * 別名の表を引く（15.5）。
   *
   * Consulted only when the hash matches no real route, so an alias can never shadow a page.
   * `hasOwnProperty` rather than a plain lookup, so an inherited property such as `constructor`
   * is not mistaken for an alias.
   */
  function lookupAlias(route) {
    return Object.prototype.hasOwnProperty.call(aliases, route) ? aliases[route] : null;
  }

  /** hash を現在の route（＋あればアンカー）へ書き換える。履歴に停留所を作らない。 */
  function replaceHash(route, anchor) {
    var next = "#" + encodeURI(route + (anchor ? "#" + anchor : ""));
    if (window.history && typeof window.history.replaceState === "function") {
      window.history.replaceState(null, "", next);
    } else {
      window.location.replace(next);
    }
  }

  function onRouteChange() {
    var h = rawHash();
    // route は必ず "/" 始まり。"/" で始まらない hash はページ内アンカー
    // （脚注・内部参照など）として扱い、該当要素を含むページを表示してスクロールする。
    if (h && h.charAt(0) !== "/") {
      var el = document.getElementById(h);
      if (el) {
        var article = el.closest ? el.closest("article[data-route]") : null;
        if (article) showPage(article.getAttribute("data-route"));
        if (typeof el.scrollIntoView === "function") el.scrollIntoView();
      }
      return;
    }

    var route = h || "/";
    var anchor = "";

    // The whole hash is tried as a route, and as an alias, **before** it is split. A route may
    // itself contain "#" — `old#name.md` produces `/old#name` — so splitting first would make that
    // page unreachable through its own address. Only a hash that names nothing is a candidate for
    // being a route plus a heading.
    if (!pageByRoute[route]) {
      var whole = lookupAlias(route);
      if (whole !== null) {
        route = whole;
        replaceHash(route, "");
      } else {
        var cut = route.indexOf("#");
        if (cut !== -1) {
          anchor = route.slice(cut + 1);
          route = route.slice(0, cut);
          if (!pageByRoute[route]) {
            var aliased = lookupAlias(route);
            // アンカーは置換をまたいで残る。パスではなく見出しを指しているからである。
            if (aliased !== null) {
              route = aliased;
              replaceHash(route, anchor);
            }
          }
        }
      }
    }

    if (anchor) pendingHeadingId = anchor;
    showPage(route || "/");
  }

  /**
   * The section number in front of a title or heading (numbering.sections), shaped as core shapes
   * it in the body and the sidebar. `marked` is the number when the search query named it, so the
   * result shows why it matched. Empty when there is no number.
   */
  function sectionNumberHtml(number, marked) {
    if (typeof number !== "string" || number === "") return "";
    var inner = number === marked ? "<mark>" + escapeHtml(number) + "</mark>" : escapeHtml(number);
    return '<span class="section-number">' + inner + "</span> ";
  }

  // ---- in-page table of contents ----
  function renderToc(route) {
    var toc = document.getElementById("toc");
    var nav = document.getElementById("toc-nav");
    if (!toc || !nav) return;

    // ページ切り替えのたびに前ページ用の監視を破棄する。
    if (tocObserver) {
      tocObserver.disconnect();
      tocObserver = null;
    }

    var page = pageByRoute[route];
    // ページデータは検索が見出しへ飛べるよう h2 以降をすべて持つ。目次に出すのは
    // toc.maxLevel までに絞る。
    var headings = (page && page.headings ? page.headings : []).filter(function (h) {
      return h.level >= 2 && h.level <= tocMaxLevel;
    });
    if (headings.length === 0) {
      nav.innerHTML = "";
      toc.hidden = true;
      return;
    }
    toc.hidden = false;

    var html = '<ul class="toc-list">';
    headings.forEach(function (h) {
      html +=
        '<li class="toc-item toc-level-' +
        h.level +
        '"><a href="#' +
        escapeHtml(encodeURI(h.id)) +
        '" data-heading="' +
        escapeHtml(h.id) +
        '">' +
        sectionNumberHtml(h.number, "") +
        escapeHtml(h.text) +
        "</a></li>";
    });
    html += "</ul>";
    nav.innerHTML = html;

    nav.querySelectorAll("a[data-heading]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        navigateTo(route, a.getAttribute("data-heading"));
      });
    });

    setupTocSpy(
      nav,
      headings.map(function (h) {
        return h.id;
      }),
    );
  }

  // スクロールに連動して、現在地の見出しに対応する目次リンクを active にする。
  function setupTocSpy(nav, headingIds) {
    if (typeof IntersectionObserver === "undefined") return; // 非対応環境は静的目次のまま。

    var links = {};
    nav.querySelectorAll("a[data-heading]").forEach(function (a) {
      links[a.getAttribute("data-heading")] = a;
    });
    var visible = {};

    function highlight() {
      // 文書順で最初に可視の見出しを現在地とみなす。
      var current = null;
      for (var i = 0; i < headingIds.length; i++) {
        if (visible[headingIds[i]]) {
          current = headingIds[i];
          break;
        }
      }
      for (var id in links) {
        if (Object.prototype.hasOwnProperty.call(links, id)) {
          links[id].classList.toggle("active", id === current);
        }
      }
    }

    tocObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) visible[entry.target.id] = true;
          else delete visible[entry.target.id];
        });
        highlight();
      },
      // 見出しがビューポート上部に来たら active にする。
      { rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );

    headingIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) tocObserver.observe(el);
    });
  }

  // ---- prev / next navigation ----
  function renderPageNav(route) {
    var nav = document.getElementById("page-nav");
    if (!nav) return;

    var idx = -1;
    for (var i = 0; i < navPages.length; i++) {
      if (navPages[i].route === route) {
        idx = i;
        break;
      }
    }
    if (idx === -1) {
      nav.innerHTML = "";
      return;
    }

    var prev = idx > 0 ? navPages[idx - 1] : null;
    var next = idx < navPages.length - 1 ? navPages[idx + 1] : null;
    var html = "";
    // 「← Prev / Next →」ラベルはリンクにしない（<a> の外に出す）。タイトルだけをリンクにする。
    // ラベルは設定ファイル由来なので、innerHTML へ入る以上はページタイトルと同様にエスケープする
    // （ここだけ素通しにすると html.labels が任意スクリプトの実行口になる）。
    if (prev) {
      html +=
        '<div class="page-nav-item page-nav-item-prev">' +
        '<span class="page-nav-dir">' +
        escapeHtml(LABELS.prev) +
        '</span><a class="page-nav-link page-nav-prev" data-route="' +
        escapeHtml(prev.route) +
        '" href="#' +
        escapeHtml(encodeURI(prev.route)) +
        '">' +
        escapeHtml(prev.title) +
        "</a></div>";
    } else {
      html += '<span class="page-nav-spacer"></span>';
    }
    if (next) {
      html +=
        '<div class="page-nav-item page-nav-item-next">' +
        '<span class="page-nav-dir">' +
        escapeHtml(LABELS.next) +
        '</span><a class="page-nav-link page-nav-next" data-route="' +
        escapeHtml(next.route) +
        '" href="#' +
        escapeHtml(encodeURI(next.route)) +
        '">' +
        escapeHtml(next.title) +
        "</a></div>";
    }
    nav.innerHTML = html;
  }

  // ---- search ----
  var SEARCH_LIMIT = 20;
  // フィールド別の重み。タイトル > 見出し > 本文の順で上位に出す。
  var SCORE_TITLE = 100;
  var SCORE_HEADING = 30;
  var SCORE_TEXT = 10;
  // 本文での繰り返し出現による加点（上限付き。本文量だけで見出し一致を逆転させない）。
  var SCORE_TEXT_REPEAT = 1;
  var MAX_TEXT_REPEAT = 5;
  // 複数語をそのままの並びで含む場合の加点（語順どおりの一致を優先する）。
  var SCORE_PHRASE_TITLE = 40;
  var SCORE_PHRASE_HEADING = 20;
  var SCORE_PHRASE_TEXT = 10;
  // スニペットの窓幅（文字数）と、一致位置の手前に残す文脈。
  var SNIPPET_WINDOW = 120;
  var SNIPPET_LEAD = 30;
  // 1 語あたりに数える出現回数の上限（巨大ページで全走査しないため）。
  var MAX_OCCURRENCES = 50;

  /**
   * 小文字化する。文脈依存の変換（ギリシャ語の語末シグマ `ΛΟΓΟΣ` → `λογος` など）を保つため
   * 文字列全体を変換し、長さが変わる文字（`İ` など）を含むときだけ、長さの変わる文字を
   * 畳まない文字単位の変換へフォールバックする。
   */
  function lowerKeepingLength(s) {
    var lower = s.toLowerCase();
    if (lower.length === s.length) return lower;
    return s.replace(/[A-Z\u00c0-\u1fff\uff21-\uff3a]/g, function (c) {
      var l = c.toLowerCase();
      return l.length === 1 ? l : c;
    });
  }

  // 全角英数字・記号（U+FF01–U+FF5E）を半角へ写す。1 文字 → 1 文字なので長さは変わらない。
  function toHalfWidth(s) {
    return s.replace(/[\uff01-\uff5e]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xfee0);
    });
  }

  /**
   * カタカナをひらがなへ写す。U+30A1–U+30F6 はひらがな U+3041–U+3096 と 1 対 1 に対応し、
   * 濁点付き（ガ → が）や ヴ・ヵ・ヶ もこの範囲に収まる。長音記号 ー（U+30FC）と、
   * 対応するひらがなを持たない ヷ–ヺ（U+30F7–U+30FA）は範囲外なのでそのまま残る。
   */
  function katakanaToHiragana(s) {
    return s.replace(/[\u30a1-\u30f6]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0x60);
    });
  }

  /**
   * 伸ばす記号と波線の書き分けを 1 文字へ寄せる。長音記号（ー）・ダッシュ類・全角ハイフン
   * （toHalfWidth で `-` になる）は同じ位置で書き分けられ、波ダッシュ（〜）と全角チルダ
   * （～。同じく `~` になる）は環境によって入れ替わるため、検索では区別しない。
   */
  function foldDashes(s) {
    return s.replace(/[\u2010-\u2015\u2212\u30fc]/g, "-").replace(/\u301c/g, "~");
  }

  /**
   * Half-width katakana (U+FF61–U+FF9F) as its full-width form, a voiced or semi-voiced mark composed
   * with the kana before it (ｶﾞ → ガ). Returns the folded string and, for each of its characters, the
   * range [start, end) of `s` it came from, since composing makes the two lengths differ.
   */
  function composeHalfWidthKana(s) {
    var out = "";
    var starts = [];
    var ends = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      var end = i + 1;
      if (c >= "｡" && c <= "ﾟ") {
        var next = s.charAt(i + 1);
        var pair = next === "ﾞ" || next === "ﾟ" ? (c + next).normalize("NFKC") : "";
        if (pair.length === 1) {
          c = pair;
          end = i + 2;
        } else {
          var single = c.normalize("NFKC");
          if (single.length === 1) c = single;
        }
      }
      out += c;
      starts.push(i);
      ends.push(end);
      i = end - 1;
    }
    return { folded: out, starts: starts, ends: ends };
  }

  /**
   * 検索用に文字列を畳む（小文字化 + 全角英数字 → 半角 + 半角カナ → 全角 + カタカナ → ひらがな +
   * 記号の書き分け）。半角カナの合成（ｶ + ﾞ → ガ）で長さが変わるので、畳んだ文字ごとに元の
   * 範囲 [starts[i], ends[i]) を持ち、ハイライトと抜粋はそれを通して原文の位置に戻す（v0.16）。
   */
  function foldField(s) {
    var text = String(s);
    var composed = composeHalfWidthKana(toHalfWidth(lowerKeepingLength(text)));
    return {
      text: text,
      folded: foldDashes(katakanaToHiragana(composed.folded)),
      starts: composed.starts,
      ends: composed.ends,
    };
  }

  function fold(s) {
    return foldField(s).folded;
  }

  // ---- loose matching (v0.16) ----
  // Besides the folded term, a looser pattern made from it is matched, never instead of it: what was
  // found before is found still. The page's text is left as it is; only the term is loosened, so the
  // match falls on the text as written. An English word is matched by its stem, and between two kanji
  // up to two kana of okurigana may be there or not, so `installing` finds `install` and `引き渡し`
  // finds `引渡し`, both ways.
  var KANJI = /[㐀-䶿一-鿿豈-﫿々]/;
  var HIRAGANA = /[ぁ-ゖ]/;
  // Okurigana is one or two kana; a longer run of kana between kanji is a word of its own.
  var OKURIGANA = "[ぁ-ゖ]{0,2}";

  /**
   * A light English stem, the same for every inflection of a word that keeps its spelling:
   * `install`, `installs`, `installed`, and `installing` are all `install`; `configure` and
   * `configuring` are `configur`. Matched as a substring, a stem finds each inflection.
   */
  function stemEnglish(word) {
    if (word.length < 4) return word;
    var w = word;
    var cut = function (suffix) {
      if (w.length - suffix.length >= 3 && w.slice(-suffix.length) === suffix) {
        w = w.slice(0, -suffix.length);
        return true;
      }
      return false;
    };
    if (w.slice(-3) === "ies" && w.length > 4) w = w.slice(0, -3) + "i";
    else if (!cut("ing") && !cut("ed") && !cut("es") && w.slice(-2) !== "ss") cut("s");
    if (w.length > 3 && w.slice(-1) === "e") w = w.slice(0, -1);
    if (w.slice(-1) === "y") w = w.slice(0, -1) + "i";
    var last = w.slice(-1);
    if (w.length > 3 && last === w.slice(-2, -1) && /[bdfgkmnprt]/.test(last)) w = w.slice(0, -1);
    return w;
  }

  /**
   * The loose pattern for a folded term, or null when it would find nothing the term does not: each
   * English word as its stem, and between two kanji the term's own okurigana left out and up to two
   * kana allowed instead.
   */
  var looseMatchers = Object.create(null);
  function looseMatcher(term) {
    if (term in looseMatchers) return looseMatchers[term];
    var pattern = "";
    var loosened = false;
    var i = 0;
    while (i < term.length) {
      var c = term.charAt(i);
      if (c >= "a" && c <= "z") {
        var j = i;
        while (j < term.length && term.charAt(j) >= "a" && term.charAt(j) <= "z") j++;
        var word = term.slice(i, j);
        var stem = stemEnglish(word);
        if (stem !== word) loosened = true;
        pattern += escapeRegExp(stem);
        i = j;
        continue;
      }
      pattern += escapeRegExp(c);
      if (KANJI.test(c)) {
        var run = i + 1;
        while (run < term.length && HIRAGANA.test(term.charAt(run)) && run - i <= 2) run++;
        if (run - i - 1 <= 2 && KANJI.test(term.charAt(run))) {
          pattern += OKURIGANA;
          loosened = true;
          i = run;
          continue;
        }
      }
      i++;
    }
    looseMatchers[term] = loosened ? new RegExp(pattern, "g") : null;
    return looseMatchers[term];
  }

  // A field a term matches only loosely scores this much less, so a page that spells the term as the
  // reader typed it comes first, and no tier (title, heading, text) is crossed.
  var LOOSE_PENALTY = 1;

  /** How a term is in a field: 2 as it is, 1 only loosely, 0 not at all. */
  function fieldMatch(field, term) {
    if (field.folded.indexOf(term) !== -1) return 2;
    var matcher = looseMatcher(term);
    if (!matcher) return 0;
    matcher.lastIndex = 0;
    return matcher.test(field.folded) ? 1 : 0;
  }

  // 空白区切りのクエリを語の配列にする（全角空白も \s に含まれる）。重複語は落とす。
  function tokenize(query) {
    var terms = [];
    fold(query)
      .split(/\s+/)
      .forEach(function (term) {
        if (term && terms.indexOf(term) === -1) terms.push(term);
      });
    return terms;
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * 語順どおりの一致を判定する正規表現を作る。語の間の空白は種類も個数も問わない
   * （全角空白・改行・連続空白を挟んでいても同じ並びとみなす）。
   */
  function phraseMatcher(terms) {
    return new RegExp(terms.map(escapeRegExp).join("\\s+"));
  }

  // 検索対象（畳んだ文字列）を初回検索時に一度だけ構築する。
  var searchIndex = null;
  function buildSearchIndex() {
    if (searchIndex) return searchIndex;
    searchIndex = navPages.map(function (p) {
      var title = p.title || "";
      var text = p.text || "";
      return {
        route: p.route,
        // A section number is matched as a whole and on its own, never folded into the title or
        // heading text: "3.2" asks for a section, and digits must not change how a word scores.
        number: typeof p.number === "string" ? fold(p.number) : "",
        title: foldField(title),
        text: foldField(text),
        headings: (p.headings || []).map(function (h) {
          var htext = h.text || "";
          return {
            id: h.id,
            number: typeof h.number === "string" ? fold(h.number) : "",
            text: foldField(htext),
          };
        }),
        // Each formula's TeX with the section it falls in: a query that matches a formula, and no
        // heading, opens the formula's section rather than the page's top.
        formulas: (p.formulas || []).map(function (f) {
          var tex = f.tex || "";
          return {
            folded: fold(tex),
            // Without its control words, for a term that is not one: "left" is prose, and should
            // not find every \left.
            foldedWords: fold(tex.replace(/\\[A-Za-z]+/g, " ")),
            section: f.section || null,
          };
        }),
      };
    });
    return searchIndex;
  }

  /**
   * Where a term occurs in a field, folded and loose, as ranges of the original text in document
   * order, at most `limit` from each reading (MAX_OCCURRENCES when omitted).
   */
  function occurrences(field, term, limit) {
    var max = typeof limit === "number" ? limit : MAX_OCCURRENCES;
    var found = [];
    var collect = function (reading, needle) {
      var from = 0;
      var count = 0;
      while (count < max) {
        var pos = reading.folded.indexOf(needle, from);
        if (pos === -1) break;
        found.push({ start: reading.starts[pos], end: reading.ends[pos + needle.length - 1] });
        from = pos + needle.length;
        count++;
      }
    };
    collect(field, term);
    var matcher = looseMatcher(term);
    if (matcher) {
      matcher.lastIndex = 0;
      var match;
      var count = 0;
      while (count < max && (match = matcher.exec(field.folded))) {
        if (match[0] === "") {
          matcher.lastIndex++;
          continue;
        }
        found.push({
          start: field.starts[match.index],
          end: field.ends[match.index + match[0].length - 1],
        });
        count++;
      }
    }
    found.sort(function (a, b) {
      return a.start - b.start || b.end - a.end;
    });
    // One occurrence found both ways is one occurrence.
    return found.filter(function (r, i) {
      return i === 0 || r.start !== found[i - 1].start;
    });
  }

  /**
   * 1 ページ分のスコアを求める。すべての語がいずれかのフィールドに含まれる場合のみ
   * 結果に残す（AND 検索）。一致しない語があれば null を返す。
   */
  function scoreEntry(entry, terms, phrase) {
    var score = 0;
    var textHits = [];
    // 見出し ID → 一致した語数。最も多くの語に一致した見出しへ飛ばす。
    // キーが Object.prototype のプロパティ名（"constructor" など）でも壊れないよう
    // プロトタイプ無しのマップを使う。
    var headingHits = Object.create(null);
    // 見出し ID → 番号が語と完全に一致したか。番号で探した読者はその節へ行きたいので、
    // 見出しの本文が語を含むだけの見出しより優先する。
    var numberHits = Object.create(null);
    var pageNumberHit = false;
    // Section ID → the number of terms a formula in it matched ("" for before the first heading).
    var formulaHits = Object.create(null);

    for (var i = 0; i < terms.length; i++) {
      var term = terms[i];
      var matched = false;

      var pageNumberMatched = Boolean(entry.number) && entry.number === term;
      if (pageNumberMatched) pageNumberHit = true;
      var titleMatch = pageNumberMatched ? 2 : fieldMatch(entry.title, term);
      if (titleMatch > 0) {
        score += SCORE_TITLE - (titleMatch === 1 ? LOOSE_PENALTY : 0);
        matched = true;
      }

      var headingMatch = 0;
      entry.headings.forEach(function (h) {
        var numberMatched = Boolean(h.number) && h.number === term;
        var match = numberMatched ? 2 : fieldMatch(h.text, term);
        if (match === 0) return;
        if (numberMatched) numberHits[h.id] = true;
        headingHits[h.id] = (headingHits[h.id] || 0) + 1;
        headingMatch = Math.max(headingMatch, match);
      });
      if (headingMatch > 0) {
        score += SCORE_HEADING - (headingMatch === 1 ? LOOSE_PENALTY : 0);
        matched = true;
      }

      // Each term counts once per section, however many of the section's formulas it is in.
      var termSections = Object.create(null);
      entry.formulas.forEach(function (f) {
        // A term with a backslash in it is TeX (`\\frac`, a pasted `e^{i\\pi}`); one without is a word.
        var tex = term.indexOf("\\") !== -1 ? f.folded : f.foldedWords;
        if (tex.indexOf(term) === -1) return;
        var key = f.section || "";
        if (termSections[key]) return;
        termSections[key] = true;
        formulaHits[key] = (formulaHits[key] || 0) + 1;
      });

      var positions = occurrences(entry.text, term).map(function (r) {
        return r.start;
      });
      if (positions.length > 0) {
        score += SCORE_TEXT + Math.min(positions.length - 1, MAX_TEXT_REPEAT) * SCORE_TEXT_REPEAT;
        if (entry.text.folded.indexOf(term) === -1) score -= LOOSE_PENALTY;
        textHits.push({ term: term, positions: positions });
        matched = true;
      }

      if (!matched) return null;
    }

    if (phrase) {
      if (phrase.test(entry.title.folded)) score += SCORE_PHRASE_TITLE;
      else if (
        entry.headings.some(function (h) {
          return phrase.test(h.text.folded);
        })
      )
        score += SCORE_PHRASE_HEADING;
      else if (phrase.test(entry.text.folded)) score += SCORE_PHRASE_TEXT;
    }

    return {
      score: score,
      textHits: textHits,
      headingHits: headingHits,
      numberHits: numberHits,
      pageNumberHit: pageNumberHit,
      formulaHits: formulaHits,
    };
  }

  /**
   * 最も多くの語に一致した見出しを選ぶ（同数なら文書順で先のもの）。番号が語と完全に一致した
   * 見出しがあれば、その中から選ぶ。ページ自身の番号が一致し、見出しの番号はどれも一致しない
   * ときは、見出しではなくページの先頭へ飛ばす（そのページを番号で探したのだから）。
   */
  function bestHeading(entry, scored) {
    var headingHits = scored.headingHits;
    var numberHits = scored.numberHits;
    var anyNumberHit = entry.headings.some(function (h) {
      return numberHits[h.id];
    });
    if (!anyNumberHit && scored.pageNumberHit) return null;
    var best = null;
    var bestCount = 0;
    entry.headings.forEach(function (h) {
      if (anyNumberHit && !numberHits[h.id]) return;
      var count = headingHits[h.id] || 0;
      if (count > bestCount) {
        best = h;
        bestCount = count;
      }
    });
    if (best || anyNumberHit) return best;
    // No heading matched: a formula that did opens its section (the one most terms matched in, the
    // first in document order on a tie); one before the first heading leaves the page's top.
    var formulaBest = null;
    var formulaCount = 0;
    entry.formulas.forEach(function (f) {
      var count = scored.formulaHits[f.section || ""] || 0;
      if (count > formulaCount) {
        formulaBest = f.section;
        formulaCount = count;
      }
    });
    if (!formulaBest) return null;
    var section = null;
    entry.headings.forEach(function (h) {
      if (!section && h.id === formulaBest) section = h;
    });
    return section;
  }

  /**
   * Return the ranges of [start, end) of a field's original text where a term matches, folded or
   * loose, in document order: the result list HTML and the in-body highlight mark the text as
   * written, whatever folding found it. `limit` caps how many matches are collected per term and
   * reading (unlimited when omitted); a single text node can hold a whole paragraph or code block, so
   * the in-body highlight stops collecting once it has enough instead of gathering every occurrence
   * and discarding the surplus. Merging only ever reduces the count, so a limit yields the same
   * ranges from the start of the range.
   */
  function matchRanges(field, terms, start, end, limit) {
    var max = typeof limit === "number" ? limit : Infinity;
    var ranges = [];
    terms.forEach(function (term) {
      occurrences(field, term, max).forEach(function (r) {
        if (r.end <= start || r.start >= end) return;
        ranges.push({ start: Math.max(r.start, start), end: Math.min(r.end, end) });
      });
    });
    // 語同士が重なる場合（部分文字列を含むクエリ）に <mark> が入れ子にならないよう束ねる。
    ranges.sort(function (a, b) {
      return a.start - b.start;
    });
    var merged = [];
    ranges.forEach(function (r) {
      var last = merged[merged.length - 1];
      if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
      else merged.push({ start: r.start, end: r.end });
    });
    return merged;
  }

  // [start, end) の範囲を、語の一致部分だけ <mark> で囲んだエスケープ済み HTML にする。
  function markRange(field, terms, start, end) {
    var text = field.text;
    var html = "";
    var cursor = start;
    matchRanges(field, terms, start, end).forEach(function (r) {
      html += escapeHtml(text.slice(cursor, r.start));
      html += "<mark>" + escapeHtml(text.slice(r.start, r.end)) + "</mark>";
      cursor = r.end;
    });
    return html + escapeHtml(text.slice(cursor, end));
  }

  function markMatches(field, terms) {
    return markRange(field, terms, 0, field.text.length);
  }

  /**
   * 本文から抜粋を作る。最も多くの語が近接して現れる窓を選び、その中の一致語を強調する。
   * 本文に語が無い（タイトル・見出しだけの一致）場合は本文の先頭を返す。
   */
  function snippet(entry, terms, textHits) {
    var text = entry.text.text;
    if (!text) return "";

    var start = 0;
    if (textHits.length > 0) {
      var candidates = [];
      textHits.forEach(function (hit) {
        hit.positions.forEach(function (pos) {
          candidates.push({ pos: pos, term: hit.term });
        });
      });
      candidates.sort(function (a, b) {
        return a.pos - b.pos;
      });

      // 位置順に並んだ一致を幅 SNIPPET_WINDOW の窓で走査し、含む語の種類が最も多い
      // 窓の先頭を採用する（同数なら先に現れる窓）。
      var bestPos = candidates[0].pos;
      var bestCount = 0;
      var counts = Object.create(null);
      var distinct = 0;
      var windowEnd = 0;
      for (var i = 0; i < candidates.length; i++) {
        while (
          windowEnd < candidates.length &&
          candidates[windowEnd].pos < candidates[i].pos + SNIPPET_WINDOW
        ) {
          var addTerm = candidates[windowEnd].term;
          if (!counts[addTerm]) distinct++;
          counts[addTerm] = (counts[addTerm] || 0) + 1;
          windowEnd++;
        }
        if (distinct > bestCount) {
          bestCount = distinct;
          bestPos = candidates[i].pos;
        }
        var dropTerm = candidates[i].term;
        counts[dropTerm]--;
        if (counts[dropTerm] === 0) distinct--;
      }
      start = Math.max(0, bestPos - SNIPPET_LEAD);
    }

    var end = Math.min(text.length, start + SNIPPET_WINDOW + SNIPPET_LEAD);
    return (
      (start > 0 ? "…" : "") +
      markRange(entry.text, terms, start, end) +
      (end < text.length ? "…" : "")
    );
  }

  // The number when one of the terms is exactly it, for sectionNumberHtml to mark.
  function matchedNumber(number, terms) {
    return number && terms.indexOf(number) !== -1 ? number : "";
  }

  function search(query) {
    var terms = tokenize(query);
    if (terms.length === 0) return [];
    // 語をそのままの並びで含む場合の加点用（単語 1 つのときは通常の一致と同じなので使わない）。
    var phrase = terms.length > 1 ? phraseMatcher(terms) : null;

    var results = [];
    buildSearchIndex().forEach(function (entry, index) {
      var scored = scoreEntry(entry, terms, phrase);
      if (!scored) return;
      var heading = bestHeading(entry, scored);
      results.push({
        route: entry.route,
        title:
          sectionNumberHtml(entry.number, matchedNumber(entry.number, terms)) +
          markMatches(entry.title, terms),
        headingId: heading ? heading.id : null,
        heading: heading
          ? sectionNumberHtml(heading.number, matchedNumber(heading.number, terms)) +
            markMatches(heading.text, terms)
          : "",
        snippet: snippet(entry, terms, scored.textHits),
        score: scored.score,
        numberHit: scored.pageNumberHit || Object.keys(scored.numberHits).length > 0,
        index: index,
      });
    });

    // 番号が語と完全に一致した結果が先。番号で探した読者が求めているのはその節であり、
    // 別のページが同じ数字を何度書いていても、点数で上回らせない。次にスコア降順、
    // 同点は閲覧順（文書順）を保つ。番号の一致が無い検索の順位は変わらない。
    results.sort(function (a, b) {
      return Number(b.numberHit) - Number(a.numberHit) || b.score - a.score || a.index - b.index;
    });
    return results.slice(0, SEARCH_LIMIT);
  }

  // ---- in-body highlight ----
  // Keywords to mark in the body of the page a result opened. Valid until the query changes.
  var bodyHighlightTerms = [];
  // The class of a highlight (colour only) and the mark of one this script created. What a mark is
  // removed by is the DOM property, not the class: a document carries <mark> of its own (AsciiDoc
  // `#text#`) and can carry any class in raw HTML, and, as with the option IDs, the name is not
  // assumed to be reserved. A property cannot be authored into the document, so the two cannot be
  // confused.
  var BODY_HIGHLIGHT_CLASS = "search-hit";
  var BODY_HIGHLIGHT_FLAG = "__monodocsSearchHit";
  // Upper bound on the marks per page, so a keyword that occurs everywhere cannot flood the DOM.
  var MAX_BODY_HIGHLIGHTS = 500;
  // Subtrees left alone. A formula is MathML, which a <mark> cannot sit inside; a Mermaid block is
  // source the runtime reads and replaces with a diagram (an svg); and the code-block toolbar and
  // its copy toast are UI text the theme injects.
  var BODY_HIGHLIGHT_SKIP_TAGS = ["SVG", "MATH", "SCRIPT", "STYLE", "TEXTAREA", "CANVAS"];
  var BODY_HIGHLIGHT_SKIP_CLASSES = ["mermaid", "code-toolbar", "code-copied-toast"];
  // The section number core put in a heading. It is matched only as a whole (see scoreEntry), so
  // marking "1" inside "13.2" would show a match search did not make. Recognised by an attribute
  // core sets rather than by the class, which a document's own markup may also use.
  var SECTION_NUMBER_ATTRIBUTE = "data-monodocs-section-number";

  function skipsBodyHighlight(el) {
    // An SVG element keeps its lower-case tagName, so compare in one case.
    if (BODY_HIGHLIGHT_SKIP_TAGS.indexOf(String(el.tagName).toUpperCase()) !== -1) return true;
    if (el.hasAttribute && el.hasAttribute(SECTION_NUMBER_ATTRIBUTE)) return true;
    for (var i = 0; i < BODY_HIGHLIGHT_SKIP_CLASSES.length; i++) {
      if (el.classList && el.classList.contains(BODY_HIGHLIGHT_SKIP_CLASSES[i])) return true;
    }
    return false;
  }

  /** The article of the page on display (null when there is none). */
  function visibleArticle() {
    var articles = document.querySelectorAll("#content article[data-route]");
    for (var i = 0; i < articles.length; i++) {
      if (!articles[i].hidden) return articles[i];
    }
    return null;
  }

  /**
   * Remove the highlight and put the text back. normalize() merges the text nodes the marking split
   * apart, so marking and unmarking repeatedly does not shred the body into ever smaller nodes; it
   * restores the structure and the node count, not the identity of the original nodes.
   */
  function clearBodyHighlight() {
    document
      .querySelectorAll("#content mark." + BODY_HIGHLIGHT_CLASS)
      .forEach(function (highlight) {
        // Content that happens to use the class stays; only marks this script created are removed.
        if (!highlight[BODY_HIGHLIGHT_FLAG]) return;
        var parent = highlight.parentNode;
        if (!parent) return;
        parent.replaceChild(document.createTextNode(highlight.textContent || ""), highlight);
        if (typeof parent.normalize === "function") parent.normalize();
      });
  }

  /** Wrap the matches in a text node with <mark>. Returns how many were wrapped. */
  function highlightTextNode(node, terms, budget) {
    var text = node.nodeValue;
    if (!text || !text.trim()) return 0;
    // Anything past the budget would be discarded, so stop collecting at budget matches per term.
    var ranges = matchRanges(foldField(text), terms, 0, text.length, budget);
    if (ranges.length === 0) return 0;
    if (ranges.length > budget) ranges = ranges.slice(0, budget);
    var parent = node.parentNode;
    if (!parent) return 0;

    var frag = document.createDocumentFragment();
    var cursor = 0;
    ranges.forEach(function (r) {
      if (r.start > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, r.start)));
      var highlight = document.createElement("mark");
      highlight.className = BODY_HIGHLIGHT_CLASS;
      highlight[BODY_HIGHLIGHT_FLAG] = true;
      highlight.textContent = text.slice(r.start, r.end);
      frag.appendChild(highlight);
      cursor = r.end;
    });
    if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
    parent.replaceChild(frag, node);
    return ranges.length;
  }

  /** Mark the text below an element. Returns the remaining budget. */
  function highlightElement(el, terms, budget) {
    var child = el.firstChild;
    while (child && budget > 0) {
      // A text node is replaced, so keep where to continue before touching it.
      var next = child.nextSibling;
      if (child.nodeType === 3) budget -= highlightTextNode(child, terms, budget);
      else if (child.nodeType === 1 && !skipsBodyHighlight(child))
        budget = highlightElement(child, terms, budget);
      child = next;
    }
    return budget;
  }

  /**
   * Mark the keywords of the opened result in the body of the page on display. The keywords and the
   * folding are the result list's, so what the list highlighted is what the body highlights. Only
   * the background changes, so neither the line breaks nor the scroll position that follows move.
   */
  function applyBodyHighlight() {
    clearBodyHighlight();
    if (bodyHighlightTerms.length === 0) return;
    var article = visibleArticle();
    if (article) highlightElement(article, bodyHighlightTerms, MAX_BODY_HIGHLIGHTS);
  }

  // ---- search UI ----
  // 結果一覧の option id 接頭辞。setupSearch で本文の ID と重ならないものに確定する。
  var searchOptionIdPrefix = "monodocs-search-option-";
  // キーボードで選択中の結果の位置（-1 は未選択）。
  var searchActive = -1;

  /**
   * 本文のどの ID とも先頭が一致しない接頭辞を選ぶ。ページの ID と見出しの組み合わせ次第で
   * `monodocs-search-option-0` のような ID は実際に生成されうる（`monodocs-search.md` の
   * 見出し `Option 0` など）。重複すると、その ID を指すアンカー遷移で `getElementById` が
   * 文書順で先にある結果一覧側の要素を拾い、対象ページへ切り替わらなくなる。
   */
  function resolveSearchOptionIdPrefix() {
    var ids = document.querySelectorAll("[id]");
    var prefix = searchOptionIdPrefix;
    var collides = true;
    while (collides) {
      collides = false;
      for (var i = 0; i < ids.length; i++) {
        if (ids[i].id.indexOf(prefix) === 0) {
          collides = true;
          break;
        }
      }
      if (collides) prefix += "x-";
    }
    return prefix;
  }

  function searchOptions() {
    var box = document.getElementById("search-results");
    if (!box) return [];
    return Array.prototype.slice.call(box.querySelectorAll("a[data-route]"));
  }

  /**
   * 選択位置を設定する。フォーカスは検索欄に残したまま `aria-activedescendant` で
   * 読み上げ位置だけを移すため、選択後もそのまま入力を続けられる。
   */
  function setSearchActive(index) {
    var input = document.getElementById("search-input");
    var options = searchOptions();
    searchActive = index;
    options.forEach(function (a, i) {
      var selected = i === index;
      a.setAttribute("aria-selected", selected ? "true" : "false");
      // 長い結果一覧でも選択位置が画面外に出ないようにする。
      if (selected && typeof a.scrollIntoView === "function")
        a.scrollIntoView({ block: "nearest" });
    });
    if (!input) return;
    if (index >= 0 && options[index]) {
      input.setAttribute("aria-activedescendant", options[index].id);
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  // 選択位置を上下に動かす。端では反対側へ回り込む。
  function moveSearchActive(delta) {
    var options = searchOptions();
    if (options.length === 0) return;
    var next = searchActive + delta;
    if (next < 0) next = options.length - 1;
    if (next >= options.length) next = 0;
    setSearchActive(next);
  }

  // 結果を開く。クリックとキーボードで同じ経路を通す。
  function activateSearchResult(a) {
    if (!a) return;
    // Mark the same keywords in the body of the page this opens. Valid until the query changes
    // (renderSearchResults drops it).
    var input = document.getElementById("search-input");
    bodyHighlightTerms = input ? tokenize(input.value) : [];
    var route = a.getAttribute("data-route");
    var current = visibleArticle();
    var headingId = a.getAttribute("data-heading");
    if (headingId) navigateToAnchor(headingId);
    else navigateTo(route, null);
    // When the page changes, the showPage that follows marks it. Jumping inside the page already on
    // display may not go through showPage at all, so mark it here.
    if (current && current.getAttribute("data-route") === route) applyBodyHighlight();
    // 狭い画面では、開いた本文がドロワーの陰に隠れたままにならないよう閉じる。クリックは
    // setupSidebarAutoClose も閉じるが（結果一覧はサイドバーの中）、キーボードの Enter は
    // click を出さないのでそこを通らない。閉じる側でフォーカスもサイドバーの外へ移る。
    if (isNarrow() && document.body.classList.contains("sidebar-open")) setSidebarCollapsed(true);
  }

  function renderSearchResults(query) {
    var box = document.getElementById("search-results");
    var nav = document.getElementById("sidebar-nav");
    var input = document.getElementById("search-input");
    if (!box) return;

    // 一覧を作り直すたびに選択は解除する（結果が変われば選択位置の意味も変わる）。
    searchActive = -1;
    if (input) input.removeAttribute("aria-activedescendant");
    // Once the query changes, the highlight on the open page belongs to the previous search. Drop it.
    bodyHighlightTerms = [];
    clearBodyHighlight();

    if (!query.trim()) {
      box.hidden = true;
      box.innerHTML = "";
      if (nav) nav.hidden = false;
      if (input) input.setAttribute("aria-expanded", "false");
      return;
    }

    var results = search(query);
    if (nav) nav.hidden = true;
    box.hidden = false;

    if (results.length === 0) {
      box.innerHTML = '<li class="search-empty">' + escapeHtml(LABELS.noResults) + "</li>";
      if (input) input.setAttribute("aria-expanded", "false");
      return;
    }
    if (input) input.setAttribute("aria-expanded", "true");

    var html = "";
    results.forEach(function (r, i) {
      // 見出しに一致した結果はその見出しへ直接飛ばす（アンカー hash はルータが
      // 該当要素を含むページへ解決する）。タイトル・本文だけの一致はページ先頭。
      var target = r.headingId || r.route;
      // listbox の子は option として扱われる必要があるため、li は presentation にして
      // リンク自身を option にする。リンクは Tab 順から外し、上下キーで辿る。
      html +=
        '<li class="search-result" role="presentation"><a id="' +
        searchOptionIdPrefix +
        i +
        '" role="option" aria-selected="false" tabindex="-1" data-route="' +
        escapeHtml(r.route) +
        '"' +
        (r.headingId ? ' data-heading="' + escapeHtml(r.headingId) + '"' : "") +
        ' href="#' +
        escapeHtml(encodeURI(target)) +
        '"><span class="search-result-title">' +
        r.title +
        "</span>" +
        (r.heading ? '<span class="search-result-heading">' + r.heading + "</span>" : "") +
        (r.snippet ? '<span class="search-result-snippet">' + r.snippet + "</span>" : "") +
        "</a></li>";
    });
    box.innerHTML = html;

    box.querySelectorAll("a[data-route]").forEach(function (a, i) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        activateSearchResult(a);
      });
      // ポインタで指した項目をキーボードの選択位置に合わせ、両操作の現在地を一致させる。
      a.addEventListener("mousemove", function () {
        if (searchActive !== i) setSearchActive(i);
      });
    });
  }

  function setupSearch() {
    var input = document.getElementById("search-input");
    var box = document.getElementById("search-results");
    if (!input) return;
    // combobox として関連付ける。テンプレートを差し替えたテーマでも属性が付くよう、
    // マークアップではなくここで設定する。
    if (box) {
      box.setAttribute("role", "listbox");
      if (!box.getAttribute("aria-label")) box.setAttribute("aria-label", LABELS.searchResults);
      input.setAttribute("role", "combobox");
      input.setAttribute("aria-controls", box.id);
      input.setAttribute("aria-autocomplete", "list");
      input.setAttribute("aria-expanded", "false");
    }
    // 結果を描画する前に、本文の ID と衝突しない接頭辞を決めておく。
    searchOptionIdPrefix = resolveSearchOptionIdPrefix();
    input.addEventListener("input", function () {
      renderSearchResults(input.value);
    });
    input.addEventListener("keydown", function (e) {
      // IME の変換中は上下キーが候補選択、Enter が確定に割り当てられている。keydown は
      // 変換中も届くため、ここで横取りすると日本語入力そのものが壊れ、未確定の文字列で
      // 結果を開いてしまう。keyCode 229 は isComposing を出さない環境向けの保険。
      if (e.isComposing || e.keyCode === 229) return;

      if (e.key === "Escape") {
        input.value = "";
        renderSearchResults("");
        // 狭い画面では、この Escape は document まで届いてドロワーも閉じる。閉じる側が
        // サイドバー外（再表示ボタン）へフォーカスを移すので、ここで blur してしまうと
        // その移動先が失われ、フォーカスが body に落ちて読者は現在地を見失う。
        if (!(isNarrow() && document.body.classList.contains("sidebar-open"))) input.blur();
        return;
      }
      // Home / End はテキスト入力のキャレット移動に残す（結果一覧には割り当てない）。
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveSearchActive(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveSearchActive(-1);
      } else if (e.key === "Enter") {
        // 未選択のまま Enter を押したときは先頭の結果を開く（入力直後の既定の意図）。
        var options = searchOptions();
        var target = searchActive >= 0 ? options[searchActive] : options[0];
        if (target) {
          e.preventDefault();
          activateSearchResult(target);
        }
      }
    });
  }

  /** 文字入力中の要素か（素のキーをショートカットに横取りしてよいかの判断）。 */
  function isEditable(el) {
    if (!el) return false;
    var tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return el.isContentEditable === true;
  }

  /** モーダルが開いている間か（画像 lightbox など。背後へフォーカスを移さない）。 */
  function modalOpen() {
    return !!document.querySelector("dialog[open]");
  }

  /**
   * 検索欄へフォーカスを移す。移せたら true。
   *
   * サイドバーが閉じていれば先に開く。閉じたサイドバーの検索欄は不可視で
   * （狭い画面のドロワーは visibility: hidden、広い画面の折りたたみは display: none）、
   * そのまま focus() を呼んでも何も起こらないため、ショートカットが黙って無反応になる。
   */
  function focusSearch() {
    var input = document.getElementById("search-input");
    if (!input || typeof input.focus !== "function") return false;
    if (!sidebarExpanded()) setSidebarCollapsed(false);
    input.focus();
    // 入力済みの語をまとめて選択する。続けて打てば置き換わり、前の検索語を消す手間がない。
    if (typeof input.select === "function") input.select();
    return true;
  }

  /**
   * K の打鍵か。ラテン文字以外の配列（キリル文字など）では K の位置を押しても `key` は
   * 別の文字になるため、そのときだけ物理位置（`code`）で見る。ラテン文字が出る配列で
   * 位置を見てはいけない。Dvorak では K の位置が `v` を出すので、貼り付け（Ctrl+V）を
   * 横取りしてしまう。
   */
  function isKKey(e) {
    if (e.key === "k" || e.key === "K") return true;
    if (typeof e.key === "string" && /^[A-Za-z]$/.test(e.key)) return false;
    return e.code === "KeyK";
  }

  /**
   * AltGr を押して出した文字か。Windows は AltGr を ctrlKey + altKey として報告するため、
   * これを「修飾キー付き」として弾くと、AltGr でしか `/` を打てない配列（ドイツ語など）で
   * ショートカットが一度も発火しなくなる。
   */
  function viaAltGraph(e) {
    if (typeof e.getModifierState === "function" && e.getModifierState("AltGraph")) return true;
    return e.ctrlKey && e.altKey;
  }

  /**
   * 検索欄を呼び出すキーボードショートカット。目次が長くても検索欄は流れないが、
   * 本文を読んでいる位置からはなお遠い。読んでいる手を動かさずに検索へ入れるようにする。
   *
   * `/` は素の打鍵なので、文字を入力できる場所では横取りしない。⌘K はどこからでも
   * 効かせる（検索欄の中で押せば入力済みの語を選び直せる）。Ctrl+K だけは入力中を避ける。
   * macOS の Ctrl+K は入力欄で「行末まで削除」に割り当てられた標準の編集操作で、
   * そこを奪うと編集手段が減る。macOS には ⌘K があるので失うものはない。
   */
  function setupSearchShortcut() {
    document.addEventListener("keydown", function (e) {
      // IME の変換中は「/」も変換対象のキー入力で、Ctrl+K を変換操作に割り当てる
      // 入力方式もある。keydown は変換中も届くため、ここで横取りすると日本語入力が壊れる。
      if (e.isComposing || e.keyCode === 229) return;
      if (modalOpen()) return;

      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && isKKey(e)) {
        if (e.ctrlKey && !e.metaKey && isEditable(document.activeElement)) return;
        if (focusSearch()) e.preventDefault();
        return;
      }

      if (e.key !== "/") return;
      if (!viaAltGraph(e) && (e.ctrlKey || e.metaKey || e.altKey)) return;
      if (isEditable(document.activeElement)) return;
      if (focusSearch()) e.preventDefault();
    });
  }

  // ---- dark mode ----
  function applyTheme(theme) {
    var root = document.documentElement;
    if (theme === "dark" || theme === "light") {
      root.setAttribute("data-theme", theme);
    } else {
      root.removeAttribute("data-theme");
    }
    var btn = document.getElementById("theme-toggle");
    if (btn) {
      var dark = root.getAttribute("data-theme") === "dark";
      var icon = btn.querySelector(".theme-toggle-icon");
      if (icon) icon.textContent = dark ? "☀️" : "🌙";
      btn.setAttribute("aria-pressed", dark ? "true" : "false");
    }
  }

  function storedTheme() {
    try {
      return window.localStorage.getItem(STORAGE_THEME);
    } catch (e) {
      return null;
    }
  }

  function storeTheme(theme) {
    try {
      window.localStorage.setItem(STORAGE_THEME, theme);
    } catch (e) {
      // localStorage 不可（プライベートモード等）でも致命的ではない。
    }
  }

  function setupTheme() {
    // 読者が一度切り替えていれば localStorage の選択を最優先。未選択なら設定ファイル由来の
    // 初期配色（既定 "light"）を使う。"auto" や未知値は applyTheme 側で data-theme を外し
    // OS の prefers-color-scheme に追従する。
    applyTheme(storedTheme() || data.colorScheme);
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var prefersDark =
        window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      var current =
        document.documentElement.getAttribute("data-theme") || (prefersDark ? "dark" : "light");
      var next = current === "dark" ? "light" : "dark";
      applyTheme(next);
      storeTheme(next);
    });
  }

  // ---- content width ----
  function storedContentWidth() {
    try {
      return window.localStorage.getItem(STORAGE_CONTENT_WIDTH);
    } catch (e) {
      return null;
    }
  }

  function storeContentWidth(width) {
    try {
      window.localStorage.setItem(STORAGE_CONTENT_WIDTH, width);
    } catch (e) {
      // localStorage を利用できなくても、このページ内での切り替えは維持する。
    }
  }

  function applyContentWidth(width) {
    var wide = width === "wide";
    document.body.classList.toggle("content-wide", wide);
    var btn = document.getElementById("content-width-toggle");
    if (btn) {
      btn.setAttribute("aria-pressed", wide ? "true" : "false");
      btn.title = wide ? LABELS.useStandardContent : LABELS.useWideContent;
    }
  }

  function setupContentWidth() {
    var btn = document.getElementById("content-width-toggle");
    if (!btn) {
      // 著者がトグルを無効化した場合は、同じ origin に残った読者設定も適用しない。
      document.body.classList.remove("content-wide");
      return;
    }
    // Prefer the reader's stored choice; otherwise use the configured initial state.
    applyContentWidth(storedContentWidth() || data.contentWidthDefault);
    btn.addEventListener("click", function () {
      var next = document.body.classList.contains("content-wide") ? "standard" : "wide";
      applyContentWidth(next);
      storeContentWidth(next);
    });
  }

  // ---- sidebar collapse ----
  // 折りたたみボタンはサイドバー内（テーマ切替の隣）、再表示ボタンは折りたたみ時のみ
  // 表示される固定ボタン。
  /**
   * ドロワー表示になる幅かどうか（CSS の `@media (max-width: 768px)` と一致させる）。
   * 広い画面ではサイドバーは常設なので、外側クリックや Esc で閉じない。
   */
  function isNarrow() {
    return (
      typeof window.matchMedia === "function" && window.matchMedia("(max-width: 768px)").matches
    );
  }

  // 狭い画面のドロワーを閉じたことによる折りたたみか（画面が広がったら解除する）。
  var drawerCollapsed = false;

  /** 現在の画面幅における、サイドバーが開いているか。 */
  function sidebarExpanded() {
    return isNarrow()
      ? document.body.classList.contains("sidebar-open")
      : !document.body.classList.contains("sidebar-collapsed");
  }

  /**
   * サイドバーの開閉状態を切り替える。表示（クラス）と支援技術向けの状態
   * （aria-expanded）が食い違わないよう、開閉はすべてこの関数を通す。
   *
   * 狭い画面のドロワー開閉（sidebar-open）と、広い画面の折りたたみ（sidebar-collapsed）は
   * 別の状態として扱う。ドロワーを閉じただけで折りたたみ状態にすると、画面を広げたときに
   * 常設のはずのサイドバーが消えたままになる。
   */
  function setSidebarCollapsed(collapsed) {
    var body = document.body;
    body.classList.toggle("sidebar-collapsed", collapsed);
    // 狭い画面ではドロワーとして重ねる。sidebar-collapsed も併せて扱うのは、
    // style.css だけを差し替えたカスタムテーマ（ドロワー用の指定を持たない）でも
    // 従来どおり閉じられるようにするため。
    body.classList.toggle("sidebar-open", isNarrow() && !collapsed);
    // 狭い画面で閉じた分の折りたたみは画面が広がった時点で解除する（広い画面では
    // サイドバーは常設のため、そのままだと消えたままになる）。
    drawerCollapsed = isNarrow() && collapsed;
    if (collapsed) restoreFocusFromSidebar();
    syncSidebarExpandedState();
  }

  /**
   * 閉じたサイドバー内にフォーカスが残らないようにする。閉じたサイドバーは
   * 不可視なので、そこにフォーカスがあるとキーボード操作の現在地を見失う。
   */
  function restoreFocusFromSidebar() {
    var sidebar = document.getElementById("sidebar");
    var active = document.activeElement;
    if (!sidebar || !active || !sidebar.contains(active)) return;
    var showBtn = document.getElementById("sidebar-show");
    if (showBtn && typeof showBtn.focus === "function") showBtn.focus();
    else if (typeof active.blur === "function") active.blur();
  }

  /**
   * ボタンの aria-expanded を実際の見え方に合わせる。狭い画面ではドロワーが CSS で
   * 閉じているため、テンプレートの初期値（aria-expanded="true"）のままだと支援技術に
   * 開いていると伝わってしまう。画面幅が変われば開閉の意味も変わるので都度求め直す。
   */
  function syncSidebarExpandedState() {
    var expanded = sidebarExpanded() ? "true" : "false";
    ["sidebar-toggle", "sidebar-show"].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.setAttribute("aria-expanded", expanded);
    });
  }

  function setupSidebarToggle() {
    var hideBtn = document.getElementById("sidebar-toggle");
    var showBtn = document.getElementById("sidebar-show");
    var setCollapsed = setSidebarCollapsed;
    syncSidebarExpandedState();
    // 画面幅が変わればドロワー／常設が切り替わるので、状態を作り直す。
    if (typeof window.matchMedia === "function") {
      var mq = window.matchMedia("(max-width: 768px)");
      if (typeof mq.addEventListener === "function") {
        mq.addEventListener("change", function () {
          if (!isNarrow() && drawerCollapsed) {
            // ドロワーを閉じたまま画面が広がった場合。常設表示へ戻す。
            document.body.classList.remove("sidebar-collapsed");
            drawerCollapsed = false;
          }
          if (!isNarrow()) document.body.classList.remove("sidebar-open");
          syncSidebarExpandedState();
        });
      }
    }
    if (hideBtn)
      hideBtn.addEventListener("click", function () {
        setCollapsed(true);
      });
    if (showBtn)
      showBtn.addEventListener("click", function () {
        setCollapsed(false);
      });
    // ドロワー表示時は、本文側（オーバーレイ）のクリックで閉じる。
    document.addEventListener("click", function (e) {
      if (!isNarrow() || !document.body.classList.contains("sidebar-open")) return;
      var sidebar = document.getElementById("sidebar");
      var target = e.target;
      if (sidebar && target instanceof Node && sidebar.contains(target)) return;
      if (showBtn && target instanceof Node && showBtn.contains(target)) return;
      setCollapsed(true);
    });
    // Esc でも閉じられるようにする（ドロワーは本文を覆うため）。
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isNarrow() && document.body.classList.contains("sidebar-open")) {
        setCollapsed(true);
      }
    });
  }

  /** 狭い画面でサイドバー内のリンクを押したら、ドロワーを閉じて本文を見せる。 */
  function setupSidebarAutoClose() {
    var sidebar = document.getElementById("sidebar");
    if (!sidebar) return;
    sidebar.addEventListener("click", function (e) {
      var target = e.target;
      var link = target && target.closest ? target.closest("a[href]") : null;
      if (!link) return;
      if (!isNarrow() || !document.body.classList.contains("sidebar-open")) return;
      setSidebarCollapsed(true);
    });
  }

  // ディレクトリ見出しのクリックで子ツリーを開閉する。
  function setupSidebarDirs() {
    var titles = document.querySelectorAll("#sidebar-nav .sidebar-dir-title");
    titles.forEach(function (title) {
      title.setAttribute("role", "button");
      title.setAttribute("tabindex", "0");
      function toggle() {
        var li = title.parentElement;
        if (li) li.classList.toggle("collapsed");
      }
      title.addEventListener("click", toggle);
      title.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });
    });
  }

  // ---- code blocks (copy / wrap toggle) ----
  // ツールバー用アイコン（Material Symbols 由来。currentColor で配色に追従）。
  var ICON_WRAP =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">' +
    '<path d="M4 19h6v-2H4v2zM20 5H4v2h16V5zm-3 6H4v2h13.25c1.1 0 2 .9 2 2s-.9 2-2 2H15v-2l-3 3 3 3v-2h2c2.21 0 4-1.79 4-4s-1.79-4-4-4z"/></svg>';
  var ICON_COPY =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">' +
    '<path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';

  // テキストをクリップボードへコピーする。Clipboard API が無い環境では
  // execCommand へフォールバックする。成否を done(ok) で通知する。
  function copyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          done(true);
        },
        function () {
          done(fallbackCopy(text));
        },
      );
      return;
    }
    done(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  // 各コードブロックを .code-block でラップし、折り返しトグルとコピーボタンを差し込む。
  // 単一 HTML では全ページが DOM 上にあるため、初期化時に一括処理すればよい。
  function setupCodeBlocks() {
    var pres = document.querySelectorAll("#content pre");
    pres.forEach(function (pre) {
      // Mermaid 図や処理済みのブロックは対象外。
      if (pre.classList.contains("mermaid")) return;
      if (pre.parentElement && pre.parentElement.classList.contains("code-block")) return;

      var wrapper = document.createElement("div");
      wrapper.className = "code-block";
      if (pre.parentNode) {
        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(pre);
      }

      var toolbar = document.createElement("div");
      toolbar.className = "code-toolbar";

      var wrapBtn = document.createElement("button");
      wrapBtn.type = "button";
      wrapBtn.className = "code-btn code-wrap-btn";
      wrapBtn.innerHTML = ICON_WRAP;
      wrapBtn.title = LABELS.wrapToggle;
      wrapBtn.setAttribute("aria-label", LABELS.wrapToggle);
      wrapBtn.setAttribute("aria-pressed", "false");
      wrapBtn.addEventListener("click", function () {
        var on = wrapper.classList.toggle("wrap");
        wrapBtn.setAttribute("aria-pressed", on ? "true" : "false");
      });

      var copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "code-btn code-copy-btn";
      copyBtn.innerHTML = ICON_COPY;
      copyBtn.title = LABELS.copy;
      copyBtn.setAttribute("aria-label", LABELS.copyCode);

      // コピー結果を一定時間表示するトースト（zenn 風の "Copied!"）。
      var toast = document.createElement("span");
      toast.className = "code-copied-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      var toastTimer = null;

      copyBtn.addEventListener("click", function () {
        var code = pre.querySelector("code");
        var text = code ? code.textContent : pre.textContent;
        copyText(text || "", function (ok) {
          toast.textContent = ok ? LABELS.copied : LABELS.copyFailed;
          toast.classList.add("show");
          if (toastTimer) clearTimeout(toastTimer);
          toastTimer = setTimeout(function () {
            toast.classList.remove("show");
          }, 1500);
        });
      });

      toolbar.appendChild(wrapBtn);
      toolbar.appendChild(copyBtn);
      wrapper.appendChild(toolbar);
      wrapper.appendChild(toast);
    });
  }

  // ---- image lightbox ----
  function setupImageLightbox() {
    var dialog = document.getElementById("image-lightbox");
    var preview = document.getElementById("image-lightbox-image");
    var caption = document.getElementById("image-lightbox-caption");
    var closeBtn = document.getElementById("image-lightbox-close");
    if (!dialog || !preview || !caption || !closeBtn) return;
    var diagramHost = document.getElementById("image-lightbox-diagram");

    var lastTrigger = null;
    // Whether focus should return without a focus ring: a diagram opened by a pointer click
    // records its keyboard-only button as the trigger, which must not pop into view on close.
    var quietReturn = false;
    // The diagram SVG shown in the dialog. It is moved rather than cloned: a Mermaid SVG carries
    // ids that its own <style> and url(#…) references point at, and a copy would duplicate them.
    var moved = null;

    function restoreDiagram() {
      if (!moved) return;
      moved.container.insertBefore(moved.svg, moved.next);
      moved.container.style.height = "";
      moved = null;
      diagramHost.hidden = true;
      diagramHost.removeAttribute("style");
      preview.hidden = false;
    }

    function resetPreview() {
      restoreDiagram();
      preview.removeAttribute("src");
      preview.alt = "";
      caption.textContent = "";
      caption.hidden = true;
      if (lastTrigger && typeof lastTrigger.focus === "function") {
        lastTrigger.focus(quietReturn ? { focusVisible: false } : undefined);
      }
      lastTrigger = null;
      quietReturn = false;
    }

    function closeLightbox() {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
        resetPreview();
      }
    }

    function showDialog(trigger, label) {
      lastTrigger = trigger;
      caption.textContent = label;
      caption.hidden = label.length === 0;
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    }

    function openLightbox(trigger) {
      var src = trigger.currentSrc || trigger.getAttribute("src");
      if (!src) return;
      var alt = trigger.getAttribute("alt") || "";
      preview.src = src;
      preview.alt = alt;
      showDialog(trigger, alt);
    }

    function enhance(el, label, open) {
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.setAttribute("aria-haspopup", "dialog");
      el.setAttribute(
        "aria-label",
        label ? LABELS.openImagePreview + ": " + label : LABELS.openImagePreview,
      );
      el.addEventListener("click", open);
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
    }

    closeBtn.addEventListener("click", closeLightbox);
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) closeLightbox();
    });
    dialog.addEventListener("close", resetPreview);

    document.querySelectorAll("#content img").forEach(function (img) {
      // Preserve parent interactions and the semantics of explicitly decorative images.
      if (img.closest && img.closest("a, button")) return;
      if (img.hasAttribute("alt") && img.getAttribute("alt") === "") return;
      img.classList.add("image-lightbox-trigger");
      enhance(img, img.getAttribute("alt"), function () {
        openLightbox(img);
      });
    });

    if (!diagramHost) return;

    /** The rendered SVG of a Mermaid block, or null while it still holds its source. */
    function diagramSvg(container) {
      for (var i = 0; i < container.children.length; i++) {
        var child = container.children[i];
        if (child.tagName.toLowerCase() === "svg") return child;
      }
      return null;
    }

    /** The diagram's accessible title (Mermaid `accTitle`), if it has one. */
    function diagramTitle(svg) {
      for (var i = 0; i < svg.children.length; i++) {
        var child = svg.children[i];
        if (child.tagName.toLowerCase() === "title") return (child.textContent || "").trim();
      }
      return "";
    }

    function openDiagram(container, trigger, byPointer) {
      var svg = diagramSvg(container);
      if (!svg || moved) return;
      quietReturn = byPointer;
      var title = diagramTitle(svg);
      // Hold the block's height so the page does not reflow behind the dialog.
      container.style.height = container.getBoundingClientRect().height + "px";
      moved = { svg: svg, container: container, next: svg.nextSibling };
      // Size the panel to the diagram's aspect ratio so it grows to fill the viewport, leaving
      // room for the caption when there is one so the dialog does not scroll. The panel is a
      // content box, so the ratio applies inside its padding and a very tall or very wide
      // diagram cannot be squeezed to nothing by it.
      var height = "calc(100vh - " + (title ? 11 : 9) + "rem)";
      diagramHost.style.height = height;
      diagramHost.style.maxHeight = height;
      var box = svg.viewBox && svg.viewBox.baseVal;
      if (box && box.width > 0 && box.height > 0) {
        diagramHost.style.height = "auto";
        diagramHost.style.aspectRatio = box.width + " / " + box.height;
        diagramHost.style.width =
          "min(calc(100% - 2rem), calc(" + height + " * " + box.width / box.height + "))";
      }
      diagramHost.appendChild(svg);
      diagramHost.hidden = false;
      preview.hidden = true;
      showDialog(trigger, title);
    }

    // The dialog must not take a diagram out of the printed page, and a diagram from a page the
    // reader has left must not stay on screen.
    function dismiss() {
      if (!dialog.hasAttribute("open")) return;
      restoreDiagram();
      lastTrigger = null;
      closeLightbox();
    }
    window.addEventListener("beforeprint", dismiss);
    if (typeof window.matchMedia === "function") {
      var printQuery = window.matchMedia("print");
      if (printQuery && typeof printQuery.addEventListener === "function") {
        printQuery.addEventListener("change", function (e) {
          if (e.matches) dismiss();
        });
      }
    }
    // Capture, so the diagram is back in its page before the router scrolls to a target in it.
    window.addEventListener("hashchange", dismiss, true);

    document.querySelectorAll("#content .mermaid").forEach(function (container) {
      var enhanced = false;
      // In client mode Mermaid replaces the source with an SVG only once the page is shown, so
      // the block becomes a trigger when its SVG arrives; a pre-rendered block already has one.
      // Unlike an image, the block itself is not turned into a button: that would hide the
      // diagram's text and description from assistive technology. A separate button, visible
      // only on keyboard focus, opens it instead; a mouse click anywhere on the diagram does too.
      function check() {
        if (enhanced) return;
        var svg = diagramSvg(container);
        if (!svg) return;
        enhanced = true;
        var title = diagramTitle(svg);
        var button = document.createElement("button");
        button.type = "button";
        button.className = "diagram-lightbox-open";
        button.textContent = LABELS.openImagePreview;
        button.setAttribute("aria-haspopup", "dialog");
        if (title) button.setAttribute("aria-label", LABELS.openImagePreview + ": " + title);
        button.addEventListener("click", function (e) {
          e.stopPropagation();
          openDiagram(container, button, false);
        });
        container.insertBefore(button, container.firstChild);
        container.classList.add("image-lightbox-trigger");
        container.addEventListener("click", function (e) {
          // A link drawn in the diagram (Mermaid `click … href`) keeps navigating.
          var link = e.target && e.target.closest ? e.target.closest("a") : null;
          if (link && container.contains(link)) return;
          // Dragging to select a label ends in a click; let the reader copy the text instead.
          if (window.getSelection && String(window.getSelection())) return;
          openDiagram(container, button, true);
        });
      }
      check();
      if (!enhanced && typeof MutationObserver === "function") {
        var observer = new MutationObserver(function () {
          check();
          if (enhanced) observer.disconnect();
        });
        observer.observe(container, { childList: true });
      }
    });
  }

  // ---- copying formulas ----
  // A browser copies a formula's MathML as its tokens one per line, the radical and the fraction bar
  // gone (roadmap 6.4). When a selection holds a formula, the copy is written here instead: the plain
  // text with each formula as its source as written (a display formula on lines of its own), and the
  // HTML as the selection's own markup, MathML included. A selection that starts or ends inside a
  // formula takes the whole formula. A selection without one is left to the browser.
  var FORMULA_SOURCE = "data-math-source";

  function closestFormula(node) {
    for (var n = node; n; n = n.parentNode) {
      if (n.nodeType === 1 && n.hasAttribute(FORMULA_SOURCE)) return n;
    }
    return null;
  }

  /** Whether a range takes in any of a formula's shown text (its TeX annotation is not shown). */
  function takesFormula(range, formula) {
    var part = document.createRange();
    part.selectNodeContents(formula);
    // The part of the formula inside the range, and nothing outside it.
    if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0) {
      part.setStart(range.startContainer, range.startOffset);
    }
    if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0) {
      part.setEnd(range.endContainer, range.endOffset);
    }
    var taken = document.createElement("div");
    taken.appendChild(part.cloneContents());
    Array.prototype.forEach.call(taken.querySelectorAll("annotation"), function (a) {
      a.parentNode.removeChild(a);
    });
    return taken.textContent !== "";
  }

  /**
   * A selection range as copied: within the page shown (a select-all reaches the hidden pages and
   * the page's scripts), and with a formula it starts or ends inside taken whole, or left out when
   * none of its text was selected. Null when nothing of the page shown is in it.
   */
  function copyRange(selected, page) {
    var range = selected.cloneRange();
    if (!range.intersectsNode(page)) return null;
    var pageRange = document.createRange();
    pageRange.selectNodeContents(page);
    if (range.compareBoundaryPoints(Range.START_TO_START, pageRange) < 0) {
      range.setStart(pageRange.startContainer, pageRange.startOffset);
    }
    if (range.compareBoundaryPoints(Range.END_TO_END, pageRange) > 0) {
      range.setEnd(pageRange.endContainer, pageRange.endOffset);
    }
    var first = closestFormula(range.startContainer);
    var last = closestFormula(range.endContainer);
    var takeFirst = first ? takesFormula(range, first) : false;
    var takeLast = last ? (last === first ? takeFirst : takesFormula(range, last)) : false;
    if (first) {
      if (takeFirst) range.setStartBefore(first);
      else range.setStartAfter(first);
    }
    if (last) {
      if (takeLast) range.setEndAfter(last);
      else range.setEndBefore(last);
    }
    // A range inside one formula that took none of it is empty now.
    if (range.collapsed) return null;
    return range;
  }

  /** Whether a range takes a formula, looked for only under the range's common ancestor. */
  function rangeHasFormula(range) {
    var root = range.commonAncestorContainer;
    if (root.nodeType !== 1) root = root.parentNode;
    if (!root || closestFormula(root)) return Boolean(root);
    return Array.prototype.some.call(
      root.querySelectorAll("[" + FORMULA_SOURCE + "]"),
      function (formula) {
        return range.intersectsNode(formula);
      },
    );
  }

  /**
   * Copy what a range takes that the page shows, as the browser's own copy leaves out what the
   * page's styles hide: an element not displayed, text not visible (an element made visible again
   * inside it is kept), and the body of a closed details. Only the nodes the range takes are read,
   * and the page is not touched. Each copied element is listed in `styled` with its computed
   * display and white space, for the plain text to be laid out as on the page. A formula is copied
   * whole, with the hidden parts (the TeX annotation) that belong to it.
   */
  function cloneShown(range, page, styled) {
    function shown(node, visible) {
      if (node.nodeType === 3) {
        if (!visible) return null;
        var value = node.nodeValue;
        var end = node === range.endContainer ? range.endOffset : value.length;
        var start = node === range.startContainer ? range.startOffset : 0;
        return document.createTextNode(value.slice(start, end));
      }
      // By local name, which an SVG script has in lower case too.
      if (node.nodeType !== 1 || /^(script|style|template|noscript)$/i.test(node.localName)) {
        return null;
      }
      var style = getComputedStyle(node);
      if (style.display === "none") return null;
      if (node.hasAttribute(FORMULA_SOURCE)) {
        return style.visibility === "visible" ? node.cloneNode(true) : null;
      }
      var copy = node.cloneNode(false);
      // What is not visible is left out below, so an element's own style must not hide, where the
      // HTML is pasted, the visible content kept inside it.
      // However the style writes it (a custom property, say), it is what hides the element here.
      if (
        style.visibility !== "visible" &&
        copy.style &&
        copy.style.getPropertyValue("visibility")
      ) {
        copy.style.removeProperty("visibility");
        if (!copy.getAttribute("style")) copy.removeAttribute("style");
      }
      styled.push({ copy: copy, display: style.display, whiteSpace: style.whiteSpace });
      within(node, copy, style.visibility === "visible");
      return copy;
    }
    function within(node, into, visible) {
      var only = null;
      if (folded(node)) {
        only = node.querySelector(":scope > summary");
        if (!only) return;
      }
      for (var child = node.firstChild; child; child = child.nextSibling) {
        if ((only && child !== only) || !range.intersectsNode(child)) continue;
        var copy = shown(child, visible);
        if (copy) into.appendChild(copy);
      }
    }
    function folded(node) {
      return node.localName === "details" && !node.open;
    }
    var holder = document.createElement("div");
    var root = range.commonAncestorContainer;
    if (root.nodeType !== 1) root = root.parentNode;
    // Nothing is shown of a selection inside an element not displayed, or inside a closed
    // details' body, both above where the walk starts.
    for (var el = root; el && el !== page; el = el.parentNode) {
      var parent = el.parentNode;
      if (getComputedStyle(el).display === "none") return holder;
      if (parent && folded(parent) && el !== parent.querySelector(":scope > summary")) {
        return holder;
      }
    }
    // The common ancestor is kept, as the browser keeps it: a selection inside a paragraph is
    // still a paragraph.
    if (root === page) {
      within(page, holder, getComputedStyle(page).visibility === "visible");
    } else {
      var copy = shown(root, true);
      if (copy) holder.appendChild(copy);
    }
    return holder;
  }

  function setupFormulaCopy() {
    document.addEventListener("copy", function (event) {
      // A copy from a text field (the search box, a code block's fallback) is the field's own.
      var target = event.target;
      if (
        target &&
        target.nodeType === 1 &&
        (/^(INPUT|TEXTAREA)$/.test(target.tagName) || target.isContentEditable)
      ) {
        return;
      }
      var selection = window.getSelection();
      var page = document.querySelector("#content article.page:not([hidden])");
      if (!selection || selection.isCollapsed || !event.clipboardData || !page) return;
      // Each range is copied on its own and the copies joined by a line break, as the ranges of a
      // selection are apart on the page.
      var ranges = [];
      for (var i = 0; i < selection.rangeCount; i++) {
        var range = copyRange(selection.getRangeAt(i), page);
        if (range) ranges.push(range);
      }
      // A copy that takes no formula is left to the browser, before anything else is done.
      if (!ranges.some(rangeHasFormula)) return;
      var copies = ranges.map(function (r) {
        var styled = [];
        return { holder: cloneShown(r, page, styled), styled: styled };
      });
      // A formula the page hides is not copied either.
      if (
        !copies.some(function (c) {
          return c.holder.querySelector("[" + FORMULA_SOURCE + "]");
        })
      ) {
        return;
      }
      var htmls = [];
      var texts = [];
      copies.forEach(function (c) {
        var holder = c.holder;
        htmls.push(holder.innerHTML);
        // The plain text is laid out with the page's display and white space, which the page's
        // selectors no longer give to the copy.
        c.styled.forEach(function (s) {
          s.copy.style.display = s.display;
          s.copy.style.whiteSpace = s.whiteSpace;
          // What is not visible is already left out; an element's own style must not hide the
          // visible text kept inside it.
          s.copy.style.visibility = "visible";
        });
        Array.prototype.forEach.call(
          holder.querySelectorAll("[" + FORMULA_SOURCE + "]"),
          function (formula) {
            var display = formula.classList.contains("math-display");
            var source = document.createElement(display ? "div" : "span");
            source.textContent = formula.getAttribute(FORMULA_SOURCE) || "";
            // A display formula's source can span lines, which are kept.
            source.style.whiteSpace = "pre";
            formula.parentNode.replaceChild(source, formula);
          },
        );
        // Nothing that loads while the copy is laid out below.
        Array.prototype.forEach.call(
          holder.querySelectorAll("iframe, video, audio, object, embed, img"),
          function (el) {
            el.parentNode.removeChild(el);
          },
        );
        // innerText gives the selection's line structure only to an element that is rendered.
        holder.style.cssText = "position:fixed;left:-99999px;top:0;";
        document.body.appendChild(holder);
        texts.push(holder.innerText);
        document.body.removeChild(holder);
      });
      var text = texts.join("\n");
      var html = htmls.join("\n");
      event.clipboardData.setData("text/plain", text);
      event.clipboardData.setData("text/html", html);
      event.preventDefault();
    });
  }

  // ---- init ----
  function init() {
    // ルート確定済みの目印。これ以降に読み込まれた Mermaid ランタイムは
    // 自分で初回描画してよい（それ以前は showPage 側の呼び出しに任せる）。
    window.__sdRouted = true;

    setupTheme();
    setupContentWidth();
    setupSearch();
    setupSearchShortcut();
    setupSidebarToggle();
    setupSidebarAutoClose();
    setupSidebarDirs();
    setupCodeBlocks();
    setupImageLightbox();
    setupFormulaCopy();

    if (window.location.hash) {
      onRouteChange();
    } else {
      showPage(data.initialRoute || "/");
    }
  }

  window.addEventListener("hashchange", onRouteChange);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

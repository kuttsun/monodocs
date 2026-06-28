(function () {
  "use strict";

  var data = window.__SINGLE_DOCS_DATA__ || {};
  var pages = Array.isArray(data.pages) ? data.pages : [];
  var pageByRoute = {};
  pages.forEach(function (p) {
    pageByRoute[p.route] = p;
  });
  // 前後ナビ・検索の対象は hidden を除いた閲覧順のページ。
  var navPages = pages.filter(function (p) {
    return !p.hidden;
  });

  var STORAGE_THEME = "single-docs:theme";

  // クライアント UI（chrome）の文言。読者の言語に追従する i18n はせず、英語で統一する
  // （著者が用意したドキュメント本文の言語とは独立した UI ラベル）。将来 config から
  // 差し替えられるよう 1 箇所に集約しておく。静的な文言は template.html 側にある。
  var LABELS = {
    prev: "← Prev",
    next: "Next →",
    noResults: "No results",
    wrapToggle: "Toggle word wrap",
    copyCode: "Copy code",
    copy: "Copy",
    copied: "Copied!",
    copyFailed: "Copy failed",
  };
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
    showPage(h || "/");
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
    var headings = page && page.headings ? page.headings : [];
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
    if (prev) {
      html +=
        '<a class="page-nav-link page-nav-prev" data-route="' +
        escapeHtml(prev.route) +
        '" href="#' +
        escapeHtml(encodeURI(prev.route)) +
        '"><span class="page-nav-dir">' +
        LABELS.prev +
        '</span><span class="page-nav-title">' +
        escapeHtml(prev.title) +
        "</span></a>";
    } else {
      html += '<span class="page-nav-spacer"></span>';
    }
    if (next) {
      html +=
        '<a class="page-nav-link page-nav-next" data-route="' +
        escapeHtml(next.route) +
        '" href="#' +
        escapeHtml(encodeURI(next.route)) +
        '"><span class="page-nav-dir">' +
        LABELS.next +
        '</span><span class="page-nav-title">' +
        escapeHtml(next.title) +
        "</span></a>";
    }
    nav.innerHTML = html;
  }

  // ---- search ----
  function snippet(text, query) {
    var lower = text.toLowerCase();
    var pos = lower.indexOf(query);
    if (pos === -1) return "";
    var start = Math.max(0, pos - 30);
    var end = Math.min(text.length, pos + query.length + 50);
    var pre = (start > 0 ? "…" : "") + text.slice(start, pos);
    var hit = text.slice(pos, pos + query.length);
    var post = text.slice(pos + query.length, end) + (end < text.length ? "…" : "");
    return escapeHtml(pre) + "<mark>" + escapeHtml(hit) + "</mark>" + escapeHtml(post);
  }

  function search(query) {
    var q = query.trim().toLowerCase();
    if (!q) return [];
    var results = [];
    for (var i = 0; i < navPages.length && results.length < 20; i++) {
      var p = navPages[i];
      var hay = (p.title + " " + (p.text || "")).toLowerCase();
      if (hay.indexOf(q) === -1) continue;
      results.push({
        route: p.route,
        title: p.title,
        snippet: snippet(p.text || p.title, q),
      });
    }
    return results;
  }

  function renderSearchResults(query) {
    var box = document.getElementById("search-results");
    var nav = document.getElementById("sidebar-nav");
    if (!box) return;

    if (!query.trim()) {
      box.hidden = true;
      box.innerHTML = "";
      if (nav) nav.hidden = false;
      return;
    }

    var results = search(query);
    if (nav) nav.hidden = true;
    box.hidden = false;

    if (results.length === 0) {
      box.innerHTML = '<li class="search-empty">' + escapeHtml(LABELS.noResults) + "</li>";
      return;
    }

    var html = "";
    results.forEach(function (r) {
      html +=
        '<li class="search-result"><a data-route="' +
        escapeHtml(r.route) +
        '" href="#' +
        escapeHtml(encodeURI(r.route)) +
        '"><span class="search-result-title">' +
        escapeHtml(r.title) +
        "</span>" +
        (r.snippet ? '<span class="search-result-snippet">' + r.snippet + "</span>" : "") +
        "</a></li>";
    });
    box.innerHTML = html;

    box.querySelectorAll("a[data-route]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        navigateTo(a.getAttribute("data-route"), null);
      });
    });
  }

  function setupSearch() {
    var input = document.getElementById("search-input");
    if (!input) return;
    input.addEventListener("input", function () {
      renderSearchResults(input.value);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        input.value = "";
        renderSearchResults("");
        input.blur();
      }
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
    applyTheme(storedTheme());
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

  // ---- sidebar collapse ----
  // 折りたたみボタンはサイドバー内（テーマ切替の隣）、再表示ボタンは折りたたみ時のみ
  // 表示される固定ボタン。
  function setupSidebarToggle() {
    var hideBtn = document.getElementById("sidebar-toggle");
    var showBtn = document.getElementById("sidebar-show");
    function setCollapsed(collapsed) {
      document.body.classList.toggle("sidebar-collapsed", collapsed);
      if (hideBtn) hideBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }
    if (hideBtn)
      hideBtn.addEventListener("click", function () {
        setCollapsed(true);
      });
    if (showBtn)
      showBtn.addEventListener("click", function () {
        setCollapsed(false);
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

  // ---- init ----
  function init() {
    // ルート確定済みの目印。これ以降に読み込まれた Mermaid ランタイムは
    // 自分で初回描画してよい（それ以前は showPage 側の呼び出しに任せる）。
    window.__sdRouted = true;

    setupTheme();
    setupSearch();
    setupSidebarToggle();
    setupSidebarDirs();
    setupCodeBlocks();

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

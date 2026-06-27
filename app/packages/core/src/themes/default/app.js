(function () {
  "use strict";

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

  function showPage(route) {
    var articles = document.querySelectorAll("#content [data-route]");
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
    links.forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-route") === route);
    });

    var content = document.getElementById("content");
    if (content) content.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function onRouteChange() {
    showPage(currentRoute());
  }

  window.addEventListener("hashchange", onRouteChange);
  document.addEventListener("DOMContentLoaded", function () {
    if (window.location.hash) {
      onRouteChange();
      return;
    }
    var data = window.__SINGLE_DOCS_DATA__ || {};
    showPage(data.initialRoute || "/");
  });
})();

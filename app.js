(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = function (tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text).replace(/(\d)–(\d)/g, "$1\u2060–\u2060$2");   // keep year ranges on one line
    return e;
  };
  var SRC = {}, PAR = {};
  SOURCES.forEach(function (s) { SRC[s.id] = s; });
  PARTIES.forEach(function (p) { PAR[p.id] = p; });
  var SCALE = 2 + Math.max.apply(null, SOURCES.map(function (s) {
    return Math.max.apply(null, Object.keys(s.seats).map(function (k) { return s.seats[k]; }));
  }));

  var state = { src: SOURCES[0].id, party: null, place: null, open: true };
  var loaded = {};
  var wide = window.matchMedia("(min-width: 900px)");
  var rowsEl = $("#rows"), dock = $("#dock"), spot = $("#spot");

  function dm(iso) { var a = iso.split("-"); return Number(a[2]) + "." + Number(a[1]); }
  function passes(n) { return (n || 0) >= THRESHOLD; }
  function firstPlace(n) { return passes(n) ? n + 1 : 1; }
  function queueOf(p, n) {
    var q = passes(n) ? [n, n + 1, n + 2, n + 3] : [1, 2, 3, 4];
    return q.filter(function (k) { return !!p.list[k]; });
  }
  function g(c, m, f) { return c.g === "f" ? f : m; }
  function initials(name) {
    var w = name.replace(/[^א-ת\s-]/g, "").trim().split(/[\s-]+/);
    return (w[0] || "").charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : "");
  }
  function ranked(s) {
    return PARTIES.map(function (p) { return { p: p, n: s.seats[p.id] }; })
      .sort(function (a, b) { return ((b.n || 0) - (a.n || 0)) || (a.p.ord - b.p.ord); });
  }
  function rowOf(pid) { return $('.row[data-p="' + pid + '"]', rowsEl); }

  /* Photos load straight from the source sites. Until one arrives (or if it is blocked), the initials stand in. */
  function photo(c, size, alt) {
    var box = el("span", "ph ph-" + size);
    var ini = el("span", "ini", initials(c.n));
    ini.setAttribute("aria-hidden", "true");
    box.appendChild(ini);
    if (c.img) {
      var im = new Image();
      im.alt = alt || "";
      im.referrerPolicy = "no-referrer";
      im.decoding = "async";
      if (loaded[c.img]) box.className += " ok now";
      im.onload = function () { loaded[c.img] = true; box.classList.add("ok"); };
      im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); };
      im.src = c.img;
      box.appendChild(im);
    }
    return box;
  }

  function renderTabs() {
    var tabs = $("#tabs");
    tabs.textContent = "";
    SOURCES.forEach(function (s) {
      var on = s.id === state.src;
      var b = el("button", "tab");
      b.type = "button"; b.id = "tab-" + s.id;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.setAttribute("aria-controls", "rows");
      b.tabIndex = on ? 0 : -1;
      b.appendChild(el("b", null, s.name));
      b.appendChild(el("small", null, "סקר מ-" + dm(s.date)));
      b.addEventListener("click", function () { setSource(s.id); });
      tabs.appendChild(b);
    });
  }

  function renderBoard() {
    var s = SRC[state.src];
    dock.appendChild(spot);                      // keep the card out of the list while it is rebuilt
    rowsEl.textContent = "";
    var cut = false;
    ranked(s).forEach(function (r) {
      var p = r.p, n = r.n, inPoll = n !== undefined, ok = passes(n);
      if (!ok && !cut) {
        cut = true;
        var c = el("li", "cut", "מתחת לאחוז החסימה בסקר הזה");
        rowsEl.appendChild(c);
      }
      var li = el("li"), b = el("button", "row");
      b.type = "button"; b.dataset.p = p.id;

      var id = el("span", "row-id");
      id.appendChild(el("span", "row-name", p.name));
      var sub = "";
      if (ok) { var nx = p.list[n + 1]; sub = nx ? g(nx, "הבא", "הבאה") + " בתור: " + nx.n : "הבא בתור: מקום " + (n + 1) + " ברשימה"; }
      else if (!inPoll) sub = "לא נכללה בסקר";
      else if (s.pct[p.id] != null) sub = s.pct[p.id] + "% מהקולות בסקר";
      if (sub) id.appendChild(el("span", "row-sub", sub));
      b.appendChild(id);

      var dots = el("span", "row-dots");
      dots.setAttribute("aria-hidden", "true");
      for (var i = 0; i < SCALE; i++) {
        var d = document.createElement("i");
        if (ok) d.className = i < n ? "" : (i === n ? "nx" : "no");
        else d.className = i < THRESHOLD ? "gh" : "no";
        dots.appendChild(d);
      }
      b.appendChild(dots);

      var num = el("span", "row-num");
      var prev = s.prev[p.id];
      if (inPoll && prev != null && prev !== n) {
        var up = n > prev, diff = Math.abs(n - prev);
        var dl = el("span", "delta", (up ? "▲" : "▼") + diff);
        dl.dir = "ltr";
        dl.title = (up ? "עלייה" : "ירידה") + " של " + diff + " לעומת הסקר הקודם (" + dm(s.prevDate) + ")";
        dl.setAttribute("aria-hidden", "true");
        num.appendChild(dl);
        num.appendChild(el("span", "sr", dl.title + ". "));
      }
      num.appendChild(el("b", null, inPoll ? String(n) : "–"));
      num.appendChild(el("span", "sr", inPoll ? " מנדטים" : " לא נכללה בסקר"));
      b.appendChild(num);

      b.addEventListener("click", function () { selectParty(p.id); });
      li.appendChild(b);
      rowsEl.appendChild(li);
    });
  }

  function renderSpot() {
    var s = SRC[state.src], p = PAR[state.party];
    var n = s.seats[p.id], inPoll = n !== undefined, ok = passes(n);
    var q = queueOf(p, n);
    if (q.indexOf(state.place) < 0) state.place = firstPlace(n);   // may be a place with no details yet
    var k = state.place, c = p.list[k], off = k - (n || 0);

    var card = el("article", "card swap");
    card.addEventListener("animationend", function () { card.classList.remove("swap"); });

    var kick = el("p", "kicker");
    kick.appendChild(el("b", null, p.name));
    kick.appendChild(document.createTextNode(" · מקום "));
    kick.appendChild(el("b", null, String(k)));
    kick.appendChild(document.createTextNode(" ברשימה · בראשות " + p.leader));
    card.appendChild(kick);

    if (!c) {                                    // place without candidate details yet: no photo, no tags
      card.appendChild(el("p", "cond", "הפרטים על המועמד במקום " + k + " יתווספו בקרוב."));
    } else {
      var person = el("div", "person");
      var big = photo(c, "lg", "תמונה של " + c.n);
      var seat = el("span", "seat", String(k));
      seat.setAttribute("aria-hidden", "true");
      big.appendChild(seat);
      person.appendChild(big);

      var who = el("div", "who");
      var tagText, tagCls = "tag", cond;
      if (!ok) {
        tagText = "מתחת לאחוז החסימה";
        cond = g(c, "נכנס", "נכנסת") + " לכנסת רק אם הרשימה עוברת את אחוז החסימה, ואז נכנסים ארבעה בבת אחת.";
        if (!inPoll) cond += " בסקר הזה היא לא נכללה.";
        else if (s.pct[p.id] != null) cond += " הסקר נותן לה " + s.pct[p.id] + "%.";
      } else if (off === 0) {
        tagText = "בפנים"; tagCls = "tag in";
        cond = "המנדט ה-" + k + " של " + p.name + ", האחרון שנכנס לפי הסקר. מנדט אחד פחות, ו" + g(c, "הוא", "היא") + " בחוץ.";
      } else {
        tagText = off === 1 ? g(c, "הבא בתור", "הבאה בתור") : "עוד " + off + " מנדטים";
        cond = g(c, "נכנס", "נכנסת") + " לכנסת עם המנדט ה-" + k + " של " + p.name + ". הסקר נותן " + n + (off > 1 ? ", חסרים " + off + "." : ".");
      }
      who.appendChild(el("span", tagCls, tagText));
      who.appendChild(el("h3", "name", c.n));
      who.appendChild(el("p", "role", c.t));
      person.appendChild(who);
      card.appendChild(person);

      card.appendChild(el("p", "cond", cond));

      var chips = el("ul", "chips");
      if (c.age) chips.appendChild(el("li", null, g(c, "בן ", "בת ") + c.age));
      if (c.city) chips.appendChild(el("li", null, c.city));
      var st = { "in": g(c, "ח״כ מכהן", "ח״כ מכהנת"), "min": g(c, "שר מכהן", "שרה מכהנת"), "new": "פנים חדשות", "back": g(c, "חוזר לכנסת", "חוזרת לכנסת") }[c.st];
      if (st) chips.appendChild(el("li", null, st));
      card.appendChild(chips);

      var bio = el("dl", "bio");
      [["ברזומה", c.was], ["שווה לדעת", c.fun]].forEach(function (r) {
        if (!r[1]) return;
        var row = el("div");
        row.appendChild(el("dt", null, r[0]));
        row.appendChild(el("dd", null, r[1]));
        bio.appendChild(row);
      });
      if (bio.children.length) card.appendChild(bio);
    }

    if (q.length > 1) {
      var qs = el("section", "queue");
      qs.appendChild(el("h4", "label", ok ? "התור של " + p.name : "ארבעת הראשונים ברשימה"));
      var qr = el("div", "q-row"), cols = [];
      q.forEach(function (pl, i) {
        if (!ok && i === 0) { qr.appendChild(tape()); cols.push("8px"); }
        var cc = p.list[pl], b = el("button", "q");
        b.type = "button";
        b.setAttribute("aria-pressed", pl === k ? "true" : "false");
        b.appendChild(photo(cc, "sm", ""));
        b.appendChild(el("span", "q-no", String(pl)));
        b.appendChild(el("span", "q-name", cc.n.replace(/-/g, "-\u200B")));
        var lbl;
        if (!ok) lbl = "מקום " + pl;
        else if (pl === n) lbl = "בפנים";
        else if (pl === n + 1) lbl = g(cc, "הבא בתור", "הבאה בתור");
        else lbl = "עוד " + (pl - n) + " מנדטים";
        b.appendChild(el("span", "q-st", lbl));
        b.addEventListener("click", function () { state.place = pl; renderSpot(); });
        qr.appendChild(b); cols.push("minmax(0,1fr)");
        if (ok && pl === n && i < q.length - 1) { qr.appendChild(tape()); cols.push("8px"); }
      });
      qr.style.gridTemplateColumns = cols.join(" ");
      qs.appendChild(qr);
      card.appendChild(qs);
    }

    var os = el("section", "others");
    os.appendChild(el("h4", "label", "ובסקרים האחרים"));
    SOURCES.forEach(function (o) {
      if (o.id === state.src) return;
      var n2 = o.seats[p.id], b = el("button", "o-btn"), txt = el("span");
      b.type = "button";
      txt.appendChild(el("b", null, o.name));
      var t;
      if (n2 === undefined) t = " · לא נכללה בסקר";
      else if (!passes(n2)) t = " · מתחת לאחוז החסימה";
      else { var nx = p.list[n2 + 1]; t = " · " + n2 + " מנדטים" + (nx ? " · " + g(nx, "הבא", "הבאה") + " בתור: " + nx.n : ""); }
      txt.appendChild(document.createTextNode(t));
      b.appendChild(txt);
      var go = el("span", "o-go", "←");
      go.setAttribute("aria-hidden", "true");
      b.appendChild(go);
      b.addEventListener("click", function () { setSource(o.id, true); });
      os.appendChild(b);
    });
    card.appendChild(os);

    spot.textContent = "";
    spot.appendChild(card);
  }
  function tape() { var t = el("span", "tape-v"); t.setAttribute("aria-hidden", "true"); return t; }

  function placeSpot() {
    var big = wide.matches;
    if (big) { dock.appendChild(spot); spot.hidden = false; }
    else { rowOf(state.party).parentNode.appendChild(spot); spot.hidden = !state.open; }
    Array.prototype.forEach.call(rowsEl.querySelectorAll(".row"), function (b) {
      var on = b.dataset.p === state.party;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      if (big) b.removeAttribute("aria-expanded");
      else b.setAttribute("aria-expanded", on && state.open ? "true" : "false");
    });
  }

  /* On a phone the card opens inside the list, so keep the tapped row where the thumb left it. */
  function anchored(pid, fn) {
    var a = rowOf(pid), before = a ? a.getBoundingClientRect().top : null;
    fn();
    var b = rowOf(pid);
    if (before != null && b && !wide.matches) {
      var d = b.getBoundingClientRect().top - before;
      if (Math.abs(d) > 1) window.scrollBy(0, d);
    }
    return b;
  }
  /* If the tapped row sits low on the screen its card would open mostly out of view, so bring the row up under the poll picker. */
  function reveal(row) {
    if (wide.matches || !row || !state.open) return;
    var top = row.getBoundingClientRect().top, bar = $(".pick").getBoundingClientRect().height;
    if (top < window.innerHeight * 0.35) return;
    var calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: window.pageYOffset + top - bar - 6, behavior: calm ? "auto" : "smooth" });
  }
  function selectParty(pid) {
    reveal(anchored(pid, function () {
      if (!wide.matches && pid === state.party) state.open = !state.open;
      else { state.party = pid; state.place = null; state.open = true; renderSpot(); }
      placeSpot();
    }));
  }
  function setSource(id, fromCard) {
    if (id === state.src) return;
    var row = anchored(state.party, function () {
      state.src = id; state.place = null; state.open = true;
      renderTabs(); renderBoard(); renderSpot(); placeSpot();
    });
    if (!fromCard) return;
    var calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var top = wide.matches ? spot.getBoundingClientRect().top - 16 : row.getBoundingClientRect().top - $(".pick").getBoundingClientRect().height - 6;
    if (top < 0) window.scrollTo({ top: window.pageYOffset + top, behavior: calm ? "auto" : "smooth" });
  }

  $("#tabs").addEventListener("keydown", function (e) {
    var step = e.key === "ArrowLeft" ? 1 : e.key === "ArrowRight" ? -1 : 0;   // right-to-left page: left arrow moves forward
    if (!step) return;
    e.preventDefault();
    var i = SOURCES.map(function (s) { return s.id; }).indexOf(state.src);
    var next = SOURCES[(i + step + SOURCES.length) % SOURCES.length].id;
    setSource(next);
    $("#tab-" + next).focus();
  });
  if (wide.addEventListener) wide.addEventListener("change", placeSpot); else wide.addListener(placeSpot);

  $("#upd").textContent = UPDATED;
  (function countdown() {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var days = Math.round((new Date(ELECTION_DAY[0], ELECTION_DAY[1], ELECTION_DAY[2]) - today) / 864e5);
    if (days < 0) { $("#status").textContent = "הבחירות התקיימו ב-27.10.2026. מוצגים הסקרים האחרונים שפורסמו לפניהן."; return; }
    $("#days").textContent = days === 0 ? "!" : String(days);
    $("#days-t").textContent = days === 0 ? "היום בוחרים" : days === 1 ? "יום לבחירות" : "ימים לבחירות";
    $("#eday").hidden = false;
  })();

  state.party = ranked(SRC[state.src])[0].p.id;
  renderTabs(); renderBoard(); renderSpot(); placeSpot();
})();

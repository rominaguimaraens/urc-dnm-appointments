(function () {
  "use strict";

  var DATA_URL = "data/appointments.json";
  var list = document.getElementById("list");
  var updated = document.getElementById("updated");
  var lastLoad = 0;

  var dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  var monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  function utcDate(iso) {
    return new Date(iso + "T12:00:00Z");
  }

  function todayInMontevideo() {
    var parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo" }).format(new Date());
    return utcDate(parts);
  }

  function daysUntil(iso) {
    return Math.round((utcDate(iso) - todayInMontevideo()) / 86400000);
  }

  function tier(days) {
    if (days <= 30) return "soon";
    if (days <= 60) return "mid";
    return "later";
  }

  function esc(text) {
    return String(text == null ? "" : text).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function ago(iso) {
    var mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return "updated just now";
    if (mins < 60) return "updated " + mins + " min ago";
    var hours = Math.round(mins / 60);
    return "updated " + hours + (hours === 1 ? " hour ago" : " hours ago");
  }

  var CHEVRON =
    '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

  function officeRow(o) {
    var first = o.slots[0];
    var t = tier(daysUntil(first.date));
    var slots = o.slots.map(function (s) {
      return "<li><span>" + esc(dayFmt.format(utcDate(s.date))) + "</span><time>" + esc(s.time) + "</time></li>";
    }).join("");
    var lines = [];
    if (o.note) lines.push("<strong>" + esc(o.note) + "</strong>");
    if (o.address) lines.push(esc(o.address));

    return (
      '<details class="office">' +
        "<summary>" +
          '<span class="place"><span class="city">' + esc(o.city) + '</span><span class="dept">' + esc(o.department) + "</span></span>" +
          '<span class="pill ' + t + '">' + esc(dayFmt.format(utcDate(first.date))) + "</span>" +
          CHEVRON +
        "</summary>" +
        '<div class="details">' +
          (lines.length ? "<p>" + lines.join("<br>") + "</p>" : "") +
          '<ul class="slots">' + slots + "</ul>" +
          '<a href="' + esc(o.url) + '" target="_blank" rel="noopener">Open on DNM</a>' +
        "</div>" +
      "</details>"
    );
  }

  function closedRow(o) {
    var note = o.status === "error" ? "couldn't check" : "";
    return (
      '<div class="office"><summary>' +
        '<span class="place"><span class="city">' + esc(o.city) + '</span><span class="dept">' + esc(o.department) + "</span></span>" +
        (note ? '<span class="status-note">' + note + "</span>" : "") +
      "</summary></div>"
    );
  }

  function render(data) {
    var open = data.offices.filter(function (o) { return o.slots && o.slots.length; });
    var closed = data.offices.filter(function (o) { return !o.slots || !o.slots.length; });

    open.sort(function (a, b) {
      return (a.slots[0].date + a.slots[0].time).localeCompare(b.slots[0].date + b.slots[0].time);
    });

    var groups = [];
    open.forEach(function (o) {
      var key = o.slots[0].date.slice(0, 7);
      var g = groups[groups.length - 1];
      if (!g || g.key !== key) {
        g = { key: key, label: monthFmt.format(utcDate(key + "-01")), offices: [] };
        groups.push(g);
      }
      g.offices.push(o);
    });

    var out = groups.map(function (g) {
      return '<section class="month"><h2>' + esc(g.label) + "</h2>" + g.offices.map(officeRow).join("") + "</section>";
    });

    if (closed.length) {
      out.push(
        '<section class="month none"><h2>No dates open</h2>' + closed.map(closedRow).join("") + "</section>"
      );
    }

    list.innerHTML = out.join("") || '<p class="empty">No offices to show right now.</p>';
    window.__resData = data;
    updated.textContent = ago(data.checked_at);
    updated.dataset.at = data.checked_at;
  }

  function load() {
    lastLoad = Date.now();
    fetch(DATA_URL, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(render)
      .catch(function () {
        if (!list.children.length) {
          list.innerHTML = '<p class="empty">Couldn’t load the schedule. Check your connection and reopen the app.</p>';
          updated.textContent = "offline";
        }
      });
  }

  // ------------------------------------------------------- Registro Civil

  var RC_URL = "https://raw.githubusercontent.com/rominaguimaraens/urc-schedule-tracking/main/state.json";
  var rcList = document.getElementById("rc-list");
  var RC_AGENDAS = [
    {
      id: "dgrec-partidas-titulares-representantes",
      title: "Holder or representative",
      who: "Parents booking for their kids, or anyone booking for someone else",
      url: "https://sae.mec.gub.uy/sae/agendarReserva/Paso1.xhtml?e=9&a=84"
    },
    {
      id: "dgrec-partidas-solo-titulares",
      title: "Holder only",
      who: "The certificate holder, who can add a spouse and kids",
      url: "https://sae.mec.gub.uy/sae/agendarReserva/Paso1.xhtml?e=9&a=82"
    }
  ];

  function parseStamp(stamp) {
    // "2026-12-12 14:30 UTC" -> Date
    return stamp ? new Date(stamp.replace(" UTC", "Z").replace(" ", "T")) : null;
  }

  var seenFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "America/Montevideo" });

  function rcBlock(agenda, entry) {
    entry = entry || {};
    var slots = entry.slots || [];
    var body;

    if (entry.status === "open" && slots.length) {
      body =
        '<p class="state open">Open now</p>' +
        '<ul class="slots">' + slots.map(function (s) {
          return "<li><span>" + esc(dayFmt.format(utcDate(s.date))) + "</span><time>" + esc(s.time) + "</time></li>";
        }).join("") + "</ul>" +
        '<a href="' + esc(agenda.url) + '" target="_blank" rel="noopener">Book on Registro Civil</a>';
    } else if (entry.status === "closed" || entry.status === "open") {
      body = '<p class="state closed">No spots open</p>';
      var months = entry.last_open_months || [];
      if (!months.length && entry.last_slots && entry.last_slots.length) {
        months = [entry.last_slots[0].date.slice(0, 7), entry.last_slots[entry.last_slots.length - 1].date.slice(0, 7)];
      }
      if (months.length) {
        var firstM = months[0];
        var lastM = months[months.length - 1];
        var shortMonth = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });
        var label = firstM === lastM
          ? monthFmt.format(utcDate(firstM + "-01"))
          : (firstM.slice(0, 4) === lastM.slice(0, 4) ? shortMonth : monthFmt).format(utcDate(firstM + "-01")) +
            " and " + monthFmt.format(utcDate(lastM + "-01"));
        var seen = parseStamp(entry.last_seen_open);
        body +=
          '<p class="last">Last appointments open were in <strong>' + esc(label) + "</strong>" +
          (seen ? " (spotted " + esc(seenFmt.format(seen)) + ")" : "") + ".</p>";
      }
    } else {
      body = '<p class="last">Couldn’t check this calendar right now.</p>';
    }

    return (
      '<section class="rc"><h2>' + esc(agenda.title) + '</h2><p class="who">' + esc(agenda.who) + "</p>" +
      body + "</section>"
    );
  }

  function loadRegistroCivil() {
    fetch(RC_URL, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(function (state) {
        rcList.innerHTML = RC_AGENDAS.map(function (a) { return rcBlock(a, state[a.id]); }).join("");
      })
      .catch(function () {
        if (!rcList.children.length) {
          rcList.innerHTML = '<p class="empty">Couldn’t load Registro Civil. Check your connection and reopen the app.</p>';
        }
      });
  }

  // ---------------------------------------------------------------- tabs

  var tabs = [
    { tab: document.getElementById("tab-res"), panel: document.getElementById("panel-res"), hash: "" },
    { tab: document.getElementById("tab-rc"), panel: document.getElementById("panel-rc"), hash: "#registro-civil" }
  ];
  var meta = document.getElementById("meta");
  var resMeta = meta.innerHTML;

  function select(index, focus) {
    tabs.forEach(function (t, i) {
      var on = i === index;
      t.tab.setAttribute("aria-selected", on ? "true" : "false");
      t.tab.tabIndex = on ? 0 : -1;
      t.panel.hidden = !on;
    });
    if (focus) tabs[index].tab.focus();
    if (index === 1) {
      meta.textContent = "Foreign birth certificates";
    } else {
      meta.innerHTML = resMeta;
      updated = document.getElementById("updated");
      if (updated && window.__resData) {
        updated.textContent = ago(window.__resData.checked_at);
        updated.dataset.at = window.__resData.checked_at;
      }
    }
    try { localStorage.setItem("dnm-tab", String(index)); } catch (e) {}
    if (history.replaceState) history.replaceState(null, "", tabs[index].hash || location.pathname);
  }

  tabs.forEach(function (t, i) {
    t.tab.addEventListener("click", function () { select(i); });
    t.tab.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        select((i + 1) % tabs.length, true);
      }
    });
  });

  var start = location.hash === "#registro-civil" ? 1 : 0;
  if (!location.hash) {
    try { start = Number(localStorage.getItem("dnm-tab")) === 1 ? 1 : 0; } catch (e) {}
  }

  // Keep the "updated X min ago" line honest, and refresh when reopened.
  setInterval(function () {
    if (updated && updated.dataset.at) updated.textContent = ago(updated.dataset.at);
  }, 60000);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && Date.now() - lastLoad > 5 * 60000) {
      load();
      loadRegistroCivil();
    }
  });

  load();
  loadRegistroCivil();
  select(start);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();

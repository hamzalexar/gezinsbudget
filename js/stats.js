(function () {
  "use strict";

  const eur = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });
  function formatEUR(n) {
    if (typeof n !== "number" || isNaN(n)) n = 0;
    return eur.format(n);
  }
  function num(v) {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
  function sum(list, field) {
    return (list || []).reduce((acc, item) => acc + num(item[field]), 0);
  }

  const MONTH_SHORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  function monthLabel(monthId) {
    const [y, m] = monthId.split("-");
    return MONTH_SHORT[parseInt(m, 10) - 1] + " '" + y.slice(2);
  }
  function monthLabelLong(monthId) {
    const NAMES = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
    const [y, m] = monthId.split("-");
    return NAMES[parseInt(m, 10) - 1] + " " + y;
  }

  function setSyncStatus(stateName, label) {
    const el = document.getElementById("sync-status");
    const labelEl = document.getElementById("sync-label");
    el.setAttribute("data-state", stateName);
    const labels = { loading: "Laden…", synced: "Gesynchroniseerd", error: "Fout", offline: "Offline" };
    labelEl.textContent = label || labels[stateName] || stateName;
  }

  // ==========================================================================
  // Firebase init
  // ==========================================================================

  let db = null;

  function isConfigFilledIn(cfg) {
    if (!cfg) return false;
    return Object.values(cfg).every((v) => typeof v === "string" && v.indexOf("VUL_HIER") === -1 && v.length > 0);
  }

  function initFirebase() {
    if (typeof firebaseConfig === "undefined" || !isConfigFilledIn(firebaseConfig)) {
      document.getElementById("config-warning").classList.remove("hidden");
      setSyncStatus("error", "Geen configuratie");
      return false;
    }
    try {
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
      return true;
    } catch (err) {
      console.error("Firebase init mislukt", err);
      setSyncStatus("error", "Configuratiefout");
      return false;
    }
  }

  // ==========================================================================
  // Kredieten (recurring costs with a fixed start/end date)
  //
  // These live in their own Firestore collection rather than being copied
  // into each month's document, so a month's contribution is recomputed
  // from the credit's stored start/end dates every time — using THAT
  // month's own id, never "today" — so history stays stable even after a
  // credit's term ends, and only changes if the credit record itself is
  // later edited or deleted.
  // ==========================================================================

  function isCreditActiveInMonth(credit, monthId) {
    if (!credit.startMonth || credit.startMonth > monthId) return false;
    if (credit.endMonth && monthId > credit.endMonth) return false;
    return true;
  }

  // ==========================================================================
  // Categorieën — zelfde lijst als js/app.js, voor de categorie-uitsplitsing
  // en -trend hieronder. Vaste facturen, kredieten en variabele uitgaven
  // dragen elk hun eigen category-veld; abonnementen zijn zelf al een
  // categorie, dus hun totaal telt rechtstreeks mee onder "abonnement".
  // ==========================================================================

  const CATEGORIES = [
    { id: "wonen", emoji: "🏠", label: "Wonen" },
    { id: "elec", emoji: "⚡", label: "Elektriciteit & Gas" },
    { id: "water", emoji: "💧", label: "Water" },
    { id: "internet", emoji: "📶", label: "Internet, TV & Telefonie" },
    { id: "verzekering", emoji: "🛡️", label: "Verzekeringen" },
    { id: "lening", emoji: "🏦", label: "Lening/Krediet" },
    { id: "kinderopvang", emoji: "🧸", label: "Kinderopvang" },
    { id: "boodschappen", emoji: "🛒", label: "Boodschappen" },
    { id: "eten", emoji: "🍽️", label: "Eten & drinken buiten" },
    { id: "transport", emoji: "🚗", label: "Transport" },
    { id: "kleding", emoji: "👕", label: "Kleding" },
    { id: "elektronica", emoji: "🔌", label: "Elektronica & huishouden" },
    { id: "verzorging", emoji: "💊", label: "Verzorging & gezondheid" },
    { id: "vrijetijd", emoji: "🎁", label: "Cadeaus & vrije tijd" },
    { id: "abonnement", emoji: "📺", label: "Abonnementen" },
    { id: "overig", emoji: "📦", label: "Overig" }
  ];

  const CATEGORY_COLORS = [
    "#3b82f6", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444", "#06b6d4",
    "#f472b6", "#84cc16", "#6366f1", "#eab308", "#14b8a6", "#fb7185",
    "#a855f7", "#22c55e", "#f97316", "#94a3b8"
  ];

  function categoryMeta(id) {
    return CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
  }

  function categoryColor(id) {
    const idx = CATEGORIES.findIndex((c) => c.id === id);
    return CATEGORY_COLORS[idx >= 0 ? idx : CATEGORY_COLORS.length - 1];
  }

  // ==========================================================================
  // Data aggregation
  // ==========================================================================

  function computeMonthStats(monthId, data, credits) {
    data = data || {};
    const income = data.income || {};
    const totalIncome = num(income.salary) + sum(income.children, "amount") + sum(income.extra, "amount");
    const activeCredits = (credits || []).filter((c) => isCreditActiveInMonth(c, monthId));
    const totalFixed = sum(data.fixedBills, "amount") + sum(activeCredits, "amount");
    const toTransfer = Math.max(0, totalFixed + num(data.buffer) - num(data.partnerContribution));
    const variableBudget = totalIncome - toTransfer;
    const totalVariable = sum(data.variableExpenses, "amount");
    const totalSubs = sum(data.subscriptions, "amount");
    const afterPaying = variableBudget - (totalVariable + totalSubs);
    const fuel = data.fuel || {};
    const fuelDacia = sum(fuel.dacia, "amount");
    const fuelSeat = sum(fuel.seat, "amount");

    const categoryTotals = {};
    const addToCategory = (catId, amount) => {
      const key = catId || "overig";
      categoryTotals[key] = (categoryTotals[key] || 0) + num(amount);
    };
    (data.fixedBills || []).forEach((b) => addToCategory(b.category, b.amount));
    activeCredits.forEach((c) => addToCategory(c.category, c.amount));
    (data.variableExpenses || []).forEach((v) => addToCategory(v.category, v.amount));
    if (totalSubs) addToCategory("abonnement", totalSubs);

    return {
      monthId,
      totalIncome,
      totalFixed,
      totalVariable,
      totalSubs,
      totalExpenses: totalFixed + totalVariable + totalSubs,
      afterPaying,
      fuelDacia,
      fuelSeat,
      categoryTotals
    };
  }

  // ==========================================================================
  // Chart color palette (theme-aware)
  // ==========================================================================

  function themeColors() {
    const style = getComputedStyle(document.documentElement);
    return {
      text: style.getPropertyValue("--text").trim(),
      muted: style.getPropertyValue("--text-muted").trim(),
      border: style.getPropertyValue("--border").trim(),
      positive: style.getPropertyValue("--positive").trim(),
      negative: style.getPropertyValue("--negative").trim(),
      // Distinct, clearly-separable hues for comparing categories within a
      // chart — the UI's --accent/--accent-2 are both blue (by design, for
      // subtle gradients elsewhere) and too close to each other to tell
      // apart in a bar/donut chart, so charts use their own palette instead.
      blue: "#3b82f6",
      amber: "#f59e0b",
      violet: "#8b5cf6"
    };
  }

  let charts = {};
  let selectedSplitMonthId = null;

  function destroyChart(key) {
    if (charts[key]) {
      charts[key].destroy();
      delete charts[key];
    }
  }

  function baseOptions(colors, extra) {
    return Object.assign(
      {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { color: colors.text, usePointStyle: true, boxWidth: 8 } },
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.dataset.label + ": " + formatEUR(ctx.parsed.y != null ? ctx.parsed.y : ctx.parsed)
            }
          }
        },
        scales: {
          x: { ticks: { color: colors.muted }, grid: { color: colors.border } },
          y: {
            ticks: { color: colors.muted, callback: (v) => formatEUR(v) },
            grid: { color: colors.border }
          }
        }
      },
      extra || {}
    );
  }

  function renderOverviewCharts(monthStats) {
    const colors = themeColors();
    destroyChart("overview");
    destroyChart("variable");
    destroyChart("fuel");
    const labels = monthStats.map((m) => monthLabel(m.monthId));

    charts.overview = new Chart(document.getElementById("chart-overview"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Inkomsten",
            data: monthStats.map((m) => m.totalIncome),
            borderColor: colors.positive,
            backgroundColor: colors.positive,
            tension: 0.25
          },
          {
            label: "Totale uitgaven",
            data: monthStats.map((m) => m.totalExpenses),
            borderColor: colors.negative,
            backgroundColor: colors.negative,
            tension: 0.25
          }
        ]
      },
      options: baseOptions(colors)
    });

    charts.variable = new Chart(document.getElementById("chart-variable"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Variabele uitgaven", data: monthStats.map((m) => m.totalVariable), backgroundColor: colors.violet },
          { label: "Abonnementen", data: monthStats.map((m) => m.totalSubs), backgroundColor: colors.amber }
        ]
      },
      options: baseOptions(colors)
    });

    charts.fuel = new Chart(document.getElementById("chart-fuel"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Dacia", data: monthStats.map((m) => m.fuelDacia), backgroundColor: colors.amber },
          { label: "Seat", data: monthStats.map((m) => m.fuelSeat), backgroundColor: colors.blue }
        ]
      },
      options: baseOptions(colors)
    });
  }

  function renderMonthPills(monthStats) {
    const container = document.getElementById("month-pills");
    container.innerHTML = "";
    monthStats.forEach((m) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "month-pill" + (m.monthId === selectedSplitMonthId ? " active" : "");
      btn.textContent = monthLabel(m.monthId);
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", m.monthId === selectedSplitMonthId ? "true" : "false");
      btn.addEventListener("click", () => {
        selectedSplitMonthId = m.monthId;
        renderMonthPills(monthStats);
        renderSplit(m);
      });
      container.appendChild(btn);
    });
    container.scrollLeft = container.scrollWidth;
  }

  function renderSplit(monthStat) {
    destroyChart("split");
    document.getElementById("split-month-label").textContent = monthLabelLong(monthStat.monthId);

    const categories = Object.keys(monthStat.categoryTotals)
      .map((id) => ({ id, meta: categoryMeta(id), amount: monthStat.categoryTotals[id], color: categoryColor(id) }))
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const total = categories.reduce((a, c) => a + c.amount, 0);

    charts.split = new Chart(document.getElementById("chart-split"), {
      type: "doughnut",
      data: {
        labels: categories.map((c) => c.meta.emoji + " " + c.meta.label),
        datasets: [
          {
            data: categories.map((c) => c.amount),
            backgroundColor: categories.map((c) => c.color),
            borderColor: getComputedStyle(document.documentElement).getPropertyValue("--surface").trim(),
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ctx.label + ": " + formatEUR(ctx.parsed) } }
        }
      }
    });

    const tbody = document.getElementById("split-table-body");
    tbody.innerHTML = "";
    categories.forEach((c) => {
      const pct = total > 0 ? (c.amount / total) * 100 : 0;
      const tr = document.createElement("tr");
      tr.innerHTML =
        '<td><span class="split-dot" style="background:' + c.color + '"></span>' + c.meta.emoji + " " + c.meta.label + "</td>" +
        "<td>" + formatEUR(c.amount) + "</td>" +
        "<td>" + pct.toFixed(0) + "%</td>";
      tbody.appendChild(tr);
    });
    if (categories.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">Geen uitgaven deze maand.</td></tr>';
    }
  }

  // ==========================================================================
  // Trend per categorie (over alle maanden)
  // ==========================================================================

  let selectedTrendCategory = null;

  function populateCategoryTrendSelect(monthStats) {
    const select = document.getElementById("category-trend-select");
    const totalsPerCategory = {};
    monthStats.forEach((m) => {
      Object.keys(m.categoryTotals).forEach((id) => {
        totalsPerCategory[id] = (totalsPerCategory[id] || 0) + m.categoryTotals[id];
      });
    });
    const available = CATEGORIES.filter((c) => totalsPerCategory[c.id] > 0);
    const list = available.length ? available : CATEGORIES;

    if (!selectedTrendCategory || !list.some((c) => c.id === selectedTrendCategory)) {
      selectedTrendCategory =
        list.slice().sort((a, b) => (totalsPerCategory[b.id] || 0) - (totalsPerCategory[a.id] || 0))[0].id;
    }

    select.innerHTML = list
      .map((c) => '<option value="' + c.id + '"' + (c.id === selectedTrendCategory ? " selected" : "") + ">" + c.emoji + " " + c.label + "</option>")
      .join("");
  }

  function renderCategoryTrend(monthStats) {
    const colors = themeColors();
    destroyChart("categoryTrend");
    const meta = categoryMeta(selectedTrendCategory);
    const color = categoryColor(selectedTrendCategory);
    const labels = monthStats.map((m) => monthLabel(m.monthId));
    const data = monthStats.map((m) => m.categoryTotals[selectedTrendCategory] || 0);

    charts.categoryTrend = new Chart(document.getElementById("chart-category-trend"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: meta.emoji + " " + meta.label,
            data,
            borderColor: color,
            backgroundColor: color,
            tension: 0.25,
            fill: false
          }
        ]
      },
      options: baseOptions(colors)
    });
  }

  function renderSummary(monthStats) {
    const n = monthStats.length;
    const avg = (fn) => (n ? monthStats.reduce((a, m) => a + fn(m), 0) / n : 0);

    document.getElementById("avg-variable").textContent = formatEUR(avg((m) => m.totalVariable));
    document.getElementById("avg-subs").textContent = formatEUR(avg((m) => m.totalSubs));
    const avgAfter = avg((m) => m.afterPaying);
    document.getElementById("avg-after").textContent = formatEUR(avgAfter);
    document.getElementById("avg-after-card").classList.toggle("negative", avgAfter < 0);
    document.getElementById("total-fuel-all").textContent = formatEUR(
      monthStats.reduce((a, m) => a + m.fuelDacia + m.fuelSeat, 0)
    );

    const first = monthStats[0].monthId;
    const last = monthStats[monthStats.length - 1].monthId;
    document.getElementById("stats-range").textContent =
      n === 1 ? "Gegevens voor " + monthLabelLong(first) + "." : "Gegevens van " + monthLabelLong(first) + " tot " + monthLabelLong(last) + " (" + n + " maanden).";
  }

  // ==========================================================================
  // Tabs
  // ==========================================================================

  function bindTabs() {
    const tabs = [
      { btn: "tab-btn-overview", panel: "tab-overview" },
      { btn: "tab-btn-split", panel: "tab-split" }
    ];
    tabs.forEach(({ btn, panel }) => {
      document.getElementById(btn).addEventListener("click", () => {
        tabs.forEach(({ btn: b, panel: p }) => {
          const isActive = b === btn;
          document.getElementById(b).classList.toggle("active", isActive);
          document.getElementById(b).setAttribute("aria-selected", isActive ? "true" : "false");
          document.getElementById(p).classList.toggle("hidden", !isActive);
        });
      });
    });
  }

  function bindCategoryTrendSelect() {
    document.getElementById("category-trend-select").addEventListener("change", (e) => {
      selectedTrendCategory = e.target.value;
      if (window.__lastMonthStats) renderCategoryTrend(window.__lastMonthStats);
    });
  }

  // ==========================================================================
  // Exporteren
  // ==========================================================================

  function setExportStatus(text, isError) {
    const el = document.getElementById("export-status");
    el.textContent = text;
    el.classList.remove("hidden");
    el.classList.toggle("export-status-error", !!isError);
  }

  function csvEscape(v) {
    const s = v == null ? "" : String(v);
    return /[",\r\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(headers, rows) {
    const lines = [headers.map(csvEscape).join(",")];
    rows.forEach((r) => lines.push(r.map(csvEscape).join(",")));
    // BOM vooraan zodat Excel het bestand herkent als UTF-8 (anders lopen
    // accenten/€ fout).
    return "﻿" + lines.join("\r\n");
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function todayStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function sortedMonthDocs() {
    return (latestMonthDocs || [])
      .map((d) => ({ id: d.id, data: d.data() || {} }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  function exportMonthlySummary() {
    const months = sortedMonthDocs();
    if (!months.length) {
      setExportStatus("Nog geen gegevens om te exporteren.", true);
      return;
    }
    const headers = [
      "Maand", "Inkomsten", "Vaste facturen", "Kredieten", "Variabele uitgaven",
      "Abonnementen", "Totale kosten", "Overschot", "Tanken Dacia", "Tanken Seat"
    ];
    const rows = months.map(({ id, data }) => {
      const income = data.income || {};
      const totalIncome = num(income.salary) + sum(income.children, "amount") + sum(income.extra, "amount");
      const activeCredits = latestCredits.filter((c) => isCreditActiveInMonth(c, id));
      const fixedOnly = sum(data.fixedBills, "amount");
      const creditsOnly = sum(activeCredits, "amount");
      const variable = sum(data.variableExpenses, "amount");
      const subs = sum(data.subscriptions, "amount");
      const totalCosts = fixedOnly + creditsOnly + variable + subs;
      const fuel = data.fuel || {};
      return [
        id, totalIncome, fixedOnly, creditsOnly, variable, subs, totalCosts, totalIncome - totalCosts,
        sum(fuel.dacia, "amount"), sum(fuel.seat, "amount")
      ].map((v) => (typeof v === "number" ? v.toFixed(2) : v));
    });
    downloadFile("gezinsbudget-maandtotalen-" + todayStamp() + ".csv", toCSV(headers, rows), "text/csv;charset=utf-8");
    setExportStatus("Maandtotalen gedownload.", false);
  }

  function exportLineItems() {
    const months = sortedMonthDocs();
    if (!months.length) {
      setExportStatus("Nog geen gegevens om te exporteren.", true);
      return;
    }
    const headers = ["Maand", "Type", "Datum", "Omschrijving", "Categorie", "Bedrag", "Betaald"];
    const rows = [];
    months.forEach(({ id, data }) => {
      (data.fixedBills || []).forEach((b) => {
        rows.push([id, "Vaste factuur", "", b.desc || "", categoryMeta(b.category).label, num(b.amount).toFixed(2), b.paid ? "Ja" : "Nee"]);
      });
      latestCredits
        .filter((c) => isCreditActiveInMonth(c, id))
        .forEach((c) => {
          const paid = (data.paidCreditIds || []).includes(c.id);
          rows.push([id, "Krediet", "", c.desc || "", categoryMeta(c.category).label, num(c.amount).toFixed(2), paid ? "Ja" : "Nee"]);
        });
      (data.variableExpenses || []).forEach((v) => {
        rows.push([id, "Variabele uitgave", v.date || "", v.desc || "", categoryMeta(v.category).label, num(v.amount).toFixed(2), v.paid ? "Ja" : "Nee"]);
      });
      (data.subscriptions || []).forEach((s) => {
        rows.push([id, "Abonnement", "", s.desc || "", "Abonnementen", num(s.amount).toFixed(2), s.paid ? "Ja" : "Nee"]);
      });
    });
    downloadFile("gezinsbudget-posten-" + todayStamp() + ".csv", toCSV(headers, rows), "text/csv;charset=utf-8");
    setExportStatus(rows.length + " posten gedownload.", false);
  }

  function serializeForBackup(value) {
    if (value == null) return value;
    if (typeof value.toDate === "function") return value.toDate().toISOString();
    if (Array.isArray(value)) return value.map(serializeForBackup);
    if (typeof value === "object") {
      const out = {};
      Object.keys(value).forEach((k) => {
        out[k] = serializeForBackup(value[k]);
      });
      return out;
    }
    return value;
  }

  function exportFullBackup() {
    setExportStatus("Back-up wordt voorbereid…", false);
    Promise.all([db.collection("months").get(), db.collection("credits").get(), db.collection("bankTransactions").get()])
      .then(([monthsSnap, creditsSnap, txSnap]) => {
        const backup = { exportedAt: new Date().toISOString(), months: {}, credits: [], bankTransactions: [] };
        monthsSnap.docs.forEach((d) => {
          backup.months[d.id] = serializeForBackup(d.data());
        });
        creditsSnap.docs.forEach((d) => {
          backup.credits.push(Object.assign({ id: d.id }, serializeForBackup(d.data())));
        });
        txSnap.docs.forEach((d) => {
          backup.bankTransactions.push(Object.assign({ id: d.id }, serializeForBackup(d.data())));
        });
        downloadFile("gezinsbudget-backup-" + todayStamp() + ".json", JSON.stringify(backup, null, 2), "application/json");
        setExportStatus("Back-up gedownload.", false);
      })
      .catch((err) => {
        console.error("Back-up maken mislukt", err);
        setExportStatus("Back-up maken mislukt: " + err.message, true);
      });
  }

  function bindExportButtons() {
    document.getElementById("export-monthly").addEventListener("click", exportMonthlySummary);
    document.getElementById("export-lineitems").addEventListener("click", exportLineItems);
    document.getElementById("export-backup").addEventListener("click", exportFullBackup);
  }

  // ==========================================================================
  // Boot
  // ==========================================================================

  function renderAll(monthStats) {
    window.__lastMonthStats = monthStats;
    if (!selectedSplitMonthId || !monthStats.some((m) => m.monthId === selectedSplitMonthId)) {
      selectedSplitMonthId = monthStats[monthStats.length - 1].monthId;
    }
    renderSummary(monthStats);
    renderOverviewCharts(monthStats);
    renderMonthPills(monthStats);
    renderSplit(monthStats.find((m) => m.monthId === selectedSplitMonthId));
    populateCategoryTrendSelect(monthStats);
    renderCategoryTrend(monthStats);
  }

  let latestMonthDocs = null;
  let latestCredits = [];

  function recomputeAndRender() {
    if (!latestMonthDocs) return;
    if (latestMonthDocs.length === 0) {
      document.getElementById("main-content").classList.remove("hidden");
      document.getElementById("stats-empty").classList.remove("hidden");
      setSyncStatus("synced");
      return;
    }
    const monthStats = latestMonthDocs
      .map((d) => computeMonthStats(d.id, d.data(), latestCredits))
      .sort((a, b) => (a.monthId < b.monthId ? -1 : a.monthId > b.monthId ? 1 : 0));

    document.getElementById("stats-empty").classList.add("hidden");
    document.getElementById("main-content").classList.remove("hidden");
    renderAll(monthStats);
    setSyncStatus("synced");
  }

  function loadAndRender() {
    setSyncStatus("loading");
    db.collection("credits").onSnapshot(
      (snap) => {
        latestCredits = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
        recomputeAndRender();
      },
      (err) => console.error("Kredieten laden mislukt", err)
    );
    db.collection("months").onSnapshot(
      (snap) => {
        latestMonthDocs = snap.docs;
        recomputeAndRender();
      },
      (err) => {
        console.error("Firestore-fout", err);
        setSyncStatus("error", "Verbindingsfout");
      }
    );
  }

  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (window.__lastMonthStats) renderAll(window.__lastMonthStats);
    });
  }

  window.addEventListener("pageshow", (e) => {
    if (e.persisted) location.reload();
  });

  document.addEventListener("DOMContentLoaded", () => {
    bindTabs();
    bindCategoryTrendSelect();
    bindExportButtons();
    if (initFirebase()) loadAndRender();
  });
})();

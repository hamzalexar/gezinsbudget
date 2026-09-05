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
  // Data aggregation
  // ==========================================================================

  function computeMonthStats(monthId, data) {
    data = data || {};
    const income = data.income || {};
    const totalIncome = num(income.salary) + sum(income.children, "amount") + sum(income.extra, "amount");
    const totalFixed = sum(data.fixedBills, "amount");
    const toTransfer = Math.max(0, totalFixed + num(data.buffer) - num(data.partnerContribution));
    const variableBudget = totalIncome - toTransfer;
    const totalVariable = sum(data.variableExpenses, "amount");
    const totalSubs = sum(data.subscriptions, "amount");
    const afterPaying = variableBudget - (totalVariable + totalSubs);
    const fuel = data.fuel || {};
    const fuelDacia = sum(fuel.dacia, "amount");
    const fuelSeat = sum(fuel.seat, "amount");
    return {
      monthId,
      totalIncome,
      totalFixed,
      totalVariable,
      totalSubs,
      totalExpenses: totalFixed + totalVariable + totalSubs,
      afterPaying,
      fuelDacia,
      fuelSeat
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
      accent: style.getPropertyValue("--accent").trim(),
      accent2: style.getPropertyValue("--accent-2").trim(),
      positive: style.getPropertyValue("--positive").trim(),
      negative: style.getPropertyValue("--negative").trim(),
      warning: style.getPropertyValue("--warning").trim()
    };
  }

  let charts = {};

  function destroyCharts() {
    Object.values(charts).forEach((c) => c && c.destroy());
    charts = {};
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

  function renderCharts(monthStats) {
    const colors = themeColors();
    destroyCharts();
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
          { label: "Variabele uitgaven", data: monthStats.map((m) => m.totalVariable), backgroundColor: colors.accent },
          { label: "Abonnementen", data: monthStats.map((m) => m.totalSubs), backgroundColor: colors.accent2 }
        ]
      },
      options: baseOptions(colors)
    });

    const last = monthStats[monthStats.length - 1];
    document.getElementById("split-month-label").textContent = monthLabelLong(last.monthId);
    charts.split = new Chart(document.getElementById("chart-split"), {
      type: "doughnut",
      data: {
        labels: ["Vaste facturen", "Abonnementen", "Variabele uitgaven"],
        datasets: [
          {
            data: [last.totalFixed, last.totalSubs, last.totalVariable],
            backgroundColor: [colors.accent, colors.accent2, colors.warning],
            borderColor: getComputedStyle(document.documentElement).getPropertyValue("--surface").trim(),
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: colors.text, usePointStyle: true, boxWidth: 8 } },
          tooltip: { callbacks: { label: (ctx) => ctx.label + ": " + formatEUR(ctx.parsed) } }
        }
      }
    });

    charts.fuel = new Chart(document.getElementById("chart-fuel"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Dacia", data: monthStats.map((m) => m.fuelDacia), backgroundColor: colors.warning },
          { label: "Seat", data: monthStats.map((m) => m.fuelSeat), backgroundColor: colors.accent }
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
  // Boot
  // ==========================================================================

  function loadAndRender() {
    setSyncStatus("loading");
    db.collection("months").onSnapshot(
      (snap) => {
        if (snap.empty) {
          document.getElementById("main-content").classList.remove("hidden");
          document.getElementById("stats-empty").classList.remove("hidden");
          setSyncStatus("synced");
          return;
        }
        const monthStats = snap.docs
          .map((d) => computeMonthStats(d.id, d.data()))
          .sort((a, b) => (a.monthId < b.monthId ? -1 : a.monthId > b.monthId ? 1 : 0));

        document.getElementById("stats-empty").classList.add("hidden");
        document.getElementById("main-content").classList.remove("hidden");
        window.__lastMonthStats = monthStats;
        renderSummary(monthStats);
        renderCharts(monthStats);
        setSyncStatus(snap.metadata.hasPendingWrites ? "saving" : "synced");
      },
      (err) => {
        console.error("Firestore-fout", err);
        setSyncStatus("error", "Verbindingsfout");
      }
    );
  }

  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (window.__lastMonthStats) renderCharts(window.__lastMonthStats);
    });
  }

  window.addEventListener("pageshow", (e) => {
    if (e.persisted) location.reload();
  });

  document.addEventListener("DOMContentLoaded", () => {
    if (initFirebase()) loadAndRender();
  });
})();

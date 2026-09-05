(function () {
  "use strict";

  const eur = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });
  function formatEUR(n) {
    if (typeof n !== "number" || isNaN(n)) n = 0;
    return eur.format(n);
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  const MONTH_SHORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  function monthLabel(monthId) {
    const [y, m] = monthId.split("-");
    return MONTH_SHORT[parseInt(m, 10) - 1] + " '" + y.slice(2);
  }

  function setSyncStatus(stateName, label) {
    const el = document.getElementById("sync-status");
    const labelEl = document.getElementById("sync-label");
    el.setAttribute("data-state", stateName);
    const labels = { loading: "Laden…", synced: "Gesynchroniseerd", error: "Fout", offline: "Offline" };
    labelEl.textContent = label || labels[stateName] || stateName;
  }

  function setUploadStatus(text, isError) {
    const el = document.getElementById("upload-status");
    el.textContent = text;
    el.classList.remove("hidden");
    el.classList.toggle("tx-status-error", !!isError);
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
  // Categorieën — zelfde lijst als js/app.js en js/stats.js, zodat
  // geïmporteerde banktransacties dezelfde kleuren/labels gebruiken als de
  // rest van de app.
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
  function categoryOptionsHTML(selectedId) {
    return CATEGORIES.map(
      (c) => '<option value="' + c.id + '"' + (c.id === selectedId ? " selected" : "") + ">" + c.emoji + " " + c.label + "</option>"
    ).join("");
  }

  // ==========================================================================
  // CSV inlezen (Argenta-export) en categoriseren
  //
  // De bank levert zelf al een ruwe `category`, maar die is voor het gros
  // van de kaartbetalingen/cash gewoon "Overig" of "Kaartbetaling/Cash" —
  // niet bruikbaar voor een echte uitgavenanalyse. We verfijnen dat met
  // trefwoorden op counterparty_name/message naar dezelfde 16 categorieën
  // die de rest van de app gebruikt, zodat dit or straks vergelijkbaar is
  // met de handmatig ingevoerde vaste/variabele kosten.
  // ==========================================================================

  function parseAmount(raw) {
    if (raw == null || raw === "") return 0;
    let s = String(raw).trim();
    const hasComma = s.indexOf(",") !== -1;
    const hasDot = s.indexOf(".") !== -1;
    if (hasComma && hasDot) {
      s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    } else if (hasComma) {
      s = s.replace(",", ".");
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function parseBool(v) {
    return String(v).trim().toLowerCase() === "true";
  }

  // Argenta's eigen ruwe categorie -> onze categorie, voor de gevallen die
  // niet via een trefwoord herkend worden.
  const RAW_CATEGORY_DEFAULTS = {
    "huur/wonen": "wonen",
    "brandstof": "transport",
    "abonnementen": "abonnement"
  };
  const RAW_CATEGORY_INCOME = ["inkomsten (overig)", "inkomsten"];

  // Trefwoorden (kleine letters) op counterparty_name + message. Eerste
  // match wint — bedoeld als startpunt, corrigeer gerust individuele
  // transacties in het controle-scherm na het inlezen.
  const KEYWORD_RULES = [
    { cat: "boodschappen", keywords: ["colruyt", "delhaize", "carrefour", "aldi", "lidl", "okay", "spar", "intermarche", "cora", "makro", "alvo", "bio-planet", "jumbo", "proxy"] },
    { cat: "eten", keywords: ["mcdonald", "quick", "kfc", "burger king", "subway", "domino", "pizza", "restaurant", "brasserie", "cafe", "café", "frituur", "friterie", "snack", "ubereats", "uber eats", "deliveroo", "takeaway", "just eat"] },
    { cat: "transport", keywords: ["total", "q8", " esso", "shell", "texaco", "lukoil", "dats 24", "nmbs", "sncb", "de lijn", "delijn", "stib", " tec ", "uber", "taxi", "parking", "q-park", "cambio", "tankstation"] },
    { cat: "kleding", keywords: ["h&m", "zara", "bershka", "primark", "c&a", "zeeman", "jbc", "decathlon", "jd sports", "veritas", "orchestra"] },
    { cat: "elektronica", keywords: ["mediamarkt", "coolblue", "krefel", "vanden borre", "fnac", "apple.com", "samsung"] },
    { cat: "verzorging", keywords: ["apotheek", "pharmacie", "kruidvat", "ici paris", "kapper", "coiffure", "wellness"] },
    { cat: "vrijetijd", keywords: ["cinema", "kinepolis", "bioscoop", "pathe", "steam", "playstation", "xbox", "bol.com", "zwembad", "fitness", "basic-fit", "basic fit", "jims"] },
    { cat: "abonnement", keywords: ["netflix", "spotify", "disney", "hbo", "dazn", "amazon prime", "youtube premium"] },
    { cat: "elec", keywords: ["engie", "luminus", "eneco", "totalenergies"] },
    { cat: "water", keywords: ["vmw", "farys", "pidpa", "water-link"] },
    { cat: "internet", keywords: ["proximus", "telenet", "orange belgium", " voo ", "edpnet", "scarlet"] },
    { cat: "verzekering", keywords: ["ethias", "axa", "ag insurance", "baloise", "dkv", "allianz", "p&v", "belfius insurance", "nn insurance"] },
    { cat: "lening", keywords: ["cetelem", "cofidis", "alpha credit"] },
    { cat: "wonen", keywords: ["syndic", "immo "] }
  ];

  function refineExpenseCategory(row) {
    const haystack = (" " + (row.counterparty_name || "") + " " + (row.message || "") + " ").toLowerCase();
    for (const rule of KEYWORD_RULES) {
      if (rule.keywords.some((kw) => haystack.indexOf(kw) !== -1)) return rule.cat;
    }
    const rawKey = String(row.category || "").trim().toLowerCase();
    if (RAW_CATEGORY_DEFAULTS[rawKey]) return RAW_CATEGORY_DEFAULTS[rawKey];
    return "overig";
  }

  function classifyRow(row, amountNum, isInternal) {
    if (isInternal) return { kind: "internal", category: null };
    const rawKey = String(row.category || "").trim().toLowerCase();
    if (amountNum > 0 || RAW_CATEGORY_INCOME.indexOf(rawKey) !== -1) return { kind: "income", category: null };
    if (amountNum === 0) return { kind: "zero", category: null };
    return { kind: "expense", category: refineExpenseCategory(row) };
  }

  function sanitizeId(s) {
    return String(s).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 220) || "x";
  }
  function hashId(basis) {
    let hash = 5381;
    for (let i = 0; i < basis.length; i++) hash = ((hash << 5) + hash + basis.charCodeAt(i)) | 0;
    return (hash >>> 0).toString(36);
  }
  // Stabiel document-ID zodat een dubbele/overlappende upload dezelfde
  // transactie gewoon overschrijft (upsert) i.p.v. dubbel te tellen.
  function transactionId(row) {
    const ref = row.reference && String(row.reference).trim();
    if (ref) return "ref-" + sanitizeId(ref);
    const basis = [row.date, row.amount, row.account, row.counterparty_account, row.message]
      .map((x) => (x == null ? "" : String(x)))
      .join("|");
    return "h-" + hashId(basis);
  }

  function buildTransaction(row) {
    const amountNum = parseAmount(row.amount);
    const isInternal = parseBool(row.is_internal_transfer);
    const cls = classifyRow(row, amountNum, isInternal);
    return {
      id: transactionId(row),
      date: (row.date || "").trim(),
      amount: amountNum,
      currency: (row.currency || "EUR").trim(),
      rawCategory: (row.category || "").trim(),
      category: cls.category,
      kind: cls.kind,
      type: (row.type || "").trim(),
      counterpartyName: (row.counterparty_name || "").trim(),
      counterpartyAccount: (row.counterparty_account || "").trim(),
      message: (row.message || "").trim(),
      account: (row.account || "").trim(),
      isInternalTransfer: isInternal,
      valueDate: (row.value_date || "").trim(),
      transactionDate: (row.transaction_date || "").trim(),
      reference: (row.reference || "").trim()
    };
  }

  // ==========================================================================
  // Upload + controlescherm
  // ==========================================================================

  let parsedRows = [];
  let categoryOverrides = {};

  function bindUpload() {
    document.getElementById("csv-file-input").addEventListener("change", (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (file) handleFile(file);
    });
    document.getElementById("preview-list").addEventListener("change", (e) => {
      if (!e.target.classList.contains("tx-cat-select")) return;
      categoryOverrides[e.target.getAttribute("data-id")] = e.target.value;
    });
    document.getElementById("confirm-import").addEventListener("click", onConfirmImport);
  }

  function handleFile(file) {
    setUploadStatus("Bestand wordt gelezen…", false);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors && results.errors.length) {
          console.warn("CSV parse-waarschuwingen", results.errors);
        }
        const rows = results.data.map(buildTransaction).filter((r) => r.date);
        if (!rows.length) {
          setUploadStatus("Geen bruikbare rijen gevonden in " + file.name + ".", true);
          return;
        }
        parsedRows = rows;
        categoryOverrides = {};
        renderPreview(rows);
        setUploadStatus(rows.length + " transacties ingelezen uit " + file.name + " — controleer de categorieën hieronder.", false);
      },
      error: (err) => {
        console.error("CSV parse-fout", err);
        setUploadStatus("Kon het bestand niet lezen: " + err.message, true);
      }
    });
  }

  function renderPreview(rows) {
    const existingIds = new Set(allTransactions.map((t) => t.id));
    const expenseCount = rows.filter((r) => r.kind === "expense").length;
    const incomeCount = rows.filter((r) => r.kind === "income").length;
    const internalCount = rows.filter((r) => r.kind === "internal").length;

    document.getElementById("preview-summary").textContent =
      expenseCount + " uitgaven · " + incomeCount + " inkomsten · " + internalCount + " interne overschrijvingen (genegeerd)";

    const html = rows
      .map((r) => {
        const known = existingIds.has(r.id) ? '<span class="tx-badge tx-badge-known">al gekend</span>' : "";
        const desc = r.counterpartyName || r.message || "(geen omschrijving)";
        const amountClass = r.amount < 0 ? "negative" : r.amount > 0 ? "positive" : "";
        let right;
        if (r.kind === "expense") {
          right = '<select class="row-category tx-cat-select" data-id="' + r.id + '">' + categoryOptionsHTML(r.category) + "</select>";
        } else if (r.kind === "internal") {
          right = '<span class="tx-badge">🔁 intern</span>';
        } else if (r.kind === "income") {
          right = '<span class="tx-badge tx-badge-income">💰 inkomen</span>';
        } else {
          right = '<span class="tx-badge">—</span>';
        }
        return (
          '<div class="row row-tx">' +
          '<div class="tx-info"><span class="tx-date">' +
          escapeHTML(r.date) +
          "</span><span class=\"tx-desc\">" +
          escapeHTML(desc) +
          "</span>" +
          known +
          "</div>" +
          '<span class="tx-amount ' +
          amountClass +
          '">' +
          formatEUR(r.amount) +
          "</span>" +
          right +
          "</div>"
        );
      })
      .join("");

    document.getElementById("preview-list").innerHTML = html;
    document.getElementById("confirm-count").textContent = rows.length;
    document.getElementById("preview-card").classList.remove("hidden");
  }

  function importRows(rows) {
    const chunkSize = 400;
    const chunks = [];
    for (let i = 0; i < rows.length; i += chunkSize) chunks.push(rows.slice(i, i + chunkSize));
    return chunks.reduce(
      (p, chunk) =>
        p.then(() => {
          const batch = db.batch();
          chunk.forEach((row) => {
            const data = Object.assign({}, row);
            delete data.id;
            data.importedAt = firebase.firestore.FieldValue.serverTimestamp();
            batch.set(db.collection("bankTransactions").doc(row.id), data, { merge: true });
          });
          return batch.commit();
        }),
      Promise.resolve()
    );
  }

  function onConfirmImport() {
    if (!parsedRows.length || !db) return;
    const rows = parsedRows.map((r) => {
      if (r.kind === "expense" && categoryOverrides[r.id]) {
        return Object.assign({}, r, { category: categoryOverrides[r.id] });
      }
      return r;
    });
    document.getElementById("confirm-import").disabled = true;
    setUploadStatus("Bezig met importeren…", false);
    importRows(rows)
      .then(() => {
        setUploadStatus(rows.length + " transacties geïmporteerd.", false);
        document.getElementById("preview-card").classList.add("hidden");
        parsedRows = [];
        categoryOverrides = {};
      })
      .catch((err) => {
        console.error("Import mislukt", err);
        setUploadStatus("Importeren mislukt: " + err.message, true);
      })
      .finally(() => {
        document.getElementById("confirm-import").disabled = false;
      });
  }

  // ==========================================================================
  // Dashboard
  // ==========================================================================

  function themeColors() {
    const style = getComputedStyle(document.documentElement);
    return {
      text: style.getPropertyValue("--text").trim(),
      muted: style.getPropertyValue("--text-muted").trim(),
      border: style.getPropertyValue("--border").trim(),
      positive: style.getPropertyValue("--positive").trim(),
      negative: style.getPropertyValue("--negative").trim()
    };
  }

  let charts = {};
  function destroyChart(key) {
    if (charts[key]) {
      charts[key].destroy();
      delete charts[key];
    }
  }

  function baseOptions(colors) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: colors.text, usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ": " + formatEUR(ctx.parsed.y != null ? ctx.parsed.y : ctx.parsed) } }
      },
      scales: {
        x: { ticks: { color: colors.muted }, grid: { color: colors.border } },
        y: { ticks: { color: colors.muted, callback: (v) => formatEUR(v) }, grid: { color: colors.border } }
      }
    };
  }

  function renderMonthlyChart(transactions) {
    const colors = themeColors();
    const byMonth = {};
    transactions.forEach((t) => {
      const monthId = t.date.slice(0, 7);
      byMonth[monthId] = byMonth[monthId] || { income: 0, expenses: 0 };
      if (t.amount > 0) byMonth[monthId].income += t.amount;
      else if (t.amount < 0) byMonth[monthId].expenses += -t.amount;
    });
    const monthIds = Object.keys(byMonth).sort();
    destroyChart("monthly");
    charts.monthly = new Chart(document.getElementById("chart-tx-overview"), {
      type: "bar",
      data: {
        labels: monthIds.map(monthLabel),
        datasets: [
          { label: "Inkomsten", data: monthIds.map((m) => byMonth[m].income), backgroundColor: colors.positive },
          { label: "Uitgaven", data: monthIds.map((m) => byMonth[m].expenses), backgroundColor: colors.negative }
        ]
      },
      options: baseOptions(colors)
    });
  }

  function renderCategorySplit(transactions) {
    const totals = {};
    transactions
      .filter((t) => t.amount < 0)
      .forEach((t) => {
        const cat = t.category || "overig";
        totals[cat] = (totals[cat] || 0) + -t.amount;
      });
    const categories = Object.keys(totals)
      .map((id) => ({ id, meta: categoryMeta(id), amount: totals[id], color: categoryColor(id) }))
      .sort((a, b) => b.amount - a.amount);
    const total = categories.reduce((a, c) => a + c.amount, 0);

    destroyChart("split");
    charts.split = new Chart(document.getElementById("chart-tx-split"), {
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

    const tbody = document.getElementById("tx-split-table-body");
    if (categories.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">Geen uitgaven gevonden.</td></tr>';
      return;
    }
    tbody.innerHTML = categories
      .map((c) => {
        const pct = total > 0 ? (c.amount / total) * 100 : 0;
        return (
          '<tr><td><span class="split-dot" style="background:' +
          c.color +
          '"></span>' +
          c.meta.emoji +
          " " +
          c.meta.label +
          "</td><td>" +
          formatEUR(c.amount) +
          "</td><td>" +
          pct.toFixed(0) +
          "%</td></tr>"
        );
      })
      .join("");
  }

  function renderTopExpenses(transactions) {
    const top = transactions
      .filter((t) => t.amount < 0)
      .sort((a, b) => a.amount - b.amount)
      .slice(0, 20);
    const tbody = document.getElementById("tx-top-table-body");
    if (!top.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">Geen uitgaven gevonden.</td></tr>';
      return;
    }
    tbody.innerHTML = top
      .map((t) => {
        const meta = categoryMeta(t.category || "overig");
        const desc = t.counterpartyName || t.message || "(geen omschrijving)";
        return (
          "<tr><td>" +
          escapeHTML(t.date) +
          "</td><td>" +
          escapeHTML(desc) +
          "</td><td>" +
          meta.emoji +
          " " +
          meta.label +
          "</td><td>" +
          formatEUR(-t.amount) +
          "</td></tr>"
        );
      })
      .join("");
  }

  function renderDashboard() {
    const nonInternal = allTransactions.filter((t) => !t.isInternalTransfer);
    const totalIncome = nonInternal.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
    const totalExpenses = nonInternal.filter((t) => t.amount < 0).reduce((a, t) => a - t.amount, 0);
    const balance = totalIncome - totalExpenses;

    document.getElementById("tx-total-income").textContent = formatEUR(totalIncome);
    document.getElementById("tx-total-expenses").textContent = formatEUR(totalExpenses);
    document.getElementById("tx-balance").textContent = formatEUR(balance);
    document.getElementById("tx-balance-card").classList.toggle("negative", balance < 0);

    const empty = allTransactions.length === 0;
    document.getElementById("tx-empty").classList.toggle("hidden", !empty);
    document.getElementById("tx-dashboard").classList.toggle("hidden", empty);
    if (empty) return;

    renderMonthlyChart(nonInternal);
    renderCategorySplit(nonInternal);
    renderTopExpenses(nonInternal);
  }

  let allTransactions = [];

  function loadAndRender() {
    setSyncStatus("loading");
    db.collection("bankTransactions").onSnapshot(
      (snap) => {
        allTransactions = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
        renderDashboard();
        document.getElementById("main-content").classList.remove("hidden");
        setSyncStatus("synced");
      },
      (err) => {
        console.error("Firestore-fout", err);
        setSyncStatus("error", "Verbindingsfout");
      }
    );
  }

  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (allTransactions.length) renderDashboard();
    });
  }

  window.addEventListener("pageshow", (e) => {
    if (e.persisted) location.reload();
  });

  document.addEventListener("DOMContentLoaded", () => {
    bindUpload();
    if (initFirebase()) loadAndRender();
  });
})();

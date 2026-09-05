(function () {
  "use strict";

  // ==========================================================================
  // Helpers
  // ==========================================================================

  const eur = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });
  function formatEUR(n) {
    if (typeof n !== "number" || isNaN(n)) n = 0;
    return eur.format(n);
  }

  function genId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function num(v) {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  function sum(list, field) {
    return (list || []).reduce((acc, item) => acc + num(item[field]), 0);
  }

  const MONTH_NAMES = [
    "januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december"
  ];

  function monthIdOf(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
  }

  function monthLabelOf(date) {
    return MONTH_NAMES[date.getMonth()] + " " + date.getFullYear();
  }

  function todayFirstOfMonth() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  // ==========================================================================
  // Default data
  // ==========================================================================

  function defaultFixedBills() {
    return [
      { id: genId(), desc: "Huur", amount: 800.65 },
      { id: genId(), desc: "Elektriciteit", amount: 220.00 },
      { id: genId(), desc: "Internet", amount: 85.90 },
      { id: genId(), desc: "Verzekering Dacia", amount: 53.44 },
      { id: genId(), desc: "Verzekering Seat", amount: 142.87 },
      { id: genId(), desc: "Verzekering Familiale", amount: 14.75 },
      { id: genId(), desc: "Afbetaling Dacia", amount: 320.27 },
      { id: genId(), desc: "Afbetaling Seat", amount: 308.31 },
      { id: genId(), desc: "Mutualiteit", amount: 35.65 },
      { id: genId(), desc: "Crèche", amount: 0.00 }
    ].map((b) => Object.assign(b, { paid: false }));
  }

  function defaultSubscriptions() {
    return [
      { id: genId(), desc: "Apple Music", amount: 0, paid: false },
      { id: genId(), desc: "YouTube Premium", amount: 25.99, paid: false },
      { id: genId(), desc: "Disney+", amount: 14.99, paid: false },
      { id: genId(), desc: "HBO Max", amount: 0, paid: false },
      { id: genId(), desc: "PS Plus", amount: 15.00, paid: false },
      { id: genId(), desc: "HP Instant Ink", amount: 3.99, paid: false },
      { id: genId(), desc: "iCloud opslag", amount: 2.99, paid: false },
      { id: genId(), desc: "iCloud opslag (Yasmine)", amount: 9.99, paid: false }
    ];
  }

  function defaultChildren() {
    return [
      { id: genId(), name: "Shahin", amount: 269.84 },
      { id: genId(), name: "Liyana", amount: 269.84 },
      { id: genId(), name: "Ayman", amount: 269.84 }
    ];
  }

  function buildDefaultMonthData() {
    return {
      income: {
        salary: 2600,
        children: defaultChildren(),
        extra: []
      },
      fixedBills: defaultFixedBills(),
      buffer: 0,
      partnerContribution: 0,
      variableExpenses: [],
      subscriptions: defaultSubscriptions(),
      fuel: { dacia: [], seat: [] }
    };
  }

  function buildFromPrevious(prev) {
    prev = prev || {};
    const prevIncome = prev.income || {};
    return {
      income: {
        salary: num(prevIncome.salary),
        children: (prevIncome.children || []).map((c) => ({ id: genId(), name: c.name || "", amount: num(c.amount) })),
        extra: []
      },
      fixedBills: (prev.fixedBills || []).map((b) => ({ id: genId(), desc: b.desc || "", amount: num(b.amount), paid: false })),
      buffer: num(prev.buffer),
      partnerContribution: num(prev.partnerContribution),
      variableExpenses: [],
      subscriptions: (prev.subscriptions || []).map((s) => ({ id: genId(), desc: s.desc || "", amount: num(s.amount), paid: false })),
      fuel: { dacia: [], seat: [] }
    };
  }

  function normalize(data) {
    data.income = data.income || {};
    data.income.salary = num(data.income.salary);
    data.income.children = (data.income.children || []).map((c) => ({ id: c.id || genId(), name: c.name || "", amount: num(c.amount) }));
    data.income.extra = (data.income.extra || []).map((e) => ({ id: e.id || genId(), desc: e.desc || "", amount: num(e.amount) }));
    data.fixedBills = (data.fixedBills || []).map((b) => ({ id: b.id || genId(), desc: b.desc || "", amount: num(b.amount), paid: !!b.paid }));
    data.buffer = num(data.buffer);
    data.partnerContribution = num(data.partnerContribution);
    data.variableExpenses = (data.variableExpenses || []).map((v) => ({ id: v.id || genId(), date: v.date || "", desc: v.desc || "", amount: num(v.amount), paid: !!v.paid }));
    data.subscriptions = (data.subscriptions || []).map((s) => ({ id: s.id || genId(), desc: s.desc || "", amount: num(s.amount), paid: !!s.paid }));
    data.fuel = data.fuel || {};
    data.fuel.dacia = (data.fuel.dacia || []).map((f) => ({ id: f.id || genId(), date: f.date || "", amount: num(f.amount) }));
    data.fuel.seat = (data.fuel.seat || []).map((f) => ({ id: f.id || genId(), date: f.date || "", amount: num(f.amount) }));
    return data;
  }

  // ==========================================================================
  // Firebase init
  // ==========================================================================

  let db = null;
  let firebaseReady = false;

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
      try {
        db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
      } catch (e) { /* offline persistence not supported, ignore */ }
      firebaseReady = true;
      return true;
    } catch (err) {
      console.error("Firebase init mislukt", err);
      setSyncStatus("error", "Configuratiefout");
      return false;
    }
  }

  // ==========================================================================
  // State
  // ==========================================================================

  const state = {
    currentDate: todayFirstOfMonth(),
    monthId: null,
    data: null,
    unsubscribe: null
  };

  // ==========================================================================
  // Sync status UI
  // ==========================================================================

  function setSyncStatus(stateName, label) {
    const el = document.getElementById("sync-status");
    const labelEl = document.getElementById("sync-label");
    el.setAttribute("data-state", stateName);
    const labels = {
      loading: "Laden…",
      initializing: "Maand voorbereiden…",
      synced: "Gesynchroniseerd",
      saving: "Opslaan…",
      error: "Fout",
      offline: "Offline"
    };
    labelEl.textContent = label || labels[stateName] || stateName;
  }

  // ==========================================================================
  // Firestore document access
  // ==========================================================================

  function monthDocRef(monthId) {
    return db.collection("months").doc(monthId);
  }

  function findPreviousMonth(monthId) {
    // Fetches the whole (small) months collection and picks the closest
    // earlier month client-side, rather than a where()+orderBy(desc) query
    // on documentId() — that combination requires a manually-created
    // Firestore composite index, which would be an extra setup step for
    // every user of this app.
    return db
      .collection("months")
      .get()
      .then((snap) => {
        const earlierIds = snap.docs.map((d) => d.id).filter((id) => id < monthId);
        if (earlierIds.length === 0) return null;
        earlierIds.sort();
        const prevId = earlierIds[earlierIds.length - 1];
        const prevDoc = snap.docs.find((d) => d.id === prevId);
        return { id: prevId, data: prevDoc.data() };
      });
  }

  function initMonthIfMissing(monthId) {
    setSyncStatus("initializing");
    return findPreviousMonth(monthId).then((prev) => {
      const base = prev ? buildFromPrevious(prev.data) : buildDefaultMonthData();
      base.meta = {
        createdFrom: prev ? prev.id : null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      const ref = monthDocRef(monthId);
      return db
        .runTransaction((tx) =>
          tx.get(ref).then((snap) => {
            if (!snap.exists) tx.set(ref, base);
          })
        )
        .then(() => {
          if (prev) showCarryOverBanner(prev.id);
        });
    });
  }

  function showCarryOverBanner(fromMonthId) {
    const [y, m] = fromMonthId.split("-");
    const label = MONTH_NAMES[parseInt(m, 10) - 1] + " " + y;
    document.getElementById("carry-over-text").textContent =
      "Vaste facturen, abonnementen, buffer en bijdrage partner werden overgenomen uit " + label + ".";
    document.getElementById("carry-over-banner").classList.remove("hidden");
  }

  // ==========================================================================
  // Loading a month
  // ==========================================================================

  function loadMonth(date) {
    const monthId = monthIdOf(date);
    state.monthId = monthId;
    state.data = null;

    document.getElementById("carry-over-banner").classList.add("hidden");
    document.getElementById("month-label").textContent = monthLabelOf(date);
    document.getElementById("main-content").classList.add("hidden");

    if (state.unsubscribe) {
      state.unsubscribe();
      state.unsubscribe = null;
    }

    if (!firebaseReady) return;

    setSyncStatus("loading");
    const ref = monthDocRef(monthId);

    let initializing = false;

    state.unsubscribe = ref.onSnapshot(
      (snap) => {
        if (state.monthId !== monthId) return; // stale listener from a previous month
        if (!snap.exists) {
          if (!initializing) {
            initializing = true;
            initMonthIfMissing(monthId).catch((err) => {
              console.error("Kon maand niet initialiseren", err);
              setSyncStatus("error", "Kon maand niet aanmaken");
            });
          }
          return;
        }
        state.data = normalize(snap.data());
        document.getElementById("main-content").classList.remove("hidden");
        render();
        setSyncStatus(snap.metadata.hasPendingWrites ? "saving" : "synced");
      },
      (err) => {
        console.error("Firestore-fout", err);
        setSyncStatus("error", "Verbindingsfout");
      }
    );
  }

  // ==========================================================================
  // Saving
  // ==========================================================================

  // Saves are debounced, but the target month/data are captured at *schedule*
  // time (not when the timer fires). This matters because navigating to a
  // different month reassigns state.data/state.monthId — without capturing
  // the reference up front, a save that fires after navigating away would
  // read the *new* month's data and the edit made just before navigating
  // would silently be lost.
  let saveTimer = null;
  let pendingSave = null; // { monthId, data }

  function performSave(monthId, data) {
    if (!monthId || !data || !firebaseReady) return;
    setSyncStatus("saving");
    const payload = Object.assign({}, data, {
      meta: Object.assign({}, data.meta, {
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      })
    });
    monthDocRef(monthId)
      .set(payload, { merge: true })
      .catch((err) => {
        console.error("Opslaan mislukt", err);
        setSyncStatus("error", "Opslaan mislukt");
      });
  }

  function scheduleSave() {
    if (!state.data || !state.monthId) return;
    pendingSave = { monthId: state.monthId, data: state.data };
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 450);
  }

  function flushSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (pendingSave) {
      const { monthId, data } = pendingSave;
      pendingSave = null;
      performSave(monthId, data);
    }
  }

  // ==========================================================================
  // Generic list sync (diff-based, preserves focus / cursor position)
  // ==========================================================================

  function syncList(container, items, buildRow, updateRow) {
    const seen = new Set();
    items.forEach((item, idx) => {
      seen.add(item.id);
      let row = container.querySelector('[data-id="' + item.id + '"]');
      if (!row) {
        row = buildRow(item);
        row.setAttribute("data-id", item.id);
      }
      updateRow(row, item);
      const atIdx = container.children[idx];
      if (atIdx !== row) container.insertBefore(row, atIdx || null);
    });
    Array.prototype.slice.call(container.children).forEach((child) => {
      if (!seen.has(child.getAttribute("data-id"))) child.remove();
    });
  }

  function setValueIfNotFocused(input, value) {
    if (document.activeElement === input) return;
    if (input.value !== String(value)) input.value = value;
  }

  // ==========================================================================
  // Rendering: KPIs
  // ==========================================================================

  function renderKPIs() {
    const d = state.data;
    const totalIncome = num(d.income.salary) + sum(d.income.children, "amount") + sum(d.income.extra, "amount");
    const totalFixed = sum(d.fixedBills, "amount");
    const toTransfer = Math.max(0, totalFixed + num(d.buffer) - num(d.partnerContribution));
    const paidFixed = sum(d.fixedBills.filter((b) => b.paid), "amount");
    const remainingOnAccount = Math.max(0, toTransfer - paidFixed);
    const variableBudget = totalIncome - toTransfer;
    const totalVariable = sum(d.variableExpenses, "amount");
    const totalSubs = sum(d.subscriptions, "amount");
    const afterPaying = variableBudget - (totalVariable + totalSubs);

    document.getElementById("total-income").textContent = formatEUR(totalIncome);
    document.getElementById("total-fixed").textContent = formatEUR(totalFixed);
    document.getElementById("total-variable").textContent = formatEUR(totalVariable);
    document.getElementById("total-subs").textContent = formatEUR(totalSubs);
    document.getElementById("total-fuel-dacia").textContent = formatEUR(sum(d.fuel.dacia, "amount"));
    document.getElementById("total-fuel-seat").textContent = formatEUR(sum(d.fuel.seat, "amount"));

    document.getElementById("kpi-transfer").textContent = formatEUR(toTransfer);
    document.getElementById("kpi-remaining").textContent = formatEUR(remainingOnAccount);
    document.getElementById("kpi-budget").textContent = formatEUR(variableBudget);
    document.getElementById("kpi-after").textContent = formatEUR(afterPaying);

    const afterCard = document.getElementById("kpi-after-card");
    afterCard.classList.toggle("negative", afterPaying < 0);
  }

  // ==========================================================================
  // Rendering: Inkomsten
  // ==========================================================================

  function renderSalary() {
    setValueIfNotFocused(document.getElementById("salary-input"), state.data.income.salary);
  }

  function buildChildRow(item) {
    const row = document.createElement("div");
    row.className = "row row-desc-amount";
    row.innerHTML =
      '<input type="text" class="child-name" placeholder="Naam" maxlength="60">' +
      '<div class="amount-input"><span class="amount-prefix">€</span>' +
      '<input type="number" class="child-amount" step="0.01" min="0" inputmode="decimal"></div>' +
      '<button type="button" class="row-remove" aria-label="Verwijder kind">×</button>';

    row.querySelector(".child-name").addEventListener("input", (e) => {
      item.name = e.target.value;
      updateItemInList(state.data.income.children, item.id, { name: e.target.value });
      scheduleSave();
    });
    row.querySelector(".child-amount").addEventListener("input", (e) => {
      updateItemInList(state.data.income.children, item.id, { amount: num(e.target.value) });
      renderKPIs();
      scheduleSave();
    });
    row.querySelector(".row-remove").addEventListener("click", () => {
      state.data.income.children = state.data.income.children.filter((c) => c.id !== item.id);
      renderChildren();
      renderKPIs();
      scheduleSave();
    });
    return row;
  }

  function renderChildren() {
    syncList(document.getElementById("children-list"), state.data.income.children, buildChildRow, (row, item) => {
      setValueIfNotFocused(row.querySelector(".child-name"), item.name);
      setValueIfNotFocused(row.querySelector(".child-amount"), item.amount);
    });
  }

  function buildExtraIncomeRow(item) {
    const row = document.createElement("div");
    row.className = "row row-desc-amount";
    row.innerHTML =
      '<input type="text" class="extra-desc" placeholder="Omschrijving (bv. bonus, RVA)" maxlength="80">' +
      '<div class="amount-input"><span class="amount-prefix">€</span>' +
      '<input type="number" class="extra-amount" step="0.01" min="0" inputmode="decimal"></div>' +
      '<button type="button" class="row-remove" aria-label="Verwijder extra inkomst">×</button>';

    row.querySelector(".extra-desc").addEventListener("input", (e) => {
      updateItemInList(state.data.income.extra, item.id, { desc: e.target.value });
      scheduleSave();
    });
    row.querySelector(".extra-amount").addEventListener("input", (e) => {
      updateItemInList(state.data.income.extra, item.id, { amount: num(e.target.value) });
      renderKPIs();
      scheduleSave();
    });
    row.querySelector(".row-remove").addEventListener("click", () => {
      state.data.income.extra = state.data.income.extra.filter((x) => x.id !== item.id);
      renderExtraIncome();
      renderKPIs();
      scheduleSave();
    });
    return row;
  }

  function renderExtraIncome() {
    syncList(document.getElementById("extra-income-list"), state.data.income.extra, buildExtraIncomeRow, (row, item) => {
      setValueIfNotFocused(row.querySelector(".extra-desc"), item.desc);
      setValueIfNotFocused(row.querySelector(".extra-amount"), item.amount);
    });
  }

  // ==========================================================================
  // Rendering: Vaste facturen
  // ==========================================================================

  function updateItemInList(list, id, patch) {
    const item = list.find((x) => x.id === id);
    if (item) Object.assign(item, patch);
  }

  function buildFixedBillRow(item) {
    const row = document.createElement("div");
    row.className = "row row-desc-amount";
    row.innerHTML =
      '<input type="text" class="bill-desc" placeholder="Omschrijving" maxlength="80">' +
      '<div class="amount-input"><span class="amount-prefix">€</span>' +
      '<input type="number" class="bill-amount" step="0.01" min="0" inputmode="decimal"></div>' +
      '<label class="row-paid"><input type="checkbox" class="bill-paid">betaald</label>' +
      '<button type="button" class="row-remove" aria-label="Verwijder factuur">×</button>';

    row.querySelector(".bill-desc").addEventListener("input", (e) => {
      updateItemInList(state.data.fixedBills, item.id, { desc: e.target.value });
      scheduleSave();
    });
    row.querySelector(".bill-amount").addEventListener("input", (e) => {
      updateItemInList(state.data.fixedBills, item.id, { amount: num(e.target.value) });
      renderKPIs();
      scheduleSave();
    });
    row.querySelector(".bill-paid").addEventListener("change", (e) => {
      updateItemInList(state.data.fixedBills, item.id, { paid: e.target.checked });
      row.classList.toggle("is-paid", e.target.checked);
      renderKPIs();
      scheduleSave();
    });
    row.querySelector(".row-remove").addEventListener("click", () => {
      state.data.fixedBills = state.data.fixedBills.filter((b) => b.id !== item.id);
      renderFixedBills();
      renderKPIs();
      scheduleSave();
    });
    return row;
  }

  function renderFixedBills() {
    syncList(document.getElementById("fixed-bills-list"), state.data.fixedBills, buildFixedBillRow, (row, item) => {
      setValueIfNotFocused(row.querySelector(".bill-desc"), item.desc);
      setValueIfNotFocused(row.querySelector(".bill-amount"), item.amount);
      const paidBox = row.querySelector(".bill-paid");
      if (document.activeElement !== paidBox) paidBox.checked = !!item.paid;
      row.classList.toggle("is-paid", !!item.paid);
    });
  }

  function renderBufferAndPartner() {
    setValueIfNotFocused(document.getElementById("buffer-input"), state.data.buffer);
    setValueIfNotFocused(document.getElementById("partner-input"), state.data.partnerContribution);
  }

  // ==========================================================================
  // Rendering: Variabele uitgaven
  // ==========================================================================

  function buildVariableRow(item) {
    const row = document.createElement("div");
    row.className = "row row-desc-amount";
    row.innerHTML =
      '<input type="date" class="var-date row-date">' +
      '<input type="text" class="var-desc" placeholder="Omschrijving" maxlength="80">' +
      '<div class="amount-input"><span class="amount-prefix">€</span>' +
      '<input type="number" class="var-amount" step="0.01" min="0" inputmode="decimal"></div>' +
      '<label class="row-paid"><input type="checkbox" class="var-paid">betaald</label>' +
      '<button type="button" class="row-remove" aria-label="Verwijder uitgave">×</button>';

    row.querySelector(".var-date").addEventListener("input", (e) => {
      updateItemInList(state.data.variableExpenses, item.id, { date: e.target.value });
      scheduleSave();
    });
    row.querySelector(".var-desc").addEventListener("input", (e) => {
      updateItemInList(state.data.variableExpenses, item.id, { desc: e.target.value });
      scheduleSave();
    });
    row.querySelector(".var-amount").addEventListener("input", (e) => {
      updateItemInList(state.data.variableExpenses, item.id, { amount: num(e.target.value) });
      renderKPIs();
      scheduleSave();
    });
    row.querySelector(".var-paid").addEventListener("change", (e) => {
      updateItemInList(state.data.variableExpenses, item.id, { paid: e.target.checked });
      row.classList.toggle("is-paid", e.target.checked);
      scheduleSave();
    });
    row.querySelector(".row-remove").addEventListener("click", () => {
      state.data.variableExpenses = state.data.variableExpenses.filter((v) => v.id !== item.id);
      renderVariableExpenses();
      renderKPIs();
      scheduleSave();
    });
    return row;
  }

  function renderVariableExpenses() {
    syncList(document.getElementById("variable-list"), state.data.variableExpenses, buildVariableRow, (row, item) => {
      setValueIfNotFocused(row.querySelector(".var-date"), item.date);
      setValueIfNotFocused(row.querySelector(".var-desc"), item.desc);
      setValueIfNotFocused(row.querySelector(".var-amount"), item.amount);
      const paidBox = row.querySelector(".var-paid");
      if (document.activeElement !== paidBox) paidBox.checked = !!item.paid;
      row.classList.toggle("is-paid", !!item.paid);
    });
  }

  // ==========================================================================
  // Rendering: Abonnementen
  // ==========================================================================

  function buildSubRow(item) {
    const row = document.createElement("div");
    row.className = "row row-desc-amount";
    row.innerHTML =
      '<input type="text" class="sub-desc" placeholder="Omschrijving" maxlength="80">' +
      '<div class="amount-input"><span class="amount-prefix">€</span>' +
      '<input type="number" class="sub-amount" step="0.01" min="0" inputmode="decimal"></div>' +
      '<label class="row-paid"><input type="checkbox" class="sub-paid">betaald</label>' +
      '<button type="button" class="row-remove" aria-label="Verwijder abonnement">×</button>';

    row.querySelector(".sub-desc").addEventListener("input", (e) => {
      updateItemInList(state.data.subscriptions, item.id, { desc: e.target.value });
      scheduleSave();
    });
    row.querySelector(".sub-amount").addEventListener("input", (e) => {
      updateItemInList(state.data.subscriptions, item.id, { amount: num(e.target.value) });
      renderKPIs();
      scheduleSave();
    });
    row.querySelector(".sub-paid").addEventListener("change", (e) => {
      updateItemInList(state.data.subscriptions, item.id, { paid: e.target.checked });
      row.classList.toggle("is-paid", e.target.checked);
      scheduleSave();
    });
    row.querySelector(".row-remove").addEventListener("click", () => {
      state.data.subscriptions = state.data.subscriptions.filter((s) => s.id !== item.id);
      renderSubscriptions();
      renderKPIs();
      scheduleSave();
    });
    return row;
  }

  function renderSubscriptions() {
    syncList(document.getElementById("subs-list"), state.data.subscriptions, buildSubRow, (row, item) => {
      setValueIfNotFocused(row.querySelector(".sub-desc"), item.desc);
      setValueIfNotFocused(row.querySelector(".sub-amount"), item.amount);
      const paidBox = row.querySelector(".sub-paid");
      if (document.activeElement !== paidBox) paidBox.checked = !!item.paid;
      row.classList.toggle("is-paid", !!item.paid);
    });
  }

  // ==========================================================================
  // Rendering: Tankbeurten
  // ==========================================================================

  function buildFuelRow(list) {
    return function (item) {
      const row = document.createElement("div");
      row.className = "row row-desc-amount";
      row.innerHTML =
        '<input type="date" class="fuel-date row-date">' +
        '<div class="amount-input"><span class="amount-prefix">€</span>' +
        '<input type="number" class="fuel-amount" step="0.01" min="0" inputmode="decimal"></div>' +
        '<button type="button" class="row-remove" aria-label="Verwijder tankbeurt">×</button>';

      row.querySelector(".fuel-date").addEventListener("input", (e) => {
        updateItemInList(list(), item.id, { date: e.target.value });
        scheduleSave();
      });
      row.querySelector(".fuel-amount").addEventListener("input", (e) => {
        updateItemInList(list(), item.id, { amount: num(e.target.value) });
        renderKPIs();
        scheduleSave();
      });
      row.querySelector(".row-remove").addEventListener("click", () => {
        const car = list();
        const idx = car.findIndex((f) => f.id === item.id);
        if (idx !== -1) car.splice(idx, 1);
        renderFuel();
        renderKPIs();
        scheduleSave();
      });
      return row;
    };
  }

  const buildDaciaFuelRow = buildFuelRow(() => state.data.fuel.dacia);
  const buildSeatFuelRow = buildFuelRow(() => state.data.fuel.seat);

  function fuelRowUpdater(row, item) {
    setValueIfNotFocused(row.querySelector(".fuel-date"), item.date);
    setValueIfNotFocused(row.querySelector(".fuel-amount"), item.amount);
  }

  function renderFuel() {
    syncList(document.getElementById("fuel-dacia-list"), state.data.fuel.dacia, buildDaciaFuelRow, fuelRowUpdater);
    syncList(document.getElementById("fuel-seat-list"), state.data.fuel.seat, buildSeatFuelRow, fuelRowUpdater);
  }

  // ==========================================================================
  // Full render
  // ==========================================================================

  function render() {
    if (!state.data) return;
    renderSalary();
    renderChildren();
    renderExtraIncome();
    renderFixedBills();
    renderBufferAndPartner();
    renderVariableExpenses();
    renderSubscriptions();
    renderFuel();
    renderKPIs();
  }

  // ==========================================================================
  // Static event bindings
  // ==========================================================================

  function bindStaticEvents() {
    document.getElementById("prev-month").addEventListener("click", () => {
      flushSave();
      state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() - 1, 1);
      loadMonth(state.currentDate);
    });
    document.getElementById("next-month").addEventListener("click", () => {
      flushSave();
      state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 1);
      loadMonth(state.currentDate);
    });
    document.getElementById("carry-over-close").addEventListener("click", () => {
      document.getElementById("carry-over-banner").classList.add("hidden");
    });

    document.getElementById("salary-input").addEventListener("input", (e) => {
      state.data.income.salary = num(e.target.value);
      renderKPIs();
      scheduleSave();
    });
    document.getElementById("buffer-input").addEventListener("input", (e) => {
      state.data.buffer = num(e.target.value);
      renderKPIs();
      scheduleSave();
    });
    document.getElementById("partner-input").addEventListener("input", (e) => {
      state.data.partnerContribution = num(e.target.value);
      renderKPIs();
      scheduleSave();
    });

    document.getElementById("add-child").addEventListener("click", () => {
      state.data.income.children.push({ id: genId(), name: "", amount: 0 });
      renderChildren();
      scheduleSave();
    });
    document.getElementById("add-extra-income").addEventListener("click", () => {
      state.data.income.extra.push({ id: genId(), desc: "", amount: 0 });
      renderExtraIncome();
      scheduleSave();
    });
    document.getElementById("add-fixed-bill").addEventListener("click", () => {
      state.data.fixedBills.push({ id: genId(), desc: "", amount: 0 });
      renderFixedBills();
      scheduleSave();
    });
    document.getElementById("add-variable").addEventListener("click", () => {
      const today = new Date();
      state.data.variableExpenses.push({
        id: genId(),
        date: today.toISOString().slice(0, 10),
        desc: "",
        amount: 0,
        paid: false
      });
      renderVariableExpenses();
      scheduleSave();
    });
    document.getElementById("add-sub").addEventListener("click", () => {
      state.data.subscriptions.push({ id: genId(), desc: "", amount: 0, paid: false });
      renderSubscriptions();
      scheduleSave();
    });
    document.getElementById("add-fuel-dacia").addEventListener("click", () => {
      state.data.fuel.dacia.push({ id: genId(), date: new Date().toISOString().slice(0, 10), amount: 0 });
      renderFuel();
      scheduleSave();
    });
    document.getElementById("add-fuel-seat").addEventListener("click", () => {
      state.data.fuel.seat.push({ id: genId(), date: new Date().toISOString().slice(0, 10), amount: 0 });
      renderFuel();
      scheduleSave();
    });
  }

  // ==========================================================================
  // Boot
  // ==========================================================================

  window.addEventListener("online", () => {
    if (state.data) setSyncStatus("synced");
  });
  window.addEventListener("offline", () => setSyncStatus("offline"));
  window.addEventListener("beforeunload", () => flushSave());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flushSave();
  });

  document.addEventListener("DOMContentLoaded", () => {
    bindStaticEvents();
    document.getElementById("month-label").textContent = monthLabelOf(state.currentDate);
    if (initFirebase()) {
      loadMonth(state.currentDate);
    }
  });
})();

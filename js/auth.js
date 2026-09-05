// Gedeeld door index.html, statistieken.html en transacties.html: initialiseert
// Firebase (eenmalig) en toont een inlogscherm tot er iemand aangemeld is,
// vóórdat de rest van de pagina ("app.js"/"stats.js"/"transacties.js") ook
// maar íets uit Firestore probeert te lezen.
(function () {
  "use strict";

  function isConfigFilledIn(cfg) {
    if (!cfg) return false;
    return Object.values(cfg).every((v) => typeof v === "string" && v.indexOf("VUL_HIER") === -1 && v.length > 0);
  }

  function loginErrorMessage(err) {
    const map = {
      "auth/invalid-email": "Ongeldig e-mailadres.",
      "auth/user-not-found": "Geen account gevonden met dit e-mailadres.",
      "auth/wrong-password": "Verkeerd wachtwoord.",
      "auth/invalid-credential": "E-mailadres of wachtwoord klopt niet.",
      "auth/too-many-requests": "Te veel mislukte pogingen, probeer straks opnieuw.",
      "auth/network-request-failed": "Geen internetverbinding."
    };
    return map[err.code] || "Inloggen mislukt: " + err.message;
  }

  function bindLoginForm(auth) {
    const form = document.getElementById("login-form");
    if (!form) return;
    const errorEl = document.getElementById("login-error");
    const submitBtn = document.getElementById("login-submit");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      errorEl.classList.add("hidden");
      submitBtn.disabled = true;
      auth
        .signInWithEmailAndPassword(document.getElementById("login-email").value.trim(), document.getElementById("login-password").value)
        .catch((err) => {
          errorEl.textContent = loginErrorMessage(err);
          errorEl.classList.remove("hidden");
        })
        .finally(() => {
          submitBtn.disabled = false;
        });
    });
  }

  function bindLogout(auth) {
    document.querySelectorAll("[data-logout]").forEach((btn) => {
      btn.addEventListener("click", () => auth.signOut());
    });
  }

  window.requireAuth = function (onReady) {
    if (typeof firebaseConfig === "undefined" || !isConfigFilledIn(firebaseConfig)) {
      const warn = document.getElementById("config-warning");
      if (warn) warn.classList.remove("hidden");
      return;
    }
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    bindLoginForm(auth);
    bindLogout(auth);

    const overlay = document.getElementById("login-overlay");
    auth.onAuthStateChanged((user) => {
      if (user) {
        if (overlay) overlay.classList.add("hidden");
        onReady();
      } else if (overlay) {
        overlay.classList.remove("hidden");
        document.getElementById("main-content") && document.getElementById("main-content").classList.add("hidden");
      }
    });
  };
})();

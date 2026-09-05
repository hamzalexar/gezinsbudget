# Gezinsbudget

Een responsive, mobile-first webapp voor maandelijks huishoudbudgetbeheer, met **realtime synchronisatie** tussen toestellen via Firebase Firestore. Geen build-tools nodig — gewoon `index.html` openen (of hosten, bv. via GitHub Pages), na het invullen van je Firebase-configuratie.

## Wat de app doet

- **Inkomsten**: loon, kinderbijslag per kind (vrij toe te voegen/verwijderen), extra inkomsten (bonus, RVA, teruggave, …).
- **Vaste facturen**: huur, elektriciteit, verzekeringen, afbetalingen, … + veiligheidsbuffer en bijdrage partner.
- **Automatisch meenemen**: bij het voor het eerst openen van een nieuwe maand worden de vaste facturen, abonnementen, veiligheidsbuffer en bijdrage partner automatisch gekopieerd uit de meest recente bestaande vorige maand (zo blijft bv. een autolening automatisch elke maand meelopen). Verwijder je een post in maand X, dan verdwijnt die vanaf maand X en alle daaropvolgende (nog niet eerder geopende) maanden; eerder al geopende maanden blijven ongewijzigd.
- **Variabele uitgaven**: vrije lijst per maand (start elke maand leeg), met datum, omschrijving, bedrag en betaald-vinkje.
- **Abonnementen**: terugkerende kosten (Apple Music, YouTube Premium, Disney+, …), blijven maand na maand meelopen, maar het betaald-vinkje wordt elke maand automatisch terug uitgevinkt.
- **Tankbeurten**: puur informatieve lijstjes per auto (Dacia/Seat), tellen niet mee in de budgetberekening.
- **KPI's bovenaan**: over te schrijven naar de gezamenlijke rekening, budget voor variabele uitgaven, en wat er na alle uitgaven deze maand nog rest.
- **Licht/donker thema**: volgt automatisch de systeeminstelling van je toestel.

## Bestandsstructuur

```
gezinsbudget/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── firebase-config.js   <- hier vul je je eigen Firebase-gegevens in
│   └── app.js
└── README.md
```

## Firebase-setup (eenmalig, ~5 minuten)

De app gebruikt **Firebase Firestore** als realtime databank, zodat jij en je partner altijd dezelfde, live-bijgewerkte gegevens zien. Firestore heeft een gratis laag ("Spark plan") die ruim voldoende is voor dit gebruik.

### 1. Firebase-project aanmaken

1. Ga naar [console.firebase.google.com](https://console.firebase.google.com/).
2. Klik op **"Project toevoegen"** (Add project) en geef het een naam, bv. `gezinsbudget`.
3. Google Analytics is niet nodig — je mag dit uitschakelen.
4. Klik op **"Project aanmaken"**.

### 2. Firestore-databank aanmaken

1. Ga in het linkermenu naar **Build → Firestore Database**.
2. Klik op **"Database maken"** (Create database).
3. Kies een locatie in de buurt (bv. `eur3 (europe-west)`).
4. Start in **testmodus** ("Start in test mode") — je past de regels hierna aan (zie stap 4).

### 3. Web-app registreren en config ophalen

1. Ga naar **Projectoverzicht → Projectinstellingen** (het tandwiel-icoon linksboven).
2. Scrol naar **"Jouw apps"** en klik op het **web-icoon (`</>`)** om een nieuwe web-app te registreren.
3. Geef de app een naam (bv. `gezinsbudget-web`) en klik op **"App registreren"**. Een Firebase Hosting-setup is niet nodig.
4. Firebase toont nu een codeblok met een object `firebaseConfig` — dit ziet er zo uit:

   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "gezinsbudget-xxxxx.firebaseapp.com",
     projectId: "gezinsbudget-xxxxx",
     storageBucket: "gezinsbudget-xxxxx.appspot.com",
     messagingSenderId: "123456789012",
     appId: "1:123456789012:web:abcdef1234567890"
   };
   ```

5. Kopieer deze waarden en plak ze in **`js/firebase-config.js`** in dit project, ter vervanging van de `"VUL_HIER_..."`-placeholders.

   > Deze waarden zijn **geen geheime sleutels** — ze zijn zichtbaar in de broncode van elke website die Firebase gebruikt. De echte beveiliging gebeurt via de Firestore Security Rules (zie hieronder), niet door deze config geheim te houden.

### 4. Firestore Security Rules instellen

Omdat de app geen inlogsysteem heeft (gewoon jij en je partner die de link openen), moeten de Firestore-regels toegang toelaten tot enkel de `months`-collectie, zonder dat de databank helemaal openstaat voor de hele wereld om te vinden/misbruiken.

Ga naar **Firestore Database → Regels** (Rules) en gebruik bijvoorbeeld:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /months/{monthId} {
      allow read, write: if true;
    }
  }
}
```

> **Let op:** dit staat lezen/schrijven toe voor iedereen die de exacte Firebase-config kent (dus in de praktijk: iedereen die de broncode van jouw site kan bekijken). Voor een privé gezinsbudget zonder gevoelige/financiële identificatiegegevens is dit meestal aanvaardbaar, maar wil je het steviger afschermen, dan kan je Firebase Authentication toevoegen (bv. met een simpele e-mail/wachtwoord-login voor jou en je partner) en de regel vervangen door:
>
> ```
> allow read, write: if request.auth != null;
> ```
>
> en vervolgens inloggen toevoegen aan de app. Dit valt buiten de basisopzet van dit project, maar Firebase Authentication is met enkele extra regels toe te voegen mocht je dit willen.

Klik op **"Publiceren"** (Publish).

### 5. Testen

1. Open `index.html` in je browser (gewoon dubbelklikken, of host het bv. via **GitHub Pages**: Settings → Pages → Deploy from branch).
2. Als de configuratie correct is ingevuld, zie je bovenaan **"Gesynchroniseerd"** verschijnen en worden de standaardgegevens van de huidige maand geladen.
3. Open de app op een tweede toestel (of tweede browsertab) — wijzigingen die je op het ene toestel maakt, verschijnen automatisch op het andere.

### Hosten via GitHub Pages (optioneel)

1. Push deze repo naar GitHub.
2. Ga naar **Settings → Pages**.
3. Kies bij **"Source"** de branch `main` en map `/ (root)`.
4. Na enkele minuten is de app bereikbaar op `https://<jouw-gebruikersnaam>.github.io/gezinsbudget/`.

## Hoe de gegevens opgeslagen worden

Elke maand wordt opgeslagen als één document in de Firestore-collectie `months`, met als document-ID het formaat `YYYY-MM` (bv. `2026-09`). Bij het voor het eerst openen van een maand die nog niet bestaat, wordt automatisch gekeken naar het meest recente bestaande vorige maand-document, en worden vaste facturen, abonnementen (betaald-vinkje gereset), veiligheidsbuffer, bijdrage partner, loon en kinderbijslag daaruit gekopieerd. Variabele uitgaven, extra inkomsten en tankbeurten starten altijd leeg voor een nieuwe maand.

## Browserondersteuning

De app gebruikt de Firebase **compat SDK** (klassieke `<script>`-tags, geen ES modules), zodat het bestand zelf probleemloos laadt wanneer je `index.html` rechtstreeks vanaf schijf opent (`file://`), zonder CORS-problemen bij het inladen van scripts.

> **Let op:** de realtime Firestore-synchronisatie zelf werkt in sommige browsers (met name Safari) **niet** wanneer de pagina via `file://` geopend is — dat blokkeert uit veiligheidsoverwegingen netwerkverkeer vanaf lokale bestanden, los van je Firebase-configuratie of -regels. Je ziet dan foutmeldingen zoals *"Fetch API cannot load ... due to access control checks"*. Host de app daarom via **GitHub Pages** (zie hierboven) of een lokale webserver (bv. `python3 -m http.server` in de projectmap, dan `http://localhost:8000` openen) — dat lost dit meteen op, en is voor twee toestellen die dezelfde gegevens delen sowieso de praktische aanpak.

Een actieve internetverbinding is nodig voor synchronisatie; Firestore-offline-persistentie is ingeschakeld zodat reeds geladen gegevens ook offline zichtbaar blijven.

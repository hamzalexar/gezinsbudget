# Gezinsbudget

Een responsive, mobile-first webapp voor maandelijks huishoudbudgetbeheer, met **realtime synchronisatie** tussen toestellen via Firebase Firestore. Geen build-tools nodig — gewoon `index.html` openen (of hosten, bv. via GitHub Pages), na het invullen van je Firebase-configuratie.

## Wat de app doet

- **Overzichtsscherm + aparte schermen per sectie**: de startpagina toont enkel de KPI's en compacte samenvattingskaarten (totaal + aantal posten) per sectie. Tik op een kaart om de volledige, bewerkbare lijst van die sectie te openen — zo hoef je niet langs alle andere secties te scrollen voor één wijziging.
- **Categorieën**: vaste facturen, kredieten en variabele uitgaven krijgen elk een categorie (Wonen, Elektriciteit & Gas, Verzekeringen, Boodschappen, Transport, …) voor latere analyse. Via de ➕ (op een sectiekaart, of de zwevende knop rechtsonder) kies je eerst het type (eenmalig / vast / krediet) en dan de categorie — de nieuwe post wordt meteen aangemaakt in de juiste lijst, klaar om in te vullen.
- **Inkomsten**: loon, kinderbijslag per kind (vrij toe te voegen/verwijderen), extra inkomsten (bonus, RVA, teruggave, …).
- **Vaste facturen**: huur, elektriciteit, verzekeringen, afbetalingen, … + veiligheidsbuffer en bijdrage partner.
- **Automatisch meenemen**: bij het voor het eerst openen van een nieuwe maand worden de vaste facturen, abonnementen, veiligheidsbuffer en bijdrage partner automatisch gekopieerd uit de meest recente bestaande vorige maand. Verwijder je een post in maand X, dan verdwijnt die vanaf maand X en alle daaropvolgende (nog niet eerder geopende) maanden; eerder al geopende maanden blijven ongewijzigd. **Let op**: een post die je pas ná het aanmaken van latere maanden toevoegt, bereikt die al bestaande latere maanden niet automatisch — gebruik daarvoor een **krediet** (zie hieronder).
- **Kredieten**: voor kosten met een vaste looptijd (bv. een autolening). Een krediet heeft een "van"- en optionele "tot"-maand en wordt, in tegenstelling tot vaste facturen, niet gekopieerd maar **elke keer opnieuw berekend** op basis van die datums — het verschijnt en verdwijnt dus automatisch in élke maand binnen die periode, ook in maanden die al eerder geopend waren. Voor statistieken/analyse blijft een maand altijd tellen wat er in díe maand echt actief was, ook nadat de looptijd van het krediet is afgelopen — dat verandert enkel als je de datums of het bedrag zelf achteraf aanpast.
- **Variabele uitgaven**: vrije lijst per maand (start elke maand leeg), met datum, omschrijving, bedrag en betaald-vinkje.
- **Abonnementen**: terugkerende kosten (Apple Music, YouTube Premium, Disney+, …), blijven maand na maand meelopen, maar het betaald-vinkje wordt elke maand automatisch terug uitgevinkt.
- **Tankbeurten**: puur informatieve lijstjes per auto (Dacia/Seat), tellen niet mee in de budgetberekening.
- **KPI's bovenaan**: "Over te schrijven naar de gezamenlijke rekening" start op het totaal van alle kosten (vaste facturen + kredieten + variabele uitgaven + abonnementen, want alles wordt vanaf die rekening betaald) en daalt automatisch zodra je om het even welke van die posten als betaald aanvinkt. "Totale kosten deze maand" is hetzelfde kostenplaatje maar dan als vast referentiecijfer (verandert niet als je betaalt). "Vrij te besteden" = inkomsten min de totale kosten — één rechtstreeks cijfer dat daalt naarmate je uitgaven ingeeft.
- **"Te betalen op rekening"-overzicht**: aparte sectiekaart die vaste facturen en kredieten van de maand samen als één lijst toont, met een betaald-vinkje per post — zo hoef je niet tussen Vaste facturen en Kredieten te wisselen om te zien wat daarvan nog moet gebeuren. Afvinken hier werkt rechtstreeks door naar die schermen en naar de KPI's bovenaan. Variabele uitgaven en abonnementen hebben elk al hun eigen scherm met betaald-vinkjes en staan daarom niet nog eens in dit overzicht.
- **Statistieken**: aparte pagina met grafieken over alle opgeslagen maanden (inkomsten vs. uitgaven, variabele uitgaven/abonnementen per maand, budgetverdeling per maand, tankkosten per auto). Onderaan die pagina kan je je gegevens ook exporteren: maandtotalen (CSV), alle losse posten (CSV, elke vaste factuur/krediet/variabele uitgave/abonnement apart met maand en categorie), of een volledige back-up (JSON, alle maanden + kredieten + banktransacties in één bestand).
- **Transacties (bank-export importeren)**: aparte pagina om periodiek (bv. maandelijks of per kwartaal) je Argenta-exports (.xlsx, per rekening) te uploaden — je mag de bestanden van al je rekeningen tegelijk selecteren. De transacties worden automatisch voorgecategoriseerd (op basis van tegenpartij/omschrijving) in dezelfde categorieën als de rest van de app — je kan dat voor het importeren nog corrigeren, en per transactie ook zelf "intern" aan-/uitvinken. Overschrijvingen tussen je eigen rekeningen (inclusief spaarpotjes/kinderrekeningen — zie `OWN_ACCOUNTS` in `js/transacties.js`, IBAN's zonder spaties, met commentaar erbij welke rekening het is) worden uitgesloten bij de totalen, zodat geld dat je gewoon binnen het gezin verplaatst niet dubbel telt. Inkomend geld op de gemeenschappelijke rekening dat geen kindergeld is en niet van een eigen rekening komt, wordt apart gemarkeerd ("⚠️ controleer") zodat je het kan nakijken (bv. een kredietopname of onverwachte overschrijving) — er is ook een apart dashboard-lijstje daarvoor. Toont verder inkomsten vs. uitgaven per maand, uitgaven per categorie en je grootste uitgaven. Een herhaalde/overlappende upload overschrijft gewoon dezelfde transacties (geen dubbeltelling), want elke transactie krijgt een stabiel document-ID op basis van de bankreferentie. Kom je een nieuwe eigen rekening tegen (bv. een nieuw spaarpotje) die nog niet herkend wordt? Voeg het IBAN toe aan `OWN_ACCOUNTS`, of vink de transactie manueel aan als "intern" in het controlescherm.
- **Inloggen**: e-mailadres + wachtwoord (Firebase Authentication) vooraleer je gegevens te zien krijgt — zo kan niet zomaar iedereen die de link vindt meekijken of bewerken. Uitloggen kan via het 🚪-icoontje in de titelbalk van elke pagina.
- **Licht/donker thema**: volgt automatisch de systeeminstelling van je toestel.

## Bestandsstructuur

```
gezinsbudget/
├── index.html
├── statistieken.html
├── transacties.html
├── css/
│   ├── style.css
│   ├── stats.css
│   └── transacties.css
├── js/
│   ├── firebase-config.js   <- hier vul je je eigen Firebase-gegevens in
│   ├── auth.js              <- inlogscherm, gedeeld door alle 3 pagina's
│   ├── app.js
│   ├── stats.js
│   └── transacties.js
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

### 4. Inloggen instellen (Firebase Authentication)

De app toont een inlogscherm (e-mailadres + wachtwoord) vooraleer je gegevens te zien krijgt, zodat niet zomaar iedereen die de link vindt kan meekijken of bewerken.

1. Ga in het linkermenu naar **Build → Authentication** en klik op **"Aan de slag"** (Get started).
2. Kies bij **Sign-in method** de provider **E-mail/wachtwoord** (Email/Password) en schakel die in (Enable) — laat "E-maillink" gerust uit.
3. Ga naar het tabblad **Users** en klik op **"Gebruiker toevoegen"** (Add user) — maak een account voor jezelf aan (e-mailadres + wachtwoord naar keuze) en herhaal dit voor je partner.

### 5. Firestore Security Rules instellen

Nu er een echt inlogsysteem is, mogen de Firestore-regels toegang beperken tot enkel aangemelde gebruikers, zonder dat de databank openstaat voor iedereen die de Firebase-config kent.

Ga naar **Firestore Database → Regels** (Rules) en gebruik bijvoorbeeld:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /months/{monthId} {
      allow read, write: if request.auth != null;
    }
    match /credits/{creditId} {
      allow read, write: if request.auth != null;
    }
    match /bankTransactions/{transactionId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

> **Let op:** heb je nog een oudere versie van deze app zonder login gebruikt (regels met `allow read, write: if true;`)? Zet eerst stap 4 hierboven op (provider inschakelen + minstens één gebruiker aanmaken) vóór je deze regels publiceert — anders kan niemand, ook jijzelf niet, nog bij de gegevens tot je bent ingelogd.

Klik op **"Publiceren"** (Publish).

### 6. Testen

1. Open `index.html` in je browser (gewoon dubbelklikken, of host het bv. via **GitHub Pages**: Settings → Pages → Deploy from branch).
2. Log in met het e-mailadres/wachtwoord dat je in stap 4 hebt aangemaakt.
3. Als de configuratie correct is ingevuld, zie je bovenaan **"Gesynchroniseerd"** verschijnen en worden de standaardgegevens van de huidige maand geladen.
4. Open de app op een tweede toestel (of tweede browsertab) — wijzigingen die je op het ene toestel maakt, verschijnen automatisch op het andere. Elk toestel/tab moet wel apart inloggen (via 🚪 in de titelbalk kan je uitloggen).

### Hosten via GitHub Pages (optioneel)

1. Push deze repo naar GitHub.
2. Ga naar **Settings → Pages**.
3. Kies bij **"Source"** de branch `main` en map `/ (root)`.
4. Na enkele minuten is de app bereikbaar op `https://<jouw-gebruikersnaam>.github.io/gezinsbudget/`.

## Hoe de gegevens opgeslagen worden

Elke maand wordt opgeslagen als één document in de Firestore-collectie `months`, met als document-ID het formaat `YYYY-MM` (bv. `2026-09`). Bij het voor het eerst openen van een maand die nog niet bestaat, wordt automatisch gekeken naar het meest recente bestaande vorige maand-document, en worden vaste facturen, abonnementen (betaald-vinkje gereset), veiligheidsbuffer, bijdrage partner, loon en kinderbijslag daaruit gekopieerd. Variabele uitgaven, extra inkomsten en tankbeurten starten altijd leeg voor een nieuwe maand.

Kredieten staan apart in de collectie `credits` (één document per krediet, met `desc`, `amount`, `startMonth` en `endMonth`), losstaand van de maand-documenten. Elke maand berekent zelf, op basis van die datums, welke kredieten die maand meetellen — er wordt dus niets gekopieerd, en een wijziging aan een krediet werkt met terugwerkende kracht door in alle maanden binnen zijn looptijd.

## Browserondersteuning

De app gebruikt de Firebase **compat SDK** (klassieke `<script>`-tags, geen ES modules), zodat het bestand zelf probleemloos laadt wanneer je `index.html` rechtstreeks vanaf schijf opent (`file://`), zonder CORS-problemen bij het inladen van scripts.

> **Let op:** de realtime Firestore-synchronisatie zelf werkt in sommige browsers (met name Safari) **niet** wanneer de pagina via `file://` geopend is — dat blokkeert uit veiligheidsoverwegingen netwerkverkeer vanaf lokale bestanden, los van je Firebase-configuratie of -regels. Je ziet dan foutmeldingen zoals *"Fetch API cannot load ... due to access control checks"*. Host de app daarom via **GitHub Pages** (zie hierboven) of een lokale webserver (bv. `python3 -m http.server` in de projectmap, dan `http://localhost:8000` openen) — dat lost dit meteen op, en is voor twee toestellen die dezelfde gegevens delen sowieso de praktische aanpak.

Een actieve internetverbinding is nodig voor synchronisatie; Firestore-offline-persistentie is ingeschakeld zodat reeds geladen gegevens ook offline zichtbaar blijven.

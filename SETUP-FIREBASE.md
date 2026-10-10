# Firebase einrichten

## Kurz-Checkliste

1. [Firebase Console](https://console.firebase.google.com/) öffnen → **Projekt hinzufügen** (Name z. B. `zero-synergy`)
2. **Realtime Database** anlegen (Region z. B. `europe-west1`, Testmodus ok)
3. Tab **Regeln** → Regeln aus Abschnitt 3 unten → **Veröffentlichen**
4. **Projekteinstellungen** (Zahnrad) → **Deine Apps** → **Web** (`</>`) → App registrieren
5. Im Dialog **`firebaseConfig`** kopieren — die 4 Felder `apiKey`, `authDomain`, `databaseURL`, `projectId`
6. In `firebase-config.js` eintragen (Vorlage: `firebase-config.TEMPLATE.js`)
7. Für Strats: **Storage** aktivieren und `storage.rules` veröffentlichen (Abschnitt 6)
8. Committen & nach `master` pushen → 1–2 Min warten → Seite neu laden → Status **„Live · synchronisiert“**

Ohne echte Werte bleibt der Banner **„Firebase nicht konfiguriert“** — die App nutzt dann nur **localStorage**.

---

## 1. Projekt anlegen

1. [Firebase Console](https://console.firebase.google.com/)
2. **Projekt hinzufügen** → z. B. `zero-synergy` → Analytics optional (aus ist ok)

## 2. Realtime Database (nicht Firestore!)

1. Links: **Build** → **Realtime Database**
2. **Datenbank erstellen** → Region `europe-west1` → Testmodus ok

## 3. Sicherheitsregeln (Realtime Database)

**Direktlink (Projekt `znrgy-ccb87`):**  
[https://console.firebase.google.com/project/znrgy-ccb87/database/znrgy-ccb87-default-rtdb/rules](https://console.firebase.google.com/project/znrgy-ccb87/database/znrgy-ccb87-default-rtdb/rules)

Tab **Regeln** → einfügen → **Veröffentlichen**:

```json
{
  "rules": {
    "teams": {
      "zero-synergy": {
        ".read": true,
        "comps": {
          ".write": true
        },
        "strats-meta": {
          ".write": true
        },
        "$node": {
          ".write": "$node != 'grid'"
        },
        "grid": {
          ".read": true,
          "$cell": {
            ".write": true,
            ".validate": "$cell.matches(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\|(1[3-9]|2[0-3]):00\\|(Fynn|Muchel|Bjarne|Lucas|Jona|Lukas)$/) && newData.isString() && (newData.val() == 'green' || newData.val() == 'yellow' || newData.val() == 'red')"
          }
        }
      }
    }
  }
}
```

Gleiche Regeln liegen im Repo als **`database.rules.json`** (`firebase deploy --only database`).

Comps und Strats-Metadaten bleiben beschreibbar. Der Knoten `teams/zero-synergy/grid` selbst darf nicht ersetzt oder gelöscht werden; einzelne Zellen (`green` / `yellow` / `red`, oder eine Zelle auf null) schon. Nicht wieder `.write: true` auf den ganzen Team-Knoten setzen — das würde den Schutz aufheben.

**Wichtig:** Der Firebase-**Testmodus** setzt oft zeitlich begrenzte Regeln (`now < …`). Nach Ablauf (~30 Tage) liefert die API **`Permission denied`** / die App zeigt **„Zugriff VERWEIGERT“**. Dann Regeln oben erneut einfügen und **Veröffentlichen** — Config und Pfad `teams/zero-synergy/` müssen dafür nicht geändert werden.

## 4. Web-App & Config kopieren

| Schritt | Wo in der Console |
|--------|-------------------|
| Einstellungen | Projektübersicht → Zahnrad **Projekteinstellungen** |
| Web-App | Nach unten scrollen → **Deine Apps** → **Web** (`</>`) |
| Registrieren | Nickname z. B. `zero-synergy-web` → **App registrieren** |
| Kopieren | Objekt **`firebaseConfig`** — nicht `firebase-config.js` im Repo verwechseln! |

Aus der Console (Beispiel):

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "zero-synergy-xxxxx.firebaseapp.com",
  databaseURL: "https://zero-synergy-xxxxx-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "zero-synergy-xxxxx",
  storageBucket: "zero-synergy-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

In **`firebase-config.js`** nur diese 4 Zeilen (mit `window.FIREBASE_CONFIG`):

```javascript
window.FIREBASE_CONFIG = {
  apiKey: "… aus firebaseConfig.apiKey",
  authDomain: "… aus firebaseConfig.authDomain",
  databaseURL: "… aus firebaseConfig.databaseURL",
  projectId: "… aus firebaseConfig.projectId",
  storageBucket: "… aus firebaseConfig.storageBucket",
};
```

`databaseURL` muss die **Realtime-Database-URL** sein (enthält oft `default-rtdb` und die Region).

## 5. Deploy (GitHub Pages)

```powershell
cd C:\Users\Fynn\bge-team-availability
git add firebase-config.js
git commit -m "Firebase-Konfiguration für Team-Sync"
git push origin master
```

Der Web-API-Key ist öffentlich — Schutz kommt von den **Regeln** (Schritt 3).

## Hilfe

| Symptom | Lösung |
|--------|--------|
| Banner „Firebase nicht konfiguriert“ | Platzhalter in `firebase-config.js` ersetzen, pushen |
| „Verbinde…“ bleibt hängen | Realtime Database existiert? Regeln **veröffentlicht**? Nach 10 s zeigt die App Offline/REST-Hinweis — F12 → Konsole |
| Status „Offline“ / „Zugriff VERWEIGERT“ | Regeln (Abschnitt 3) **veröffentlichen** — oft abgelaufener Testmodus; `databaseURL` prüfen; F12 |
| Nur „Nur lokal“ | Config fehlt oder ungültig |
| Strats: Upload 0 % / Timeout | [Storage aktivieren](https://console.firebase.google.com/project/znrgy-ccb87/storage), Regeln aus `storage.rules`, `storageBucket` prüfen |
| Strats: Upload scheitert lokal | Nicht `file://` — `py -m http.server 8765`, dann `http://127.0.0.1:8765/strats-map.html?map=…` |

**Datenpfad in der DB:** `teams/zero-synergy/grid` (Availability), `teams/zero-synergy/comps` (Team Comps), `teams/zero-synergy/strats-meta/{map}` (Strats-Metadaten)

## 6. Firebase Storage (Strats) — **Pflicht für Uploads**

Map-Strats (PDF/Bilder) landen in **Firebase Storage**. Ohne aktiviertes Storage bleibt der Upload bei **0 %** stehen und bricht nach 30 Sekunden ab.

**Kurz-Checkliste (Deutsch):** [TROUBLESHOOTING-UPLOAD.md](TROUBLESHOOTING-UPLOAD.md) — „Was du falsch machen könntest“ vs. „Was in Firebase fehlt“.

**Direktlink (Projekt `znrgy-ccb87`):**  
[https://console.firebase.google.com/project/znrgy-ccb87/storage](https://console.firebase.google.com/project/znrgy-ccb87/storage)

### Storage aktivieren (Console)

| Schritt | Was du siehst / tust |
|--------|----------------------|
| 1 | [Firebase Console](https://console.firebase.google.com/) → Projekt **`znrgy-ccb87`** wählen |
| 2 | Links **Build** → **Storage** |
| 3 | Erstes Mal: große Schaltfläche **Loslegen** / **Get started** (nicht nur die Übersicht ohne Bucket) |
| 4 | Assistent: **Im Testmodus starten** oder Produktionsmodus — für das Team reicht Testmodus + eigene Regeln |
| 5 | **Speicherort** wählen, z. B. **`europe-west1`** (wie Realtime Database) → **Fertig** |
| 6 | Nach dem Setup: Tab **Dateien** zeigt den leeren Bucket; Tab **Regeln** ist editierbar |

**Screenshot-Merkmale:** Vor Aktivierung steht oft „Storage einrichten“ / „Get started“. Danach siehst du Tabs **Dateien** und **Regeln** sowie einen Bucket-Namen (z. B. `znrgy-ccb87.firebasestorage.app`).

### Storage-Regeln veröffentlichen

1. Tab **Regeln** in der Console (oder Datei `storage.rules` im Repo).
2. Regeln einfügen → **Veröffentlichen**:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /teams/zero-synergy/strats/{map}/{fileName} {
      allow read, write: if true;
    }
  }
}
```

**Optional per CLI** (nach `npm install -g firebase-tools` und `firebase login` im Projektordner):

```powershell
cd C:\Users\Fynn\bge-team-availability
firebase deploy --only storage
```

(`firebase.json` im Repo verweist bereits auf `storage.rules`.)

### `storageBucket` in der Web-Config

1. **Projekteinstellungen** (Zahnrad) → **Deine Apps** → Web-App (`</>`).
2. Im Objekt **`firebaseConfig`** den Wert **`storageBucket`** kopieren.
3. In **`firebase-config.js`** eintragen — für dieses Projekt z. B.:

```javascript
storageBucket: "znrgy-ccb87.firebasestorage.app",
```

Falscher oder fehlender Bucket → Upload hängt bei 0 % oder Fehler „bucket not found“.

**Pfade:**  
- Storage: `teams/zero-synergy/strats/{mapSlug}/{id}_{dateiname}`  
- RTDB-Metadaten: `teams/zero-synergy/strats-meta/{mapSlug}` (`id`, `name`, `storagePath`, `downloadURL`, `type`, `uploadedAt`)

### Strats lokal testen (Upload)

Nicht per Doppelklick (`file://`) — Firebase blockiert Uploads dort.

```powershell
cd C:\Users\Fynn\bge-team-availability
py -m http.server 8765
```

Browser: `http://127.0.0.1:8765/strats-map.html?map=ascent`

| Upload-Symptom | Ursache / Lösung |
|----------------|------------------|
| Bleibt bei **0 %**, Abbruch nach 30 s | **Storage nicht aktiviert** (häufigste Ursache) → Abschnitt oben, [Storage-Console](https://console.firebase.google.com/project/znrgy-ccb87/storage) |
| Banner „file://“ | Lokalen Webserver nutzen (siehe oben) |
| „Zugriff verweigert“ | Storage-Regeln veröffentlichen (`storage.rules`) |
| „Storage nicht aktiviert“ / retry-limit | Console → Build → Storage → **Loslegen** |
| „Netzwerkfehler“ | `http://127.0.0.1` oder `http://localhost`, kein `file://` |
| Datei zu groß | Max. 10 MB |

In `strats-map.html` müssen `firebase-storage-compat.js` und `firebase-config.js` mit gesetztem `storageBucket` geladen sein.

## Optional: Firebase CLI

Nicht nötig für GitHub Pages. Nur für Regeln-Deploy o. Ä.:

```powershell
npm install -g firebase-tools
firebase login
```

`firebase login` öffnet den Browser — einmalig mit Google-Konto bestätigen.

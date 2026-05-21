# Firebase einrichten

## Kurz-Checkliste

1. [Firebase Console](https://console.firebase.google.com/) öffnen → **Projekt hinzufügen** (Name z. B. `zero-synergy`)
2. **Realtime Database** anlegen (Region z. B. `europe-west1`, Testmodus ok)
3. Tab **Regeln** → Regeln aus Abschnitt 3 unten → **Veröffentlichen**
4. **Projekteinstellungen** (Zahnrad) → **Deine Apps** → **Web** (`</>`) → App registrieren
5. Im Dialog **`firebaseConfig`** kopieren — die 4 Felder `apiKey`, `authDomain`, `databaseURL`, `projectId`
6. In `firebase-config.js` eintragen (Vorlage: `firebase-config.TEMPLATE.js`)
7. Committen & nach `master` pushen → 1–2 Min warten → Seite neu laden → Status **„Live · synchronisiert“**

Ohne echte Werte bleibt der Banner **„Firebase nicht konfiguriert“** — die App nutzt dann nur **localStorage**.

---

## 1. Projekt anlegen

1. [Firebase Console](https://console.firebase.google.com/)
2. **Projekt hinzufügen** → z. B. `zero-synergy` → Analytics optional (aus ist ok)

## 2. Realtime Database (nicht Firestore!)

1. Links: **Build** → **Realtime Database**
2. **Datenbank erstellen** → Region `europe-west1` → Testmodus ok

## 3. Sicherheitsregeln

Tab **Regeln** → einfügen → **Veröffentlichen**:

```json
{
  "rules": {
    "teams": {
      "zero-synergy": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

Jeder mit dem Link kann lesen/schreiben — für ein kleines Team mit privatem Link oft ausreichend.

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
| Status „Offline“ / „Zugriff verweigert“ | Regeln (Abschnitt 3), `databaseURL`, Browser-Konsole (F12) |
| Nur „Nur lokal“ | Config fehlt oder ungültig |

**Datenpfad in der DB:** `teams/zero-synergy/grid`

## Optional: Firebase CLI

Nicht nötig für GitHub Pages. Nur für Regeln-Deploy o. Ä.:

```powershell
npm install -g firebase-tools
firebase login
```

`firebase login` öffnet den Browser — einmalig mit Google-Konto bestätigen.

# Firebase einrichten (ca. 5 Minuten)

Damit **alle Zero-Synergy-Spieler dieselbe Tabelle** sehen und bearbeiten, brauchst du ein kostenloses Firebase-Projekt mit **Realtime Database**.

## 1. Projekt anlegen

1. Öffne [Firebase Console](https://console.firebase.google.com/)
2. **Projekt hinzufügen** → Name z. B. `zero-synergy-availability` → Google Analytics optional (kann aus)
3. Warten, bis das Projekt fertig ist

## 2. Realtime Database aktivieren

1. Links: **Build** → **Realtime Database**
2. **Datenbank erstellen**
3. Region wählen (z. B. `europe-west1`)
4. Beim Start **Testmodus** ist ok — gleich passen wir die Regeln an

## 3. Sicherheitsregeln (wichtig)

Tab **Regeln** → folgenden Inhalt einfügen und **Veröffentlichen**:

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

**Hinweis:** Jeder mit dem Link kann lesen und schreiben. Für ein kleines Team mit privatem Link ist das oft ausreichend. Für mehr Schutz später: Firebase Authentication ergänzen.

## 4. Web-App registrieren & Config kopieren

1. Projektübersicht → Zahnrad **Projekteinstellungen**
2. Nach unten: **Deine Apps** → Symbol **Web** (`</>`)
3. App-Nickname z. B. `zero-synergy-web` → **App registrieren**
4. `firebaseConfig` anzeigen — du brauchst mindestens:
   - `apiKey`
   - `authDomain`
   - `databaseURL` (Realtime Database URL!)
   - `projectId`

## 5. `firebase-config.js` im Projekt füllen

1. Datei `firebase-config.example.js` nach `firebase-config.js` kopieren (falls noch nicht geschehen)
2. Platzhalter durch deine echten Werte ersetzen, z. B.:

```javascript
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "zero-synergy-xxx.firebaseapp.com",
  databaseURL: "https://zero-synergy-xxx-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "zero-synergy-xxx",
};
```

3. **Committen und nach GitHub pushen** (`master`), damit GitHub Pages die Config lädt  
   (Der API-Key ist für Web-Apps öffentlich — entscheidend sind die **Regeln** in Schritt 3.)

4. 1–2 Minuten warten, Seite neu laden: Status sollte **„Live · synchronisiert“** zeigen.

## 6. Optional: Firebase CLI (lokal)

Nur für Regeln deployen oder Hosting — **nicht nötig** für GitHub Pages (SDK kommt per CDN).

```powershell
npm install -g firebase-tools
firebase login
```

`firebase login` öffnet den Browser — das musst du selbst ausführen.

## Datenpfad

Die App speichert unter: `teams/zero-synergy/grid`

## Ohne Config

Solange `firebase-config.js` noch Platzhalter enthält (`DEIN_API_KEY`), zeigt die Seite einen Hinweis und nutzt **nur localStorage** (wie früher, nicht teamweit).

## Hilfe

- Banner: „Firebase nicht konfiguriert“ → Schritte 4–5
- Status „Offline“ → Regeln prüfen, `databaseURL` prüfen, Browser-Konsole (F12)

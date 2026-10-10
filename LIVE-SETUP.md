# Live-Website (GitHub Pages)

Kurz erklärt, was die Meldungen auf **https://spassigxd.github.io/bek-otto-lost/** bedeuten und was du tun musst.

## „Zugriff VERWEIGERT“ / Availability nicht live

**Ursache:** Die Realtime-Database-Regeln blockieren Lesen/Schreiben (sehr oft: **Testmodus abgelaufen** nach ~30 Tagen). Config und Pfad `teams/zero-synergy/…` sind korrekt — ohne veröffentlichte Regeln liefert Firebase `Permission denied` (HTTP 401).

**Sofort-Fix in der Firebase Console (Pflicht):**

1. Öffne: [Realtime Database → Regeln](https://console.firebase.google.com/project/znrgy-ccb87/database/znrgy-ccb87-default-rtdb/rules)
2. Projekt **`znrgy-ccb87`** wählen (falls noch nicht).
3. Tab **Regeln** — Inhalt durch Folgendes ersetzen (oder aus `database.rules.json` im Repo kopieren):

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

Nicht `.write: true` auf ganz `teams/zero-synergy` setzen. Das würde erlauben, das Availability-Grid auf einmal zu löschen.

4. Oben rechts **Veröffentlichen** klicken (ohne das bleibt alles gesperrt).
5. Live-Seite hart neu laden (**Strg+F5**) → Status sollte **„Live · synchronisiert“** zeigen. Sonst **„Erneut verbinden“**.

Optional per CLI (nach `npm i -g firebase-tools` und `firebase login`):

```powershell
cd C:\Users\Fynn\bge-team-availability
firebase deploy --only database
```

---

## Strats-Upload-Meldungen

- **`firebase-config.js` fehlt auf der Website** — Die Datei liegt lokal vor, wurde aber nicht mit auf GitHub gepusht (oder die Seite lädt sie nicht). Ohne sie kennt die Live-Seite dein Firebase-Projekt nicht. Lösung: `firebase-config.js` ins Repo committen und pushen (API-Keys sind für Web-Apps öffentlich vorgesehen).
- **`storageBucket` fehlt … bitte deployen** — Die Config ist auf dem Server unvollständig (nur Database, kein Storage-Bucket). In `firebase-config.js` muss `storageBucket: "znrgy-ccb87.firebasestorage.app"` stehen — Wert aus Firebase Console → Projekteinstellungen → Deine Apps.
- **`Storage in Console aktivieren (Loslegen)`** — Firebase Storage ist im Projekt noch nicht gestartet. Console → Build → Storage → **Loslegen** (nach Blaze-Plan).
- **`Regeln veröffentlichen`** — Storage läuft, aber Lese/Schreib-Zugriff blockiert. Console → Storage → **Regeln** → `storage.rules` aus dem Repo veröffentlichen.
- **Lokal ging’s, live nicht** — Blaze und Regeln waren bei dir schon richtig; typisch fehlt nur die vollständige `firebase-config.js` auf GitHub Pages. Nach Push 1–2 Minuten warten, Seite hart neu laden (Strg+F5).

Weitere Details: `SETUP-FIREBASE.md`, Upload-Hilfe: `TROUBLESHOOTING-UPLOAD.md`.

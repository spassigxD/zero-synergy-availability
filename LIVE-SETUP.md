# Live-Website (GitHub Pages) — Strats-Upload

Kurz erklärt, was die Meldungen auf **spassigxd.github.io** bedeuten und was du tun musst.

- **`firebase-config.js fehlt auf der Website`** — Die Datei liegt lokal vor, wurde aber nicht mit auf GitHub gepusht (oder die Seite lädt sie nicht). Ohne sie kennt die Live-Seite dein Firebase-Projekt nicht. Lösung: `firebase-config.js` ins Repo committen und pushen (API-Keys sind für Web-Apps öffentlich vorgesehen).
- **`storageBucket fehlt … bitte deployen`** — Die Config ist auf dem Server unvollständig (nur Database, kein Storage-Bucket). In `firebase-config.js` muss `storageBucket: "znrgy-ccb87.firebasestorage.app"` stehen — Wert aus Firebase Console → Projekteinstellungen → Deine Apps.
- **`Storage in Console aktivieren (Loslegen)`** — Firebase Storage ist im Projekt noch nicht gestartet. Console → Build → Storage → **Loslegen** (nach Blaze-Plan).
- **`Regeln veröffentlichen`** — Storage läuft, aber Lese/Schreib-Zugriff blockiert. Console → Storage → **Regeln** → `storage.rules` aus dem Repo veröffentlichen.
- **Lokal ging’s, live nicht** — Blaze und Regeln waren bei dir schon richtig; typisch fehlt nur die vollständige `firebase-config.js` auf GitHub Pages. Nach Push 1–2 Minuten warten, Seite hart neu laden (Strg+F5).

Weitere Details: `SETUP-FIREBASE.md`, Upload-Hilfe: `TROUBLESHOOTING-UPLOAD.md`.

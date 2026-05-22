# Strats-Upload — Fehlersuche (Zero Synergy)

Projekt: **znrgy-ccb87** · Bucket: **znrgy-ccb87.firebasestorage.app**

Wenn der Upload bei **0 %** hängen bleibt und nach **30 Sekunden** abbricht, ist fast immer **Firebase Storage im Projekt noch nicht aktiviert**. Die Realtime Database allein reicht **nicht**.

---

## Was du richtig machst

- Seite über **http://127.0.0.1:8765/strats-map.html?map=ascent** (oder andere Map) — nicht per Doppelklick
- Lokaler Server läuft (`py -m http.server 8765`) — Terminal offen lassen
- `firebase-config.js` enthält gültige Werte inkl. `storageBucket: "znrgy-ccb87.firebasestorage.app"`
- Datei ist **PDF, JPG, PNG oder WebP** und **≤ 10 MB**
- In der Firebase Console bist du im Projekt **znrgy-ccb87** (nicht ein anderes Projekt)

Auf der Strats-Map-Seite: Button **„Storage-Status prüfen“** — **grün** = Bucket erreichbar, **rot** = Storage in Firebase noch einrichten.

---

## Was du falsch machen könntest (Checkliste)

1. **HTML per Doppelklick geöffnet (`file://`)**  
   → Upload blockiert. Stattdessen: Server starten, URL `http://127.0.0.1:8765/...` im Browser öffnen.

2. **Kein lokaler Webserver / Terminal geschlossen**  
   → Seite lädt nicht oder Upload bricht ab. Server neu starten, URL erneut öffnen.

3. **Falsche URL** (z. B. nur `strats.html` ohne Map, oder ohne `?map=ascent`)  
   → Map-Upload-Seite: `strats-map.html?map=ascent` (Map-Name klein: ascent, bind, …).

4. **Datei zu groß oder falsches Format**  
   → Max. 10 MB; nur PDF, JPG, PNG, WebP.

5. **Anderes Firebase-Projekt in der Console**  
   → Oben links muss **znrgy-ccb87** stehen.

6. **Storage-Regeln nie veröffentlicht** (wenn Storage schon aktiv ist)  
   → Tab **Regeln** → Inhalt aus `storage.rules` → **Veröffentlichen**. Sonst: `storage/unauthorized`.

7. **Nur Realtime Database eingerichtet, Storage nie „Loslegen“ geklickt**  
   → Typisch: 0 %, Timeout nach 30 s. Siehe Abschnitt „Was in Firebase fehlt“.

---

## Was in Firebase noch fehlen muss

**API-Test (ohne Login):**  
`GET https://firebasestorage.googleapis.com/v0/b/znrgy-ccb87.firebasestorage.app/o?maxResults=1`

| HTTP-Code | Bedeutung |
|-----------|-----------|
| **404** | Storage **nicht aktiviert** — Bucket existiert nicht. **Du musst den Storage-Assistenten abschließen.** |
| **200** | Bucket existiert und ist per API erreichbar. |
| **403** | Bucket kann existieren; Regeln oder Berechtigung prüfen. |

**RTDB allein reicht nicht.** Ohne Storage-Setup gibt es keinen Bucket für Dateien.

---

## Nächster Klick in der Console (exakt)

1. Öffnen: [Firebase Console → Storage (znrgy-ccb87)](https://console.firebase.google.com/project/znrgy-ccb87/storage)
2. Mit Google-Konto anmelden, das Zugriff auf **znrgy-ccb87** hat.
3. Links: **Build** → **Storage**.
4. Wenn du **„Loslegen“** / **„Get started“** siehst: **darauf klicken** (nicht nur die leere Übersicht).
5. Modus wählen (z. B. **Im Testmodus starten**), Region **europe-west1** (wie RTDB) → **Fertig**.
6. Danach Tabs **Dateien** und **Regeln** sichtbar → Tab **Regeln** → Inhalt aus `storage.rules` im Repo → **Veröffentlichen**.
7. Optional: **Projekteinstellungen** → **Deine Apps** → Web-App → `storageBucket` mit `firebase-config.js` abgleichen.
8. Browser: `http://127.0.0.1:8765/strats-map.html?map=ascent` neu laden → Upload erneut testen.

---

## Fehlermeldung in der App (Timeout)

Nach 30 Sekunden ohne Fortschritt:

- Code: **`upload/timeout`**
- Text u. a.: *„Upload bleibt bei 0 % stehen — nach 30 Sekunden abgebrochen.“*
- Schritte in der App verweisen auf die Storage-Console und `SETUP-FIREBASE.md` Abschnitt 6.

---

## Mehr Details

- [SETUP-FIREBASE.md](SETUP-FIREBASE.md) — Abschnitt **6. Firebase Storage (Strats)**
- `storage.rules` im Projektordner
- CLI (optional): `npm install -g firebase-tools`, `firebase login`, `firebase deploy --only storage`

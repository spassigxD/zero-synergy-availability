const PLAYERS = ["Joletsgoo", "spassig", "stefan", "horus", "Haidew", "Pascal", "Keena"];

const DAYS = [
  { id: "monday", label: "Monday", class: "monday" },
  { id: "tuesday", label: "Tuesday", class: "tuesday" },
  { id: "wednesday", label: "Wednesday", class: "wednesday" },
  { id: "thursday", label: "Thursday", class: "thursday" },
  { id: "friday", label: "Friday", class: "friday" },
  { id: "saturday", label: "Saturday", class: "saturday" },
  { id: "sunday", label: "Sunday", class: "sunday" },
];

const TIMES = [];
for (let h = 13; h <= 22; h++) {
  TIMES.push(`${h}:00`);
}

const STORAGE_KEY = "zero-synergy-availability-v1";
const MIGRATION_KEY = "zero-synergy-firebase-migrated-v1";
const FIREBASE_GRID_PATH = "teams/zero-synergy/grid";
const FIREBASE_SDK_TIMEOUT_MS = 5000;

let selectedColor = "green";
let grid = {};
let isPainting = false;
let hasDragged = false;
let paintStartCell = null;
let paintOriginColor = null;

let useFirebase = false;
let dbRef = null;
let firebaseBootstrapped = false;
let firebaseSdkTimer = null;
let saveTimer = null;
let lastPushedJson = null;

function isFirebaseConfigured() {
  const c = window.FIREBASE_CONFIG;
  if (!c || !c.apiKey || !c.databaseURL) return false;
  if (c.apiKey === "DEIN_API_KEY" || String(c.apiKey).includes("DEIN")) return false;
  if (String(c.databaseURL).includes("dein-projekt")) return false;
  return true;
}

function firebaseRestBase() {
  return String(window.FIREBASE_CONFIG.databaseURL).replace(/\/$/, "");
}

function loadGridFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function saveGridToLocalStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(grid));
}

function schedulePersist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistGrid, 150);
}

async function persistGridViaRest() {
  const url = `${firebaseRestBase()}/${FIREBASE_GRID_PATH}.json`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(grid),
  });
  if (!res.ok) {
    const err = new Error(`http_${res.status}`);
    err.code = res.status === 401 || res.status === 403 ? "PERMISSION_DENIED" : "HTTP_ERROR";
    throw err;
  }
}

function persistGrid() {
  const json = JSON.stringify(grid);
  saveGridToLocalStorage();

  if (!useFirebase) return;

  lastPushedJson = json;

  const onWriteError = (err) => {
    console.error("[firebase] write failed", err?.code, err?.message);
    setSyncStatus(
      err?.code === "PERMISSION_DENIED" ? "error-rules" : "offline-local"
    );
    persistGridViaRest()
      .then(() => setSyncStatus("live"))
      .catch((restErr) => {
        console.error("[firebase] REST write failed", restErr?.code, restErr?.message);
        setSyncStatus(
          restErr?.code === "PERMISSION_DENIED" ? "error-rules" : "offline-local"
        );
      });
  };

  if (dbRef) {
    dbRef.set(grid).then(() => setSyncStatus("live")).catch(onWriteError);
  } else {
    persistGridViaRest().then(() => setSyncStatus("live")).catch(onWriteError);
  }
}

function setRetryVisible(visible) {
  const btn = document.getElementById("retrySync");
  if (btn) btn.hidden = !visible;
}

function setSyncStatus(mode) {
  const el = document.getElementById("syncStatus");
  if (!el) return;
  el.className = "sync-status";
  el.removeAttribute("title");
  setRetryVisible(false);

  if (mode === "loading") {
    el.textContent = "Synchronisiere…";
    el.classList.add("sync-status--connecting");
  } else if (mode === "live") {
    el.textContent = "Live · synchronisiert";
    el.classList.add("sync-status--live");
  } else if (mode === "offline") {
    el.textContent = "Offline";
    el.classList.add("sync-status--offline");
    el.title =
      "Keine Verbindung zur Realtime Database. Prüfe Regeln in der Firebase Console (Veröffentlichen) und die Netzwerkverbindung.";
    setRetryVisible(true);
  } else if (mode === "offline-local") {
    el.textContent = "Offline (nur lokal)";
    el.classList.add("sync-status--offline");
    el.title =
      "Der Plan ist sichtbar und lokal bearbeitbar. Team-Sync folgt, sobald Firebase erreichbar ist.";
    setRetryVisible(true);
  } else if (mode === "error-rules") {
    el.textContent = "Zugriff verweigert";
    el.classList.add("sync-status--offline");
    el.title =
      "Prüfe Realtime Database Regeln in Firebase Console (teams/zero-synergy) und klicke Veröffentlichen.";
    setRetryVisible(true);
  } else if (mode === "local") {
    el.textContent = "Nur lokal";
    el.classList.add("sync-status--local");
  }
}

function setBannerVisible(visible) {
  const banner = document.getElementById("configBanner");
  if (banner) banner.hidden = !visible;
}

function cellKey(dayId, time, player) {
  return `${dayId}|${time}|${player}`;
}

function getCell(dayId, time, player) {
  return grid[cellKey(dayId, time, player)] ?? null;
}

function setCell(dayId, time, player, color) {
  const key = cellKey(dayId, time, player);
  if (color) {
    grid[key] = color;
  } else {
    delete grid[key];
  }
  schedulePersist();
}

function refreshAllCells() {
  document.querySelectorAll(".schedule-cell").forEach((cell) => {
    const { day, time, player } = cell.dataset;
    updateCellUI(cell, getCell(day, time, player));
  });
}

function applyRemoteGrid(remote) {
  const json = JSON.stringify(remote || {});
  if (json === lastPushedJson) return;
  grid = remote && typeof remote === "object" ? remote : {};
  refreshAllCells();
  saveGridToLocalStorage();
  setSyncStatus("live");
}

function buildSchedule() {
  const main = document.getElementById("schedule");
  main.innerHTML = "";

  for (const day of DAYS) {
    const card = document.createElement("section");
    card.className = "day-card";
    card.innerHTML = `
      <h2 class="day-card__title day-card__title--${day.class}">${day.label}</h2>
      <div class="schedule-wrap">
        <div class="schedule-grid" data-day="${day.id}"></div>
      </div>
    `;
    main.appendChild(card);

    const gridEl = card.querySelector(".schedule-grid");
    gridEl.style.gridTemplateColumns = `72px repeat(${PLAYERS.length}, minmax(88px, 1fr))`;

    const timeHead = document.createElement("div");
    timeHead.className = "schedule-grid__head schedule-grid__head--time";
    timeHead.textContent = "Zeit";
    gridEl.appendChild(timeHead);

    for (const player of PLAYERS) {
      const head = document.createElement("div");
      head.className = "schedule-grid__head";
      head.textContent = player;
      gridEl.appendChild(head);
    }

    for (const time of TIMES) {
      const timeLabel = document.createElement("div");
      timeLabel.className = "schedule-grid__time";
      timeLabel.textContent = time;
      gridEl.appendChild(timeLabel);

      for (const player of PLAYERS) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "schedule-cell";
        cell.dataset.day = day.id;
        cell.dataset.time = time;
        cell.dataset.player = player;
        cell.setAttribute(
          "aria-label",
          `${day.label} ${time} ${player}`
        );

        const color = getCell(day.id, time, player);
        if (color) {
          cell.classList.add(`schedule-cell--${color}`);
          cell.setAttribute("aria-pressed", "true");
        } else {
          cell.setAttribute("aria-pressed", "false");
        }

        cell.addEventListener("mousedown", onCellMouseDown);
        cell.addEventListener("mouseenter", onCellMouseEnter);
        cell.addEventListener("touchstart", onCellTouchStart, { passive: true });
        gridEl.appendChild(cell);
      }
    }
  }
}

function updateCellUI(cell, color) {
  if (color) {
    cell.className = `schedule-cell schedule-cell--${color}`;
    cell.setAttribute("aria-pressed", "true");
  } else {
    cell.className = "schedule-cell";
    cell.setAttribute("aria-pressed", "false");
  }
}

function applyPaint(cell) {
  const { day, time, player } = cell.dataset;
  if (selectedColor === "erase") {
    setCell(day, time, player, null);
    updateCellUI(cell, null);
  } else {
    setCell(day, time, player, selectedColor);
    updateCellUI(cell, selectedColor);
  }
}

function applyToggle(cell, originColor) {
  const { day, time, player } = cell.dataset;
  if (selectedColor === "erase") {
    setCell(day, time, player, null);
    updateCellUI(cell, null);
    return;
  }
  if (originColor === selectedColor) {
    setCell(day, time, player, null);
    updateCellUI(cell, null);
  } else {
    setCell(day, time, player, selectedColor);
    updateCellUI(cell, selectedColor);
  }
}

function startPainting(cell) {
  isPainting = true;
  hasDragged = false;
  paintStartCell = cell;
  const { day, time, player } = cell.dataset;
  paintOriginColor = getCell(day, time, player);
  applyPaint(cell);
  document.body.classList.add("is-painting");
}

function stopPainting() {
  if (!isPainting) return;
  if (!hasDragged && paintStartCell) {
    applyToggle(paintStartCell, paintOriginColor);
  }
  isPainting = false;
  hasDragged = false;
  paintStartCell = null;
  paintOriginColor = null;
  document.body.classList.remove("is-painting");
}

function onCellMouseDown(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  startPainting(e.currentTarget);
}

function onCellMouseEnter(e) {
  if (!isPainting) return;
  const cell = e.currentTarget;
  if (cell !== paintStartCell) hasDragged = true;
  applyPaint(cell);
}

function cellFromTouchEvent(e) {
  const t = e.touches[0] ?? e.changedTouches[0];
  if (!t) return null;
  const el = document.elementFromPoint(t.clientX, t.clientY);
  return el?.closest?.(".schedule-cell") ?? null;
}

function onCellTouchStart(e) {
  startPainting(e.currentTarget);
}

function onTouchMove(e) {
  if (!isPainting) return;
  const cell = cellFromTouchEvent(e);
  if (cell) {
    if (cell !== paintStartCell) hasDragged = true;
    applyPaint(cell);
  }
  e.preventDefault();
}

function initColorPalette() {
  const buttons = document.querySelectorAll(".color-btn[data-color]");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedColor = btn.dataset.color;
      buttons.forEach((b) => {
        const active = b === btn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", String(active));
      });
    });
  });
}

function bootstrapUI() {
  grid = loadGridFromLocalStorage();
  buildSchedule();
}

function initLocalOnly() {
  useFirebase = false;
  setBannerVisible(true);
  setSyncStatus("local");
}

async function fetchGridViaRest() {
  const url = `${firebaseRestBase()}/${FIREBASE_GRID_PATH}.json`;
  const res = await fetch(url);
  if (res.status === 404) {
    const err = new Error("database_not_found");
    err.code = "DATABASE_NOT_FOUND";
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`http_${res.status}`);
    err.code = res.status === 401 || res.status === 403 ? "PERMISSION_DENIED" : "HTTP_ERROR";
    throw err;
  }
  const data = await res.json();
  return data && typeof data === "object" ? data : {};
}

function applyInitialRemoteGrid(remote) {
  const remoteGrid = remote && typeof remote === "object" ? remote : {};
  const hasRemote = Object.keys(remoteGrid).length > 0;
  const localGrid = loadGridFromLocalStorage();
  const hasLocal = Object.keys(localGrid).length > 0;
  const migrated = localStorage.getItem(MIGRATION_KEY);

  if (!hasRemote && hasLocal && !migrated) {
    grid = { ...localGrid };
    localStorage.setItem(MIGRATION_KEY, "1");
    persistGrid();
  } else {
    grid = remoteGrid;
    if (hasRemote) localStorage.setItem(MIGRATION_KEY, "1");
  }
  refreshAllCells();
  saveGridToLocalStorage();
}

function clearFirebaseSdkTimer() {
  if (firebaseSdkTimer) {
    clearTimeout(firebaseSdkTimer);
    firebaseSdkTimer = null;
  }
}

function finishFirebaseBootstrap(remote, source) {
  if (firebaseBootstrapped) return;
  firebaseBootstrapped = true;
  clearFirebaseSdkTimer();
  applyInitialRemoteGrid(remote);
  setSyncStatus("live");
  console.info("[firebase] bootstrap via", source);
}

function failFirebaseStartup(err) {
  clearFirebaseSdkTimer();
  console.error("[firebase] startup failed", err?.code, err?.message || err);

  const isRules =
    err?.code === "PERMISSION_DENIED" ||
    err?.code === "permission_denied";

  if (!firebaseBootstrapped) {
    firebaseBootstrapped = true;
    grid = loadGridFromLocalStorage();
    refreshAllCells();
  }
  setSyncStatus(isRules ? "error-rules" : "offline-local");
}

async function bootstrapFirebaseViaRest() {
  try {
    const remote = await fetchGridViaRest();
    finishFirebaseBootstrap(remote, "rest");
    return true;
  } catch (err) {
    console.warn("[firebase] REST bootstrap failed", err?.code, err?.message);
    if (!firebaseBootstrapped) {
      setSyncStatus(
        err?.code === "PERMISSION_DENIED" ? "error-rules" : "offline-local"
      );
    }
    return false;
  }
}

function attachFirebaseRealtimeListener() {
  if (!dbRef) return;

  dbRef.on(
    "value",
    (snapshot) => {
      if (!firebaseBootstrapped) {
        finishFirebaseBootstrap(snapshot.val(), "sdk-value");
        return;
      }
      applyRemoteGrid(snapshot.val());
    },
    (err) => {
      console.error("[firebase] on(value) error", err?.code, err?.message);
      if (!firebaseBootstrapped) {
        failFirebaseStartup(err);
        return;
      }
      setSyncStatus(
        err?.code === "PERMISSION_DENIED" ? "error-rules" : "offline-local"
      );
    }
  );
}

function initFirebaseSdk() {
  try {
    const app = getFirebaseApp();
    const db = firebase.database(app);
    dbRef = db.ref(FIREBASE_GRID_PATH);

    db.ref(".info/connected").on("value", (snap) => {
      if (snap.val() === true) {
        console.info("[firebase] websocket connected");
      }
    });

    firebaseSdkTimer = setTimeout(() => {
      if (firebaseBootstrapped) return;
      console.warn(
        "[firebase] SDK listener timeout after",
        FIREBASE_SDK_TIMEOUT_MS,
        "ms"
      );
      bootstrapFirebaseViaRest();
    }, FIREBASE_SDK_TIMEOUT_MS);

    attachFirebaseRealtimeListener();
  } catch (err) {
    console.error("[firebase] SDK init exception", err);
    clearFirebaseSdkTimer();
    bootstrapFirebaseViaRest();
  }
}

function getFirebaseApp() {
  if (firebase.apps.length > 0) return firebase.app();
  return firebase.initializeApp(window.FIREBASE_CONFIG);
}

function initFirebase() {
  useFirebase = true;
  firebaseBootstrapped = false;
  setBannerVisible(false);
  setSyncStatus("loading");

  bootstrapFirebaseViaRest().then((ok) => {
    if (!ok && !firebaseBootstrapped) {
      /* grid already visible from bootstrapUI; status set in REST catch */
    }
    if (typeof firebase !== "undefined") {
      initFirebaseSdk();
    }
  });
}

async function retryFirebaseSync() {
  if (!isFirebaseConfigured()) return;
  setSyncStatus("loading");
  firebaseBootstrapped = false;
  clearFirebaseSdkTimer();
  const ok = await bootstrapFirebaseViaRest();
  if (!ok) return;
  if (typeof firebase !== "undefined" && !dbRef) {
    initFirebaseSdk();
  }
}

function initSync() {
  bootstrapUI();
  if (typeof firebase !== "undefined" && isFirebaseConfigured()) {
    initFirebase();
  } else {
    initLocalOnly();
  }
}

document.getElementById("resetAll").addEventListener("click", () => {
  if (
    !confirm(
      "Alle Einträge löschen? Dies kann nicht rückgängig gemacht werden."
    )
  ) {
    return;
  }
  grid = {};
  persistGrid();
  buildSchedule();
});

document.getElementById("retrySync")?.addEventListener("click", () => {
  retryFirebaseSync();
});

document.addEventListener("mouseup", stopPainting);
document.addEventListener("touchend", stopPainting);
document.addEventListener("touchcancel", stopPainting);
document.addEventListener("touchmove", onTouchMove, { passive: false });

initColorPalette();
initSync();

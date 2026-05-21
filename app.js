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
const FIREBASE_CONNECT_TIMEOUT_MS = 10000;

let selectedColor = "green";
let grid = {};
let isPainting = false;
let hasDragged = false;
let paintStartCell = null;
let paintOriginColor = null;

let useFirebase = false;
let dbRef = null;
let firebaseReady = false;
let firebaseBootstrapped = false;
let firebaseConnectTimer = null;
let saveTimer = null;
let lastPushedJson = null;

function isFirebaseConfigured() {
  const c = window.FIREBASE_CONFIG;
  if (!c || !c.apiKey || !c.databaseURL) return false;
  if (c.apiKey === "DEIN_API_KEY" || String(c.apiKey).includes("DEIN")) return false;
  if (String(c.databaseURL).includes("dein-projekt")) return false;
  return true;
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

function persistGrid() {
  const json = JSON.stringify(grid);
  if (useFirebase && dbRef) {
    lastPushedJson = json;
    dbRef
      .set(grid)
      .then(() => setSyncStatus("live"))
      .catch((err) => {
        console.error("[firebase] write failed", err?.code, err?.message);
        setSyncStatus(
          err?.code === "PERMISSION_DENIED" ? "error-rules" : "offline"
        );
      });
  } else {
    saveGridToLocalStorage();
  }
}

function setSyncStatus(mode) {
  const el = document.getElementById("syncStatus");
  if (!el) return;
  el.className = "sync-status";
  el.removeAttribute("title");
  if (mode === "loading") {
    el.textContent = "Verbinde…";
    el.classList.add("sync-status--connecting");
  } else if (mode === "live") {
    el.textContent = "Live · synchronisiert";
    el.classList.add("sync-status--live");
  } else if (mode === "offline") {
    el.textContent = "Offline";
    el.classList.add("sync-status--offline");
    el.title =
      "Keine Verbindung zur Realtime Database. Prüfe Regeln in der Firebase Console (Veröffentlichen) und die Netzwerkverbindung.";
  } else if (mode === "error-rules") {
    el.textContent = "Zugriff verweigert";
    el.classList.add("sync-status--offline");
    el.title =
      "Prüfe Realtime Database Regeln in Firebase Console (teams/zero-synergy) und klicke Veröffentlichen.";
  } else if (mode === "local") {
    el.textContent = "Nur lokal";
    el.classList.add("sync-status--local");
  }
}

function setBannerVisible(visible) {
  const banner = document.getElementById("configBanner");
  if (banner) banner.hidden = !visible;
}

function setScheduleLocked(locked) {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.hidden = !locked;
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
  if (!firebaseReady) return;
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

function initLocalOnly() {
  useFirebase = false;
  setBannerVisible(true);
  setSyncStatus("local");
  grid = loadGridFromLocalStorage();
  firebaseReady = true;
  setScheduleLocked(false);
  buildSchedule();
}

function getFirebaseApp() {
  if (firebase.apps.length > 0) return firebase.app();
  return firebase.initializeApp(window.FIREBASE_CONFIG);
}

async function fetchGridViaRest() {
  const base = String(window.FIREBASE_CONFIG.databaseURL).replace(/\/$/, "");
  const url = `${base}/${FIREBASE_GRID_PATH}.json`;
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
}

function clearFirebaseConnectTimer() {
  if (firebaseConnectTimer) {
    clearTimeout(firebaseConnectTimer);
    firebaseConnectTimer = null;
  }
}

function unlockFirebaseSchedule() {
  firebaseReady = true;
  setScheduleLocked(false);
  buildSchedule();
}

function finishFirebaseBootstrap(remote, source) {
  if (firebaseBootstrapped) return;
  firebaseBootstrapped = true;
  clearFirebaseConnectTimer();
  applyInitialRemoteGrid(remote);
  unlockFirebaseSchedule();
  setSyncStatus("live");
  console.info("[firebase] connected via", source);
}

function failFirebaseStartup(err) {
  clearFirebaseConnectTimer();
  console.error("[firebase] startup failed", err?.code, err?.message || err);

  const isRules =
    err?.code === "PERMISSION_DENIED" ||
    err?.code === "permission_denied";
  if (!firebaseBootstrapped) {
    firebaseBootstrapped = true;
    grid = loadGridFromLocalStorage();
    unlockFirebaseSchedule();
  }
  setSyncStatus(isRules ? "error-rules" : "offline");
}

function initFirebase() {
  useFirebase = true;
  firebaseBootstrapped = false;
  setBannerVisible(false);
  setSyncStatus("loading");
  setScheduleLocked(true);

  try {
    const app = getFirebaseApp();
    const db = firebase.database(app);
    dbRef = db.ref(FIREBASE_GRID_PATH);

    db.ref(".info/connected").on("value", (snap) => {
      if (snap.val() === true) {
        console.info("[firebase] websocket connected");
      }
    });

    firebaseConnectTimer = setTimeout(async () => {
      if (firebaseBootstrapped) return;
      console.warn(
        "[firebase] SDK timeout after",
        FIREBASE_CONNECT_TIMEOUT_MS,
        "ms — trying REST"
      );
      try {
        const remote = await fetchGridViaRest();
        finishFirebaseBootstrap(remote, "rest-timeout");
      } catch (restErr) {
        failFirebaseStartup(restErr);
      }
    }, FIREBASE_CONNECT_TIMEOUT_MS);

    dbRef
      .once("value")
      .then((snapshot) => {
        finishFirebaseBootstrap(snapshot.val(), "once");
      })
      .catch((err) => {
        console.error("[firebase] once(value) failed", err?.code, err?.message);
        failFirebaseStartup(err);
      });

    dbRef.on(
      "value",
      (snapshot) => {
        if (!firebaseBootstrapped) return;
        applyRemoteGrid(snapshot.val());
      },
      (err) => {
        console.error("[firebase] on(value) error", err?.code, err?.message);
        if (!firebaseBootstrapped) {
          failFirebaseStartup(err);
          return;
        }
        setSyncStatus(
          err?.code === "PERMISSION_DENIED" ? "error-rules" : "offline"
        );
      }
    );
  } catch (err) {
    console.error("[firebase] init exception", err);
    clearFirebaseConnectTimer();
    initLocalOnly();
  }
}

function initSync() {
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

document.addEventListener("mouseup", stopPainting);
document.addEventListener("touchend", stopPainting);
document.addEventListener("touchcancel", stopPainting);
document.addEventListener("touchmove", onTouchMove, { passive: false });

initColorPalette();
initSync();

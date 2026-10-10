/** Canonical roster — column headers ALWAYS use this list (never Firebase/localStorage keys). */
const PLAYERS = Object.freeze(["Fynn", "Muchel", "Bjarne", "Lucas", "Jona", "Lukas"]);

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
for (let h = 13; h <= 23; h++) {
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
/** Firebase writes stay off until the first remote snapshot is applied. */
let remoteReady = false;
let persistRetries = 0;
const dirtyKeys = new Set();
const deleteKeys = new Set();
let writeQueue = Promise.resolve();
/** "Alles zurücksetzen" clicked before the first snapshot arrived. */
let pendingReset = false;

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

function playerFromCellKey(key) {
  const parts = String(key).split("|");
  return parts.length >= 3 ? parts.slice(2).join("|") : "";
}

function isCurrentPlayerKey(key) {
  return PLAYERS.includes(playerFromCellKey(key));
}

function noteWriteSuccess() {
  persistRetries = 0;
  setSyncStatus("live");
}

function isPermissionDenied(err) {
  return err?.code === "PERMISSION_DENIED" || err?.code === "permission_denied";
}

async function persistJson(method, body) {
  const url = `${firebaseRestBase()}/${FIREBASE_GRID_PATH}.json`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error(`http_${res.status}`);
    err.code = res.status === 401 || res.status === 403 ? "PERMISSION_DENIED" : "HTTP_ERROR";
    throw err;
  }
}

function enqueueFirebaseWrite(work) {
  const run = () =>
    Promise.resolve()
      .then(work)
      .catch((err) => {
        console.error("[firebase] write failed", err?.code, err?.message);
        setSyncStatus(isPermissionDenied(err) ? "error-rules" : "offline-local");
      });
  writeQueue = writeQueue.then(run, run);
  return writeQueue;
}

/** Patch changed cells only. A full set/PUT would wipe every other cell. */
function writePatch(patch) {
  const viaRest = () => persistJson("PATCH", patch).then(noteWriteSuccess);
  if (dbRef) {
    return dbRef.update(patch).then(noteWriteSuccess).catch(() => viaRest());
  }
  return viaRest();
}

function snapshotPatch() {
  const patch = {};
  for (const key of [...dirtyKeys]) {
    if (!Object.prototype.hasOwnProperty.call(grid, key)) {
      dirtyKeys.delete(key);
      continue;
    }
    patch[key] = grid[key];
    dirtyKeys.delete(key);
  }
  for (const key of [...deleteKeys]) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) patch[key] = null;
    deleteKeys.delete(key);
  }
  return patch;
}

function restorePatch(patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value == null) deleteKeys.add(key);
    else dirtyKeys.add(key);
  }
}

function retryWrite(err, restore) {
  restore();
  if (isPermissionDenied(err) || persistRetries >= 2) return;
  persistRetries += 1;
  schedulePersist();
}

function persistGrid() {
  saveGridToLocalStorage();
  if (!useFirebase || !remoteReady) return;

  const patch = snapshotPatch();
  if (!Object.keys(patch).length) return;

  enqueueFirebaseWrite(() =>
    writePatch(patch).catch((err) => {
      retryWrite(err, () => restorePatch(patch));
      throw err;
    })
  );
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
    el.textContent = "Zugriff VERWEIGERT";
    el.classList.add("sync-status--offline");
    el.title =
      "Realtime-Database-Regeln blockieren den Zugriff (oft abgelaufener Testmodus). Console → Realtime Database → Regeln → teams/zero-synergy mit .read/.write true → Veröffentlichen. Siehe SETUP-FIREBASE.md. Danach „Erneut verbinden“.";
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
  if (!PLAYERS.includes(player)) return;
  if (color) {
    grid[key] = color;
    dirtyKeys.add(key);
    deleteKeys.delete(key);
  } else {
    delete grid[key];
    dirtyKeys.delete(key);
    deleteKeys.add(key);
  }
  persistRetries = 0;
  schedulePersist();
}

function clearCurrentPlayerCells() {
  for (const key of Object.keys(grid)) {
    if (!isCurrentPlayerKey(key)) continue;
    delete grid[key];
    dirtyKeys.delete(key);
    deleteKeys.add(key);
  }
}

function refreshAllCells() {
  document.querySelectorAll(".schedule-cell").forEach((cell) => {
    const { day, time, player } = cell.dataset;
    updateCellUI(cell, getCell(day, time, player));
  });
}

function overlayPendingEdits(cells) {
  const next = cells && typeof cells === "object" && !Array.isArray(cells) ? { ...cells } : {};
  for (const key of dirtyKeys) {
    if (Object.prototype.hasOwnProperty.call(grid, key)) next[key] = grid[key];
    else delete next[key];
  }
  for (const key of deleteKeys) delete next[key];
  return next;
}

function applySnapshot(remote, { allowLocalMigration = false } = {}) {
  if (Array.isArray(remote)) {
    remoteReady = true;
    setSyncStatus("live");
    return;
  }

  const remoteCells = remote && typeof remote === "object" ? remote : {};
  const empty = Object.keys(remoteCells).length === 0;
  let next = overlayPendingEdits(remoteCells);

  if (
    allowLocalMigration &&
    empty &&
    !pendingReset &&
    !localStorage.getItem(MIGRATION_KEY)
  ) {
    const localGrid = loadGridFromLocalStorage();
    if (
      localGrid &&
      typeof localGrid === "object" &&
      !Array.isArray(localGrid) &&
      Object.keys(localGrid).length
    ) {
      next = { ...localGrid, ...next };
      for (const key of Object.keys(localGrid)) {
        if (!deleteKeys.has(key)) dirtyKeys.add(key);
      }
      localStorage.setItem(MIGRATION_KEY, "1");
    }
  }

  if (pendingReset) {
    pendingReset = false;
    for (const key of Object.keys(next)) {
      if (!isCurrentPlayerKey(key)) continue;
      delete next[key];
      dirtyKeys.delete(key);
      deleteKeys.add(key);
    }
  }

  grid = next;
  remoteReady = true;
  if (!empty) localStorage.setItem(MIGRATION_KEY, "1");
  refreshAllCells();
  saveGridToLocalStorage();
  if (dirtyKeys.size || deleteKeys.size) schedulePersist();
  setSyncStatus("live");
}

function applyRemoteGrid(remote) {
  applySnapshot(remote);
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
  applySnapshot(remote, { allowLocalMigration: true });
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
  remoteReady = false;
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
  remoteReady = false;
  clearFirebaseSdkTimer();
  if (dbRef) {
    try {
      dbRef.off();
    } catch {
      /* ignore */
    }
    dbRef = null;
  }
  await bootstrapFirebaseViaRest();
  if (typeof firebase !== "undefined") {
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
  pendingReset = useFirebase && !remoteReady;
  clearCurrentPlayerCells();
  persistRetries = 0;
  refreshAllCells();
  schedulePersist();
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


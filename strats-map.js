const MAPS = [
  { id: "ascent", label: "Ascent" },
  { id: "bind", label: "Bind" },
  { id: "breeze", label: "Breeze" },
  { id: "fracture", label: "Fracture" },
  { id: "haven", label: "Haven" },
  { id: "lotus", label: "Lotus" },
  { id: "pearl", label: "Pearl" },
  { id: "corrode", label: "Corrode" },
  { id: "split", label: "Split" },
];

const SIDES = ["attack", "defence"];
const SIDE_LABELS = { attack: "Attack", defence: "Defence" };

const ACCEPTED_EXT = new Set(["pdf", "jpg", "jpeg", "png", "webp"]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const META_PATH_PREFIX = "teams/zero-synergy/strats-meta";
const STORAGE_PATH_PREFIX = "teams/zero-synergy/strats";
const FIREBASE_SDK_TIMEOUT_MS = 5000;
const UPLOAD_STUCK_TIMEOUT_MS = 30000;
const UPLOAD_PROGRESS_POLL_MS = 250;
const FIREBASE_STORAGE_CONSOLE =
  "https://console.firebase.google.com/project/znrgy-ccb87/storage";

let storageApiReachable = null;

function storageSetupErrorHtml() {
  if (storageApiReachable === true) {
    return (
      `Upload bleibt bei 0&nbsp;% — Regeln veröffentlichen: ` +
      `<a href="${FIREBASE_STORAGE_CONSOLE}/rules" target="_blank" rel="noopener">Console → Storage → Regeln</a>`
    );
  }
  return (
    `Upload bleibt bei 0&nbsp;% — Storage in Console aktivieren (` +
    `<a href="${FIREBASE_STORAGE_CONSOLE}" target="_blank" rel="noopener">Loslegen</a>)`
  );
}

function storageSetupErrorPlain() {
  if (storageApiReachable === true) {
    return "Upload bleibt bei 0 % — Regeln veröffentlichen";
  }
  return "Upload bleibt bei 0 % — Storage in Console aktivieren (Loslegen)";
}

const mapById = Object.fromEntries(MAPS.map((m) => [m.id, m]));

let mapSlug = null;
let mapLabel = null;
let files = [];
let useFirebase = false;
let useStorage = false;
let dbRef = null;
let storageRef = null;
let firebaseBootstrapped = false;
let firebaseSdkTimer = null;
let isUploading = false;
let isSavingMeta = false;
let dragSourceId = null;
let uploadSide = "attack";

function getMapFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get("map") || "").toLowerCase().trim();
  return mapById[raw] ? raw : null;
}

function metaPath() {
  return `${META_PATH_PREFIX}/${mapSlug}`;
}

function storagePathFor(fileId, filename) {
  const safeName = filename.replace(/[/\\#?%*:|"<>]/g, "_");
  return `${STORAGE_PATH_PREFIX}/${mapSlug}/${fileId}_${safeName}`;
}

function isFirebaseConfigured() {
  const c = window.FIREBASE_CONFIG;
  if (!c || !c.apiKey || !c.databaseURL) return false;
  if (c.apiKey === "DEIN_API_KEY" || String(c.apiKey).includes("DEIN")) return false;
  if (String(c.databaseURL).includes("dein-projekt")) return false;
  return true;
}

function isStorageConfigured() {
  const c = window.FIREBASE_CONFIG;
  if (!c?.storageBucket || String(c.storageBucket).includes("DEIN")) return false;
  if (typeof firebase === "undefined" || !firebase.storage) return false;
  return true;
}

function firebaseRestBase() {
  return String(window.FIREBASE_CONFIG.databaseURL).replace(/\/$/, "");
}

function fileTypeFromName(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return "image";
  return "other";
}

function uniqueId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeFilesList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter(Boolean);
  if (typeof data === "object") return Object.values(data).filter(Boolean);
  return [];
}

function defaultTitleFromFilename(filename) {
  if (!filename) return "Unbenannt";
  const base = String(filename).replace(/\.[^./\\]+$/, "").trim();
  return base || String(filename);
}

function normalizeSide(side) {
  return side === "defence" ? "defence" : "attack";
}

function migrateFileEntry(file, index) {
  const entry = { ...file };
  if (entry.order == null || Number.isNaN(Number(entry.order))) {
    entry.order = index;
  } else {
    entry.order = Number(entry.order);
  }
  if (!entry.title || !String(entry.title).trim()) {
    entry.title = defaultTitleFromFilename(entry.name);
  }
  if (entry.description == null) entry.description = "";
  entry.side = normalizeSide(entry.side);
  return entry;
}

function reindexFileOrders(list) {
  return list.map((f, i) => ({ ...f, order: i }));
}

function reindexAllSides(list) {
  const merged = [];
  for (const side of SIDES) {
    const sideFiles = list
      .filter((f) => normalizeSide(f.side) === side)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    merged.push(...reindexFileOrders(sideFiles.map((f) => ({ ...f, side }))));
  }
  return merged;
}

function migrateAndSortFilesList(data) {
  const list = normalizeFilesList(data);
  const migrated = list.map((f, i) => migrateFileEntry(f, i));
  const sorted = migrated.sort((a, b) => a.order - b.order);
  return reindexAllSides(sorted);
}

function getSortedFiles(side) {
  const filtered = side
    ? files.filter((f) => normalizeSide(f.side) === normalizeSide(side))
    : [...files];
  return filtered.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function mergeSideLists(attackList, defenceList) {
  return [
    ...reindexFileOrders(attackList.map((f) => ({ ...f, side: "attack" }))),
    ...reindexFileOrders(defenceList.map((f) => ({ ...f, side: "defence" }))),
  ];
}

function displayLabel(file) {
  return (file.title && String(file.title).trim()) || file.name || "Unbenannt";
}

function setBannerVisible(id, visible) {
  const el = document.getElementById(id);
  if (el) el.hidden = !visible;
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
    setRetryVisible(true);
  } else if (mode === "error-rules") {
    el.textContent = "Zugriff verweigert";
    el.classList.add("sync-status--offline");
    setRetryVisible(true);
  } else if (mode === "local") {
    el.textContent = "Nur lokal (kein Sync)";
    el.classList.add("sync-status--local");
  } else if (mode === "uploading") {
    el.textContent = "Upload läuft…";
    el.classList.add("sync-status--connecting");
  }
}

function ensureUploadProgressChrome() {
  const el = document.getElementById("uploadProgress");
  if (!el) return null;
  if (!el.querySelector(".strats-upload-progress__track")) {
    el.innerHTML = `
      <p class="strats-upload-progress__label" id="uploadProgressLabel"></p>
      <div class="strats-upload-progress__track" id="uploadProgressTrack" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="strats-upload-progress__bar" id="uploadProgressBar"></div>
      </div>
      <div class="strats-upload-progress__spinner" id="uploadProgressSpinner" hidden aria-hidden="true"></div>
    `;
  }
  return {
    root: el,
    label: document.getElementById("uploadProgressLabel"),
    track: document.getElementById("uploadProgressTrack"),
    bar: document.getElementById("uploadProgressBar"),
    spinner: document.getElementById("uploadProgressSpinner"),
  };
}

function setUploadProgress(state) {
  const chrome = ensureUploadProgressChrome();
  if (!chrome) return;

  const visible = !!(state && state.visible !== false && state.message);
  chrome.root.hidden = !visible;
  chrome.root.classList.toggle("strats-upload-progress--success", !!state?.success);
  chrome.root.classList.toggle("strats-upload-progress--error", !!state?.error);

  if (!visible) {
    chrome.root.classList.remove(
      "strats-upload-progress--success",
      "strats-upload-progress--error",
      "strats-upload-progress--indeterminate"
    );
    chrome.bar.style.width = "0%";
    return;
  }

  chrome.label.textContent = state.message;

  if (state.indeterminate) {
    chrome.root.classList.add("strats-upload-progress--indeterminate");
    chrome.track.hidden = true;
    chrome.spinner.hidden = false;
    chrome.track.setAttribute("aria-valuetext", "Wird hochgeladen");
    return;
  }

  chrome.root.classList.remove("strats-upload-progress--indeterminate");
  chrome.track.hidden = false;
  chrome.spinner.hidden = true;
  const pct = typeof state.percent === "number" ? Math.min(100, Math.max(0, state.percent)) : 0;
  chrome.bar.style.width = `${pct}%`;
  chrome.track.setAttribute("aria-valuenow", String(pct));
  chrome.track.setAttribute("aria-valuetext", `${pct}%`);
}

function snapshotUploadPercent(snapshot, file) {
  const bytes = snapshot?.bytesTransferred ?? 0;
  const totalBytes = snapshot?.totalBytes ?? 0;
  if (totalBytes > 0) {
    return {
      percent: Math.min(100, Math.round((bytes / totalBytes) * 100)),
      indeterminate: false,
    };
  }
  if (file?.size > 0) {
    return {
      percent: Math.min(100, Math.round((bytes / file.size) * 100)),
      indeterminate: bytes === 0,
    };
  }
  return { percent: bytes > 0 ? 100 : 0, indeterminate: true };
}

function applyUploadProgressFromSnapshot(progressBase, snapshot, file) {
  const { percent, indeterminate } = snapshotUploadPercent(snapshot, file);
  const message = indeterminate
    ? `${progressBase} … wird hochgeladen`
    : `${progressBase} … ${percent}%`;
  setUploadProgress({ message, percent, indeterminate, visible: true });
}

function contentTypeForFile(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const byExt = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  return byExt[ext] || file.type || "application/octet-stream";
}

function setUploadError(message, visible, options = {}) {
  const el = document.getElementById("uploadError");
  if (!el) return;
  el.hidden = !visible;
  if (!visible) {
    el.textContent = "";
    el.innerHTML = "";
    el.classList.remove("strats-upload-error--rich");
    return;
  }
  if (options.html) {
    el.innerHTML = message || "";
    el.classList.add("strats-upload-error--rich");
  } else {
    el.textContent = message || "";
    el.classList.remove("strats-upload-error--rich");
  }
}

function setStorageStatusResult(state, message) {
  const el = document.getElementById("storageStatusResult");
  if (!el) return;
  el.hidden = false;
  el.textContent = message;
  el.className = "storage-status-check";
  if (state === "ok") el.classList.add("storage-status-check--ok");
  else if (state === "fail") el.classList.add("storage-status-check--fail");
  else el.classList.add("storage-status-check--pending");
}

async function checkStorageStatus() {
  const btn = document.getElementById("storageStatusBtn");
  if (btn) btn.disabled = true;
  setStorageStatusResult("pending", "Prüfe…");

  if (!isFirebaseConfigured()) {
    setStorageStatusResult("fail", "firebase-config.js fehlt auf der Website — bitte deployen");
    setBannerVisible("configBanner", true);
    if (btn) btn.disabled = false;
    return false;
  }

  const bucket = window.FIREBASE_CONFIG?.storageBucket;
  if (!bucket || String(bucket).includes("DEIN")) {
    setStorageStatusResult(
      "fail",
      "firebase-config.js unvollständig — storageBucket fehlt, bitte deployen"
    );
    showStorageSetupBanner();
    if (btn) btn.disabled = false;
    return false;
  }

  try {
    const listUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o?maxResults=1`;
    const res = await fetch(listUrl);
    if (res.status === 404) {
      storageApiReachable = false;
      setStorageStatusResult("fail", "Storage in Console aktivieren (Loslegen)");
      showStorageSetupBanner();
      if (btn) btn.disabled = false;
      return false;
    }
    if (res.ok || res.status === 403) {
      storageApiReachable = true;
      if (res.status === 403) {
        setStorageStatusResult("ok", "Storage aktiv — Regeln veröffentlichen");
      } else {
        setStorageStatusResult("ok", "Storage aktiv");
      }
      setBannerVisible("storageBanner", false);
      if (useFirebase && isStorageConfigured() && !isFileProtocol()) {
        useStorage = true;
        if (!storageRef) storageRef = getStorageRoot();
        setFileInputEnabled(true);
      }
      if (btn) btn.disabled = false;
      return true;
    }
  } catch (err) {
    console.warn("[storage check] REST failed", err);
  }

  if (storageRef && typeof storageRef.listAll === "function") {
    try {
      await storageRef.child(`${STORAGE_PATH_PREFIX}/${mapSlug}`).listAll();
      setStorageStatusResult("ok", "Storage aktiv");
      setBannerVisible("storageBanner", false);
      if (btn) btn.disabled = false;
      return true;
    } catch (err) {
      const code = String(err?.code || "").toLowerCase();
      if (code === "storage/bucket-not-found" || code === "storage/object-not-found") {
        setStorageStatusResult("fail", "Storage in Console aktivieren (Loslegen)");
        showStorageSetupBanner();
        if (btn) btn.disabled = false;
        return false;
      }
      if (code === "storage/unauthorized") {
        setStorageStatusResult("ok", "Storage aktiv");
        setBannerVisible("storageBanner", false);
        if (btn) btn.disabled = false;
        return true;
      }
    }
  }

  setStorageStatusResult("fail", "Storage in Console aktivieren (Loslegen)");
  showStorageSetupBanner();
  if (btn) btn.disabled = false;
  return false;
}

function isUploadStuckError(err) {
  const code = String(err?.code || "").toLowerCase();
  const msg = String(err?.message || "").toLowerCase();
  return (
    code === "upload/timeout" ||
    code === "storage/retry-limit-exceeded" ||
    msg.includes("upload timeout") ||
    isStorageSetupError(err)
  );
}

function isFileProtocol() {
  return window.location.protocol === "file:";
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUploadError(err) {
  const code = String(err?.code || "").toLowerCase();
  const msg = String(err?.message || err || "");

  if (isFileProtocol()) {
    return "Uploads funktionieren nicht über file://. Seite über einen lokalen Webserver öffnen (z. B. http://127.0.0.1:8765/strats-map.html?map=ascent).";
  }
  if (code === "upload/timeout" || msg.toLowerCase().includes("upload timeout")) {
    return storageSetupErrorPlain();
  }
  if (code === "permission_denied" || code === "storage/unauthorized") {
    return `Zugriff verweigert — storage.rules unter ${FIREBASE_STORAGE_CONSOLE}/rules veröffentlichen.`;
  }
  if (
    code === "storage/unauthenticated" ||
    msg.toLowerCase().includes("unauthenticated")
  ) {
    return "Nicht authentifiziert — Storage-Regeln oder Projekt-Einstellungen prüfen.";
  }
  if (
    code === "storage/bucket-not-found" ||
    code === "storage/object-not-found" && msg.includes("bucket")
  ) {
    return storageSetupErrorPlain();
  }
  if (
    msg.includes("storage has not been set up") ||
    msg.includes("storage is not enabled") ||
    msg.includes("not been enabled") ||
    code === "storage/invalid-argument" && msg.includes("bucket")
  ) {
    return storageSetupErrorPlain();
  }
  if (code === "storage/retry-limit-exceeded") {
    return storageSetupErrorPlain();
  }
  if (
    code === "storage/canceled" ||
    msg.toLowerCase().includes("network") ||
    msg.toLowerCase().includes("failed to fetch") ||
    msg.toLowerCase().includes("cors")
  ) {
    return "Netzwerkfehler — Internetverbindung prüfen; Seite über http://localhost oder http://127.0.0.1 öffnen (nicht file://).";
  }
  if (code === "storage/quota-exceeded") {
    return "Speicherplatz im Firebase-Projekt erschöpft.";
  }
  if (msg.toLowerCase().includes("size") || msg.toLowerCase().includes("too large")) {
    return "Datei zu groß — maximal 10 MB pro Datei.";
  }
  if (code === "storage/unknown" && isFileProtocol()) {
    return "Upload fehlgeschlagen — bitte über http://127.0.0.1:8765/ testen, nicht per Doppelklick (file://).";
  }
  if (msg && !msg.startsWith("„")) {
    return `${msg}${code ? ` (${code})` : ""}`;
  }
  return msg || "Upload fehlgeschlagen.";
}

function isStorageSetupError(err) {
  const code = String(err?.code || "").toLowerCase();
  const msg = String(err?.message || "").toLowerCase();
  if (code === "storage/unauthorized" || code === "permission_denied") {
    return false;
  }
  if (code === "upload/timeout" || msg.includes("upload timeout")) {
    return storageApiReachable !== true;
  }
  return (
    code === "storage/bucket-not-found" ||
    code === "storage/retry-limit-exceeded" ||
    msg.includes("storage has not been set up") ||
    msg.includes("storage is not enabled") ||
    msg.includes("not been enabled") ||
    (msg.includes("bucket") && !msg.includes("object-not-found"))
  );
}

function showUploadErrorFromResults(errors, lastErr) {
  if (!errors.length) {
    setUploadError("", false);
    return;
  }
  if (lastErr && isStorageSetupError(lastErr)) {
    setUploadError(storageSetupErrorHtml(), true, { html: true });
    return;
  }
  const unique = [...new Set(errors.filter(Boolean))];
  setUploadError(unique.join("\n"), true);
}

function showStorageSetupBanner() {
  setBannerVisible("storageBanner", true);
  useStorage = false;
  setFileInputEnabled(false);
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function setReorderHintVisible(visible) {
  const hint = document.getElementById("reorderHint");
  if (hint) hint.hidden = !visible;
}

function setCardSaveState(card, state) {
  const saveBtn = card.querySelector(".strats-file-card__save");
  if (!saveBtn) return;
  if (state === "saving") {
    saveBtn.disabled = true;
    saveBtn.textContent = "Speichern…";
    saveBtn.hidden = false;
  } else if (state === "dirty") {
    saveBtn.disabled = isUploading || isSavingMeta || !useFirebase;
    saveBtn.textContent = "Speichern";
    saveBtn.hidden = false;
  } else {
    saveBtn.disabled = true;
    saveBtn.textContent = "Gespeichert";
    saveBtn.hidden = true;
  }
}

function markCardDirty(card) {
  setCardSaveState(card, "dirty");
}

function readCardMeta(card) {
  const titleInput = card.querySelector(".strats-file-card__title-input");
  const descInput = card.querySelector(".strats-file-card__desc-input");
  return {
    title: (titleInput?.value || "").trim(),
    description: descInput?.value ?? "",
  };
}

async function saveCardMeta(card, fileId) {
  if (!useFirebase || isUploading || isSavingMeta) return;
  const idx = files.findIndex((f) => f.id === fileId);
  if (idx < 0) return;

  const { title, description } = readCardMeta(card);
  const nextTitle = title || defaultTitleFromFilename(files[idx].name);

  if (files[idx].title === nextTitle && files[idx].description === description) {
    setCardSaveState(card, "saved");
    return;
  }

  isSavingMeta = true;
  setCardSaveState(card, "saving");

  try {
    files[idx] = { ...files[idx], title: nextTitle, description };
    if (dbRef) {
      await persistMeta();
    } else {
      await persistMetaViaRest();
    }
    setCardSaveState(card, "saved");
    setSyncStatus("live");
  } catch (err) {
    console.error("[strats meta]", err);
    setUploadError(formatUploadError(err), true);
    setCardSaveState(card, "dirty");
    setSyncStatus(
      err?.code === "PERMISSION_DENIED" || err?.code === "storage/unauthorized"
        ? "error-rules"
        : "offline"
    );
  } finally {
    isSavingMeta = false;
  }
}

function bindCardMetaEditors(card, file) {
  const titleInput = card.querySelector(".strats-file-card__title-input");
  const descInput = card.querySelector(".strats-file-card__desc-input");
  const saveBtn = card.querySelector(".strats-file-card__save");

  const onInput = () => markCardDirty(card);
  titleInput?.addEventListener("input", onInput);
  descInput?.addEventListener("input", onInput);

  const onBlur = () => {
    if (card.classList.contains("strats-file-card--dragging")) return;
    void saveCardMeta(card, file.id);
  };
  titleInput?.addEventListener("blur", onBlur);
  descInput?.addEventListener("blur", onBlur);

  saveBtn?.addEventListener("click", () => void saveCardMeta(card, file.id));
}

function bindCardSideToggle(card, file) {
  const toggle = card.querySelector(".strats-file-card__side-toggle");
  if (!toggle) return;
  toggle.querySelectorAll(".strats-side-toggle__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextSide = btn.dataset.side;
      if (!nextSide || normalizeSide(nextSide) === normalizeSide(file.side)) return;
      void setFileSide(file.id, nextSide);
    });
  });
}

function bindCardDragReorder(card, file, columnCount) {
  const handle = card.querySelector(".strats-file-card__drag");
  if (!handle) return;

  handle.addEventListener("dragstart", (e) => {
    if (isUploading || isSavingMeta || columnCount < 2) {
      e.preventDefault();
      return;
    }
    dragSourceId = file.id;
    card.classList.add("strats-file-card--dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", file.id);
    e.dataTransfer.setData("application/x-strat-side", normalizeSide(file.side));
    if (e.dataTransfer.setDragImage) {
      e.dataTransfer.setDragImage(card, 24, 24);
    }
  });

  handle.addEventListener("dragend", () => {
    dragSourceId = null;
    card.classList.remove("strats-file-card--dragging");
    document.querySelectorAll(".strats-file-card--drop-target").forEach((el) => {
      el.classList.remove("strats-file-card--drop-target");
    });
    document.querySelectorAll(".strats-side-column__list--drop-target").forEach((el) => {
      el.classList.remove("strats-side-column__list--drop-target");
    });
  });

  card.addEventListener("dragover", (e) => {
    if (!dragSourceId || dragSourceId === file.id) return;
    const source = files.find((f) => f.id === dragSourceId);
    if (!source || normalizeSide(source.side) !== normalizeSide(file.side)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    card.classList.add("strats-file-card--drop-target");
  });

  card.addEventListener("dragleave", (e) => {
    if (!card.contains(e.relatedTarget)) {
      card.classList.remove("strats-file-card--drop-target");
    }
  });

  card.addEventListener("drop", (e) => {
    e.preventDefault();
    card.classList.remove("strats-file-card--drop-target");
    const sourceId = e.dataTransfer.getData("text/plain") || dragSourceId;
    if (sourceId && sourceId !== file.id) {
      void reorderFiles(sourceId, file.id);
    }
    dragSourceId = null;
  });
}

async function setFileSide(fileId, newSide) {
  if (!useFirebase || isUploading || isSavingMeta) return;
  const side = normalizeSide(newSide);
  const idx = files.findIndex((f) => f.id === fileId);
  if (idx < 0 || normalizeSide(files[idx].side) === side) return;

  const attackList = getSortedFiles("attack").filter((f) => f.id !== fileId);
  const defenceList = getSortedFiles("defence").filter((f) => f.id !== fileId);
  const moved = { ...files[idx], side };
  if (side === "attack") attackList.push(moved);
  else defenceList.push(moved);
  files = mergeSideLists(attackList, defenceList);

  isSavingMeta = true;
  try {
    if (dbRef) {
      await persistMeta();
    } else {
      await persistMetaViaRest();
    }
    renderFiles();
    setSyncStatus("live");
  } catch (err) {
    console.error("[strats side]", err);
    setUploadError(formatUploadError(err), true);
    setSyncStatus(
      err?.code === "PERMISSION_DENIED" || err?.code === "storage/unauthorized"
        ? "error-rules"
        : "offline"
    );
  } finally {
    isSavingMeta = false;
  }
}

async function reorderFiles(sourceId, targetId) {
  if (!useFirebase || isUploading || isSavingMeta || sourceId === targetId) return;

  const sourceFile = files.find((f) => f.id === sourceId);
  const targetFile = files.find((f) => f.id === targetId);
  if (!sourceFile || !targetFile) return;
  if (normalizeSide(sourceFile.side) !== normalizeSide(targetFile.side)) return;

  const side = normalizeSide(sourceFile.side);
  const sorted = getSortedFiles(side);
  const from = sorted.findIndex((f) => f.id === sourceId);
  const to = sorted.findIndex((f) => f.id === targetId);
  if (from < 0 || to < 0) return;

  const next = [...sorted];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);

  const attackList = side === "attack" ? next : getSortedFiles("attack");
  const defenceList = side === "defence" ? next : getSortedFiles("defence");
  files = mergeSideLists(attackList, defenceList);

  isSavingMeta = true;
  try {
    if (dbRef) {
      await persistMeta();
    } else {
      await persistMetaViaRest();
    }
    renderFiles();
    setSyncStatus("live");
  } catch (err) {
    console.error("[strats reorder]", err);
    setUploadError(formatUploadError(err), true);
    setSyncStatus(
      err?.code === "PERMISSION_DENIED" || err?.code === "storage/unauthorized"
        ? "error-rules"
        : "offline"
    );
  } finally {
    isSavingMeta = false;
  }
}

function appendPreview(file, container, label) {
  if (file.downloadURL && file.type === "image") {
    const img = document.createElement("img");
    img.className = "strats-file-card__img";
    img.src = file.downloadURL;
    img.alt = label || "Strat-Bild";
    img.loading = "lazy";
    img.tabIndex = 0;
    img.addEventListener("click", () => openLightbox(file.downloadURL, label));
    img.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openLightbox(file.downloadURL, label);
      }
    });
    container.appendChild(img);
  } else if (file.downloadURL && file.type === "pdf") {
    const iframe = document.createElement("iframe");
    iframe.className = "strats-file-card__pdf";
    iframe.src = file.downloadURL;
    iframe.title = label || "PDF";
    container.appendChild(iframe);
  } else if (!file.downloadURL) {
    const p = document.createElement("p");
    p.className = "strats-file-card__unavailable";
    p.textContent = "Vorschau nicht verfügbar";
    container.appendChild(p);
  }
}

function updateUploadSidePicker() {
  const picker = document.getElementById("uploadSidePicker");
  if (!picker) return;
  picker.querySelectorAll(".strats-side-toggle__btn").forEach((btn) => {
    const active = btn.dataset.side === uploadSide;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function bindColumnDropTarget(listEl, side) {
  if (!listEl || listEl.dataset.dropBound === "1") return;
  listEl.dataset.dropBound = "1";

  listEl.addEventListener("dragover", (e) => {
    if (!dragSourceId) return;
    const source = files.find((f) => f.id === dragSourceId);
    if (!source || normalizeSide(source.side) === normalizeSide(side)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    listEl.classList.add("strats-side-column__list--drop-target");
  });

  listEl.addEventListener("dragleave", (e) => {
    if (!listEl.contains(e.relatedTarget)) {
      listEl.classList.remove("strats-side-column__list--drop-target");
    }
  });

  listEl.addEventListener("drop", (e) => {
    if (e.target.closest(".strats-file-card")) return;
    e.preventDefault();
    listEl.classList.remove("strats-side-column__list--drop-target");
    const sourceId = e.dataTransfer.getData("text/plain") || dragSourceId;
    if (!sourceId) return;
    const source = files.find((f) => f.id === sourceId);
    if (!source) return;
    if (normalizeSide(source.side) === normalizeSide(side)) return;
    void setFileSide(sourceId, side);
    dragSourceId = null;
  });
}

function renderFileCard(file, sortedInColumn, canEdit, listEl) {
    const label = displayLabel(file);
    const card = document.createElement("article");
    card.className = "strats-file-card";
    card.dataset.id = file.id;

    const dragBtn = document.createElement("button");
    dragBtn.type = "button";
    dragBtn.className = "strats-file-card__drag";
    dragBtn.draggable = true;
    dragBtn.setAttribute("aria-label", "Reihenfolge ändern");
    dragBtn.title = "Reihenfolge per Drag";
    dragBtn.textContent = "⋮⋮";
    dragBtn.disabled =
      isUploading || isSavingMeta || sortedInColumn.length < 2 || !useFirebase;
    card.appendChild(dragBtn);

    const layout = document.createElement("div");
    layout.className = "strats-file-card__layout";

    const thumb = document.createElement("div");
    thumb.className = "strats-file-card__thumb";
    if (file.downloadURL && file.type === "image") {
      const thumbImg = document.createElement("img");
      thumbImg.className = "strats-file-card__thumb-img";
      thumbImg.src = file.downloadURL;
      thumbImg.alt = label;
      thumbImg.loading = "lazy";
      thumbImg.tabIndex = 0;
      thumbImg.addEventListener("click", () => openLightbox(file.downloadURL, label));
      thumbImg.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openLightbox(file.downloadURL, label);
        }
      });
      thumb.appendChild(thumbImg);
    } else if (file.downloadURL && file.type === "pdf") {
      const thumbLink = document.createElement("a");
      thumbLink.className = "strats-file-card__thumb-pdf";
      thumbLink.href = file.downloadURL;
      thumbLink.target = "_blank";
      thumbLink.rel = "noopener";
      thumbLink.textContent = "PDF";
      thumb.appendChild(thumbLink);
    } else {
      const thumbPlaceholder = document.createElement("span");
      thumbPlaceholder.className = "strats-file-card__thumb-placeholder";
      thumbPlaceholder.textContent = "—";
      thumb.appendChild(thumbPlaceholder);
    }
    layout.appendChild(thumb);

    const content = document.createElement("div");
    content.className = "strats-file-card__content";

    const titleField = document.createElement("div");
    titleField.className = "strats-file-card__field";
    const titleLabel = document.createElement("label");
    titleLabel.className = "strats-file-card__label";
    titleLabel.htmlFor = `title-${file.id}`;
    titleLabel.textContent = "Titel";
    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.id = `title-${file.id}`;
    titleInput.className = "strats-file-card__title-input";
    titleInput.value = file.title || defaultTitleFromFilename(file.name);
    titleInput.disabled = !canEdit || isUploading;
    titleField.appendChild(titleLabel);
    titleField.appendChild(titleInput);
    content.appendChild(titleField);

    const descField = document.createElement("div");
    descField.className = "strats-file-card__field";
    const descLabel = document.createElement("label");
    descLabel.className = "strats-file-card__label";
    descLabel.htmlFor = `desc-${file.id}`;
    descLabel.textContent = "Beschreibung";
    const descInput = document.createElement("textarea");
    descInput.id = `desc-${file.id}`;
    descInput.className = "strats-file-card__desc-input";
    descInput.rows = 3;
    descInput.placeholder = "Notizen, Callouts, Setup …";
    descInput.value = file.description || "";
    descInput.disabled = !canEdit || isUploading;
    descField.appendChild(descLabel);
    descField.appendChild(descInput);
    content.appendChild(descField);

    const meta = document.createElement("p");
    meta.className = "strats-file-card__meta";
    const typeLabel = file.type === "pdf" ? "PDF" : file.type === "image" ? "Bild" : "Datei";
    const fileRef = file.name ? `Datei: ${file.name}` : "";
    meta.textContent = [typeLabel, formatDate(file.uploadedAt), fileRef]
      .filter(Boolean)
      .join(" · ");
    content.appendChild(meta);

    const sideField = document.createElement("div");
    sideField.className = "strats-file-card__field strats-file-card__side";
    const sideLabel = document.createElement("span");
    sideLabel.className = "strats-file-card__label";
    sideLabel.textContent = "Seite";
    const sideToggle = document.createElement("div");
    sideToggle.className = "strats-file-card__side-toggle strats-side-toggle";
    sideToggle.setAttribute("role", "group");
    sideToggle.setAttribute("aria-label", "Attack oder Defence");
    for (const sideKey of SIDES) {
      const sideBtn = document.createElement("button");
      sideBtn.type = "button";
      sideBtn.className = "strats-side-toggle__btn";
      sideBtn.dataset.side = sideKey;
      sideBtn.textContent = SIDE_LABELS[sideKey];
      sideBtn.disabled = !canEdit || isUploading;
      if (normalizeSide(file.side) === sideKey) {
        sideBtn.classList.add("is-active");
        sideBtn.setAttribute("aria-pressed", "true");
      } else {
        sideBtn.setAttribute("aria-pressed", "false");
      }
      sideToggle.appendChild(sideBtn);
    }
    sideField.appendChild(sideLabel);
    sideField.appendChild(sideToggle);
    content.appendChild(sideField);

    const actions = document.createElement("div");
    actions.className = "strats-file-card__actions";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn-secondary strats-file-card__save";
    saveBtn.textContent = "Speichern";
    saveBtn.hidden = true;
    saveBtn.disabled = !canEdit || isUploading;
    actions.appendChild(saveBtn);

    if (file.downloadURL) {
      const openLink = document.createElement("a");
      openLink.className = "btn-secondary strats-file-card__open";
      openLink.href = file.downloadURL;
      openLink.target = "_blank";
      openLink.rel = "noopener";
      openLink.textContent = "Öffnen";
      actions.appendChild(openLink);
    }

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn-secondary strats-file-card__delete";
    delBtn.textContent = "Löschen";
    delBtn.disabled = isUploading || !useFirebase || !useStorage;
    delBtn.addEventListener("click", () => deleteFile(file));
    actions.appendChild(delBtn);

    content.appendChild(actions);
    layout.appendChild(content);
    card.appendChild(layout);

    const preview = document.createElement("div");
    preview.className = "strats-file-card__preview";
    appendPreview(file, preview, label);
    card.appendChild(preview);

    bindCardMetaEditors(card, file);
    bindCardSideToggle(card, file);
    bindCardDragReorder(card, file, sortedInColumn.length);
    listEl.appendChild(card);
}

function renderFiles() {
  const listAttack = document.getElementById("fileListAttack");
  const listDefence = document.getElementById("fileListDefence");
  const empty = document.getElementById("emptyHint");
  const emptyAttack = document.getElementById("emptyHintAttack");
  const emptyDefence = document.getElementById("emptyHintDefence");
  if (!listAttack || !listDefence) return;

  listAttack.innerHTML = "";
  listDefence.innerHTML = "";

  const attackFiles = getSortedFiles("attack");
  const defenceFiles = getSortedFiles("defence");
  const totalCount = attackFiles.length + defenceFiles.length;
  const canEdit = useFirebase && totalCount > 0;

  if (empty) empty.hidden = totalCount > 0;
  if (emptyAttack) emptyAttack.hidden = attackFiles.length > 0;
  if (emptyDefence) emptyDefence.hidden = defenceFiles.length > 0;

  const showReorder =
    canEdit &&
    (attackFiles.length > 1 || defenceFiles.length > 1);
  setReorderHintVisible(showReorder);

  for (const file of attackFiles) {
    renderFileCard(file, attackFiles, canEdit, listAttack);
  }
  for (const file of defenceFiles) {
    renderFileCard(file, defenceFiles, canEdit, listDefence);
  }

  bindColumnDropTarget(listAttack, "attack");
  bindColumnDropTarget(listDefence, "defence");
  updateUploadSidePicker();
}

function isLightboxOpen() {
  const box = document.getElementById("lightbox");
  return Boolean(box && !box.hidden);
}

const LIGHTBOX_DEBUG_IMAGE =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500">' +
      '<rect width="100%" height="100%" fill="#1e293b"/>' +
      '<text x="50%" y="50%" fill="#94a3b8" font-size="28" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle">Lightbox Test</text>' +
      "</svg>"
  );

function openLightbox(url, alt) {
  const box = document.getElementById("lightbox");
  const img = document.getElementById("lightboxImg");
  if (!box || !img) return;
  img.src = url;
  img.alt = alt || "";
  box.hidden = false;
  document.body.classList.add("strats-lightbox-open");
  document.getElementById("lightboxCloseBtn")?.focus();
}

function closeLightbox() {
  const box = document.getElementById("lightbox");
  const img = document.getElementById("lightboxImg");
  if (!box || !img || box.hidden) return;
  box.hidden = true;
  img.removeAttribute("src");
  document.body.classList.remove("strats-lightbox-open");
}

function onLightboxCloseClick(e) {
  e.preventDefault();
  e.stopPropagation();
  closeLightbox();
  return false;
}

function initLightboxControls() {
  const box = document.getElementById("lightbox");
  const closeX = document.getElementById("lightboxCloseX");
  const closeBtn = document.getElementById("lightboxCloseBtn");
  const toolbar = document.getElementById("lightboxToolbar");

  if (closeX) closeX.onclick = onLightboxCloseClick;
  if (closeBtn) closeBtn.onclick = onLightboxCloseClick;

  if (toolbar) {
    toolbar.onclick = (e) => e.stopPropagation();
  }

  if (box) {
    box.onclick = (e) => {
      if (e.target === box) closeLightbox();
    };
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isLightboxOpen()) {
      e.preventDefault();
      closeLightbox();
    }
  });
}

async function persistMeta() {
  if (!dbRef) return;
  await dbRef.set(files);
}

async function fetchMetaViaRest() {
  const url = `${firebaseRestBase()}/${metaPath()}.json`;
  const res = await fetch(url);
  if (res.status === 404) return [];
  if (!res.ok) {
    const err = new Error(`http_${res.status}`);
    err.code = res.status === 401 || res.status === 403 ? "PERMISSION_DENIED" : "HTTP_ERROR";
    throw err;
  }
  const data = await res.json();
  return normalizeFilesList(data);
}

async function persistMetaViaRest() {
  const url = `${firebaseRestBase()}/${metaPath()}.json`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(files),
  });
  if (!res.ok) {
    const err = new Error(`http_${res.status}`);
    err.code = res.status === 401 || res.status === 403 ? "PERMISSION_DENIED" : "HTTP_ERROR";
    throw err;
  }
}

function applyRemoteFiles(remote) {
  files = migrateAndSortFilesList(remote);
  renderFiles();
  setSyncStatus("live");
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
  applyRemoteFiles(remote);
  console.info("[firebase strats] bootstrap via", source);
}

function failFirebaseStartup(err) {
  clearFirebaseSdkTimer();
  console.error("[firebase strats] startup failed", err?.code, err?.message || err);
  if (!firebaseBootstrapped) {
    firebaseBootstrapped = true;
    files = [];
    renderFiles();
  }
  const isRules =
    err?.code === "PERMISSION_DENIED" || err?.code === "permission_denied";
  setSyncStatus(isRules ? "error-rules" : "offline");
}

function getFirebaseApp() {
  if (firebase.apps.length > 0) return firebase.app();
  return firebase.initializeApp(window.FIREBASE_CONFIG);
}

function getStorageRoot() {
  const app = getFirebaseApp();
  return firebase.storage(app).ref();
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
      applyRemoteFiles(snapshot.val());
    },
    (err) => {
      console.error("[firebase strats] on(value) error", err?.code, err?.message);
      if (!firebaseBootstrapped) {
        failFirebaseStartup(err);
        return;
      }
      setSyncStatus(
        err?.code === "PERMISSION_DENIED" ? "error-rules" : "offline"
      );
    }
  );
}

async function bootstrapFirebaseViaRest() {
  try {
    const remote = await fetchMetaViaRest();
    finishFirebaseBootstrap(remote, "rest");
    return true;
  } catch (err) {
    console.warn("[firebase strats] REST bootstrap failed", err?.code, err?.message);
    if (!firebaseBootstrapped) {
      setSyncStatus(
        err?.code === "PERMISSION_DENIED" ? "error-rules" : "offline"
      );
    }
    return false;
  }
}

function initFirebaseSdk() {
  try {
    const app = getFirebaseApp();
    const db = firebase.database(app);
    dbRef = db.ref(metaPath());

    if (isFileProtocol()) {
      useStorage = false;
      setBannerVisible("fileProtocolBanner", true);
      setFileInputEnabled(false);
    } else if (isStorageConfigured()) {
      storageRef = getStorageRoot();
      useStorage = true;
      setBannerVisible("storageBanner", false);
      setFileInputEnabled(true);
    } else {
      useStorage = false;
      showStorageSetupBanner();
    }

    firebaseSdkTimer = setTimeout(() => {
      if (firebaseBootstrapped) return;
      bootstrapFirebaseViaRest();
    }, FIREBASE_SDK_TIMEOUT_MS);

    attachFirebaseRealtimeListener();
  } catch (err) {
    console.error("[firebase strats] SDK init exception", err);
    clearFirebaseSdkTimer();
    bootstrapFirebaseViaRest();
  }
}

function initFirebase() {
  useFirebase = true;
  firebaseBootstrapped = false;
  setBannerVisible("configBanner", false);
  setSyncStatus("loading");

  bootstrapFirebaseViaRest().then(() => {
    if (typeof firebase !== "undefined") {
      initFirebaseSdk();
    }
  });
}

function setFileInputEnabled(enabled) {
  const input = document.getElementById("fileInput");
  if (input) input.disabled = !enabled;
}

function initLocalOnly() {
  useFirebase = false;
  useStorage = false;
  setBannerVisible("configBanner", true);
  setBannerVisible("storageBanner", false);
  setBannerVisible("fileProtocolBanner", isFileProtocol());
  setSyncStatus("local");
  setFileInputEnabled(false);
  renderFiles();
}

function validateSelectedFile(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!ACCEPTED_EXT.has(ext)) {
    return `„${file.name}" — nur PDF, JPG, PNG oder WebP.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `„${file.name}" — maximal 10 MB (aktuell ${formatFileSize(file.size)}).`;
  }
  if (!file.size) {
    return `„${file.name}" — Datei ist leer.`;
  }
  return null;
}

async function uploadOneFile(file, progressBase) {
  const validationErr = validateSelectedFile(file);
  if (validationErr) throw new Error(validationErr);

  const id = uniqueId();
  const type = fileTypeFromName(file.name);
  const path = storagePathFor(id, file.name);
  const objectRef = storageRef.child(path);

  const uploadTask = objectRef.put(file, { contentType: contentTypeForFile(file) });
  const stateEvent =
    (typeof firebase !== "undefined" && firebase.storage?.TaskEvent?.STATE_CHANGED) ||
    "state_changed";

  applyUploadProgressFromSnapshot(progressBase, { bytesTransferred: 0, totalBytes: 0 }, file);

  await new Promise((resolve, reject) => {
    let settled = false;
    let pollTimer = null;
    let stuckTimer = null;
    let sawBytes = false;

    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (stuckTimer) clearTimeout(stuckTimer);
      fn(arg);
    };

    const onSnapshot = (snapshot) => {
      if (!snapshot) return;
      if (snapshot.bytesTransferred > 0) {
        sawBytes = true;
        if (stuckTimer) {
          clearTimeout(stuckTimer);
          stuckTimer = null;
        }
      }
      applyUploadProgressFromSnapshot(progressBase, snapshot, file);
    };

    stuckTimer = setTimeout(() => {
      if (sawBytes) return;
      const err = new Error("Upload timeout");
      err.code = "upload/timeout";
      finish(reject, err);
      try {
        uploadTask.cancel();
      } catch (_) {
        /* ignore */
      }
    }, UPLOAD_STUCK_TIMEOUT_MS);

    uploadTask.on(
      stateEvent,
      (snapshot) => {
        onSnapshot(snapshot);
        const successState =
          typeof firebase !== "undefined" && firebase.storage?.TaskState?.SUCCESS;
        if (successState && snapshot.state === successState) {
          setUploadProgress({
            message: `${progressBase} … 100%`,
            percent: 100,
            indeterminate: false,
            visible: true,
          });
        }
      },
      (e) => finish(reject, e),
      () => finish(resolve)
    );

    pollTimer = setInterval(() => {
      if (uploadTask.snapshot) onSnapshot(uploadTask.snapshot);
    }, UPLOAD_PROGRESS_POLL_MS);
  });

  const downloadURL = await objectRef.getDownloadURL();
  const side = normalizeSide(uploadSide);
  const sideFiles = getSortedFiles(side);
  const maxOrder = sideFiles.reduce((max, f) => Math.max(max, Number(f.order) || 0), -1);
  const entry = {
    id,
    name: file.name,
    title: defaultTitleFromFilename(file.name),
    description: "",
    side,
    order: maxOrder + 1,
    storagePath: path,
    downloadURL,
    type,
    uploadedAt: new Date().toISOString(),
  };

  files = [...files, entry];
  try {
    if (dbRef) {
      await persistMeta();
    } else {
      await persistMetaViaRest();
    }
  } catch (metaErr) {
    await objectRef.delete().catch(() => {});
    files = files.filter((f) => f.id !== id);
    throw metaErr;
  }
  renderFiles();
  return entry;
}

async function onFilesSelected(fileList) {
  setUploadError("", false);

  if (isFileProtocol()) {
    setUploadError(formatUploadError({ code: "file_protocol" }), true);
    return;
  }

  if (!useFirebase || !useStorage || !storageRef) {
    setUploadError(
      "Upload nicht möglich: Firebase Storage ist nicht konfiguriert. Siehe SETUP-FIREBASE.md.",
      true
    );
    showStorageSetupBanner();
    setUploadError(storageSetupErrorHtml(), true, { html: true });
    return;
  }

  const selected = Array.from(fileList || []);
  if (!selected.length) return;

  const preflightErrors = [];
  const valid = [];
  for (const file of selected) {
    const err = validateSelectedFile(file);
    if (err) preflightErrors.push(err);
    else valid.push(file);
  }

  if (!valid.length) {
    setUploadError(preflightErrors.join("\n"), true);
    const input = document.getElementById("fileInput");
    if (input) input.value = "";
    return;
  }

  isUploading = true;
  setSyncStatus("uploading");
  const input = document.getElementById("fileInput");
  if (input) input.disabled = true;

  const errors = [...preflightErrors];
  let done = 0;
  let storageFailed = false;
  let lastUploadErr = null;

  for (const file of valid) {
    const progressBase = `Upload ${done + 1} von ${valid.length}: ${file.name}`;
    try {
      await uploadOneFile(file, progressBase);
      done += 1;
    } catch (e) {
      console.error("[strats upload]", e?.code, e?.message || e);
      if (e?.code === "upload/timeout") {
        console.error(
          "[strats upload] 0 % timeout — prüfen:",
          FIREBASE_STORAGE_CONSOLE,
          "storageBucket:",
          window.FIREBASE_CONFIG?.storageBucket
        );
      }
      lastUploadErr = e;
      errors.push(formatUploadError(e));
      if (isStorageSetupError(e)) storageFailed = true;
    }
  }

  if (done > 0 && done === valid.length) {
    setUploadProgress({
      message:
        done === 1
          ? "1 Datei erfolgreich hochgeladen."
          : `${done} Dateien erfolgreich hochgeladen.`,
      percent: 100,
      visible: true,
      success: true,
    });
    window.setTimeout(() => setUploadProgress({ visible: false }), 3500);
  } else {
    setUploadProgress({ visible: false });
  }
  isUploading = false;
  if (input) {
    input.disabled = !useStorage || isFileProtocol();
    input.value = "";
  }
  setSyncStatus(useFirebase ? "live" : "offline");

  if (storageFailed) {
    void checkStorageStatus();
    showUploadErrorFromResults(errors, lastUploadErr);
  } else if (errors.length) {
    showUploadErrorFromResults(errors, lastUploadErr);
  }
}

async function deleteFile(file) {
  if (!file?.id) return;
  if (
    !confirm(
      `„${displayLabel(file)}" wirklich löschen? Das kann nicht rückgängig gemacht werden.`
    )
  ) {
    return;
  }

  if (!useFirebase || !useStorage) return;

  isUploading = true;
  setSyncStatus("uploading");

  try {
    if (file.storagePath && storageRef) {
      await storageRef.child(file.storagePath).delete().catch((err) => {
        if (err?.code !== "storage/object-not-found") throw err;
      });
    }

    const remaining = files.filter((f) => f.id !== file.id);
    files = mergeSideLists(
      remaining.filter((f) => normalizeSide(f.side) === "attack"),
      remaining.filter((f) => normalizeSide(f.side) === "defence")
    );
    if (dbRef) {
      await persistMeta();
    } else {
      await persistMetaViaRest();
    }
    renderFiles();
    setSyncStatus("live");
  } catch (err) {
    console.error("[strats delete]", err);
    setUploadError(formatUploadError(err), true);
    if (isStorageSetupError(err)) {
      showStorageSetupBanner();
      setUploadError(storageSetupErrorHtml(), true, { html: true });
      void checkStorageStatus();
    }
    setSyncStatus(
      err?.code === "PERMISSION_DENIED" || err?.code === "storage/unauthorized"
        ? "error-rules"
        : "offline"
    );
  } finally {
    isUploading = false;
    setFileInputEnabled(useStorage && !isFileProtocol());
  }
}

async function retryFirebaseSync() {
  if (!isFirebaseConfigured()) return;
  setSyncStatus("loading");
  firebaseBootstrapped = false;
  clearFirebaseSdkTimer();
  await bootstrapFirebaseViaRest();
  if (typeof firebase !== "undefined" && !dbRef) {
    initFirebaseSdk();
  }
}

function showInvalidMap() {
  document.title = "Zero Synergy — Strats";
  const title = document.getElementById("mapTitle");
  if (title) title.textContent = "Map nicht gefunden";
  const main = document.querySelector(".strats-map-main");
  if (main) {
    main.innerHTML =
      '<p class="strats-invalid">Ungültige Map. <a href="strats.html">Zurück zur Übersicht</a>.</p>';
  }
  const toolbar = document.querySelector(".strats-upload-toolbar");
  if (toolbar) toolbar.hidden = true;
}

function initPage() {
  mapSlug = getMapFromQuery();
  if (!mapSlug) {
    showInvalidMap();
    return;
  }

  mapLabel = mapById[mapSlug].label;
  document.title = `Zero Synergy — Strats · ${mapLabel}`;
  const title = document.getElementById("mapTitle");
  if (title) title.textContent = `Strats — ${mapLabel}`;

  initLightboxControls();

  const params = new URLSearchParams(window.location.search);
  if (params.get("debug") === "lightbox") {
    setTimeout(() => openLightbox(LIGHTBOX_DEBUG_IMAGE, "Lightbox Test"), 150);
  }

  document.getElementById("fileInput")?.addEventListener("change", (e) => {
    onFilesSelected(e.target.files);
  });

  document.getElementById("uploadSidePicker")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".strats-side-toggle__btn");
    if (!btn?.dataset.side) return;
    uploadSide = normalizeSide(btn.dataset.side);
    updateUploadSidePicker();
  });

  document.getElementById("retrySync")?.addEventListener("click", retryFirebaseSync);
  document.getElementById("storageStatusBtn")?.addEventListener("click", () => {
    void checkStorageStatus();
  });

  if (isFileProtocol()) {
    setBannerVisible("fileProtocolBanner", true);
  }

  if (typeof firebase !== "undefined" && isFirebaseConfigured()) {
    initFirebase();
    if (!isFileProtocol()) {
      window.setTimeout(() => void checkStorageStatus(), 800);
    }
  } else {
    initLocalOnly();
  }
}

initPage();

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
let groups = [];
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
let activeSide = "attack";

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

function normalizeGroupsList(data) {
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

function isLegacyFileEntry(entry) {
  return Boolean(
    entry &&
      !Array.isArray(entry.images) &&
      (entry.downloadURL || entry.storagePath || entry.name)
  );
}

function normalizeImagesList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter(Boolean);
  if (typeof data === "object") return Object.values(data).filter(Boolean);
  return [];
}

function migrateImageEntry(image, index) {
  const img = { ...image };
  if (!img.id) img.id = uniqueId();
  if (img.order == null || Number.isNaN(Number(img.order))) {
    img.order = index;
  } else {
    img.order = Number(img.order);
  }
  if (!img.type && img.name) img.type = fileTypeFromName(img.name);
  return img;
}

function reindexImageOrders(images) {
  return images.map((img, i) => ({ ...img, order: i }));
}

function legacyFileToGroup(file, index) {
  const image = migrateImageEntry(
    {
      id: uniqueId(),
      name: file.name,
      storagePath: file.storagePath,
      downloadURL: file.downloadURL,
      type: file.type || fileTypeFromName(file.name),
      uploadedAt: file.uploadedAt,
      order: 0,
    },
    0
  );
  const group = {
    id: file.id || uniqueId(),
    title: file.title,
    description: file.description ?? "",
    side: normalizeSide(file.side),
    order: file.order ?? index,
    images: [image],
  };
  if (!group.title || !String(group.title).trim()) {
    group.title = defaultTitleFromFilename(file.name);
  }
  if (group.order == null || Number.isNaN(Number(group.order))) {
    group.order = index;
  } else {
    group.order = Number(group.order);
  }
  return group;
}

function migrateGroupEntry(entry, index) {
  if (isLegacyFileEntry(entry)) {
    return legacyFileToGroup(entry, index);
  }
  const group = { ...entry };
  if (!group.id) group.id = uniqueId();
  if (group.description == null) group.description = "";
  group.side = normalizeSide(group.side);
  if (group.order == null || Number.isNaN(Number(group.order))) {
    group.order = index;
  } else {
    group.order = Number(group.order);
  }
  const images = normalizeImagesList(group.images).map((img, i) => migrateImageEntry(img, i));
  group.images = reindexImageOrders(
    images.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  );
  if (!group.title || !String(group.title).trim()) {
    const firstName = group.images[0]?.name;
    group.title = firstName ? defaultTitleFromFilename(firstName) : "Unbenannt";
  }
  if (!group.images.length) {
    group.title = group.title || "Unbenannt";
  }
  return group;
}

function reindexGroupOrders(list) {
  return list.map((g, i) => ({ ...g, order: i }));
}

function reindexAllSides(list) {
  const merged = [];
  for (const side of SIDES) {
    const sideGroups = list
      .filter((g) => normalizeSide(g.side) === side)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    merged.push(...reindexGroupOrders(sideGroups.map((g) => ({ ...g, side }))));
  }
  return merged;
}

function migrateAndSortGroupsList(data) {
  const list = normalizeGroupsList(data);
  const migrated = list.map((g, i) => migrateGroupEntry(g, i));
  const sorted = migrated.sort((a, b) => a.order - b.order);
  return reindexAllSides(sorted);
}

function getSortedGroups(side) {
  const filtered = side
    ? groups.filter((g) => normalizeSide(g.side) === normalizeSide(side))
    : [...groups];
  return filtered.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function getSortedImages(group) {
  const images = normalizeImagesList(group?.images);
  return images.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function mergeSideLists(attackList, defenceList) {
  return [
    ...reindexGroupOrders(attackList.map((g) => ({ ...g, side: "attack" }))),
    ...reindexGroupOrders(defenceList.map((g) => ({ ...g, side: "defence" }))),
  ];
}

function displayLabel(group) {
  const title = group?.title && String(group.title).trim();
  if (title) return title;
  const first = getSortedImages(group)[0];
  return first?.name ? defaultTitleFromFilename(first.name) : "Unbenannt";
}

function groupMetaSummary(group) {
  const images = getSortedImages(group);
  const imageCount = images.filter((i) => i.type === "image").length;
  const pdfCount = images.filter((i) => i.type === "pdf").length;
  const parts = [];
  if (imageCount) parts.push(imageCount === 1 ? "1 Bild" : `${imageCount} Bilder`);
  if (pdfCount) parts.push(pdfCount === 1 ? "1 PDF" : `${pdfCount} PDFs`);
  const latest = images
    .map((i) => i.uploadedAt)
    .filter(Boolean)
    .sort()
    .pop();
  if (latest) parts.push(formatDate(latest));
  return parts.join(" · ");
}

function galleryLayoutClass(count) {
  if (count <= 1) return "strats-gallery--1";
  if (count === 2) return "strats-gallery--2";
  if (count <= 4) return "strats-gallery--4";
  if (count === 5) return "strats-gallery--5";
  return "strats-gallery--many";
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

/** Max height before description scrolls (very long notes). */
const DESC_EDITOR_MAX_HEIGHT_PX = 480;
const DESC_BULLET_LINE_RE = /^\s*[-•]\s/;

function escapeDescHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isStoredDescriptionHtml(stored) {
  const s = (stored ?? "").trim();
  if (!s) return false;
  return /<[a-z][\s\S]*>/i.test(s);
}

function plainTextToDescHtml(text) {
  const raw = text ?? "";
  if (!raw) return "";
  return raw
    .split("\n")
    .map((line) => {
      const cls = DESC_BULLET_LINE_RE.test(line) ? "strats-desc-bullet" : "strats-desc-line";
      const inner = line === "" ? "<br>" : escapeDescHtml(line);
      return `<p class="${cls}">${inner}</p>`;
    })
    .join("");
}

function descParagraphClassFromNode(node) {
  if (node.classList?.contains("strats-desc-bullet")) return "strats-desc-bullet";
  if (node.classList?.contains("strats-desc-line")) return "strats-desc-line";
  return DESC_BULLET_LINE_RE.test(node.textContent || "")
    ? "strats-desc-bullet"
    : "strats-desc-line";
}

function sanitizeDescNode(node, outParent) {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = node.textContent || "";
    if (t) outParent.appendChild(document.createTextNode(t));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const tag = node.nodeName;
  if (tag === "SCRIPT" || tag === "STYLE") return;

  if (tag === "P" || tag === "DIV") {
    const p = document.createElement("p");
    p.className = descParagraphClassFromNode(node);
    for (const child of node.childNodes) sanitizeDescNode(child, p);
    if (!p.childNodes.length) p.appendChild(document.createElement("br"));
    outParent.appendChild(p);
    return;
  }
  if (tag === "BR") {
    outParent.appendChild(document.createElement("br"));
    return;
  }
  if (tag === "STRONG" || tag === "B") {
    const el = document.createElement("strong");
    for (const child of node.childNodes) sanitizeDescNode(child, el);
    if (el.childNodes.length) outParent.appendChild(el);
    return;
  }
  if (tag === "EM" || tag === "I") {
    const el = document.createElement("em");
    for (const child of node.childNodes) sanitizeDescNode(child, el);
    if (el.childNodes.length) outParent.appendChild(el);
    return;
  }
  if (tag === "SPAN" && node.classList.contains("strats-desc-large")) {
    const el = document.createElement("span");
    el.className = "strats-desc-large";
    for (const child of node.childNodes) sanitizeDescNode(child, el);
    if (el.childNodes.length) outParent.appendChild(el);
    return;
  }

  for (const child of node.childNodes) sanitizeDescNode(child, outParent);
}

function sanitizeDescriptionHtml(html) {
  const raw = html ?? "";
  if (!String(raw).trim()) return "";
  const wrap = document.createElement("div");
  wrap.innerHTML = raw;
  const out = document.createElement("div");
  for (const child of wrap.childNodes) sanitizeDescNode(child, out);
  if (!out.querySelector("p")) {
    const text = (out.textContent || "").trim();
    if (!text && !out.querySelector("br")) return "";
    return plainTextToDescHtml(out.textContent || "");
  }
  return out.innerHTML;
}

function extractDescriptionFromEditor(el) {
  if (!el) return "";
  ensureDescEditorHasBlock(el);
  const html = (el.innerHTML || "").trim();
  if (!html) return "";
  return sanitizeDescriptionHtml(el.innerHTML);
}

function syncDescEditorFromStored(descEl, stored) {
  if (!descEl) return;
  const raw = stored ?? "";
  descEl.innerHTML = isStoredDescriptionHtml(raw)
    ? sanitizeDescriptionHtml(raw)
    : plainTextToDescHtml(raw);
  fitDescEditor(descEl);
}

function findAncestorDescLarge(node, root) {
  while (node && node !== root) {
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      node.nodeName === "SPAN" &&
      node.classList.contains("strats-desc-large")
    ) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
}

function unwrapDescElement(el) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function wrapRangeWithDescClass(range, className) {
  const span = document.createElement("span");
  span.className = className;
  try {
    range.surroundContents(span);
  } catch {
    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);
  }
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    const next = document.createRange();
    next.selectNodeContents(span);
    next.collapse(false);
    sel.addRange(next);
  }
}

function toggleDescLargeFormat(descEl) {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!descEl.contains(range.commonAncestorContainer)) return;

  if (!range.collapsed) {
    const startLarge = findAncestorDescLarge(range.startContainer, descEl);
    const endLarge = findAncestorDescLarge(range.endContainer, descEl);
    if (startLarge && startLarge === endLarge) {
      unwrapDescElement(startLarge);
      return;
    }
    wrapRangeWithDescClass(range, "strats-desc-large");
    return;
  }

  const atLarge = findAncestorDescLarge(sel.anchorNode, descEl);
  if (atLarge) {
    unwrapDescElement(atLarge);
    return;
  }

  const span = document.createElement("span");
  span.className = "strats-desc-large";
  span.appendChild(document.createTextNode("\u200b"));
  range.insertNode(span);
  const caret = document.createRange();
  caret.setStart(span.firstChild, 1);
  caret.collapse(true);
  sel.removeAllRanges();
  sel.addRange(caret);
}

function applyDescFormat(descEl, format) {
  if (!descEl || descEl.getAttribute("contenteditable") !== "true") return;
  descEl.focus();
  ensureDescEditorHasBlock(descEl);
  if (format === "bold") {
    document.execCommand("bold", false, null);
  } else if (format === "italic") {
    document.execCommand("italic", false, null);
  } else if (format === "large") {
    toggleDescLargeFormat(descEl);
  }
  notifyDescEditorChange(descEl);
}

function bindDescFormatToolbar(toolbar, descEl) {
  if (!toolbar || !descEl) return;
  toolbar.querySelectorAll("[data-format]").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      applyDescFormat(descEl, btn.dataset.format);
    });
  });
}

function createDescFormatToolbar(canEditToolbar) {
  const toolbar = document.createElement("div");
  toolbar.className = "strats-desc-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Beschreibung formatieren");
  const items = [
    { format: "bold", label: "Fett", aria: "Fett" },
    { format: "italic", label: "Kursiv", aria: "Kursiv" },
    { format: "large", label: "Größer", aria: "Größerer Text" },
  ];
  for (const { format, label, aria } of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "strats-desc-toolbar__btn";
    btn.dataset.format = format;
    btn.textContent = label;
    btn.setAttribute("aria-label", aria);
    btn.disabled = !canEditToolbar;
    toolbar.appendChild(btn);
  }
  return toolbar;
}

function setPlainTextInputAttrs(input) {
  if (!input) return;
  input.setAttribute("spellcheck", "false");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("autocapitalize", "off");
}

function fitDescEditor(descEl) {
  if (!descEl) return;
  descEl.style.height = "auto";
  const minH = parseFloat(getComputedStyle(descEl).minHeight) || 0;
  const next = Math.max(descEl.scrollHeight, minH);
  if (next <= DESC_EDITOR_MAX_HEIGHT_PX) {
    descEl.style.height = `${next}px`;
    descEl.style.overflowY = "hidden";
  } else {
    descEl.style.height = `${DESC_EDITOR_MAX_HEIGHT_PX}px`;
    descEl.style.overflowY = "auto";
  }
}

function bindDescEditorAutoResize(descEl) {
  if (!descEl) return;
  const resize = () => fitDescEditor(descEl);
  descEl.addEventListener("input", resize);
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(resize);
    ro.observe(descEl);
  }
  requestAnimationFrame(resize);
}

function getActiveDescBlock(descEl) {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !descEl) return null;
  let node = sel.anchorNode;
  if (!node || !descEl.contains(node)) return null;
  while (node && node !== descEl) {
    if (node.nodeName === "P" || (node.nodeName === "DIV" && node.parentNode === descEl)) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
}

function isDescBulletBlock(block) {
  if (!block) return false;
  if (block.classList?.contains("strats-desc-bullet")) return true;
  return DESC_BULLET_LINE_RE.test(block.textContent || "");
}

function createDescParagraph(isBullet, text = "") {
  const p = document.createElement("p");
  p.className = isBullet ? "strats-desc-bullet" : "strats-desc-line";
  if (!text) {
    p.appendChild(document.createElement("br"));
  } else {
    p.textContent = text;
  }
  return p;
}

function setDescBlockText(block, text) {
  if (!text) {
    block.textContent = "";
    block.appendChild(document.createElement("br"));
  } else {
    block.textContent = text;
  }
}

function formatNewBulletLineText(afterText) {
  const trimmed = (afterText || "").replace(/^\s+/, "");
  if (!trimmed) return "- ";
  if (DESC_BULLET_LINE_RE.test(trimmed) || /^\s*[-•]/.test(afterText || "")) return trimmed;
  return `- ${trimmed}`;
}

function descBulletCaretOffset(text) {
  const m = (text || "").match(/^\s*([-•])\s*/);
  return m ? m[0].length : 0;
}

function isEmptyBulletBlock(block) {
  const t = (block?.textContent || "").replace(/\u00a0/g, " ").trim();
  return !t || t === "-" || /^-\s*$/.test(t);
}

function getTextSplitInBlock(block, range) {
  const beforeRange = document.createRange();
  beforeRange.selectNodeContents(block);
  beforeRange.setEnd(range.startContainer, range.startOffset);
  const afterRange = document.createRange();
  afterRange.selectNodeContents(block);
  afterRange.setStart(range.endContainer, range.endOffset);
  return { before: beforeRange.toString(), after: afterRange.toString() };
}

function isCaretAtBlockStart(range, block) {
  const r = document.createRange();
  r.selectNodeContents(block);
  r.setEnd(range.startContainer, range.startOffset);
  return r.toString().length === 0;
}

function placeCaretInDescBlock(block, offset) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  const textNode = [...block.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
  if (textNode) {
    const pos = Math.min(Math.max(0, offset), textNode.length);
    range.setStart(textNode, pos);
    range.collapse(true);
  } else {
    range.selectNodeContents(block);
    range.collapse(true);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

function ensureDescEditorHasBlock(descEl) {
  const hasBlock = [...descEl.childNodes].some(
    (n) => n.nodeName === "P" || (n.nodeName === "DIV" && n !== descEl)
  );
  if (!hasBlock) {
    descEl.appendChild(createDescParagraph(false));
  }
}

function notifyDescEditorChange(descEl) {
  descEl.dispatchEvent(new Event("input", { bubbles: true }));
  fitDescEditor(descEl);
}

function handleDescEditorEnter(descEl, e) {
  e.preventDefault();
  ensureDescEditorHasBlock(descEl);
  const sel = window.getSelection();
  if (!sel?.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!descEl.contains(range.commonAncestorContainer)) return;
  if (!range.collapsed) range.deleteContents();

  let block = getActiveDescBlock(descEl);
  if (!block) {
    block = createDescParagraph(false);
    descEl.appendChild(block);
    placeCaretInDescBlock(block, 0);
    return;
  }

  const isBullet = isDescBulletBlock(block);
  const { before, after } = getTextSplitInBlock(block, range);
  setDescBlockText(block, before);

  const newText = isBullet ? formatNewBulletLineText(after) : after;
  const newBlock = createDescParagraph(isBullet, newText);
  block.after(newBlock);

  const caretOffset = isBullet ? descBulletCaretOffset(newText) : 0;
  placeCaretInDescBlock(newBlock, caretOffset);
  notifyDescEditorChange(descEl);
}

function handleDescEditorBackspace(descEl, e) {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const block = getActiveDescBlock(descEl);
  if (!block || !isDescBulletBlock(block) || !isCaretAtBlockStart(range, block)) return;
  if (!isEmptyBulletBlock(block)) return;

  e.preventDefault();
  const prev = block.previousElementSibling;
  block.remove();
  if (prev) {
    placeCaretInDescBlock(prev, (prev.textContent || "").length);
  } else {
    ensureDescEditorHasBlock(descEl);
    const first = descEl.querySelector("p, div");
    if (first) {
      first.className = "strats-desc-line";
      setDescBlockText(first, "");
      placeCaretInDescBlock(first, 0);
    }
  }
  notifyDescEditorChange(descEl);
}

function bindDescEditorKeys(descEl) {
  if (!descEl) return;
  descEl.addEventListener("keydown", (e) => {
    if (descEl.getAttribute("contenteditable") !== "true") return;
    if (e.key === "Enter" && !e.shiftKey) {
      handleDescEditorEnter(descEl, e);
    } else if (e.key === "Backspace") {
      handleDescEditorBackspace(descEl, e);
    }
  });
}

function readCardMeta(card) {
  const titleInput = card.querySelector(".strats-file-card__title-input");
  const descInput = card.querySelector(".strats-file-card__desc-input");
  return {
    title: (titleInput?.value || "").trim(),
    description: extractDescriptionFromEditor(descInput),
  };
}

async function saveCardMeta(card, groupId) {
  if (!useFirebase || isUploading || isSavingMeta) return;
  const idx = groups.findIndex((g) => g.id === groupId);
  if (idx < 0) return;

  const { title, description } = readCardMeta(card);
  const fallbackName = getSortedImages(groups[idx])[0]?.name;
  const nextTitle = title || defaultTitleFromFilename(fallbackName);

  if (groups[idx].title === nextTitle && groups[idx].description === description) {
    setCardSaveState(card, "saved");
    return;
  }

  isSavingMeta = true;
  setCardSaveState(card, "saving");

  try {
    groups[idx] = { ...groups[idx], title: nextTitle, description };
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

function bindCardMetaEditors(card, group) {
  const titleInput = card.querySelector(".strats-file-card__title-input");
  const descInput = card.querySelector(".strats-file-card__desc-input");
  const saveBtn = card.querySelector(".strats-file-card__save");

  const onInput = () => markCardDirty(card);
  titleInput?.addEventListener("input", onInput);
  descInput?.addEventListener("input", onInput);
  bindDescEditorAutoResize(descInput);
  bindDescEditorKeys(descInput);
  const descToolbar = card.querySelector(".strats-desc-toolbar");
  bindDescFormatToolbar(descToolbar, descInput);

  descInput?.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (document.queryCommandSupported?.("insertText")) {
      document.execCommand("insertText", false, text);
    } else {
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      sel.deleteFromDocument();
      sel.getRangeAt(0).insertNode(document.createTextNode(text));
      sel.collapseToEnd();
    }
  });

  const onBlur = () => {
    if (card.classList.contains("strats-file-card--dragging")) return;
    if (descInput) {
      syncDescEditorFromStored(descInput, extractDescriptionFromEditor(descInput));
    }
    void saveCardMeta(card, group.id);
  };
  titleInput?.addEventListener("blur", onBlur);
  descInput?.addEventListener("blur", onBlur);

  saveBtn?.addEventListener("click", () => {
    if (descInput) {
      syncDescEditorFromStored(descInput, extractDescriptionFromEditor(descInput));
    }
    void saveCardMeta(card, group.id);
  });
}

function bindCardSideToggle(card, group) {
  const toggle = card.querySelector(".strats-file-card__side-toggle");
  if (!toggle) return;
  toggle.querySelectorAll(".strats-side-toggle__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextSide = btn.dataset.side;
      if (!nextSide || normalizeSide(nextSide) === normalizeSide(group.side)) return;
      void setGroupSide(group.id, nextSide, { switchView: true });
    });
  });
}

function bindCardDragReorder(card, group, columnCount) {
  const handle = card.querySelector(".strats-file-card__drag");
  if (!handle) return;

  handle.addEventListener("dragstart", (e) => {
    if (isUploading || isSavingMeta || columnCount < 2) {
      e.preventDefault();
      return;
    }
    dragSourceId = group.id;
    card.classList.add("strats-file-card--dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", group.id);
    e.dataTransfer.setData("application/x-strat-side", normalizeSide(group.side));
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
    document.querySelectorAll(".strats-side-panel__list--drop-target").forEach((el) => {
      el.classList.remove("strats-side-panel__list--drop-target");
    });
  });

  card.addEventListener("dragover", (e) => {
    if (!dragSourceId || dragSourceId === group.id) return;
    const source = groups.find((g) => g.id === dragSourceId);
    if (!source || normalizeSide(source.side) !== normalizeSide(group.side)) return;
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
    if (sourceId && sourceId !== group.id) {
      void reorderGroups(sourceId, group.id);
    }
    dragSourceId = null;
  });
}

async function setGroupSide(groupId, newSide, options = {}) {
  if (!useFirebase || isUploading || isSavingMeta) return;
  const side = normalizeSide(newSide);
  const idx = groups.findIndex((g) => g.id === groupId);
  if (idx < 0 || normalizeSide(groups[idx].side) === side) return;

  const attackList = getSortedGroups("attack").filter((g) => g.id !== groupId);
  const defenceList = getSortedGroups("defence").filter((g) => g.id !== groupId);
  const moved = { ...groups[idx], side };
  if (side === "attack") attackList.push(moved);
  else defenceList.push(moved);
  groups = mergeSideLists(attackList, defenceList);

  isSavingMeta = true;
  try {
    if (dbRef) {
      await persistMeta();
    } else {
      await persistMetaViaRest();
    }
    if (options.switchView) {
      setActiveSide(side, { syncUpload: true });
    } else {
      renderGroups();
    }
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

async function reorderGroups(sourceId, targetId) {
  if (!useFirebase || isUploading || isSavingMeta || sourceId === targetId) return;

  const sourceGroup = groups.find((g) => g.id === sourceId);
  const targetGroup = groups.find((g) => g.id === targetId);
  if (!sourceGroup || !targetGroup) return;
  if (normalizeSide(sourceGroup.side) !== normalizeSide(targetGroup.side)) return;

  const side = normalizeSide(sourceGroup.side);
  const sorted = getSortedGroups(side);
  const from = sorted.findIndex((g) => g.id === sourceId);
  const to = sorted.findIndex((g) => g.id === targetId);
  if (from < 0 || to < 0) return;

  const next = [...sorted];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);

  const attackList = side === "attack" ? next : getSortedGroups("attack");
  const defenceList = side === "defence" ? next : getSortedGroups("defence");
  groups = mergeSideLists(attackList, defenceList);

  isSavingMeta = true;
  try {
    if (dbRef) {
      await persistMeta();
    } else {
      await persistMetaViaRest();
    }
    renderGroups();
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

let lightboxGroupId = null;
let lightboxImageIndex = 0;
let addImagesTargetGroupId = null;

function getGroupLightboxImages(group) {
  return getSortedImages(group).filter((img) => img.downloadURL && img.type === "image");
}

function appendGallery(group, container, label) {
  const images = getSortedImages(group);
  if (!images.length) {
    const p = document.createElement("p");
    p.className = "strats-gallery__empty";
    p.textContent = "Noch keine Dateien in diesem Strat.";
    container.appendChild(p);
    return;
  }

  const grid = document.createElement("div");
  grid.className = `strats-gallery ${galleryLayoutClass(images.length)}`;
  grid.setAttribute("role", "list");

  const lightboxImages = getGroupLightboxImages(group);

  images.forEach((image, index) => {
    const item = document.createElement("div");
    item.className = "strats-gallery__item";
    item.setAttribute("role", "listitem");

    const badge = document.createElement("span");
    badge.className = "strats-gallery__badge";
    badge.textContent = String(index + 1);
    item.appendChild(badge);

    if (image.downloadURL && image.type === "image") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "strats-gallery__thumb-btn";
      const img = document.createElement("img");
      img.className = "strats-gallery__thumb";
      img.src = image.downloadURL;
      img.alt = `${label} — Bild ${index + 1}`;
      img.loading = "lazy";
      btn.appendChild(img);
      const lbIndex = lightboxImages.findIndex((i) => i.id === image.id);
      btn.addEventListener("click", () => {
        if (lbIndex >= 0) openLightboxForGroup(group.id, lbIndex);
      });
      item.appendChild(btn);
    } else if (image.downloadURL && image.type === "pdf") {
      const pdfLink = document.createElement("a");
      pdfLink.className = "strats-gallery__pdf";
      pdfLink.href = image.downloadURL;
      pdfLink.target = "_blank";
      pdfLink.rel = "noopener";
      pdfLink.textContent = "PDF öffnen";
      item.appendChild(pdfLink);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "strats-gallery__placeholder";
      placeholder.textContent = "—";
      item.appendChild(placeholder);
    }

    if (useFirebase && useStorage && !isUploading) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "strats-gallery__remove";
      removeBtn.textContent = "Aus Strat entfernen";
      removeBtn.title = "Datei aus diesem Strat entfernen";
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        void removeImageFromGroup(group.id, image.id);
      });
      item.appendChild(removeBtn);
    }

    grid.appendChild(item);
  });

  container.appendChild(grid);
}

function updateSideToggleButtons(container, active) {
  if (!container) return;
  const side = normalizeSide(active);
  container.querySelectorAll(".strats-side-toggle__btn").forEach((btn) => {
    const isActive = btn.dataset.side === side;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    if (btn.getAttribute("role") === "tab") {
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    }
  });
}

function updateUploadSidePicker() {
  updateSideToggleButtons(document.getElementById("uploadSidePicker"), uploadSide);
}

function updateMapSideToggle() {
  updateSideToggleButtons(document.getElementById("mapSideToggle"), activeSide);
  const panel = document.getElementById("stratsSidePanel");
  const listEl = document.getElementById("fileList");
  const tabId = activeSide === "defence" ? "mapSideTabDefence" : "mapSideTabAttack";
  if (panel) panel.setAttribute("aria-labelledby", tabId);
  if (listEl) listEl.dataset.side = activeSide;
}

function setActiveSide(side, options = {}) {
  activeSide = normalizeSide(side);
  if (options.syncUpload !== false) {
    uploadSide = activeSide;
    updateUploadSidePicker();
  }
  updateMapSideToggle();
  renderGroups();
}

function emptyHintForSide(side) {
  return side === "defence" ? "Noch keine Defence-Strats." : "Noch keine Attack-Strats.";
}

function renderGroupCard(group, sortedInColumn, canEdit, listEl) {
    const label = displayLabel(group);
    const card = document.createElement("article");
    card.className = "strats-file-card";
    card.dataset.id = group.id;

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

    const content = document.createElement("div");
    content.className = "strats-file-card__content";

    const titleField = document.createElement("div");
    titleField.className = "strats-file-card__field";
    const titleLabel = document.createElement("label");
    titleLabel.className = "strats-file-card__label";
    titleLabel.htmlFor = `title-${group.id}`;
    titleLabel.textContent = "Titel";
    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.id = `title-${group.id}`;
    titleInput.className = "strats-file-card__title-input";
    titleInput.value =
      group.title || defaultTitleFromFilename(getSortedImages(group)[0]?.name);
    titleInput.disabled = !canEdit || isUploading;
    setPlainTextInputAttrs(titleInput);
    titleField.appendChild(titleLabel);
    titleField.appendChild(titleInput);
    content.appendChild(titleField);

    const descField = document.createElement("div");
    descField.className = "strats-file-card__field";
    const descLabel = document.createElement("span");
    descLabel.className = "strats-file-card__label";
    descLabel.id = `desc-label-${group.id}`;
    descLabel.textContent = "Beschreibung";
    const descHint = document.createElement("span");
    descHint.className = "strats-file-card__field-hint";
    descHint.textContent = "Stichpunkte mit „- “ oder „• “ am Zeilenanfang";
    const descToolbar = createDescFormatToolbar(canEdit && !isUploading);
    const descInput = document.createElement("div");
    descInput.id = `desc-${group.id}`;
    descInput.className = "strats-file-card__desc-input strats-desc-editor";
    descInput.setAttribute("role", "textbox");
    descInput.setAttribute("aria-multiline", "true");
    descInput.setAttribute("aria-labelledby", descLabel.id);
    descInput.setAttribute("lang", "en");
    setPlainTextInputAttrs(descInput);
    descInput.dataset.placeholder = "Notizen, Callouts … (Stichpunkte mit - beginnen)";
    descInput.contentEditable = canEdit && !isUploading ? "true" : "false";
    syncDescEditorFromStored(descInput, group.description || "");
    descField.appendChild(descLabel);
    descField.appendChild(descHint);
    descField.appendChild(descToolbar);
    descField.appendChild(descInput);
    content.appendChild(descField);

    const meta = document.createElement("p");
    meta.className = "strats-file-card__meta";
    meta.textContent = groupMetaSummary(group);
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
      if (normalizeSide(group.side) === sideKey) {
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

    const firstWithUrl = getSortedImages(group).find((i) => i.downloadURL);
    if (firstWithUrl?.downloadURL) {
      const openLink = document.createElement("a");
      openLink.className = "btn-secondary strats-file-card__open";
      openLink.href = firstWithUrl.downloadURL;
      openLink.target = "_blank";
      openLink.rel = "noopener";
      openLink.textContent = "Öffnen";
      actions.appendChild(openLink);
    }

    if (useFirebase && useStorage) {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn-secondary strats-file-card__add-images";
      addBtn.textContent = "Weitere Bilder hinzufügen";
      addBtn.disabled = isUploading;
      actions.appendChild(addBtn);
    }

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn-secondary strats-file-card__delete";
    delBtn.textContent = "Strat löschen";
    delBtn.disabled = isUploading || !useFirebase || !useStorage;
    actions.appendChild(delBtn);

    content.appendChild(actions);
    layout.appendChild(content);
    card.appendChild(layout);

    const galleryWrap = document.createElement("div");
    galleryWrap.className = "strats-file-card__gallery";
    appendGallery(group, galleryWrap, label);
    card.appendChild(galleryWrap);

    bindCardMetaEditors(card, group);
    bindCardSideToggle(card, group);
    bindCardDragReorder(card, group, sortedInColumn.length);
    listEl.appendChild(card);
}

function renderGroups() {
  const listEl = document.getElementById("fileList");
  const empty = document.getElementById("emptyHint");
  const emptySide = document.getElementById("emptyHintSide");
  if (!listEl) return;

  listEl.innerHTML = "";

  const attackGroups = getSortedGroups("attack");
  const defenceGroups = getSortedGroups("defence");
  const totalCount = attackGroups.length + defenceGroups.length;
  const side = normalizeSide(activeSide);
  const sideGroups = side === "defence" ? defenceGroups : attackGroups;
  const canEdit = useFirebase && totalCount > 0;

  if (empty) empty.hidden = totalCount > 0;
  if (emptySide) {
    emptySide.hidden = sideGroups.length > 0;
    emptySide.textContent = emptyHintForSide(side);
  }

  const showReorder = canEdit && sideGroups.length > 1;
  setReorderHintVisible(showReorder);

  for (const group of sideGroups) {
    renderGroupCard(group, sideGroups, canEdit, listEl);
  }

  updateMapSideToggle();
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

function updateLightboxNav() {
  const group = groups.find((g) => g.id === lightboxGroupId);
  const images = group ? getGroupLightboxImages(group) : [];
  const prevBtn = document.getElementById("lightboxPrev");
  const nextBtn = document.getElementById("lightboxNext");
  const counter = document.getElementById("lightboxCounter");
  const showNav = images.length > 1;
  if (prevBtn) {
    prevBtn.hidden = !showNav;
    prevBtn.disabled = !showNav;
  }
  if (nextBtn) {
    nextBtn.hidden = !showNav;
    nextBtn.disabled = !showNav;
  }
  if (counter) {
    counter.hidden = !showNav;
    counter.textContent = showNav ? `${lightboxImageIndex + 1} / ${images.length}` : "";
  }
}

function showLightboxImage(group, index) {
  const images = getGroupLightboxImages(group);
  if (!images.length) return;
  const safeIndex = ((index % images.length) + images.length) % images.length;
  const image = images[safeIndex];
  const box = document.getElementById("lightbox");
  const imgEl = document.getElementById("lightboxImg");
  if (!box || !imgEl || !image?.downloadURL) return;
  lightboxGroupId = group.id;
  lightboxImageIndex = safeIndex;
  imgEl.src = image.downloadURL;
  imgEl.alt = `${displayLabel(group)} — Bild ${safeIndex + 1}`;
  box.hidden = false;
  document.body.classList.add("strats-lightbox-open");
  updateLightboxNav();
}

function openLightboxForGroup(groupId, imageIndex) {
  const group = groups.find((g) => g.id === groupId);
  if (!group) return;
  showLightboxImage(group, imageIndex ?? 0);
  document.getElementById("lightboxCloseBtn")?.focus();
}

function openLightbox(url, alt) {
  const box = document.getElementById("lightbox");
  const img = document.getElementById("lightboxImg");
  if (!box || !img) return;
  lightboxGroupId = null;
  lightboxImageIndex = 0;
  img.src = url;
  img.alt = alt || "";
  box.hidden = false;
  document.body.classList.add("strats-lightbox-open");
  updateLightboxNav();
  document.getElementById("lightboxCloseBtn")?.focus();
}

function navigateLightbox(delta) {
  if (!lightboxGroupId) return;
  const group = groups.find((g) => g.id === lightboxGroupId);
  if (!group) return;
  showLightboxImage(group, lightboxImageIndex + delta);
}

function closeLightbox() {
  const box = document.getElementById("lightbox");
  const img = document.getElementById("lightboxImg");
  if (!box || !img || box.hidden) return;
  box.hidden = true;
  img.removeAttribute("src");
  lightboxGroupId = null;
  lightboxImageIndex = 0;
  document.body.classList.remove("strats-lightbox-open");
  updateLightboxNav();
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

  document.getElementById("lightboxPrev")?.addEventListener("click", (e) => {
    e.stopPropagation();
    navigateLightbox(-1);
  });
  document.getElementById("lightboxNext")?.addEventListener("click", (e) => {
    e.stopPropagation();
    navigateLightbox(1);
  });

  document.addEventListener("keydown", (e) => {
    if (!isLightboxOpen()) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeLightbox();
    } else if (e.key === "ArrowLeft" && lightboxGroupId) {
      e.preventDefault();
      navigateLightbox(-1);
    } else if (e.key === "ArrowRight" && lightboxGroupId) {
      e.preventDefault();
      navigateLightbox(1);
    }
  });
}

async function persistMeta() {
  if (!dbRef) return;
  await dbRef.set(groups);
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
  return normalizeGroupsList(data);
}

async function persistMetaViaRest() {
  const url = `${firebaseRestBase()}/${metaPath()}.json`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(groups),
  });
  if (!res.ok) {
    const err = new Error(`http_${res.status}`);
    err.code = res.status === 401 || res.status === 403 ? "PERMISSION_DENIED" : "HTTP_ERROR";
    throw err;
  }
}

function applyRemoteGroups(remote) {
  groups = migrateAndSortGroupsList(remote);
  if (!isUploading) {
    renderGroups();
  }
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
  applyRemoteGroups(remote);
  console.info("[firebase strats] bootstrap via", source);
}

function failFirebaseStartup(err) {
  clearFirebaseSdkTimer();
  console.error("[firebase strats] startup failed", err?.code, err?.message || err);
  if (!firebaseBootstrapped) {
    firebaseBootstrapped = true;
    groups = [];
    renderGroups();
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
      applyRemoteGroups(snapshot.val());
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

/** Re-enable inputs and refresh cards after upload/delete (avoids stuck disabled UI). */
function resetUploadUi() {
  isUploading = false;
  setFileInputEnabled(useStorage && !isFileProtocol());
  const fileInput = document.getElementById("fileInput");
  if (fileInput) fileInput.value = "";
  const addImagesInput = document.getElementById("addImagesInput");
  if (addImagesInput) {
    addImagesInput.disabled = false;
    addImagesInput.value = "";
  }
  renderGroups();
}

function initLocalOnly() {
  useFirebase = false;
  useStorage = false;
  setBannerVisible("configBanner", true);
  setBannerVisible("storageBanner", false);
  setBannerVisible("fileProtocolBanner", isFileProtocol());
  setSyncStatus("local");
  setFileInputEnabled(false);
  renderGroups();
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

async function uploadFileToStorage(file, imageId, progressBase) {
  const validationErr = validateSelectedFile(file);
  if (validationErr) throw new Error(validationErr);

  const type = fileTypeFromName(file.name);
  const path = storagePathFor(imageId, file.name);
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
  return {
    id: imageId,
    name: file.name,
    storagePath: path,
    downloadURL,
    type,
    uploadedAt: new Date().toISOString(),
  };
}

async function persistGroupsAfterUpload(uploadedImagePaths) {
  try {
    if (dbRef) {
      await persistMeta();
    } else {
      await persistMetaViaRest();
    }
  } catch (metaErr) {
    if (uploadedImagePaths?.length && storageRef) {
      for (const storagePath of uploadedImagePaths) {
        await storageRef.child(storagePath).delete().catch(() => {});
      }
    }
    throw metaErr;
  }
  if (!isUploading) {
    renderGroups();
  }
}

async function uploadImagesToGroup(groupId, fileList, progressLabelBase) {
  const idx = groups.findIndex((g) => g.id === groupId);
  if (idx < 0) throw new Error("Strat nicht gefunden.");

  const valid = [];
  const preflightErrors = [];
  for (const file of fileList) {
    const err = validateSelectedFile(file);
    if (err) preflightErrors.push(err);
    else valid.push(file);
  }
  if (!valid.length) {
    if (preflightErrors.length) throw new Error(preflightErrors.join("\n"));
    return;
  }

  const existingImages = getSortedImages(groups[idx]);
  const startOrder = existingImages.length;
  const newImages = [];
  const uploadedPaths = [];
  let done = 0;

  for (const file of valid) {
    const imageId = uniqueId();
    const progressBase =
      progressLabelBase ||
      `Upload ${done + 1} von ${valid.length}: ${file.name}`;
    try {
      const imageEntry = await uploadFileToStorage(file, imageId, progressBase);
      imageEntry.order = startOrder + done;
      newImages.push(imageEntry);
      uploadedPaths.push(imageEntry.storagePath);
      done += 1;
    } catch (e) {
      for (const path of uploadedPaths) {
        await storageRef.child(path).delete().catch(() => {});
      }
      throw e;
    }
  }

  groups[idx] = {
    ...groups[idx],
    images: reindexImageOrders([...existingImages, ...newImages]),
  };
  await persistGroupsAfterUpload(uploadedPaths);
}

async function uploadNewGroup(fileList, progressLabelBase) {
  const valid = [];
  const preflightErrors = [];
  for (const file of fileList) {
    const err = validateSelectedFile(file);
    if (err) preflightErrors.push(err);
    else valid.push(file);
  }
  if (!valid.length) {
    if (preflightErrors.length) throw new Error(preflightErrors.join("\n"));
    return;
  }

  const groupId = uniqueId();
  const side = normalizeSide(uploadSide);
  const sideGroups = getSortedGroups(side);
  const maxOrder = sideGroups.reduce((max, g) => Math.max(max, Number(g.order) || 0), -1);
  const images = [];
  const uploadedPaths = [];
  let done = 0;

  for (const file of valid) {
    const imageId = uniqueId();
    const progressBase =
      progressLabelBase ||
      `Upload ${done + 1} von ${valid.length}: ${file.name}`;
    const imageEntry = await uploadFileToStorage(file, imageId, progressBase);
    imageEntry.order = done;
    images.push(imageEntry);
    uploadedPaths.push(imageEntry.storagePath);
    done += 1;
  }

  const group = {
    id: groupId,
    title: defaultTitleFromFilename(valid[0].name),
    description: "",
    side,
    order: maxOrder + 1,
    images: reindexImageOrders(images),
  };

  groups = [...groups, group];
  try {
    await persistGroupsAfterUpload(uploadedPaths);
  } catch (metaErr) {
    groups = groups.filter((g) => g.id !== groupId);
    throw metaErr;
  }
  return group;
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

  try {
    await uploadNewGroup(valid, `Upload Strat (${valid.length} Datei${valid.length > 1 ? "en" : ""})`);
    done = valid.length;
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

  if (done > 0 && done === valid.length) {
    setUploadProgress({
      message:
        done === 1
          ? "1 Strat erfolgreich hochgeladen."
          : `Strat mit ${done} Bildern erfolgreich hochgeladen.`,
      percent: 100,
      visible: true,
      success: true,
    });
    window.setTimeout(() => setUploadProgress({ visible: false }), 3500);
  } else {
    setUploadProgress({ visible: false });
  }
  resetUploadUi();
  setSyncStatus(useFirebase ? "live" : "offline");

  if (storageFailed) {
    void checkStorageStatus();
    showUploadErrorFromResults(errors, lastUploadErr);
  } else if (errors.length) {
    showUploadErrorFromResults(errors, lastUploadErr);
  }
}

function triggerAddImagesToGroup(groupId) {
  if (!useFirebase || !useStorage || isUploading) return;
  addImagesTargetGroupId = groupId;
  const input = document.getElementById("addImagesInput");
  if (input) {
    input.value = "";
    input.click();
  }
}

async function onAddImagesSelected(fileList) {
  const groupId = addImagesTargetGroupId;
  addImagesTargetGroupId = null;
  if (!groupId || !fileList?.length) return;

  setUploadError("", false);
  if (!useFirebase || !useStorage || !storageRef) {
    setUploadError("Upload nicht möglich.", true);
    return;
  }

  isUploading = true;
  setSyncStatus("uploading");
  const input = document.getElementById("addImagesInput");
  if (input) input.disabled = true;

  try {
    await uploadImagesToGroup(groupId, Array.from(fileList), "Weitere Bilder");
    setUploadProgress({
      message: "Bilder zum Strat hinzugefügt.",
      percent: 100,
      visible: true,
      success: true,
    });
    window.setTimeout(() => setUploadProgress({ visible: false }), 3500);
    setSyncStatus("live");
  } catch (err) {
    console.error("[strats add images]", err);
    setUploadError(formatUploadError(err), true);
    if (isStorageSetupError(err)) {
      showStorageSetupBanner();
      void checkStorageStatus();
    }
    setSyncStatus(
      err?.code === "PERMISSION_DENIED" || err?.code === "storage/unauthorized"
        ? "error-rules"
        : "offline"
    );
  } finally {
    resetUploadUi();
  }
}

async function removeImageFromGroup(groupId, imageId) {
  const idx = groups.findIndex((g) => g.id === groupId);
  if (idx < 0) return;
  const images = getSortedImages(groups[idx]);
  const image = images.find((i) => i.id === imageId);
  if (!image) return;

  if (
    !confirm(
      `„${image.name || "Datei"}" aus „${displayLabel(groups[idx])}" entfernen?`
    )
  ) {
    return;
  }

  if (!useFirebase || !useStorage) return;

  isUploading = true;
  setSyncStatus("uploading");

  try {
    if (image.storagePath && storageRef) {
      await storageRef.child(image.storagePath).delete().catch((err) => {
        if (err?.code !== "storage/object-not-found") throw err;
      });
    }

    const remainingImages = images.filter((i) => i.id !== imageId);
    if (!remainingImages.length) {
      const remaining = groups.filter((g) => g.id !== groupId);
      groups = mergeSideLists(
        remaining.filter((g) => normalizeSide(g.side) === "attack"),
        remaining.filter((g) => normalizeSide(g.side) === "defence")
      );
    } else {
      groups[idx] = {
        ...groups[idx],
        images: reindexImageOrders(remainingImages),
      };
    }

    if (dbRef) {
      await persistMeta();
    } else {
      await persistMetaViaRest();
    }
    renderGroups();
    setSyncStatus("live");
  } catch (err) {
    console.error("[strats remove image]", err);
    setUploadError(formatUploadError(err), true);
    setSyncStatus(
      err?.code === "PERMISSION_DENIED" || err?.code === "storage/unauthorized"
        ? "error-rules"
        : "offline"
    );
  } finally {
    resetUploadUi();
  }
}

async function deleteGroup(group) {
  if (!group?.id) return;
  if (
    !confirm(
      `„${displayLabel(group)}" wirklich löschen? Alle Bilder werden entfernt. Das kann nicht rückgängig gemacht werden.`
    )
  ) {
    return;
  }

  if (!useFirebase || !useStorage) return;

  isUploading = true;
  setSyncStatus("uploading");

  try {
    const images = getSortedImages(group);
    if (storageRef) {
      for (const image of images) {
        if (!image.storagePath) continue;
        await storageRef.child(image.storagePath).delete().catch((err) => {
          if (err?.code !== "storage/object-not-found") throw err;
        });
      }
    }

    const remaining = groups.filter((g) => g.id !== group.id);
    groups = mergeSideLists(
      remaining.filter((g) => normalizeSide(g.side) === "attack"),
      remaining.filter((g) => normalizeSide(g.side) === "defence")
    );
    if (dbRef) {
      await persistMeta();
    } else {
      await persistMetaViaRest();
    }
    renderGroups();
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
    if (lightboxGroupId === group.id) closeLightbox();
    resetUploadUi();
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

function initStratsMapDelegation() {
  const view = document.getElementById("stratsMapView");
  if (!view || view.dataset.delegationBound === "1") return;
  view.dataset.delegationBound = "1";

  view.addEventListener("click", (e) => {
    const delBtn = e.target.closest(".strats-file-card__delete");
    if (delBtn) {
      if (delBtn.disabled || isUploading) return;
      const card = delBtn.closest(".strats-file-card");
      const group = groups.find((g) => g.id === card?.dataset.id);
      if (group) void deleteGroup(group);
      return;
    }
    const addBtn = e.target.closest(".strats-file-card__add-images");
    if (addBtn) {
      if (addBtn.disabled || isUploading) return;
      const card = addBtn.closest(".strats-file-card");
      const groupId = card?.dataset.id;
      if (groupId) triggerAddImagesToGroup(groupId);
    }
  });
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
  initStratsMapDelegation();

  const params = new URLSearchParams(window.location.search);
  if (params.get("debug") === "lightbox") {
    setTimeout(() => openLightbox(LIGHTBOX_DEBUG_IMAGE, "Lightbox Test"), 150);
  }

  document.getElementById("fileInput")?.addEventListener("change", (e) => {
    onFilesSelected(e.target.files);
  });

  document.getElementById("addImagesInput")?.addEventListener("change", (e) => {
    onAddImagesSelected(e.target.files);
  });

  document.getElementById("mapSideToggle")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".strats-side-toggle__btn");
    if (!btn?.dataset.side || btn.closest("#uploadSidePicker")) return;
    setActiveSide(btn.dataset.side);
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

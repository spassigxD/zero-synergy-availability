const PLAYERS = ["Joletsgo", "spassig", "Stefan", "Horus", "Haidew"];

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

/** Playable roster (valorant-api.com, matches strats.gg lineup pool) */
const AGENTS = [
  { name: "Astra", icon: "https://media.valorant-api.com/agents/41fb69c1-4189-7b37-f117-bcaf1e96f1bf/displayicon.png" },
  { name: "Breach", icon: "https://media.valorant-api.com/agents/5f8d3a7f-467b-97f3-062c-13acf203c006/displayicon.png" },
  { name: "Brimstone", icon: "https://media.valorant-api.com/agents/9f0d8ba9-4140-b941-57d3-a7ad57c6b417/displayicon.png" },
  { name: "Chamber", icon: "https://media.valorant-api.com/agents/22697a3d-45bf-8dd7-4fec-84a9e28c69d7/displayicon.png" },
  { name: "Clove", icon: "https://media.valorant-api.com/agents/1dbf2edd-4729-0984-3115-daa5eed44993/displayicon.png" },
  { name: "Cypher", icon: "https://media.valorant-api.com/agents/117ed9e3-49f3-6512-3ccf-0cada7e3823b/displayicon.png" },
  { name: "Deadlock", icon: "https://media.valorant-api.com/agents/cc8b64c8-4b25-4ff9-6e7f-37b4da43d235/displayicon.png" },
  { name: "Fade", icon: "https://media.valorant-api.com/agents/dade69b4-4f5a-8528-247b-219e5a1facd6/displayicon.png" },
  { name: "Gekko", icon: "https://media.valorant-api.com/agents/e370fa57-4757-3604-3648-499e1f642d3f/displayicon.png" },
  { name: "Harbor", icon: "https://media.valorant-api.com/agents/95b78ed7-4637-86d9-7e41-71ba8c293152/displayicon.png" },
  { name: "Iso", icon: "https://media.valorant-api.com/agents/0e38b510-41a8-5780-5e8f-568b2a4f2d6c/displayicon.png" },
  { name: "Jett", icon: "https://media.valorant-api.com/agents/add6443a-41bd-e414-f6ad-e58d267f4e95/displayicon.png" },
  { name: "KAY/O", icon: "https://media.valorant-api.com/agents/601dbbe7-43ce-be57-2a40-4abd24953621/displayicon.png" },
  { name: "Killjoy", icon: "https://media.valorant-api.com/agents/1e58de9c-4950-5125-93e9-a0aee9f98746/displayicon.png" },
  { name: "Miks", icon: "https://media.valorant-api.com/agents/7c8a4701-4de6-9355-b254-e09bc2a34b72/displayicon.png" },
  { name: "Neon", icon: "https://media.valorant-api.com/agents/bb2a4828-46eb-8cd1-e765-15848195d751/displayicon.png" },
  { name: "Omen", icon: "https://media.valorant-api.com/agents/8e253930-4c05-31dd-1b6c-968525494517/displayicon.png" },
  { name: "Phoenix", icon: "https://media.valorant-api.com/agents/eb93336a-449b-9c1b-0a54-a891f7921d69/displayicon.png" },
  { name: "Raze", icon: "https://media.valorant-api.com/agents/f94c3b30-42be-e959-889c-5aa313dba261/displayicon.png" },
  { name: "Reyna", icon: "https://media.valorant-api.com/agents/a3bfb853-43b2-7238-a4f1-ad90e9e46bcc/displayicon.png" },
  { name: "Sage", icon: "https://media.valorant-api.com/agents/569fdd95-4d10-43ab-ca70-79becc718b46/displayicon.png" },
  { name: "Skye", icon: "https://media.valorant-api.com/agents/6f2a04ca-43e0-be17-7f36-b3908627744d/displayicon.png" },
  { name: "Sova", icon: "https://media.valorant-api.com/agents/320b2a48-4d9b-a075-30f1-1f93a9b638fa/displayicon.png" },
  { name: "Tejo", icon: "https://media.valorant-api.com/agents/b444168c-4e35-8076-db47-ef9bf368f384/displayicon.png" },
  { name: "Veto", icon: "https://media.valorant-api.com/agents/92eeef5d-43b5-1d4a-8d03-b3927a09034b/displayicon.png" },
  { name: "Viper", icon: "https://media.valorant-api.com/agents/707eab51-4836-f488-046a-cda6bf494859/displayicon.png" },
  { name: "Vyse", icon: "https://media.valorant-api.com/agents/efba5359-4016-a1e5-7626-b1ae76895940/displayicon.png" },
  { name: "Waylay", icon: "https://media.valorant-api.com/agents/df1cb487-4902-002e-5c17-d28e83e78588/displayicon.png" },
  { name: "Yoru", icon: "https://media.valorant-api.com/agents/7f94d92c-4234-0a36-9646-3a87eb8b5c89/displayicon.png" },
];

const MAX_AGENTS_PER_CELL = 3;
const STORAGE_KEY = "zero-synergy-comps-v1";
const MIGRATION_KEY = "zero-synergy-comps-firebase-migrated-v1";
const FIREBASE_COMPS_PATH = "teams/zero-synergy/comps";
const FIREBASE_SDK_TIMEOUT_MS = 5000;

const agentByName = Object.fromEntries(AGENTS.map((a) => [a.name, a]));

let comps = {};
let dragAgent = null;
let dragSource = null;
let isEditing = false;
let cellPickerMap = null;
let cellPickerPlayer = null;
let suppressCellClick = false;
let cellTapViaTouch = false;
let cellTouchStart = null;
const CELL_TAP_MOVE_THRESHOLD = 12;
let agentsSheetOpen = false;

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

function cellKey(mapId, player) {
  return `${mapId}|${player}`;
}

function mapLabel(mapId) {
  return MAPS.find((m) => m.id === mapId)?.label ?? mapId;
}

function isMobileCompsLayout() {
  return window.matchMedia("(max-width: 900px)").matches;
}

function getCellAgents(mapId, player) {
  const val = comps[cellKey(mapId, player)];
  return Array.isArray(val) ? [...val] : [];
}

function setCellAgents(mapId, player, agents) {
  const key = cellKey(mapId, player);
  const list = agents.filter(Boolean).slice(0, MAX_AGENTS_PER_CELL);
  if (list.length) {
    comps[key] = list;
  } else {
    delete comps[key];
  }
  schedulePersist();
}

function loadCompsFromLocalStorage() {
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

function saveCompsToLocalStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(comps));
}

function schedulePersist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistComps, 150);
}

async function persistCompsViaRest() {
  const url = `${firebaseRestBase()}/${FIREBASE_COMPS_PATH}.json`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(comps),
  });
  if (!res.ok) {
    const err = new Error(`http_${res.status}`);
    err.code = res.status === 401 || res.status === 403 ? "PERMISSION_DENIED" : "HTTP_ERROR";
    throw err;
  }
}

function persistComps() {
  const json = JSON.stringify(comps);
  saveCompsToLocalStorage();

  if (!useFirebase) return;

  lastPushedJson = json;

  const onWriteError = (err) => {
    console.error("[firebase comps] write failed", err?.code, err?.message);
    setSyncStatus(err?.code === "PERMISSION_DENIED" ? "error-rules" : "offline-local");
    persistCompsViaRest()
      .then(() => setSyncStatus("live"))
      .catch((restErr) => {
        console.error("[firebase comps] REST write failed", restErr?.code, restErr?.message);
        setSyncStatus(
          restErr?.code === "PERMISSION_DENIED" ? "error-rules" : "offline-local"
        );
      });
  };

  if (dbRef) {
    dbRef.set(comps).then(() => setSyncStatus("live")).catch(onWriteError);
  } else {
    persistCompsViaRest().then(() => setSyncStatus("live")).catch(onWriteError);
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
  } else if (mode === "offline-local") {
    el.textContent = "Offline (nur lokal)";
    el.classList.add("sync-status--offline");
    setRetryVisible(true);
  } else if (mode === "error-rules") {
    el.textContent = "Zugriff verweigert";
    el.classList.add("sync-status--offline");
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

function createAgentChip(agentName, options = {}) {
  const { removable = false, inCell = false, editable = true } = options;
  const agent = agentByName[agentName];
  const li = document.createElement("li");
  li.className = inCell ? "comps-cell-agent" : "comps-agent-chip";
  if (inCell && !editable) {
    li.classList.add("comps-cell-agent--readonly");
  }
  li.draggable = editable;
  li.dataset.agent = agentName;
  li.setAttribute("role", "listitem");

  if (agent?.icon) {
    const img = document.createElement("img");
    img.className = "comps-agent-chip__icon";
    img.src = agent.icon;
    img.alt = "";
    img.width = 44;
    img.height = 44;
    img.loading = "lazy";
    li.appendChild(img);
  }

  const label = document.createElement("span");
  label.className = "comps-agent-chip__name";
  label.textContent = agentName;
  li.appendChild(label);

  if (removable) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "comps-cell-agent__remove";
    btn.setAttribute("aria-label", `${agentName} entfernen`);
    btn.textContent = "×";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const cell = li.closest(".comps-cell");
      if (!cell) return;
      const { map, player } = cell.dataset;
      const list = getCellAgents(map, player).filter((a) => a !== agentName);
      setCellAgents(map, player, list);
      renderCell(cell);
    });
    li.appendChild(btn);
  }

  if (editable) {
    li.addEventListener("dragstart", onAgentDragStart);
    li.addEventListener("dragend", onAgentDragEnd);
  }

  return li;
}

function renderCell(cellEl) {
  const { map, player } = cellEl.dataset;
  const list = getCellAgents(map, player);
  const slot = cellEl.querySelector(".comps-cell__agents");
  slot.innerHTML = "";
  for (const name of list) {
    slot.appendChild(
      createAgentChip(name, {
        removable: isEditing,
        inCell: true,
        editable: isEditing,
      })
    );
  }
  cellEl.classList.toggle("comps-cell--full", list.length >= MAX_AGENTS_PER_CELL);
  cellEl.classList.toggle("comps-cell--empty", list.length === 0);
  cellEl.classList.toggle("comps-cell--editable", isEditing);

  if (
    isEditing &&
    cellPickerMap === map &&
    cellPickerPlayer === player &&
    !document.getElementById("cellPicker")?.hidden
  ) {
    renderCellPickerCurrent();
  }
}

function refreshAllCells() {
  document.querySelectorAll(".comps-cell").forEach(renderCell);
}

function filterAgentChips(listEl, query) {
  const q = query.trim().toLowerCase();
  listEl.querySelectorAll("[data-agent]").forEach((chip) => {
    const name = chip.dataset.agent.toLowerCase();
    chip.classList.toggle("is-hidden", Boolean(q && !name.includes(q)));
  });
}

function buildAgentSidebar() {
  const countEl = document.getElementById("agentCount");
  if (countEl) {
    countEl.textContent = isMobileCompsLayout()
      ? `${AGENTS.length} Agenten · unten durchsuchen`
      : `${AGENTS.length} Agenten · ziehen oder Zelle antippen`;
  }

  const list = document.getElementById("agentList");
  list.innerHTML = "";
  for (const agent of AGENTS) {
    list.appendChild(createAgentChip(agent.name));
  }

  const search = document.getElementById("agentSearch");
  search?.addEventListener("input", () => {
    filterAgentChips(list, search.value);
  });
}

function buildCellPickerAgentList() {
  const list = document.getElementById("cellPickerAgents");
  if (!list || list.dataset.built) return;
  list.dataset.built = "1";
  for (const agent of AGENTS) {
    const li = document.createElement("li");
    li.className = "comps-picker-agent";
    li.dataset.agent = agent.name;
    li.setAttribute("role", "button");
    li.tabIndex = 0;

    if (agent.icon) {
      const img = document.createElement("img");
      img.className = "comps-picker-agent__icon";
      img.src = agent.icon;
      img.alt = "";
      img.width = 40;
      img.height = 40;
      img.loading = "lazy";
      li.appendChild(img);
    }

    const label = document.createElement("span");
    label.className = "comps-picker-agent__name";
    label.textContent = agent.name;
    li.appendChild(label);

    let pickViaTouch = false;
    const pick = () => pickAgentForCell(agent.name);
    li.addEventListener("touchend", (e) => {
      e.preventDefault();
      pickViaTouch = true;
      pick();
      setTimeout(() => {
        pickViaTouch = false;
      }, 450);
    });
    li.addEventListener("click", () => {
      if (pickViaTouch) return;
      pick();
    });
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pick();
      }
    });
    list.appendChild(li);
  }
}

function renderCellPickerCurrent() {
  const current = document.getElementById("cellPickerCurrent");
  const empty = document.getElementById("cellPickerEmpty");
  if (!current || cellPickerMap == null || !cellPickerPlayer) return;

  current.innerHTML = "";
  const list = getCellAgents(cellPickerMap, cellPickerPlayer);
  empty.hidden = list.length > 0;

  for (const name of list) {
    const li = document.createElement("li");
    li.className = "comps-picker-current-agent";

    const agent = agentByName[name];
    if (agent?.icon) {
      const img = document.createElement("img");
      img.className = "comps-picker-current-agent__icon";
      img.src = agent.icon;
      img.alt = "";
      img.width = 36;
      img.height = 36;
      li.appendChild(img);
    }

    const label = document.createElement("span");
    label.className = "comps-picker-current-agent__name";
    label.textContent = name;
    li.appendChild(label);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "comps-picker-current-agent__remove";
    btn.setAttribute("aria-label", `${name} entfernen`);
    btn.textContent = "×";
    btn.addEventListener("click", () => {
      removeAgentFromCell(cellPickerMap, cellPickerPlayer, name);
      refreshCellByKey(cellPickerMap, cellPickerPlayer);
      renderCellPickerCurrent();
      refreshCellPickerAgents();
    });
    li.appendChild(btn);
    current.appendChild(li);
  }
}

function refreshCellPickerAgents() {
  const list = document.getElementById("cellPickerAgents");
  if (!list || cellPickerMap == null || !cellPickerPlayer) return;
  const inCell = getCellAgents(cellPickerMap, cellPickerPlayer);
  const full = inCell.length >= MAX_AGENTS_PER_CELL;
  list.querySelectorAll(".comps-picker-agent").forEach((item) => {
    const name = item.dataset.agent;
    const already = inCell.includes(name);
    item.classList.toggle("is-disabled", full && !already);
    item.classList.toggle("is-in-cell", already);
    item.setAttribute("aria-disabled", full && !already ? "true" : "false");
  });
}

function refreshCellByKey(mapId, player) {
  document.querySelectorAll(".comps-cell").forEach((c) => {
    if (c.dataset.map === mapId && c.dataset.player === player) renderCell(c);
  });
}

function pickAgentForCell(agentName) {
  if (cellPickerMap == null || !cellPickerPlayer) return;
  const list = getCellAgents(cellPickerMap, cellPickerPlayer);
  if (list.includes(agentName) || list.length >= MAX_AGENTS_PER_CELL) return;
  if (!addAgentToCell(cellPickerMap, cellPickerPlayer, agentName)) return;
  refreshCellByKey(cellPickerMap, cellPickerPlayer);
  renderCellPickerCurrent();
  refreshCellPickerAgents();
}

function openCellPicker(mapId, player) {
  const picker = document.getElementById("cellPicker");
  if (!picker || !isEditing) return;

  cellPickerMap = mapId;
  cellPickerPlayer = player;

  const title = document.getElementById("cellPickerTitle");
  if (title) {
    title.textContent = `${mapLabel(mapId)} · ${player}`;
  }

  const search = document.getElementById("cellPickerSearch");
  if (search) search.value = "";

  buildCellPickerAgentList();
  renderCellPickerCurrent();
  refreshCellPickerAgents();
  filterAgentChips(document.getElementById("cellPickerAgents"), "");

  picker.hidden = false;
  picker.setAttribute("aria-hidden", "false");
  document.body.classList.add("comps-picker-open");
  search?.focus();
}

function closeCellPicker() {
  const picker = document.getElementById("cellPicker");
  if (!picker || picker.hidden) return;
  picker.hidden = true;
  picker.setAttribute("aria-hidden", "true");
  document.body.classList.remove("comps-picker-open");
  cellPickerMap = null;
  cellPickerPlayer = null;
}

function setAgentsSheetOpen(open) {
  agentsSheetOpen = open;
  const layout = document.getElementById("compsLayout");
  const fab = document.getElementById("agentsFab");
  layout?.classList.toggle("is-agents-sheet-open", open);
  if (fab) {
    fab.setAttribute("aria-expanded", open ? "true" : "false");
    fab.textContent = open ? "Agenten schließen" : "Agenten";
  }
}

function updateMobileAgentsFab() {
  const fab = document.getElementById("agentsFab");
  if (!fab) return;
  const show = isEditing && isMobileCompsLayout();
  fab.hidden = !show;
  if (!show) setAgentsSheetOpen(false);
}

function buildCompsGrid() {
  const grid = document.getElementById("compsGrid");
  grid.innerHTML = "";
  grid.style.gridTemplateColumns = `88px repeat(${PLAYERS.length}, minmax(100px, 1fr))`;

  const mapHead = document.createElement("div");
  mapHead.className = "comps-grid__head comps-grid__head--map";
  mapHead.textContent = "Map";
  grid.appendChild(mapHead);

  for (const player of PLAYERS) {
    const head = document.createElement("div");
    head.className = "comps-grid__head";
    head.textContent = player;
    grid.appendChild(head);
  }

  for (const map of MAPS) {
    const mapLabel = document.createElement("a");
    mapLabel.className = "comps-grid__map comps-grid__map-link";
    mapLabel.href = `strats-map.html?map=${encodeURIComponent(map.id)}`;
    mapLabel.textContent = map.label;
    mapLabel.title = `Strats für ${map.label}`;
    grid.appendChild(mapLabel);

    for (const player of PLAYERS) {
      const cell = document.createElement("div");
      cell.className = "comps-cell comps-cell--empty";
      cell.dataset.map = map.id;
      cell.dataset.player = player;
      cell.setAttribute("aria-label", `${map.label} — ${player}`);

      const agents = document.createElement("ul");
      agents.className = "comps-cell__agents";
      cell.appendChild(agents);

      cell.addEventListener("dragover", onCellDragOver);
      cell.addEventListener("dragleave", onCellDragLeave);
      cell.addEventListener("drop", onCellDrop);
      cell.addEventListener("click", onCellClick);
      cell.addEventListener("touchstart", onCellTouchStart, { passive: true });
      cell.addEventListener("touchend", onCellTouchEnd, { passive: false });

      grid.appendChild(cell);
      renderCell(cell);
    }
  }
}

function setEditMode(editing) {
  isEditing = editing;
  const layout = document.getElementById("compsLayout");
  const toggle = document.getElementById("toggleEdit");
  const resetBtn = document.getElementById("resetAll");
  const footer = document.getElementById("compsFooterHint");

  layout?.classList.toggle("is-editing", editing);
  if (toggle) {
    toggle.textContent = editing ? "Fertig" : "Bearbeiten";
    toggle.setAttribute("aria-pressed", editing ? "true" : "false");
  }
  if (resetBtn) resetBtn.hidden = !editing;
  if (footer) {
    footer.innerHTML = editing
      ? isMobileCompsLayout()
        ? "Zelle <strong>antippen</strong> zum Hinzufügen (max. <strong>3</strong>) oder <strong>Agenten</strong> unten für Drag. Änderungen werden <strong>live für das Team</strong> synchronisiert."
        : "Agent <strong>ziehen</strong> oder Zelle <strong>anklicken</strong> (max. <strong>3 pro Zelle</strong>). Mit <strong>×</strong> entfernen. Änderungen werden <strong>live für das Team</strong> synchronisiert."
      : "Team-Comps pro Map und Spieler — zum Bearbeiten auf <strong>Bearbeiten</strong> klicken.";
  }

  if (!editing) closeCellPicker();
  updateMobileAgentsFab();
  buildAgentSidebar();

  refreshAllCells();
  document.querySelectorAll(".comps-cell.is-drop-target").forEach((c) => {
    c.classList.remove("is-drop-target");
  });
  dragAgent = null;
  dragSource = null;
}

function handleCellTap(cell, target) {
  if (!isEditing || suppressCellClick || !cell) return;
  if (target?.closest?.(".comps-cell-agent__remove")) return;
  openCellPicker(cell.dataset.map, cell.dataset.player);
}

function onCellTouchStart(e) {
  if (!isEditing || suppressCellClick) return;
  const t = e.touches[0];
  if (!t) return;
  cellTouchStart = {
    x: t.clientX,
    y: t.clientY,
    cell: e.currentTarget,
  };
}

function onCellTouchEnd(e) {
  const start = cellTouchStart;
  cellTouchStart = null;
  if (!start || e.currentTarget !== start.cell) return;
  const t = e.changedTouches[0];
  if (!t) return;
  const dx = t.clientX - start.x;
  const dy = t.clientY - start.y;
  if (Math.hypot(dx, dy) > CELL_TAP_MOVE_THRESHOLD) return;
  if (!isEditing || suppressCellClick) return;
  e.preventDefault();
  cellTapViaTouch = true;
  handleCellTap(e.currentTarget, e.target);
  setTimeout(() => {
    cellTapViaTouch = false;
  }, 450);
}

function onCellClick(e) {
  if (cellTapViaTouch) return;
  handleCellTap(e.currentTarget, e.target);
}

function onAgentDragStart(e) {
  if (!isEditing) {
    e.preventDefault();
    return;
  }
  suppressCellClick = true;
  const chip = e.currentTarget;
  dragAgent = chip.dataset.agent;
  dragSource = chip.closest(".comps-cell")
    ? { type: "cell", map: chip.closest(".comps-cell").dataset.map, player: chip.closest(".comps-cell").dataset.player }
    : { type: "sidebar" };
  chip.classList.add("is-dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", dragAgent);
}

function onAgentDragEnd(e) {
  e.currentTarget.classList.remove("is-dragging");
  document.querySelectorAll(".comps-cell.is-drop-target").forEach((c) => {
    c.classList.remove("is-drop-target");
  });
  dragAgent = null;
  dragSource = null;
  setTimeout(() => {
    suppressCellClick = false;
  }, 0);
}

function onCellDragOver(e) {
  if (!isEditing) return;
  e.preventDefault();
  const cell = e.currentTarget;
  const list = getCellAgents(cell.dataset.map, cell.dataset.player);
  if (list.length >= MAX_AGENTS_PER_CELL && !list.includes(dragAgent)) {
    e.dataTransfer.dropEffect = "none";
    return;
  }
  e.dataTransfer.dropEffect = "move";
  cell.classList.add("is-drop-target");
}

function onCellDragLeave(e) {
  const cell = e.currentTarget;
  if (!cell.contains(e.relatedTarget)) {
    cell.classList.remove("is-drop-target");
  }
}

function addAgentToCell(mapId, player, agentName) {
  const list = getCellAgents(mapId, player);
  if (list.includes(agentName)) return false;
  if (list.length >= MAX_AGENTS_PER_CELL) return false;
  setCellAgents(mapId, player, [...list, agentName]);
  return true;
}

function removeAgentFromCell(mapId, player, agentName) {
  const list = getCellAgents(mapId, player).filter((a) => a !== agentName);
  setCellAgents(mapId, player, list);
}

function onCellDrop(e) {
  if (!isEditing) return;
  e.preventDefault();
  suppressCellClick = true;
  setTimeout(() => {
    suppressCellClick = false;
  }, 0);
  const targetCell = e.currentTarget;
  targetCell.classList.remove("is-drop-target");
  const agent = dragAgent || e.dataTransfer.getData("text/plain");
  if (!agent || !agentByName[agent]) return;

  const { map: targetMap, player: targetPlayer } = targetCell.dataset;

  if (dragSource?.type === "cell") {
    const { map: srcMap, player: srcPlayer } = dragSource;
    if (srcMap === targetMap && srcPlayer === targetPlayer) return;

    const srcList = getCellAgents(srcMap, srcPlayer);
    if (!srcList.includes(agent)) return;

    const targetList = getCellAgents(targetMap, targetPlayer);
    if (targetList.includes(agent)) {
      removeAgentFromCell(srcMap, srcPlayer, agent);
      document.querySelectorAll(".comps-cell").forEach((c) => {
        if (c.dataset.map === srcMap && c.dataset.player === srcPlayer) renderCell(c);
      });
      return;
    }
    if (targetList.length >= MAX_AGENTS_PER_CELL) return;

    removeAgentFromCell(srcMap, srcPlayer, agent);
    addAgentToCell(targetMap, targetPlayer, agent);

    document.querySelectorAll(".comps-cell").forEach((c) => {
      const m = c.dataset.map;
      const p = c.dataset.player;
      if (
        (m === srcMap && p === srcPlayer) ||
        (m === targetMap && p === targetPlayer)
      ) {
        renderCell(c);
      }
    });
    return;
  }

  if (addAgentToCell(targetMap, targetPlayer, agent)) {
    renderCell(targetCell);
  }
}

function applyRemoteComps(remote) {
  const json = JSON.stringify(remote || {});
  if (json === lastPushedJson) return;
  comps = remote && typeof remote === "object" ? remote : {};
  refreshAllCells();
  saveCompsToLocalStorage();
  setSyncStatus("live");
}

function bootstrapUI() {
  comps = loadCompsFromLocalStorage();
  buildAgentSidebar();
  buildCompsGrid();
}

function initLocalOnly() {
  useFirebase = false;
  setBannerVisible(true);
  setSyncStatus("local");
}

async function fetchCompsViaRest() {
  const url = `${firebaseRestBase()}/${FIREBASE_COMPS_PATH}.json`;
  const res = await fetch(url);
  if (res.status === 404) return {};
  if (!res.ok) {
    const err = new Error(`http_${res.status}`);
    err.code = res.status === 401 || res.status === 403 ? "PERMISSION_DENIED" : "HTTP_ERROR";
    throw err;
  }
  const data = await res.json();
  return data && typeof data === "object" ? data : {};
}

function applyInitialRemoteComps(remote) {
  const remoteComps = remote && typeof remote === "object" ? remote : {};
  const hasRemote = Object.keys(remoteComps).length > 0;
  const localComps = loadCompsFromLocalStorage();
  const hasLocal = Object.keys(localComps).length > 0;
  const migrated = localStorage.getItem(MIGRATION_KEY);

  if (!hasRemote && hasLocal && !migrated) {
    comps = { ...localComps };
    localStorage.setItem(MIGRATION_KEY, "1");
    persistComps();
  } else {
    comps = remoteComps;
    if (hasRemote) localStorage.setItem(MIGRATION_KEY, "1");
  }
  refreshAllCells();
  saveCompsToLocalStorage();
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
  applyInitialRemoteComps(remote);
  setSyncStatus("live");
  console.info("[firebase comps] bootstrap via", source);
}

function failFirebaseStartup(err) {
  clearFirebaseSdkTimer();
  console.error("[firebase comps] startup failed", err?.code, err?.message || err);
  const isRules =
    err?.code === "PERMISSION_DENIED" || err?.code === "permission_denied";
  if (!firebaseBootstrapped) {
    firebaseBootstrapped = true;
    comps = loadCompsFromLocalStorage();
    refreshAllCells();
  }
  setSyncStatus(isRules ? "error-rules" : "offline-local");
}

async function bootstrapFirebaseViaRest() {
  try {
    const remote = await fetchCompsViaRest();
    finishFirebaseBootstrap(remote, "rest");
    return true;
  } catch (err) {
    console.warn("[firebase comps] REST bootstrap failed", err?.code, err?.message);
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
      applyRemoteComps(snapshot.val());
    },
    (err) => {
      console.error("[firebase comps] on(value) error", err?.code, err?.message);
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

function getFirebaseApp() {
  if (firebase.apps.length > 0) return firebase.app();
  return firebase.initializeApp(window.FIREBASE_CONFIG);
}

function initFirebaseSdk() {
  try {
    const app = getFirebaseApp();
    const db = firebase.database(app);
    dbRef = db.ref(FIREBASE_COMPS_PATH);

    firebaseSdkTimer = setTimeout(() => {
      if (firebaseBootstrapped) return;
      bootstrapFirebaseViaRest();
    }, FIREBASE_SDK_TIMEOUT_MS);

    attachFirebaseRealtimeListener();
  } catch (err) {
    console.error("[firebase comps] SDK init exception", err);
    clearFirebaseSdkTimer();
    bootstrapFirebaseViaRest();
  }
}

function initFirebase() {
  useFirebase = true;
  firebaseBootstrapped = false;
  setBannerVisible(false);
  setSyncStatus("loading");

  bootstrapFirebaseViaRest().then(() => {
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
  await bootstrapFirebaseViaRest();
  if (typeof firebase !== "undefined" && !dbRef) {
    initFirebaseSdk();
  }
}

function initSync() {
  bootstrapUI();
  setEditMode(false);
  if (typeof firebase !== "undefined" && isFirebaseConfigured()) {
    initFirebase();
  } else {
    initLocalOnly();
  }
}

document.getElementById("toggleEdit")?.addEventListener("click", () => {
  setEditMode(!isEditing);
});

document.getElementById("resetAll")?.addEventListener("click", () => {
  if (!confirm("Alle Team-Comps löschen? Dies kann nicht rückgängig gemacht werden.")) {
    return;
  }
  comps = {};
  persistComps();
  refreshAllCells();
});

document.getElementById("retrySync")?.addEventListener("click", () => {
  retryFirebaseSync();
});

document.getElementById("cellPickerBackdrop")?.addEventListener("click", closeCellPicker);
document.getElementById("cellPickerClose")?.addEventListener("click", closeCellPicker);
document.getElementById("cellPickerCloseX")?.addEventListener("click", closeCellPicker);

document.getElementById("cellPickerSearch")?.addEventListener("input", (e) => {
  const list = document.getElementById("cellPickerAgents");
  if (list) filterAgentChips(list, e.target.value);
});

document.getElementById("agentsFab")?.addEventListener("click", () => {
  setAgentsSheetOpen(!agentsSheetOpen);
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!document.getElementById("cellPicker")?.hidden) {
    closeCellPicker();
    return;
  }
  if (agentsSheetOpen) setAgentsSheetOpen(false);
});

window.matchMedia("(max-width: 900px)").addEventListener("change", () => {
  updateMobileAgentsFab();
  if (isEditing) buildAgentSidebar();
});

initSync();

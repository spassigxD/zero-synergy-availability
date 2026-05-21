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

let selectedColor = "green";
let grid = loadGrid();
let isPainting = false;
let hasDragged = false;
let paintStartCell = null;
let paintOriginColor = null;

function loadGrid() {
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

function saveGrid() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(grid));
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
  saveGrid();
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

document.getElementById("resetAll").addEventListener("click", () => {
  if (
    !confirm(
      "Alle Einträge löschen? Dies kann nicht rückgängig gemacht werden."
    )
  ) {
    return;
  }
  grid = {};
  saveGrid();
  buildSchedule();
});

document.addEventListener("mouseup", stopPainting);
document.addEventListener("touchend", stopPainting);
document.addEventListener("touchcancel", stopPainting);
document.addEventListener("touchmove", onTouchMove, { passive: false });

initColorPalette();
buildSchedule();

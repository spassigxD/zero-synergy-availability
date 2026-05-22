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

function buildMapGrid() {
  const grid = document.getElementById("stratsMapGrid");
  if (!grid) return;

  for (const map of MAPS) {
    const card = document.createElement("a");
    card.className = "strats-map-card";
    card.href = `strats-map.html?map=${encodeURIComponent(map.id)}`;
    card.setAttribute("aria-label", `Strats für ${map.label}`);

    const name = document.createElement("span");
    name.className = "strats-map-card__name";
    name.textContent = map.label;
    card.appendChild(name);

    const hint = document.createElement("span");
    hint.className = "strats-map-card__hint";
    hint.textContent = "Strats ansehen & hochladen";
    card.appendChild(hint);

    grid.appendChild(card);
  }
}

buildMapGrid();

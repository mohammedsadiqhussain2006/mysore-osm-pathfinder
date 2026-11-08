import { checkApi, requestRoutes } from "./api.js";
import { createMap, createMapLayers, renderSelection, renderRoutes } from "./map.js";

const $ = (selector) => document.querySelector(selector);
const ui = {
  status: $("#status"),
  hint: $("#map-hint"),
  pickStart: $("#pick-start"),
  pickEnd: $("#pick-end"),
  mode: $("#mode"),
  algorithm: $("#algorithm"),
  calculate: $("#calculate"),
  reset: $("#reset"),
  results: $("#results"),
};

const state = {
  choosing: "start",
  start: null,
  destination: null,
};

const map = createMap(handleMapClick);
const layers = createMapLayers(map);

function setStatus(message, connected = false) {
  ui.status.innerHTML = `<span class="dot ${connected ? "ok" : ""}"></span>${message}`;
}

function updateSelectionUI() {
  ui.pickStart.classList.toggle("active", state.choosing === "start");
  ui.pickEnd.classList.toggle("active", state.choosing === "destination");
  ui.hint.textContent = state.choosing === "start"
    ? "Click the map to choose your start point."
    : "Click the map to choose your destination.";
  renderSelection(layers, state.start, state.destination);
}

function handleMapClick(latlng) {
  const point = { lat: latlng.lat, lon: latlng.lng };

  if (state.choosing === "start") {
    state.start = point;
    state.destination = null;
    state.choosing = "destination";
  } else {
    state.destination = point;
  }

  updateSelectionUI();
}

ui.pickStart.addEventListener("click", () => {
  state.choosing = "start";
  updateSelectionUI();
});

ui.pickEnd.addEventListener("click", () => {
  state.choosing = "destination";
  updateSelectionUI();
});

ui.reset.addEventListener("click", () => {
  state.start = null;
  state.destination = null;
  state.choosing = "start";
  layers.routes.clearLayers();
  ui.results.innerHTML = `
    <div class="empty">
      <strong>Pick two points on the map</strong>
      <span>We'll snap them to nearby OSM streets and calculate a route.</span>
    </div>`;
  updateSelectionUI();
});

ui.calculate.addEventListener("click", async () => {
  if (!state.start || !state.destination) {
    setStatus("Choose both points first");
    return;
  }

  ui.calculate.disabled = true;
  ui.calculate.textContent = "Calculating…";
  setStatus("Searching the OSM road graph…");

  try {
    const response = await requestRoutes({
      start: state.start,
      destination: state.destination,
      mode: ui.mode.value,
      algorithm: ui.algorithm.value,
    });

    renderRoutes(map, layers, response.results);
    renderResultCards(response.results);
    setStatus("OSM graph ready", true);
  } catch (error) {
    setStatus(error.message);
    ui.results.innerHTML = `<div class="empty"><strong>Could not calculate route</strong><span>${escapeHtml(error.message)}</span></div>`;
  } finally {
    ui.calculate.disabled = false;
    ui.calculate.textContent = "Find route";
  }
});

function renderResultCards(results) {
  ui.results.replaceChildren();

  for (const result of results) {
    const { metrics } = result;
    const card = document.createElement("article");
    card.className = `result-card ${metrics.algorithm}`;
    card.innerHTML = `
      <h2>${metrics.algorithm === "astar" ? "A* · Heuristic search" : "Dijkstra · Uniform-cost search"}</h2>
      <div class="metrics">
        <div class="metric"><small>Route distance</small><strong>${metrics.distance_km.toFixed(2)} km</strong></div>
        <div class="metric"><small>Estimated time*</small><strong>${metrics.estimated_minutes == null ? "—" : `${metrics.estimated_minutes.toFixed(1)} min`}</strong></div>
        <div class="metric"><small>Nodes explored</small><strong>${metrics.explored_nodes.toLocaleString()}</strong></div>
        <div class="metric"><small>Search time</small><strong>${metrics.elapsed_ms.toFixed(2)} ms</strong></div>
      </div>`;
    ui.results.appendChild(card);
  }

  const note = document.createElement("div");
  note.className = "empty";
  note.innerHTML = "<strong>How to read this comparison</strong><span>Both algorithms use the same OSM network and distance weights. Estimated time uses OSM speed tags where available; it is not live traffic.</span>";
  ui.results.appendChild(note);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

checkApi()
  .then(() => setStatus("API connected", true))
  .catch(() => setStatus("Start the FastAPI backend"));
updateSelectionUI();

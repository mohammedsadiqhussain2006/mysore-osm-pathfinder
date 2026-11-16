import { checkApi, requestRoutes } from "./api.js";
import {
  createMap,
  createMapLayers,
  renderSelection,
  renderRoutes,
  clearRoutes,
} from "./map.js";

const $ = (selector) => document.querySelector(selector);
const ui = {
  status: $("#status"),
  hint: $("#map-hint"),
  pickStart: $("#pick-start"),
  pickEnd: $("#pick-end"),
  mode: $("#mode"),
  algorithm: $("#algorithm"),
  calculate: $("#calculate"),
  replay: $("#replay"),
  reset: $("#reset"),
  results: $("#results"),
};

const state = {
  choosing: "start",
  start: null,
  destination: null,
  snappedStart: null,
  snappedDestination: null,
  lastResults: null,
};

const map = createMap(handleMapClick);
const layers = createMapLayers(map);

function setStatus(message, connected = false) {
  ui.status.innerHTML = `<span class="dot ${connected ? "ok" : ""}"></span>${message}`;
}

function updateSelectionUI() {
  ui.pickStart.classList.toggle("active", state.choosing === "start");
  ui.pickEnd.classList.toggle("active", state.choosing === "destination");
  ui.hint.textContent =
    state.choosing === "start"
      ? "Click the map to choose your start point."
      : "Click the map to choose your destination.";

  renderSelection(
    layers,
    state.start,
    state.destination,
    state.snappedStart,
    state.snappedDestination,
  );
}

function handleMapClick(latlng) {
  const point = { lat: latlng.lat, lon: latlng.lng };

  // New clicks invalidate current snapped points and route display
  state.snappedStart = null;
  state.snappedDestination = null;
  state.lastResults = null;
  ui.replay.hidden = true;
  clearRoutes(layers);

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
  state.snappedStart = null;
  state.snappedDestination = null;
  state.lastResults = null;
  state.choosing = "start";

  ui.replay.hidden = true;
  clearRoutes(layers);

  ui.results.innerHTML = `
    <div class="empty">
      <strong>Pick two points on the map</strong>
      <span>We'll snap them to nearby OSM streets and calculate a route.</span>
    </div>`;
  updateSelectionUI();
});

ui.replay.addEventListener("click", () => {
  if (!state.lastResults || state.lastResults.length === 0) return;
  renderRoutes(map, layers, state.lastResults);
  renderResultCards(state.lastResults);
});

ui.calculate.addEventListener("click", async () => {
  if (!state.start || !state.destination) {
    setStatus("Choose both points first");
    return;
  }

  ui.calculate.disabled = true;
  ui.calculate.classList.add("loading");
  ui.calculate.textContent = "Calculating…";
  setStatus("Searching the OSM road graph…");

  try {
    const response = await requestRoutes({
      start: state.start,
      destination: state.destination,
      mode: ui.mode.value,
      algorithm: ui.algorithm.value,
    });

    state.lastResults = response.results;

    // Retrieve snapped nodes from the first result's metrics
    if (response.results && response.results.length > 0) {
      const firstMetrics = response.results[0].metrics;
      state.snappedStart = firstMetrics.snapped_start;
      state.snappedDestination = firstMetrics.snapped_destination;
      // Re-render markers with snap connector lines
      updateSelectionUI();
    }

    renderRoutes(map, layers, response.results);
    renderResultCards(response.results);
    ui.replay.hidden = false;
    setStatus("OSM graph ready", true);
  } catch (error) {
    setStatus(error.message);
    ui.replay.hidden = true;
    ui.results.innerHTML = `<div class="empty"><strong>Could not calculate route</strong><span>${escapeHtml(error.message)}</span></div>`;
  } finally {
    ui.calculate.disabled = false;
    ui.calculate.classList.remove("loading");
    ui.calculate.textContent = "Find route";
  }
});

function animateNumber(element, start, end, duration, formatFn) {
  const startTime = performance.now();
  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Smooth easeOutCubic curve
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = start + (end - start) * ease;
    element.textContent = formatFn(current, progress === 1);
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  requestAnimationFrame(update);
}

function renderResultCards(results) {
  ui.results.replaceChildren();

  results.forEach((result, idx) => {
    const { metrics } = result;
    const isAstar = metrics.algorithm === "astar";
    const card = document.createElement("article");
    card.className = `result-card ${metrics.algorithm}`;
    card.style.animationDelay = `${idx * 120}ms`;

    card.innerHTML = `
      <h2>${isAstar ? "A* · Heuristic search" : "Dijkstra · Uniform-cost search"}</h2>
      <div class="metrics">
        <div class="metric"><small>Route distance</small><strong class="metric-dist">0.00 km</strong></div>
        <div class="metric"><small>Estimated time*</small><strong class="metric-time">—</strong></div>
        <div class="metric"><small>Nodes explored</small><strong class="metric-nodes">0</strong></div>
        <div class="metric"><small>Search time</small><strong class="metric-elapsed">0.00 ms</strong></div>
      </div>`;
    ui.results.appendChild(card);

    const distEl = card.querySelector(".metric-dist");
    const timeEl = card.querySelector(".metric-time");
    const nodesEl = card.querySelector(".metric-nodes");
    const elapsedEl = card.querySelector(".metric-elapsed");

    // Animate the metrics
    animateNumber(distEl, 0, metrics.distance_km, 1200, (v) => `${v.toFixed(2)} km`);
    if (metrics.estimated_minutes != null) {
      animateNumber(timeEl, 0, metrics.estimated_minutes, 1200, (v) => `${v.toFixed(1)} min`);
    } else {
      timeEl.textContent = "—";
    }
    animateNumber(nodesEl, 0, metrics.explored_nodes, 1200, (v) => Math.round(v).toLocaleString());
    animateNumber(elapsedEl, 0, metrics.elapsed_ms, 1200, (v) => `${v.toFixed(2)} ms`);
  });

  const note = document.createElement("div");
  note.className = "empty info-card";
  note.innerHTML = `
    <strong>How to read this comparison</strong>
    <span>Both algorithms run over the exact same OSM road graph. Notice how A* evaluates significantly fewer nodes thanks to its distance heuristic while yielding the optimal path.</span>
  `;
  ui.results.appendChild(note);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

checkApi()
  .then(() => setStatus("API connected", true))
  .catch(() => setStatus("Start the FastAPI backend"));

updateSelectionUI();

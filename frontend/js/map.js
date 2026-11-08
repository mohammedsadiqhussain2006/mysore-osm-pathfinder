import { MYSURU_CENTER, INITIAL_ZOOM } from "./config.js";

export function createMap(onMapClick) {
  const map = L.map("map").setView(MYSURU_CENTER, INITIAL_ZOOM);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  map.on("click", (event) => onMapClick(event.latlng));
  return map;
}

export function createMapLayers(map) {
  const markers = L.layerGroup().addTo(map);
  const routes = L.layerGroup().addTo(map);
  return { markers, routes };
}

export function renderSelection(layers, start, destination) {
  layers.markers.clearLayers();

  if (start) {
    L.marker([start.lat, start.lon]).addTo(layers.markers).bindPopup("Start");
  }
  if (destination) {
    L.marker([destination.lat, destination.lon]).addTo(layers.markers).bindPopup("Destination");
  }
}

export function renderRoutes(map, layers, results) {
  layers.routes.clearLayers();

  const bounds = [];
  for (const result of results) {
    const isAstar = result.metrics.algorithm === "astar";
    const line = L.polyline(
      result.coordinates.map(([lon, lat]) => [lat, lon]),
      {
        color: isAstar ? "#087e78" : "#b86e00",
        weight: 6,
        opacity: 0.86,
      },
    ).addTo(layers.routes);

    line.bindPopup(
      `${result.metrics.algorithm.toUpperCase()} · ${result.metrics.distance_km.toFixed(2)} km`,
    );
    bounds.push(...line.getLatLngs());
  }

  if (bounds.length) map.fitBounds(L.latLngBounds(bounds).pad(0.12));
}

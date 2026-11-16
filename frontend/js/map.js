import { MYSURU_CENTER, INITIAL_ZOOM } from "./config.js";

let activeAnimationId = null;

export function createMap(onMapClick) {
  const map = L.map("map", {
    zoomControl: true,
  }).setView(MYSURU_CENTER, INITIAL_ZOOM);

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
  const tracers = L.layerGroup().addTo(map);
  return { markers, routes, tracers };
}

export function renderSelection(layers, start, destination, snappedStart = null, snappedDestination = null) {
  layers.markers.clearLayers();

  if (start) {
    const startIcon = L.divIcon({
      className: "custom-pin start-pin marker-bounce",
      html: `
        <div class="pulse-ring"></div>
        <div class="pin-core">A</div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -18],
    });

    L.marker([start.lat, start.lon], { icon: startIcon })
      .addTo(layers.markers)
      .bindPopup("<strong>Start Point</strong><br>Chosen location");
  }

  if (destination) {
    const destIcon = L.divIcon({
      className: "custom-pin dest-pin marker-bounce",
      html: `
        <div class="pulse-ring"></div>
        <div class="pin-core">B</div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -18],
    });

    L.marker([destination.lat, destination.lon], { icon: destIcon })
      .addTo(layers.markers)
      .bindPopup("<strong>Destination</strong><br>Chosen location");
  }

  // Snapped street node connection indicators
  if (start && snappedStart) {
    const dist = L.latLng(start.lat, start.lon).distanceTo(L.latLng(snappedStart.lat, snappedStart.lon));
    if (dist > 3) {
      L.polyline(
        [
          [start.lat, start.lon],
          [snappedStart.lat, snappedStart.lon],
        ],
        {
          color: "#10b981",
          weight: 2,
          dashArray: "3, 5",
          opacity: 0.75,
        },
      ).addTo(layers.markers);
    }
  }

  if (destination && snappedDestination) {
    const dist = L.latLng(destination.lat, destination.lon).distanceTo(
      L.latLng(snappedDestination.lat, snappedDestination.lon),
    );
    if (dist > 3) {
      L.polyline(
        [
          [destination.lat, destination.lon],
          [snappedDestination.lat, snappedDestination.lon],
        ],
        {
          color: "#f43f5e",
          weight: 2,
          dashArray: "3, 5",
          opacity: 0.75,
        },
      ).addTo(layers.markers);
    }
  }
}

export function stopActiveAnimation(layers) {
  if (activeAnimationId !== null) {
    cancelAnimationFrame(activeAnimationId);
    activeAnimationId = null;
  }
  if (layers && layers.tracers) {
    layers.tracers.clearLayers();
  }
}

export function clearRoutes(layers) {
  stopActiveAnimation(layers);
  if (layers && layers.routes) {
    layers.routes.clearLayers();
  }
}

function prepareRouteData(result) {
  const points = result.coordinates.map(([lon, lat]) => L.latLng(lat, lon));
  const segmentDistances = [];
  const cumulativeDistances = [0];
  let totalDistance = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const d = points[i].distanceTo(points[i + 1]);
    segmentDistances.push(d);
    totalDistance += d;
    cumulativeDistances.push(totalDistance);
  }

  return {
    algorithm: result.metrics.algorithm,
    metrics: result.metrics,
    points,
    segmentDistances,
    cumulativeDistances,
    totalDistance: Math.max(totalDistance, 1),
  };
}

function samplePath(route, targetDistance) {
  const { points, cumulativeDistances, totalDistance } = route;
  if (targetDistance <= 0 || points.length <= 1) {
    return { currentPoints: [points[0]], head: points[0] };
  }
  if (targetDistance >= totalDistance) {
    return { currentPoints: points, head: points[points.length - 1] };
  }

  let i = 0;
  while (i < cumulativeDistances.length - 1 && cumulativeDistances[i + 1] < targetDistance) {
    i++;
  }

  const p1 = points[i];
  const p2 = points[i + 1];
  const segDist = cumulativeDistances[i + 1] - cumulativeDistances[i];
  const fraction = segDist > 0 ? (targetDistance - cumulativeDistances[i]) / segDist : 0;

  const headLat = p1.lat + (p2.lat - p1.lat) * fraction;
  const headLng = p1.lng + (p2.lng - p1.lng) * fraction;
  const head = L.latLng(headLat, headLng);

  const currentPoints = points.slice(0, i + 1);
  currentPoints.push(head);
  return { currentPoints, head };
}

function createTracerIcon(algorithm) {
  return L.divIcon({
    className: "tracer-head",
    html: `
      <div class="tracer-halo ${algorithm}"></div>
      <div class="tracer-core ${algorithm}"></div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function renderRoutes(map, layers, results, onComplete = null) {
  stopActiveAnimation(layers);
  layers.routes.clearLayers();
  layers.tracers.clearLayers();

  if (!results || results.length === 0) return;

  const preparedRoutes = results.map(prepareRouteData);
  const allPoints = preparedRoutes.flatMap((r) => r.points);

  // Smooth cinematic camera pan/zoom into route bounds
  if (allPoints.length > 0) {
    const bounds = L.latLngBounds(allPoints);
    map.flyToBounds(bounds.pad(0.16), {
      duration: 1.0,
      easeLinearity: 0.25,
    });
  }

  // Determine line style and instantiate polylines
  const activeLines = [];
  const activeTracers = [];
  const hasMultiple = preparedRoutes.length > 1;

  for (const route of preparedRoutes) {
    const isAstar = route.algorithm === "astar";
    // Dijkstra acts as base underlay if comparing, A* overlays in center
    const color = isAstar ? "#087e78" : "#b86e00";
    const weight = hasMultiple ? (isAstar ? 4 : 7) : 5;
    const opacity = isAstar ? 0.95 : 0.85;

    const line = L.polyline([route.points[0]], {
      color,
      weight,
      opacity,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(layers.routes);

    const tracer = L.marker(route.points[0], {
      icon: createTracerIcon(route.algorithm),
      interactive: false,
    }).addTo(layers.tracers);

    activeLines.push({ route, line, tracer });
  }

  const maxDistance = Math.max(...preparedRoutes.map((r) => r.totalDistance));
  // Responsive duration based on route length: 1100ms - 2200ms
  const duration = Math.min(2200, Math.max(1100, Math.round(maxDistance * 0.18)));
  const startTime = performance.now();

  function animate(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeOutCubic(progress);

    for (const { route, line, tracer } of activeLines) {
      const targetDist = route.totalDistance * easedProgress;
      const { currentPoints, head } = samplePath(route, targetDist);
      line.setLatLngs(currentPoints);
      tracer.setLatLng(head);
    }

    if (progress < 1) {
      activeAnimationId = requestAnimationFrame(animate);
    } else {
      activeAnimationId = null;
      // Complete routes: finalize paths and bind popups
      for (const { route, line, tracer } of activeLines) {
        line.setLatLngs(route.points);
        line.bindPopup(
          `<strong>${route.algorithm.toUpperCase()}</strong> · ${route.metrics.distance_km.toFixed(2)} km`,
        );
      }
      // Remove animated tracers cleanly after small settle time
      setTimeout(() => {
        layers.tracers.clearLayers();
      }, 500);

      if (onComplete) onComplete();
    }
  }

  // Small delay so map camera starts gliding before polyline traces
  setTimeout(() => {
    activeAnimationId = requestAnimationFrame(animate);
  }, 120);
}

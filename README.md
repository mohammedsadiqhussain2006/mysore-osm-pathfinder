# Mysuru OSM Pathfinder

A real-road-network pathfinding visualizer for Mysuru using OpenStreetMap data.



- Replaces the hand-written landmark graph with a drivable/walkable street network downloaded from OpenStreetMap through OSMnx.
- Uses Leaflet to display real OSM map tiles and routes.
- Uses NetworkX to run Dijkstra and A* on the same OSM street graph.
- Snaps user-selected map points to nearby road-network nodes.
- Reports route distance, travel-time estimate (when edge speed data is available), explored nodes, and execution time.
- Keeps a cached GraphML copy so you do not need to download the graph on every server restart.

## Architecture

```text
Browser (Leaflet + OSM tiles)
        |
        | POST /api/route
        v
FastAPI backend
        |
        +-- OSMnx: download/cache Mysuru road graph
        +-- NetworkX: Dijkstra / A*
        +-- OSMnx: snap clicked coordinates to graph nodes
        |
        v
GeoJSON-like route response
        |
        v
Leaflet draws both routes on the map
```

## Requirements

- Python 3.10+
- Internet connection for the first OSM graph download and map tiles
- Node/npm are not required

## Run

### 1. Create a virtual environment

```bash
cd mysuru_osm_pathfinder
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

### 2. Start the backend

```bash
uvicorn backend.main:app --reload
```

The first launch downloads the Mysuru road graph and saves it under `backend/data/`.
This may take a little while. Later launches load the cached GraphML file.

### 3. Open the frontend

In a second terminal:

```bash
cd frontend
python3 -m http.server 5500
```

Open http://localhost:5500.

The API runs at http://127.0.0.1:8000. If you host the frontend elsewhere, update
`API_BASE` in `frontend/js/config.js`.

## How to use

1. Click **Choose start**, then click a road location on the map.
2. Click **Choose destination**, then click another road location.
3. Select A* or Dijkstra, or compare both.
4. Choose a travel mode and calculate.
5. The map draws the selected route and the comparison panel reports metrics.

## Notes on algorithm fairness

Both algorithms use the same downloaded OSM graph, the same edge weights, and the same
snapped start/end nodes. Dijkstra uses edge length as its cost. A* uses straight-line
Haversine distance to the destination as its heuristic. Since edge lengths are road
distances and cannot be shorter than straight-line distance, this is an admissible
heuristic (subject to OSM geometry/data quality).

The current app uses **distance minimization** for both algorithms. It does not claim
to optimize live traffic or real-world driving time. The optional time estimate is
computed from OSM speed attributes where available and is informational only.

## OSM attribution and usage

The map uses OpenStreetMap data and standard OSM tile services. Keep the visible
attribution control enabled. The public OSM tile service has a usage policy; do not
bulk-download tiles, hide attribution, or use it as a high-volume production tile
backend. For production, use a suitable tile provider or self-hosted tiles.

## Project layout

```text
mysuru-osm-pathfinder/
├── backend/
│   ├── __init__.py
│   ├── main.py
│   ├── osm_graph.py
│   ├── routing.py
│   ├── schemas.py
│   └── requirements.txt
└── frontend/
    ├── index.html
    ├── styles.css
    └── js/
        ├── app.js
        ├── config.js
        ├── map.js
        └── api.js
```

## Useful next extensions

- Add turn restrictions and one-way direction-aware routing (the OSMnx directed graph already
  represents one-way streets; the current NetworkX searches respect edge direction).
- Add route alternatives and avoid-toll / avoid-highway preferences.
- Add live traffic through a separate licensed traffic provider.
- Add an algorithm animation mode that reveals explored nodes incrementally.
- Add unit tests for graph loading, snapping, and A*/Dijkstra path equivalence.

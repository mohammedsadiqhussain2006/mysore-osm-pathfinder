from pathlib import Path
import osmnx as ox
import networkx as nx

# Mysuru urban bounding box. OSMnx expects north, south, east, west.
CITY_BBOX = (12.38, 12.20, 76.72, 76.58)
DATA_DIR = Path(__file__).resolve().parent / "data"
GRAPH_FILES = {
    "drive": DATA_DIR / "mysuru_drive.graphml",
    "walk": DATA_DIR / "mysuru_walk.graphml",
    "bike": DATA_DIR / "mysuru_bike.graphml",
}

NETWORK_TYPES = {
    "drive": "drive",
    "walk": "walk",
    "bike": "bike",
}


def load_graph(mode: str) -> nx.MultiDiGraph:
    """Load a cached OSM street graph or download it once and cache it."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = GRAPH_FILES[mode]

    if cache_path.exists():
        graph = ox.load_graphml(cache_path)
    else:
        north, south, east, west = CITY_BBOX
        graph = ox.graph_from_bbox(
            (west, south, east, north),
            network_type=NETWORK_TYPES[mode],
            simplify=True,
            retain_all=False,
            truncate_by_edge=True,
        )
        graph = ox.add_edge_speeds(graph)
        graph = ox.add_edge_travel_times(graph)
        ox.save_graphml(graph, cache_path)

    # Ensure speeds/travel times are present for older cache files too.
    if any("speed_kph" not in data for _, _, _, data in graph.edges(keys=True, data=True)):
        graph = ox.add_edge_speeds(graph)
    if any("travel_time" not in data for _, _, _, data in graph.edges(keys=True, data=True)):
        graph = ox.add_edge_travel_times(graph)

    return graph

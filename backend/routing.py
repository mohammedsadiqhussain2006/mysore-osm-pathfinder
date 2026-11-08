import time
import math
import osmnx as ox
import networkx as nx

from .schemas import Coordinate, RouteMetrics, RouteResult


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


def edge_distance(u, v, data):
    """OSMnx graphs can be MultiDiGraphs; use the shortest parallel edge."""
    return min(float(attrs.get("length", 1e12)) for attrs in data.values())


def edge_travel_time(u, v, data):
    return min(float(attrs.get("travel_time", 1e12)) for attrs in data.values())


def search_with_metrics(graph, source, target, algorithm: str):
    """Custom Dijkstra/A* to count settled nodes consistently."""
    import heapq
    import itertools

    counter = itertools.count()
    distances = {source: 0.0}
    parents = {}
    queue = [(0.0, next(counter), source)]
    settled = set()
    explored = 0

    def h(node):
        if algorithm != "astar":
            return 0.0
        a, b = graph.nodes[node], graph.nodes[target]
        return haversine_m(a["y"], a["x"], b["y"], b["x"])

    started = time.perf_counter()
    while queue:
        _, _, current = heapq.heappop(queue)
        if current in settled:
            continue
        settled.add(current)
        explored += 1

        if current == target:
            break

        for neighbor, keyed_edges in graph[current].items():
            if neighbor in settled:
                continue
            cost = edge_distance(current, neighbor, keyed_edges)
            candidate = distances[current] + cost
            if candidate < distances.get(neighbor, float("inf")):
                distances[neighbor] = candidate
                parents[neighbor] = current
                heapq.heappush(queue, (candidate + h(neighbor), next(counter), neighbor))

    elapsed_ms = (time.perf_counter() - started) * 1000
    if target not in settled:
        raise nx.NetworkXNoPath("No route connects the selected locations.")

    path = [target]
    while path[-1] != source:
        path.append(parents[path[-1]])
    path.reverse()
    return path, distances[target], explored, elapsed_ms


def build_route_result(graph, path, distance_m, explored, elapsed_ms, algorithm, start_node, end_node):
    coordinates = []
    for node in path:
        data = graph.nodes[node]
        coordinates.append([float(data["x"]), float(data["y"])])

    total_seconds = 0.0
    for u, v in zip(path[:-1], path[1:]):
        total_seconds += edge_travel_time(u, v, graph[u][v])

    start_data = graph.nodes[start_node]
    end_data = graph.nodes[end_node]

    metrics = RouteMetrics(
        algorithm=algorithm,
        distance_km=distance_m / 1000,
        estimated_minutes=total_seconds / 60 if total_seconds < 1e11 else None,
        explored_nodes=explored,
        elapsed_ms=elapsed_ms,
        snapped_start=Coordinate(lat=float(start_data["y"]), lon=float(start_data["x"])),
        snapped_destination=Coordinate(lat=float(end_data["y"]), lon=float(end_data["x"])),
    )
    return RouteResult(metrics=metrics, coordinates=coordinates, node_ids=[int(n) for n in path])


def calculate_routes(graph, request):
    start = ox.distance.nearest_nodes(graph, X=request.start.lon, Y=request.start.lat)
    end = ox.distance.nearest_nodes(graph, X=request.destination.lon, Y=request.destination.lat)

    if start == end:
        raise ValueError("Start and destination snap to the same road node. Choose points farther apart.")

    algorithms = ["astar", "dijkstra"] if request.algorithm == "compare" else [request.algorithm]
    results = []

    for algorithm in algorithms:
        path, distance_m, explored, elapsed_ms = search_with_metrics(graph, start, end, algorithm)
        results.append(
            build_route_result(graph, path, distance_m, explored, elapsed_ms, algorithm, start, end)
        )

    return results

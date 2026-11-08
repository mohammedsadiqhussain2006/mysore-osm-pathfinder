from typing import Literal
from pydantic import BaseModel, Field


TravelMode = Literal["drive", "walk", "bike"]
Algorithm = Literal["astar", "dijkstra", "compare"]


class Coordinate(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class RouteRequest(BaseModel):
    start: Coordinate
    destination: Coordinate
    mode: TravelMode = "drive"
    algorithm: Algorithm = "compare"


class RouteMetrics(BaseModel):
    algorithm: str
    distance_km: float
    estimated_minutes: float | None
    explored_nodes: int
    elapsed_ms: float
    snapped_start: Coordinate
    snapped_destination: Coordinate


class RouteResult(BaseModel):
    metrics: RouteMetrics
    coordinates: list[list[float]]  # [longitude, latitude] for GeoJSON/Leaflet
    node_ids: list[int]


class RouteResponse(BaseModel):
    mode: TravelMode
    results: list[RouteResult]
    message: str

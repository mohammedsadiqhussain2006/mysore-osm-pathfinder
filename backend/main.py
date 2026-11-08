from functools import lru_cache
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import networkx as nx

from .osm_graph import load_graph
from .schemas import RouteRequest, RouteResponse
from .routing import calculate_routes

app = FastAPI(
    title="Mysuru OSM Pathfinder API",
    description="A* and Dijkstra routing over an OpenStreetMap road graph.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "https://mysore-osm-pathfinder-frontend.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@lru_cache(maxsize=3)
def get_graph(mode: str):
    return load_graph(mode)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "Mysuru OSM Pathfinder"}


@app.post("/api/route", response_model=RouteResponse)
def route(request: RouteRequest):
    try:
        graph = get_graph(request.mode)
        results = calculate_routes(graph, request)
        return RouteResponse(
            mode=request.mode,
            results=results,
            message="Routes calculated on the same OSM street graph and edge-distance weights.",
        )
    except nx.NetworkXNoPath:
        raise HTTPException(status_code=404, detail="No route found between these locations.")
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Routing failed: {error}")

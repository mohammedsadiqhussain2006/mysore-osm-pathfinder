import { API_BASE } from "./config.js";

export async function checkApi() {
  const response = await fetch(`${API_BASE}/api/health`);
  if (!response.ok) throw new Error("API is unavailable");
  return response.json();
}

export async function requestRoutes(payload) {
  const response = await fetch(`${API_BASE}/api/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = await response.json();
  if (!response.ok) throw new Error(body.detail || "Route request failed");
  return body;
}

import { API_BASE, MYSURU_CENTER, INITIAL_ZOOM } from "./config.js";
import { checkApi, requestRoutes } from "./api.js";

// ==========================================
// 1. MIN-HEAP PRIORITY QUEUE
// ==========================================
class MinHeap {
  constructor() {
    this.heap = [];
  }

  size() {
    return this.heap.length;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  push(item, priority, secondary = 0) {
    this.heap.push({ item, priority, secondary });
    this._bubbleUp(this.heap.length - 1);
  }

  pop() {
    if (this.isEmpty()) return null;
    const top = this.heap[0];
    const bottom = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this._sinkDown(0);
    }
    return top.item;
  }

  _bubbleUp(idx) {
    const node = this.heap[idx];
    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / 2);
      const parent = this.heap[parentIdx];
      if (node.priority < parent.priority || 
         (node.priority === parent.priority && node.secondary < parent.secondary)) {
        this.heap[idx] = parent;
        idx = parentIdx;
      } else {
        break;
      }
    }
    this.heap[idx] = node;
  }

  _sinkDown(idx) {
    const length = this.heap.length;
    const node = this.heap[idx];
    while (true) {
      let leftIdx = 2 * idx + 1;
      let rightIdx = 2 * idx + 2;
      let swapIdx = null;

      if (leftIdx < length) {
        const left = this.heap[leftIdx];
        if (left.priority < node.priority || 
           (left.priority === node.priority && left.secondary < node.secondary)) {
          swapIdx = leftIdx;
        }
      }

      if (rightIdx < length) {
        const right = this.heap[rightIdx];
        const compareTo = swapIdx === null ? node : this.heap[swapIdx];
        if (right.priority < compareTo.priority || 
           (right.priority === compareTo.priority && right.secondary < compareTo.secondary)) {
          swapIdx = rightIdx;
        }
      }

      if (swapIdx === null) break;
      this.heap[idx] = this.heap[swapIdx];
      idx = swapIdx;
    }
    this.heap[idx] = node;
  }
}

// ==========================================
// 2. GRID ARENA ENGINE
// ==========================================
const ROWS = 22;
const COLS = 32;

const CELL_STATE = {
  EMPTY: 0,
  WALL: 1,
};

const SEARCH_STATE = {
  UNVISITED: 0,
  FRONTIER: 1,
  SETTLED: 2,
  PATH: 3,
};

const gridState = {
  rows: ROWS,
  cols: COLS,
  start: { r: 10, c: 5 },
  target: { r: 10, c: 26 },
  walls: new Set(),
  heuristic: "euclidean",
  movement: 4, // 4 or 8
  drawingTool: "wall", // "wall" or "erase"
  speed: "normal",
  isPlaying: false,
  isPaused: false,
  dragTarget: null, // "start", "target", "wall", "erase", null
};

// Heuristic calculation functions
function calculateHeuristic(r, c, tr, tc, type) {
  const dr = Math.abs(r - tr);
  const dc = Math.abs(c - tc);
  switch (type) {
    case "manhattan":
      return dr + dc;
    case "chebyshev":
      return Math.max(dr, dc);
    case "diagonal":
      return (dr + dc) + (Math.SQRT2 - 2) * Math.min(dr, dc);
    case "euclidean":
    default:
      return Math.sqrt(dr * dr + dc * dc);
  }
}

// Search Algorithm Instance
class AlgorithmRunner {
  constructor(name, isAstar) {
    this.name = name;
    this.isAstar = isAstar;
    this.reset();
  }

  reset() {
    this.heap = new MinHeap();
    this.g = Array.from({ length: ROWS }, () => Array(COLS).fill(Infinity));
    this.h = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    this.f = Array.from({ length: ROWS }, () => Array(COLS).fill(Infinity));
    this.parent = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.states = Array.from({ length: ROWS }, () => Array(COLS).fill(SEARCH_STATE.UNVISITED));
    this.settledCount = 0;
    this.frontierCount = 0;
    this.isFinished = false;
    this.foundPath = false;
    this.path = [];
    this.pathCost = 0;
    this.pathAnimIndex = 0;
  }

  init(start, target, heuristic, movement) {
    this.reset();
    const { r: sr, c: sc } = start;
    const { r: tr, c: tc } = target;

    this.g[sr][sc] = 0;
    this.h[sr][sc] = this.isAstar ? calculateHeuristic(sr, sc, tr, tc, heuristic) : 0;
    this.f[sr][sc] = this.g[sr][sc] + this.h[sr][sc];

    this.heap.push({ r: sr, c: sc }, this.f[sr][sc], this.h[sr][sc]);
    this.states[sr][sc] = SEARCH_STATE.FRONTIER;
    this.frontierCount = 1;
    this.movement = movement;
  }

  step(walls, target, heuristic) {
    if (this.isFinished || this.heap.isEmpty()) {
      if (!this.isFinished) {
        this.isFinished = true;
      }
      return false;
    }

    // Pop the lowest cost cell
    const curr = this.heap.pop();
    if (!curr) {
      this.isFinished = true;
      return false;
    }

    const { r, c } = curr;
    if (this.states[r][c] === SEARCH_STATE.SETTLED) {
      return true; // Already processed
    }

    this.states[r][c] = SEARCH_STATE.SETTLED;
    this.settledCount++;
    if (this.frontierCount > 0) this.frontierCount--;

    // Target reached?
    if (r === target.r && c === target.c) {
      this.isFinished = true;
      this.foundPath = true;
      this.reconstructPath(target);
      return false;
    }

    // Neighbors
    const neighbors = [];
    if (this.movement === 4) {
      neighbors.push({ r: r - 1, c, cost: 1 }, { r: r + 1, c, cost: 1 }, { r, c: c - 1, cost: 1 }, { r, c: c + 1, cost: 1 });
    } else {
      // 8-way movement
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const cost = Math.abs(dr) + Math.abs(dc) === 2 ? Math.SQRT2 : 1;
          neighbors.push({ r: r + dr, c: c + dc, cost });
        }
      }
    }

    for (const nb of neighbors) {
      const { r: nr, c: nc, cost } = nb;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (walls.has(`${nr},${nc}`)) continue;
      if (this.states[nr][nc] === SEARCH_STATE.SETTLED) continue;

      const tentativeG = this.g[r][c] + cost;
      if (tentativeG < this.g[nr][nc]) {
        this.parent[nr][nc] = { r, c };
        this.g[nr][nc] = tentativeG;
        this.h[nr][nc] = this.isAstar ? calculateHeuristic(nr, nc, target.r, target.c, heuristic) : 0;
        this.f[nr][nc] = this.g[nr][nc] + this.h[nr][nc];

        if (this.states[nr][nc] !== SEARCH_STATE.FRONTIER) {
          this.states[nr][nc] = SEARCH_STATE.FRONTIER;
          this.frontierCount++;
        }

        // Secondary priority breaks ties toward lower h(n) in A*
        this.heap.push({ r: nr, c: nc }, this.f[nr][nc], this.h[nr][nc]);
      }
    }

    return true;
  }

  reconstructPath(target) {
    const p = [];
    let curr = target;
    while (curr) {
      p.push(curr);
      if (
        (curr.r !== gridState.start.r || curr.c !== gridState.start.c) &&
        (curr.r !== gridState.target.r || curr.c !== gridState.target.c)
      ) {
        this.states[curr.r][curr.c] = SEARCH_STATE.PATH;
      }
      curr = this.parent[curr.r][curr.c];
    }
    p.reverse();
    this.path = p;
    this.pathCost = this.g[target.r][target.c];
  }
}

const runnerDijkstra = new AlgorithmRunner("dijkstra", false);
const runnerAstar = new AlgorithmRunner("astar", true);

// ==========================================
// 3. CANVAS RENDERING
// ==========================================
const canvasDijkstra = document.getElementById("canvas-dijkstra");
const canvasAstar = document.getElementById("canvas-astar");
const ctxDijkstra = canvasDijkstra.getContext("2d");
const ctxAstar = canvasAstar.getContext("2d");

let cellSize = 20;

function resizeCanvases() {
  const container = document.getElementById("container-dijkstra");
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const availableWidth = rect.width > 50 ? rect.width : 540;

  cellSize = Math.max(10, Math.floor(availableWidth / COLS));
  const w = cellSize * COLS;
  const h = cellSize * ROWS;

  [canvasDijkstra, canvasAstar].forEach((canvas) => {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
  });

  drawBoards();
}

function drawBoard(ctx, runner, isAstar) {
  const w = cellSize * COLS;
  const h = cellSize * ROWS;
  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  // Draw cells
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * cellSize;
      const y = r * cellSize;
      const key = `${r},${c}`;

      if (gridState.walls.has(key)) {
        // Wall
        ctx.fillStyle = "#2b3935";
        ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        continue;
      }

      const st = runner.states[r][c];

      if (st === SEARCH_STATE.PATH) {
        ctx.fillStyle = "#fbbf24";
        ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
      } else if (st === SEARCH_STATE.SETTLED) {
        ctx.fillStyle = isAstar ? "#a7f3d0" : "#fed7aa";
        ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
      } else if (st === SEARCH_STATE.FRONTIER) {
        ctx.fillStyle = isAstar ? "#ccfbf1" : "#fef3c7";
        ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
      } else {
        // Grid lines
        ctx.strokeStyle = "#f0f3f1";
        ctx.strokeRect(x, y, cellSize, cellSize);
      }
    }
  }

  // Draw Path connecting line
  if (runner.path.length > 1) {
    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = Math.max(3, cellSize * 0.28);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < runner.path.length; i++) {
      const pt = runner.path[i];
      const px = pt.c * cellSize + cellSize / 2;
      const py = pt.r * cellSize + cellSize / 2;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  // Draw Start (A)
  const sx = gridState.start.c * cellSize + cellSize / 2;
  const sy = gridState.start.r * cellSize + cellSize / 2;
  ctx.fillStyle = "#10b981";
  ctx.beginPath();
  ctx.arc(sx, sy, cellSize * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.floor(cellSize * 0.52)}px Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("A", sx, sy);

  // Draw Target (B)
  const tx = gridState.target.c * cellSize + cellSize / 2;
  const ty = gridState.target.r * cellSize + cellSize / 2;
  ctx.fillStyle = "#f43f5e";
  ctx.beginPath();
  ctx.arc(tx, ty, cellSize * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.floor(cellSize * 0.52)}px Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("B", tx, ty);
}

function drawBoards() {
  drawBoard(ctxDijkstra, runnerDijkstra, false);
  drawBoard(ctxAstar, runnerAstar, true);
  updateDashboardUI();
}

// ==========================================
// 4. DASHBOARD & STATS UPDATE
// ==========================================
const statDijkstraSettled = document.getElementById("stat-dijkstra-settled");
const statDijkstraFrontier = document.getElementById("stat-dijkstra-frontier");
const statDijkstraCost = document.getElementById("stat-dijkstra-cost");
const statDijkstraStatus = document.getElementById("stat-dijkstra-status");

const statAstarSettled = document.getElementById("stat-astar-settled");
const statAstarFrontier = document.getElementById("stat-astar-frontier");
const statAstarCost = document.getElementById("stat-astar-cost");
const statAstarStatus = document.getElementById("stat-astar-status");

const comparisonMsg = document.getElementById("comparison-message");
const barNumDijkstra = document.getElementById("bar-num-dijkstra");
const barNumAstar = document.getElementById("bar-num-astar");
const barFillDijkstra = document.getElementById("bar-fill-dijkstra");
const barFillAstar = document.getElementById("bar-fill-astar");

function updateDashboardUI() {
  statDijkstraSettled.textContent = runnerDijkstra.settledCount.toLocaleString();
  statDijkstraFrontier.textContent = runnerDijkstra.frontierCount.toLocaleString();
  statDijkstraCost.textContent = runnerDijkstra.foundPath ? runnerDijkstra.pathCost.toFixed(1) : "—";

  if (runnerDijkstra.foundPath) {
    statDijkstraStatus.textContent = "Goal Reached!";
    statDijkstraStatus.className = "status-text found";
  } else if (runnerDijkstra.isFinished) {
    statDijkstraStatus.textContent = "No Path Found";
    statDijkstraStatus.className = "status-text nopath";
  } else if (gridState.isPlaying) {
    statDijkstraStatus.textContent = "Searching…";
    statDijkstraStatus.className = "status-text searching";
  } else {
    statDijkstraStatus.textContent = "Ready";
    statDijkstraStatus.className = "status-text ready";
  }

  statAstarSettled.textContent = runnerAstar.settledCount.toLocaleString();
  statAstarFrontier.textContent = runnerAstar.frontierCount.toLocaleString();
  statAstarCost.textContent = runnerAstar.foundPath ? runnerAstar.pathCost.toFixed(1) : "—";

  if (runnerAstar.foundPath) {
    statAstarStatus.textContent = "Goal Reached!";
    statAstarStatus.className = "status-text found";
  } else if (runnerAstar.isFinished) {
    statAstarStatus.textContent = "No Path Found";
    statAstarStatus.className = "status-text nopath";
  } else if (gridState.isPlaying) {
    statAstarStatus.textContent = "Searching…";
    statAstarStatus.className = "status-text searching";
  } else {
    statAstarStatus.textContent = "Ready";
    statAstarStatus.className = "status-text ready";
  }

  // Update comparison bar and text
  const dCount = runnerDijkstra.settledCount;
  const aCount = runnerAstar.settledCount;
  barNumDijkstra.textContent = dCount;
  barNumAstar.textContent = aCount;

  const total = Math.max(1, dCount + aCount);
  barFillDijkstra.style.width = `${(dCount / total) * 100}%`;
  barFillAstar.style.width = `${(aCount / total) * 100}%`;

  if (runnerAstar.foundPath && runnerDijkstra.foundPath) {
    const diff = dCount - aCount;
    const pct = dCount > 0 ? ((diff / dCount) * 100).toFixed(0) : 0;
    if (diff > 0) {
      comparisonMsg.innerHTML = `🎯 <strong>A* reached destination exploring ${pct}% fewer nodes</strong> (${aCount} vs ${dCount} settled) with identical optimal cost <span class="advantage">${runnerAstar.pathCost.toFixed(1)}</span>!`;
    } else {
      comparisonMsg.innerHTML = `Both algorithms found optimal path of cost ${runnerAstar.pathCost.toFixed(1)}.`;
    }
  } else if (runnerAstar.foundPath && !runnerDijkstra.isFinished) {
    comparisonMsg.innerHTML = `⚡ <strong>A* found the goal in ${aCount} steps!</strong> Dijkstra is still searching outward (${dCount} settled so far)...`;
  }
}

// ==========================================
// 5. ANIMATION LOOP & CONTROLS
// ==========================================
let animFrameId = null;
let lastStepTime = 0;

const btnPlay = document.getElementById("btn-play");
const btnPlayText = document.getElementById("btn-play-text");
const btnStep = document.getElementById("btn-step");
const btnReset = document.getElementById("btn-reset");
const btnClearWalls = document.getElementById("btn-clear-walls");
const speedSelect = document.getElementById("speed-select");
const mazeSelect = document.getElementById("maze-select");
const heuristicSelect = document.getElementById("heuristic-select");
const diagonalToggle = document.getElementById("diagonal-toggle");
const toolDraw = document.getElementById("tool-draw");
const toolErase = document.getElementById("tool-erase");

function initSearch() {
  runnerDijkstra.init(gridState.start, gridState.target, gridState.heuristic, gridState.movement);
  runnerAstar.init(gridState.start, gridState.target, gridState.heuristic, gridState.movement);
}

function stepBoth() {
  const dActive = !runnerDijkstra.isFinished;
  const aActive = !runnerAstar.isFinished;

  if (dActive) {
    runnerDijkstra.step(gridState.walls, gridState.target, gridState.heuristic);
  }
  if (aActive) {
    runnerAstar.step(gridState.walls, gridState.target, gridState.heuristic);
  }

  drawBoards();
  return !runnerDijkstra.isFinished || !runnerAstar.isFinished;
}

function getDelayForSpeed(speed) {
  switch (speed) {
    case "slow": return 55;
    case "normal": return 16;
    case "fast": return 4;
    case "turbo": return 0;
    case "instant": return 0;
    default: return 16;
  }
}

function animationLoop(now) {
  if (!gridState.isPlaying) return;

  const speed = gridState.speed;

  if (speed === "instant") {
    let limit = 20000;
    while ((!runnerDijkstra.isFinished || !runnerAstar.isFinished) && limit-- > 0) {
      stepBoth();
    }
    stopAnimation();
    drawBoards();
    return;
  }

  const delay = getDelayForSpeed(speed);
  const stepsPerTick = speed === "turbo" ? 6 : (speed === "fast" ? 2 : 1);

  if (now - lastStepTime >= delay) {
    lastStepTime = now;
    let keepGoing = true;
    for (let i = 0; i < stepsPerTick; i++) {
      keepGoing = stepBoth();
      if (!keepGoing) break;
    }

    if (!keepGoing) {
      stopAnimation();
      return;
    }
  }

  animFrameId = requestAnimationFrame(animationLoop);
}

function startAnimation() {
  if (runnerDijkstra.isFinished && runnerAstar.isFinished) {
    initSearch();
  } else if (!runnerDijkstra.heap.isEmpty() && !runnerAstar.heap.isEmpty()) {
    // Continue from paused state
  } else {
    initSearch();
  }

  gridState.isPlaying = true;
  gridState.isPaused = false;
  btnPlay.classList.add("running");
  btnPlayText.textContent = "Pause Animation";
  lastStepTime = performance.now();
  animFrameId = requestAnimationFrame(animationLoop);
}

function pauseAnimation() {
  gridState.isPlaying = false;
  gridState.isPaused = true;
  btnPlay.classList.remove("running");
  btnPlayText.textContent = "Resume Animation";
  if (animFrameId) cancelAnimationFrame(animFrameId);
  drawBoards();
}

function stopAnimation() {
  gridState.isPlaying = false;
  gridState.isPaused = false;
  btnPlay.classList.remove("running");
  btnPlayText.textContent = "Replay Animation";
  if (animFrameId) cancelAnimationFrame(animFrameId);
  drawBoards();
}

function resetSearchState() {
  if (animFrameId) cancelAnimationFrame(animFrameId);
  gridState.isPlaying = false;
  gridState.isPaused = false;
  btnPlay.classList.remove("running");
  btnPlayText.textContent = "Start Animation";
  initSearch();
  drawBoards();
  comparisonMsg.innerHTML = `Hit <strong>Start Animation</strong> to see how A* prunes the search space relative to Dijkstra.`;
}

btnPlay.addEventListener("click", () => {
  if (gridState.isPlaying) {
    pauseAnimation();
  } else {
    startAnimation();
  }
});

btnStep.addEventListener("click", () => {
  if (gridState.isPlaying) pauseAnimation();
  if (runnerDijkstra.heap.isEmpty() && runnerAstar.heap.isEmpty()) {
    initSearch();
  }
  stepBoth();
});

btnReset.addEventListener("click", () => {
  resetSearchState();
});

btnClearWalls.addEventListener("click", () => {
  gridState.walls.clear();
  mazeSelect.value = "custom";
  resetSearchState();
});

speedSelect.addEventListener("change", (e) => {
  gridState.speed = e.target.value;
});

heuristicSelect.addEventListener("change", (e) => {
  gridState.heuristic = e.target.value;
  resetSearchState();
});

diagonalToggle.addEventListener("change", (e) => {
  gridState.movement = parseInt(e.target.value, 10);
  resetSearchState();
});

toolDraw.addEventListener("click", () => {
  gridState.drawingTool = "wall";
  toolDraw.classList.add("active");
  toolErase.classList.remove("active");
});

toolErase.addEventListener("click", () => {
  gridState.drawingTool = "erase";
  toolErase.classList.add("active");
  toolDraw.classList.remove("active");
});

// ==========================================
// 6. MAZE & SCENARIO GENERATORS
// ==========================================
mazeSelect.addEventListener("change", (e) => {
  const type = e.target.value;
  gridState.walls.clear();

  if (type === "recursive") {
    generateRecursiveDivisionMaze();
  } else if (type === "random") {
    generateRandomWalls(0.3);
  } else if (type === "trap") {
    generateTrapPreset();
  } else if (type === "bottleneck") {
    generateBottleneckPreset();
  } else if (type === "spiral") {
    generateSpiralPreset();
  }

  resetSearchState();
});

function isEndpoint(r, c) {
  return (r === gridState.start.r && c === gridState.start.c) || 
         (r === gridState.target.r && c === gridState.target.c);
}

function generateRandomWalls(density = 0.28) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (isEndpoint(r, c)) continue;
      // Keep immediate start/target neighbors clear
      if (Math.abs(r - gridState.start.r) <= 1 && Math.abs(c - gridState.start.c) <= 1) continue;
      if (Math.abs(r - gridState.target.r) <= 1 && Math.abs(c - gridState.target.c) <= 1) continue;
      if (Math.random() < density) {
        gridState.walls.add(`${r},${c}`);
      }
    }
  }
}

function generateBottleneckPreset() {
  const midCol = Math.floor(COLS / 2);
  const doorway = Math.floor(ROWS / 2);
  for (let r = 0; r < ROWS; r++) {
    if (r !== doorway && r !== doorway + 1) {
      gridState.walls.add(`${r},${midCol}`);
    }
  }
}

function generateTrapPreset() {
  // A concave U-shaped trap around target facing start
  const tr = gridState.target.r;
  const tc = gridState.target.c;
  const top = Math.max(1, tr - 5);
  const bottom = Math.min(ROWS - 2, tr + 5);
  const left = Math.max(1, tc - 8);
  const right = Math.min(COLS - 2, tc + 4);

  // Top & bottom horizontal walls
  for (let c = left; c <= right; c++) {
    gridState.walls.add(`${top},${c}`);
    gridState.walls.add(`${bottom},${c}`);
  }
  // Right back wall (open only to the left)
  for (let r = top; r <= bottom; r++) {
    gridState.walls.add(`${r},${right}`);
  }
}

function generateSpiralPreset() {
  let top = 1, bottom = ROWS - 2, left = 1, right = COLS - 2;
  while (top < bottom && left < right) {
    for (let c = left; c <= right; c++) gridState.walls.add(`${top},${c}`);
    for (let r = top; r <= bottom; r++) gridState.walls.add(`${r},${right}`);
    for (let c = right; c >= left + 2; c--) gridState.walls.add(`${bottom},${c}`);
    for (let r = bottom; r >= top + 2; r--) gridState.walls.add(`${r},${left + 1}`);
    top += 3; bottom -= 3; left += 3; right -= 3;
  }
  // Clear endpoints
  gridState.walls.delete(`${gridState.start.r},${gridState.start.c}`);
  gridState.walls.delete(`${gridState.target.r},${gridState.target.c}`);
}

function generateRecursiveDivisionMaze() {
  // Outer borders
  for (let r = 0; r < ROWS; r++) {
    gridState.walls.add(`${r},0`);
    gridState.walls.add(`${r},${COLS - 1}`);
  }
  for (let c = 0; c < COLS; c++) {
    gridState.walls.add(`0,${c}`);
    gridState.walls.add(`${ROWS - 1},${c}`);
  }

  function divide(r1, r2, c1, c2) {
    if (r2 - r1 < 3 || c2 - c1 < 3) return;

    const horizontal = (r2 - r1) > (c2 - c1);
    if (horizontal) {
      // Horizontal split
      const wallR = Math.floor((r1 + r2) / 2);
      const passageC = Math.floor(Math.random() * (c2 - c1 - 1)) + c1 + 1;
      for (let c = c1 + 1; c < c2; c++) {
        if (c !== passageC) gridState.walls.add(`${wallR},${c}`);
      }
      divide(r1, wallR, c1, c2);
      divide(wallR, r2, c1, c2);
    } else {
      // Vertical split
      const wallC = Math.floor((c1 + c2) / 2);
      const passageR = Math.floor(Math.random() * (r2 - r1 - 1)) + r1 + 1;
      for (let r = r1 + 1; r < r2; r++) {
        if (r !== passageR) gridState.walls.add(`${r},${wallC}`);
      }
      divide(r1, r2, c1, wallC);
      divide(r1, r2, wallC, c2);
    }
  }

  divide(0, ROWS - 1, 0, COLS - 1);
  gridState.walls.delete(`${gridState.start.r},${gridState.start.c}`);
  gridState.walls.delete(`${gridState.target.r},${gridState.target.c}`);
}

// ==========================================
// 7. MOUSE & TOUCH INTERACTION ON CANVASES
// ==========================================
const cellInspector = document.getElementById("cell-inspector");
const inspPos = document.getElementById("insp-pos");
const inspState = document.getElementById("insp-state");
const inspG = document.getElementById("insp-g");
const inspH = document.getElementById("insp-h");
const inspF = document.getElementById("insp-f");

function getCellFromCoords(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const c = Math.floor(x / cellSize);
  const r = Math.floor(y / cellSize);
  if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
    return { r, c };
  }
  return null;
}

function handlePointerDown(e, canvas) {
  const cell = getCellFromCoords(canvas, e.clientX, e.clientY);
  if (!cell) return;

  if (cell.r === gridState.start.r && cell.c === gridState.start.c) {
    gridState.dragTarget = "start";
    return;
  }
  if (cell.r === gridState.target.r && cell.c === gridState.target.c) {
    gridState.dragTarget = "target";
    return;
  }

  // Right-click or eraser tool
  const isErase = e.button === 2 || gridState.drawingTool === "erase";
  gridState.dragTarget = isErase ? "erase" : "wall";
  applyCellAction(cell, gridState.dragTarget);
}

function handlePointerMove(e, canvas, runner) {
  const cell = getCellFromCoords(canvas, e.clientX, e.clientY);
  if (!cell) {
    cellInspector.classList.remove("active");
    return;
  }

  // Cell inspector tooltip
  cellInspector.classList.add("active");
  cellInspector.style.left = `${e.clientX + 16}px`;
  cellInspector.style.top = `${e.clientY + 16}px`;

  inspPos.textContent = `(${cell.r}, ${cell.c})`;
  const key = `${cell.r},${cell.c}`;
  if (cell.r === gridState.start.r && cell.c === gridState.start.c) {
    inspState.textContent = "Start Point (A)";
  } else if (cell.r === gridState.target.r && cell.c === gridState.target.c) {
    inspState.textContent = "Target Destination (B)";
  } else if (gridState.walls.has(key)) {
    inspState.textContent = "Obstacle Wall";
  } else {
    const st = runner.states[cell.r][cell.c];
    if (st === SEARCH_STATE.PATH) inspState.textContent = "Optimal Path";
    else if (st === SEARCH_STATE.SETTLED) inspState.textContent = "Settled (Closed)";
    else if (st === SEARCH_STATE.FRONTIER) inspState.textContent = "Frontier (Open)";
    else inspState.textContent = "Unvisited";
  }

  const gVal = runner.g[cell.r][cell.c];
  const hVal = runner.h[cell.r][cell.c];
  const fVal = runner.f[cell.r][cell.c];
  inspG.textContent = gVal < Infinity ? gVal.toFixed(1) : "∞";
  inspH.textContent = runner.isAstar ? hVal.toFixed(1) : "0.0 (Dijkstra)";
  inspF.textContent = fVal < Infinity ? fVal.toFixed(1) : "∞";

  // Dragging logic
  if (!gridState.dragTarget) return;

  if (gridState.dragTarget === "start") {
    if (!gridState.walls.has(key) && (cell.r !== gridState.target.r || cell.c !== gridState.target.c)) {
      gridState.start = cell;
      resetSearchState();
    }
  } else if (gridState.dragTarget === "target") {
    if (!gridState.walls.has(key) && (cell.r !== gridState.start.r || cell.c !== gridState.start.c)) {
      gridState.target = cell;
      resetSearchState();
    }
  } else {
    applyCellAction(cell, gridState.dragTarget);
  }
}

function handlePointerUp() {
  gridState.dragTarget = null;
}

function applyCellAction(cell, action) {
  if (isEndpoint(cell.r, cell.c)) return;
  const key = `${cell.r},${cell.c}`;
  if (action === "wall") {
    gridState.walls.add(key);
  } else if (action === "erase") {
    gridState.walls.delete(key);
  }
  mazeSelect.value = "custom";
  resetSearchState();
}

function handleTouchStart(e, canvas) {
  if (e.touches.length > 0) {
    const t = e.touches[0];
    handlePointerDown({ clientX: t.clientX, clientY: t.clientY, button: 0 }, canvas);
  }
}

function handleTouchMove(e, canvas, runner) {
  if (e.touches.length > 0) {
    const t = e.touches[0];
    handlePointerMove({ clientX: t.clientX, clientY: t.clientY }, canvas, runner);
    e.preventDefault();
  }
}

[
  { canvas: canvasDijkstra, runner: runnerDijkstra },
  { canvas: canvasAstar, runner: runnerAstar },
].forEach(({ canvas, runner }) => {
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("mousedown", (e) => handlePointerDown(e, canvas));
  canvas.addEventListener("mousemove", (e) => handlePointerMove(e, canvas, runner));
  canvas.addEventListener("mouseleave", () => cellInspector.classList.remove("active"));
  canvas.addEventListener("touchstart", (e) => handleTouchStart(e, canvas), { passive: false });
  canvas.addEventListener("touchmove", (e) => handleTouchMove(e, canvas, runner), { passive: false });
  canvas.addEventListener("touchend", handlePointerUp);
});

window.addEventListener("mouseup", handlePointerUp);

// ==========================================
// 8. TAB NAVIGATION
// ==========================================
const tabGrid = document.getElementById("tab-grid");
const tabOsm = document.getElementById("tab-osm");
const gridView = document.getElementById("grid-view");
const osmView = document.getElementById("osm-view");

let osmMapInitialized = false;

tabGrid.addEventListener("click", () => {
  tabGrid.classList.add("active");
  tabOsm.classList.remove("active");
  gridView.classList.add("active");
  osmView.classList.remove("active");
  setTimeout(resizeCanvases, 50);
});

tabOsm.addEventListener("click", () => {
  tabOsm.classList.add("active");
  tabGrid.classList.remove("active");
  osmView.classList.add("active");
  gridView.classList.remove("active");
  if (!osmMapInitialized) {
    initOsmVisualizerMap();
  } else if (osmMap) {
    setTimeout(() => {
      osmMap.invalidateSize();
      renderOsmMarkers();
    }, 100);
  }
});

// ==========================================
// 9. TAB 2: MYSURU STREET NETWORK ANIMATION
// ==========================================
let osmMap = null;
let osmOverlayCanvas = null;
let osmAnimId = null;
let osmResults = null;
let currentOsmRenderedPoints = { dijkstra: [], astar: [] };

const btnOsmRun = document.getElementById("btn-osm-run");
const btnOsmRunText = document.getElementById("btn-osm-run-text");
const btnOsmReplay = document.getElementById("btn-osm-replay");
const osmModeSelect = document.getElementById("osm-mode");
const osmAlgoSelect = document.getElementById("osm-algo");
const osmHud = document.getElementById("osm-hud");
const osmCountDijkstra = document.getElementById("osm-count-dijkstra");
const osmCountAstar = document.getElementById("osm-count-astar");
const osmDist = document.getElementById("osm-dist");

let selectedStart = { lat: 12.3051, lon: 76.6551 };
let selectedDest = { lat: 12.2724, lon: 76.6713 };
let osmMarkers = null;
let osmRouteLines = null;

function initOsmVisualizerMap() {
  osmMapInitialized = true;
  osmMap = L.map("map-visualizer").setView(MYSURU_CENTER, INITIAL_ZOOM);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(osmMap);

  osmMarkers = L.layerGroup().addTo(osmMap);
  osmRouteLines = L.layerGroup().addTo(osmMap);

  // Setup custom canvas overlay for wavefront rendering
  setupOsmCanvasOverlay();
  renderOsmMarkers();

  // Click on map to pick custom start / destination
  let settingDest = false;
  osmMap.on("click", (e) => {
    if (!settingDest) {
      selectedStart = { lat: e.latlng.lat, lon: e.latlng.lng };
      settingDest = true;
    } else {
      selectedDest = { lat: e.latlng.lat, lon: e.latlng.lng };
      settingDest = false;
    }
    document.querySelectorAll(".preset-pill").forEach((p) => p.classList.remove("active"));
    renderOsmMarkers();
    btnOsmReplay.hidden = true;
    clearOsmCanvas();
    osmRouteLines.clearLayers();
  });

  // Preset pill selection
  document.querySelectorAll(".preset-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".preset-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      const [sLat, sLon] = pill.dataset.start.split(",").map(Number);
      const [dLat, dLon] = pill.dataset.dest.split(",").map(Number);
      selectedStart = { lat: sLat, lon: sLon };
      selectedDest = { lat: dLat, lon: dLon };
      settingDest = false;
      renderOsmMarkers();
      btnOsmReplay.hidden = true;
      clearOsmCanvas();
      osmRouteLines.clearLayers();
    });
  });
}

function redrawOsmWave() {
  if (!osmOverlayCanvas || !osmMap) return;
  const ctx = osmOverlayCanvas.getContext("2d");
  const size = osmMap.getSize();
  ctx.clearRect(0, 0, size.x, size.y);

  for (const [lon, lat] of currentOsmRenderedPoints.dijkstra) {
    const pt = osmMap.latLngToContainerPoint([lat, lon]);
    ctx.fillStyle = "rgba(184, 110, 0, 0.4)";
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const [lon, lat] of currentOsmRenderedPoints.astar) {
    const pt = osmMap.latLngToContainerPoint([lat, lon]);
    ctx.fillStyle = "rgba(8, 126, 120, 0.65)";
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function setupOsmCanvasOverlay() {
  const container = osmMap.getContainer();
  osmOverlayCanvas = document.createElement("canvas");
  osmOverlayCanvas.className = "osm-overlay-canvas";
  osmOverlayCanvas.style.position = "absolute";
  osmOverlayCanvas.style.top = "0";
  osmOverlayCanvas.style.left = "0";
  osmOverlayCanvas.style.width = "100%";
  osmOverlayCanvas.style.height = "100%";
  osmOverlayCanvas.style.pointerEvents = "none";
  osmOverlayCanvas.style.zIndex = "450";
  container.appendChild(osmOverlayCanvas);

  function resetCanvas() {
    const size = osmMap.getSize();
    const dpr = window.devicePixelRatio || 1;
    osmOverlayCanvas.width = size.x * dpr;
    osmOverlayCanvas.height = size.y * dpr;
    const ctx = osmOverlayCanvas.getContext("2d");
    ctx.scale(dpr, dpr);
    redrawOsmWave();
  }

  osmMap.on("move", resetCanvas);
  osmMap.on("resize", resetCanvas);
  resetCanvas();
}

function clearOsmCanvas() {
  currentOsmRenderedPoints = { dijkstra: [], astar: [] };
  if (osmOverlayCanvas && osmMap) {
    const ctx = osmOverlayCanvas.getContext("2d");
    const size = osmMap.getSize();
    ctx.clearRect(0, 0, size.x, size.y);
  }
}

function renderOsmMarkers() {
  osmMarkers.clearLayers();

  const startIcon = L.divIcon({
    className: "custom-pin start-pin marker-bounce",
    html: `<div class="pulse-ring"></div><div class="pin-core">A</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

  const destIcon = L.divIcon({
    className: "custom-pin dest-pin marker-bounce",
    html: `<div class="pulse-ring"></div><div class="pin-core">B</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

  L.marker([selectedStart.lat, selectedStart.lon], { icon: startIcon }).addTo(osmMarkers);
  L.marker([selectedDest.lat, selectedDest.lon], { icon: destIcon }).addTo(osmMarkers);

  const bounds = L.latLngBounds([
    [selectedStart.lat, selectedStart.lon],
    [selectedDest.lat, selectedDest.lon],
  ]);
  osmMap.fitBounds(bounds.pad(0.3));
}

btnOsmRun.addEventListener("click", async () => {
  if (btnOsmRun.disabled) return;
  btnOsmRun.disabled = true;
  btnOsmRun.classList.add("loading");
  btnOsmRunText.textContent = "Calculating Wavefront…";
  clearOsmCanvas();
  osmRouteLines.clearLayers();
  if (osmAnimId) cancelAnimationFrame(osmAnimId);

  try {
    const res = await requestRoutes({
      start: selectedStart,
      destination: selectedDest,
      mode: osmModeSelect.value,
      algorithm: osmAlgoSelect.value,
      include_exploration: true,
    });

    osmResults = res.results;
    osmHud.hidden = false;
    btnOsmReplay.hidden = false;
    animateOsmExplorationWave(osmResults);
  } catch (err) {
    alert("Routing search failed: " + err.message);
  } finally {
    btnOsmRun.disabled = false;
    btnOsmRun.classList.remove("loading");
    btnOsmRunText.textContent = "Animate Street Search Wave";
  }
});

btnOsmReplay.addEventListener("click", () => {
  if (!osmResults) return;
  clearOsmCanvas();
  osmRouteLines.clearLayers();
  if (osmAnimId) cancelAnimationFrame(osmAnimId);
  animateOsmExplorationWave(osmResults);
});

function animateOsmExplorationWave(results) {
  if (!results || results.length === 0) return;

  const astarRes = results.find((r) => r.metrics.algorithm === "astar");
  const dijkstraRes = results.find((r) => r.metrics.algorithm === "dijkstra");

  const astarCoords = astarRes?.explored_coords || [];
  const dijkstraCoords = dijkstraRes?.explored_coords || [];

  const maxLen = Math.max(astarCoords.length, dijkstraCoords.length);
  if (maxLen === 0) return;

  osmDist.textContent = `${results[0].metrics.distance_km.toFixed(2)} km`;

  const ctx = osmOverlayCanvas.getContext("2d");
  let frame = 0;
  const speedBatch = Math.max(14, Math.floor(maxLen / 100));

  function stepWave() {
    const endFrame = Math.min(frame + speedBatch, maxLen);

    for (let i = frame; i < endFrame; i++) {
      // Draw Dijkstra node (Amber)
      if (dijkstraCoords[i]) {
        const [lon, lat] = dijkstraCoords[i];
        currentOsmRenderedPoints.dijkstra.push([lon, lat]);
        const pt = osmMap.latLngToContainerPoint([lat, lon]);
        ctx.fillStyle = "rgba(184, 110, 0, 0.4)";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw A* node (Teal)
      if (astarCoords[i]) {
        const [lon, lat] = astarCoords[i];
        currentOsmRenderedPoints.astar.push([lon, lat]);
        const pt = osmMap.latLngToContainerPoint([lat, lon]);
        ctx.fillStyle = "rgba(8, 126, 120, 0.65)";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    frame = endFrame;
    if (dijkstraRes) {
      const dRatio = Math.min(1, frame / dijkstraCoords.length);
      osmCountDijkstra.textContent = Math.round(dRatio * dijkstraRes.metrics.explored_nodes).toLocaleString();
    }
    if (astarRes) {
      const aRatio = Math.min(1, frame / astarCoords.length);
      osmCountAstar.textContent = Math.round(aRatio * astarRes.metrics.explored_nodes).toLocaleString();
    }

    if (frame < maxLen) {
      osmAnimId = requestAnimationFrame(stepWave);
    } else {
      // Draw Final Shortest Path Polyline
      for (const res of results) {
        const isAstar = res.metrics.algorithm === "astar";
        const pts = res.coordinates.map(([lon, lat]) => [lat, lon]);
        L.polyline(pts, {
          color: isAstar ? "#087e78" : "#b86e00",
          weight: isAstar ? 4 : 7,
          opacity: isAstar ? 0.95 : 0.8,
        }).addTo(osmRouteLines);
      }
    }
  }

  osmAnimId = requestAnimationFrame(stepWave);
}

// ==========================================
// 10. API HEALTH CHECK & INITIAL LOAD
// ==========================================
const apiStatus = document.getElementById("api-status");
checkApi()
  .then(() => {
    apiStatus.innerHTML = `<span class="dot ok"></span> API Connected`;
  })
  .catch(() => {
    apiStatus.innerHTML = `<span class="dot"></span> Backend Offline (Grid mode works offline)`;
  });

window.addEventListener("resize", resizeCanvases);
window.addEventListener("DOMContentLoaded", () => {
  initSearch();
  resizeCanvases();
});

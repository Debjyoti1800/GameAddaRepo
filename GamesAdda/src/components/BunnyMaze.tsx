import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

/* ------------------------------------------------------------------ */
/*  Bunny Maze: a Pac-Man style game.                                  */
/*  Bunny = player, robots = enemies, carrots = dots.                  */
/*  Self-contained: no external libraries or assets.                   */
/*  Usage: <BunnyMaze onExit={() => goBackToGamePool()} />             */
/* ------------------------------------------------------------------ */

type Ctx = CanvasRenderingContext2D;
type Dir = { x: number; y: number };
type Mode = "pen" | "leave" | "roam" | "eyes";
type Status = "idle" | "ready" | "playing" | "paused" | "dying" | "cleared" | "over";

interface Mover { tx: number; ty: number; dx: number; dy: number; prog: number }
interface Bunny extends Mover { want: Dir; face: Dir }
interface Robot extends Mover {
  mode: Mode; hue: string; chase: number; release: number; fright: boolean; phase: number;
}
interface Pop { x: number; y: number; text: string; life: number }
interface Game {
  status: Status; timer: number; t: number; dirty: boolean;
  score: number; best: number; lives: number; level: number;
  pellets: number[][]; left: number; scared: number; combo: number;
  bunny: Bunny; robots: Robot[]; pops: Pop[];
}

/* ---------- maze: # wall, . carrot, o big carrot, G robot gate, P bunny start ---------- */
const MAP: string[] = [
  "###################",
  "#........#........#",
  "#o##.###.#.###.##o#",
  "#.................#",
  "#.##.#.#####.#.##.#",
  "#....#...#...#....#",
  "####.### # ###.####",
  "####.#       #.####",
  "####.# ##G## #.####",
  "    .  #   #  .    ",
  "####.# ##### #.####",
  "####.#       #.####",
  "####.# ##### #.####",
  "#........#........#",
  "#.##.###.#.###.##.#",
  "#o.#.....P.....#.o#",
  "##.#.#.#####.#.#.##",
  "#....#...#...#....#",
  "#.######.#.######.#",
  "#.................#",
  "###################",
];
const COLS = 19;
const ROWS = 21;
const TS = 24; // tile size in px
const W = COLS * TS;
const H = ROWS * TS;

const BG = "#0e2118";
const HEDGE = "#15382a";
const HEDGE_EDGE = "#4fb883";
const CARROT = "#ff8c1a";
const LEAF = "#5fd35f";
const CREAM = "#fff6ea";
const PINK = "#ffb3c6";
const BEST_KEY = "bunny-maze-best";
const BUNNY_SPEED = 6.2; // tiles per second

const DIRS: Dir[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
const KEYS: Record<string, Dir> = {
  ArrowUp: DIRS[3], w: DIRS[3], ArrowDown: DIRS[2], s: DIRS[2],
  ArrowLeft: DIRS[1], a: DIRS[1], ArrowRight: DIRS[0], d: DIRS[0],
};

const wrapX = (x: number) => (x + COLS) % COLS;
const cell = (x: number, y: number) => (y < 0 || y >= ROWS ? "#" : MAP[y][wrapX(x)]);
const canMove = (x: number, y: number, gate: boolean) => {
  const c = cell(x, y);
  return c !== "#" && (c !== "G" || gate);
};

/* Shortest-path maps so eaten robots can find their way home / out of the pen. */
const distFrom = (fx: number, fy: number) => {
  const d = Array.from({ length: ROWS }, () => Array<number>(COLS).fill(Infinity));
  const q: [number, number][] = [[fx, fy]];
  d[fy][fx] = 0;
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const v of DIRS) {
      const nx = wrapX(x + v.x);
      const ny = y + v.y;
      if (ny < 0 || ny >= ROWS || MAP[ny][nx] === "#" || d[ny][nx] !== Infinity) continue;
      d[ny][nx] = d[y][x] + 1;
      q.push([nx, ny]);
    }
  }
  return d;
};
const DIST_HOME = distFrom(9, 9);
const DIST_EXIT = distFrom(9, 7);

const ROBOT_SPECS: { x: number; y: number; mode: Mode; hue: string; chase: number; rel: number }[] = [
  { x: 9, y: 7, mode: "roam", hue: "#5aa9ff", chase: 0.85, rel: 0 },
  { x: 8, y: 9, mode: "pen", hue: "#ff6b6b", chase: 0.7, rel: 2 },
  { x: 9, y: 9, mode: "pen", hue: "#ffd166", chase: 0.55, rel: 5 },
  { x: 10, y: 9, mode: "pen", hue: "#c792ea", chase: 0.4, rel: 8 },
];

/* ------------------------------ game logic ------------------------------ */

function makeGame(): Game {
  const g = {
    status: "idle", timer: 0, t: 0, dirty: true, score: 0, best: 0, lives: 3, level: 1,
    pellets: [], left: 0, scared: 0, combo: 0, pops: [],
  } as unknown as Game;
  newLevel(g);
  resetActors(g);
  return g;
}

function newLevel(g: Game) {
  g.pellets = MAP.map((row) => [...row].map((ch) => (ch === "." ? 1 : ch === "o" ? 2 : 0)));
  g.left = g.pellets.flat().filter(Boolean).length;
  g.scared = 0;
  g.combo = 0;
  g.pops = [];
}

function resetActors(g: Game) {
  g.bunny = { tx: 9, ty: 15, dx: 0, dy: 0, prog: 0, want: { x: 0, y: 0 }, face: { x: 1, y: 0 } };
  g.robots = ROBOT_SPECS.map((s, i) => ({
    tx: s.x, ty: s.y, dx: s.mode === "roam" ? -1 : 0, dy: 0, prog: 0, mode: s.mode, hue: s.hue,
    chase: s.chase, release: s.rel * Math.pow(0.85, g.level - 1), fright: false, phase: i * 1.7,
  }));
  g.scared = 0;
}

function setStatus(g: Game, s: Status, timer = 0) {
  g.status = s;
  g.timer = timer;
  g.dirty = true;
}

function startGame(g: Game) {
  g.score = 0;
  g.lives = 3;
  g.level = 1;
  newLevel(g);
  resetActors(g);
  setStatus(g, "ready", 1.2);
}

function togglePause(g: Game) {
  if (g.status === "playing") setStatus(g, "paused");
  else if (g.status === "paused") setStatus(g, "playing");
}

function setWant(g: Game, d: Dir) {
  const b = g.bunny;
  b.want = d;
  // Allow an instant U-turn mid-tile.
  if (g.status === "playing" && b.prog > 0 && (b.dx || b.dy) && d.x === -b.dx && d.y === -b.dy) {
    b.tx = wrapX(b.tx + b.dx);
    b.ty += b.dy;
    b.dx = d.x;
    b.dy = d.y;
    b.prog = 1 - b.prog;
  }
}

function input(g: Game, d: Dir) {
  if (g.status === "idle" || g.status === "over") startGame(g);
  if (g.status === "paused") return;
  setWant(g, d);
}

function advance(g: Game) {
  if (g.status === "ready") {
    setStatus(g, "playing");
  } else if (g.status === "dying") {
    if (g.lives > 0) {
      resetActors(g);
      setStatus(g, "ready", 1.2);
    } else {
      if (g.score > g.best) {
        g.best = g.score;
        try { localStorage.setItem(BEST_KEY, String(g.best)); } catch { /* storage unavailable */ }
      }
      setStatus(g, "over");
    }
  } else if (g.status === "cleared") {
    g.level++;
    newLevel(g);
    resetActors(g);
    setStatus(g, "ready", 1.4);
  }
}

function move<T extends Mover>(e: T, dist: number, choose: (e: T) => void, arrive: (e: T) => void) {
  let guard = 0;
  while (dist > 1e-6 && guard++ < 8) {
    if (e.prog === 0) {
      choose(e);
      if (!e.dx && !e.dy) return;
    }
    const step = Math.min(dist, 1 - e.prog);
    e.prog += step;
    dist -= step;
    if (e.prog >= 1 - 1e-6) {
      e.tx = wrapX(e.tx + e.dx);
      e.ty += e.dy;
      e.prog = 0;
      arrive(e);
    }
  }
}

function chooseBunny(b: Bunny) {
  const open = (d: Dir) => canMove(b.tx + d.x, b.ty + d.y, false);
  if ((b.want.x || b.want.y) && open(b.want)) {
    b.dx = b.want.x;
    b.dy = b.want.y;
  } else if (!open({ x: b.dx, y: b.dy })) {
    b.dx = 0;
    b.dy = 0;
  }
  if (b.dx || b.dy) b.face = { x: b.dx, y: b.dy };
}

function eat(g: Game, b: Bunny) {
  const p = g.pellets[b.ty][b.tx];
  if (!p) return;
  g.pellets[b.ty][b.tx] = 0;
  g.left--;
  g.dirty = true;
  if (p === 2) {
    g.score += 50;
    g.scared = Math.max(3, 8 - (g.level - 1));
    g.combo = 0;
    for (const r of g.robots) if (r.mode === "roam" || r.mode === "leave") r.fright = true;
  } else {
    g.score += 10;
  }
  if (g.left === 0) setStatus(g, "cleared", 1.6);
}

function chooseRobot(g: Game, r: Robot) {
  const gate = r.mode === "eyes" || r.mode === "leave";
  const opts = DIRS.filter((d) => canMove(r.tx + d.x, r.ty + d.y, gate));
  if (!opts.length) { r.dx = 0; r.dy = 0; return; }
  const noBack = opts.filter((d) => !(d.x === -r.dx && d.y === -r.dy));
  const cands = noBack.length ? noBack : opts;
  const dist = (d: Dir) => {
    const nx = r.tx + d.x, ny = r.ty + d.y;
    if (r.mode === "eyes") return DIST_HOME[ny][wrapX(nx)];
    if (r.mode === "leave") return DIST_EXIT[ny][wrapX(nx)];
    return (nx - g.bunny.tx) ** 2 + (ny - g.bunny.ty) ** 2;
  };
  let pick: Dir;
  if (r.mode === "eyes" || r.mode === "leave") {
    pick = opts.reduce((a, c) => (dist(c) < dist(a) ? c : a));
  } else if (Math.random() < (r.fright ? 0.35 : r.chase)) {
    pick = cands.reduce((a, c) => ((r.fright ? dist(c) > dist(a) : dist(c) < dist(a)) ? c : a));
  } else {
    pick = cands[Math.floor(Math.random() * cands.length)];
  }
  r.dx = pick.x;
  r.dy = pick.y;
}

function arriveRobot(r: Robot) {
  if (r.mode === "leave" && r.tx === 9 && r.ty === 7) r.mode = "roam";
  if (r.mode === "eyes" && r.tx === 9 && r.ty === 9) r.mode = "leave";
}

const pos = (m: Mover) => ({ x: (m.tx + m.dx * m.prog + 0.5) * TS, y: (m.ty + m.dy * m.prog + 0.5) * TS });

function update(g: Game, dt: number) {
  g.t += dt;
  for (const p of g.pops) p.life -= dt;
  g.pops = g.pops.filter((p) => p.life > 0);

  if (g.status === "ready" || g.status === "dying" || g.status === "cleared") {
    g.timer -= dt;
    if (g.timer <= 0) advance(g);
    return;
  }
  if (g.status !== "playing") return;

  if (g.scared > 0) {
    g.scared -= dt;
    if (g.scared <= 0) for (const r of g.robots) r.fright = false;
  }

  const b = g.bunny;
  move(b, BUNNY_SPEED * dt, chooseBunny, (m) => eat(g, m));
  if (g.status !== "playing") return;

  const base = Math.min(5.9, 4.6 + 0.3 * (g.level - 1));
  for (const r of g.robots) {
    if (r.mode === "pen") {
      r.release -= dt;
      if (r.release <= 0) r.mode = "leave";
      continue;
    }
    const speed = r.mode === "eyes" ? 11 : r.mode === "leave" ? 4 : r.fright ? 3.2 : base;
    move(r, speed * dt, (m) => chooseRobot(g, m), arriveRobot);
  }

  const bp = pos(b);
  for (const r of g.robots) {
    if (r.mode === "pen" || r.mode === "eyes") continue;
    const rp = pos(r);
    if (Math.hypot(rp.x - bp.x, rp.y - bp.y) > TS * 0.62) continue;
    if (r.fright) {
      r.mode = "eyes";
      r.fright = false;
      g.combo++;
      const pts = 100 * 2 ** g.combo;
      g.score += pts;
      g.pops.push({ x: rp.x, y: rp.y, text: String(pts), life: 0.9 });
      g.dirty = true;
    } else {
      g.lives--;
      setStatus(g, "dying", 1.3);
      break;
    }
  }
}

/* ------------------------------- rendering ------------------------------- */

function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function buildWalls(dpr: number) {
  const cv = document.createElement("canvas");
  cv.width = W * dpr;
  cv.height = H * dpr;
  const c = cv.getContext("2d")!;
  c.scale(dpr, dpr);
  const isWall = (x: number, y: number) => y >= 0 && y < ROWS && x >= 0 && x < COLS && MAP[y][x] === "#";
  const layer = (pad: number, color: string) => {
    c.fillStyle = color;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!isWall(x, y)) continue;
        const px = x * TS, py = y * TS, s = TS - 2 * pad;
        c.fillRect(px + pad, py + pad, s, s);
        if (isWall(x + 1, y)) c.fillRect(px + TS - pad, py + pad, 2 * pad, s);
        if (isWall(x, y + 1)) c.fillRect(px + pad, py + TS - pad, s, 2 * pad);
        if (isWall(x + 1, y) && isWall(x, y + 1) && isWall(x + 1, y + 1)) c.fillRect(px + TS - pad, py + TS - pad, 2 * pad, 2 * pad);
      }
    }
  };
  layer(2, HEDGE_EDGE);
  layer(4, HEDGE);
  return cv;
}

function drawCarrot(c: Ctx, x: number, y: number, s: number) {
  c.save();
  c.translate(x, y);
  c.rotate(0.55);
  c.fillStyle = CARROT;
  c.beginPath();
  c.moveTo(-s * 0.34, -s * 0.5);
  c.lineTo(s * 0.34, -s * 0.5);
  c.lineTo(0, s * 0.8);
  c.closePath();
  c.fill();
  c.fillStyle = LEAF;
  for (const a of [-0.45, 0.45]) {
    c.beginPath();
    c.ellipse(a * s * 0.45, -s * 0.78, s * 0.13, s * 0.3, a, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

function drawBunny(c: Ctx, x: number, y: number, face: Dir, t: number, moving: boolean, die: number) {
  c.save();
  c.translate(x, y);
  if (die > 0) {
    c.rotate(die * Math.PI * 5);
    c.scale(1 - die * 0.9, 1 - die * 0.9);
  }
  c.scale(0.95, 0.95);
  c.translate(0, moving ? -Math.abs(Math.sin(t * 16)) * 1.6 : 0);
  const wig = moving ? Math.sin(t * 16) * 0.12 : Math.sin(t * 2.5) * 0.05;
  for (const s of [-1, 1]) {
    c.save();
    c.translate(s * 4, -6);
    c.rotate(s * (0.2 + wig));
    c.fillStyle = CREAM;
    c.beginPath();
    c.ellipse(0, -6, 3.2, 7.5, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = PINK;
    c.beginPath();
    c.ellipse(0, -5.5, 1.5, 5, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  c.fillStyle = CREAM;
  c.beginPath();
  c.arc(0, 1, 9, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(255,150,180,0.55)";
  for (const s of [-1, 1]) {
    c.beginPath();
    c.arc(s * 5.6, 4, 1.9, 0, Math.PI * 2);
    c.fill();
  }
  for (const s of [-1, 1]) {
    const ex = s * 3.3 + face.x * 1.1, ey = -0.8 + face.y * 1.1;
    c.fillStyle = "#2b2d42";
    c.beginPath();
    c.arc(ex, ey, 1.7, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#fff";
    c.beginPath();
    c.arc(ex + 0.5, ey - 0.5, 0.5, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = "#ff7b9c";
  c.beginPath();
  c.ellipse(face.x * 0.8, 3 + face.y * 0.8, 1.5, 1, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#8d5a5a";
  c.lineWidth = 0.9;
  for (const s of [-1.2, 1.2]) {
    c.beginPath();
    c.arc(s, 5.1, 1.2, 0, Math.PI);
    c.stroke();
  }
  c.strokeStyle = "rgba(255,255,255,0.75)";
  c.lineWidth = 0.7;
  for (const s of [-1, 1]) {
    for (const k of [-1, 1]) {
      c.beginPath();
      c.moveTo(s * 6.5, 3.5);
      c.lineTo(s * 12, 3.5 + k * 1.6);
      c.stroke();
    }
  }
  c.restore();
}

function drawRobot(c: Ctx, r: Robot, x: number, y: number, t: number, flash: boolean) {
  c.save();
  c.translate(x, y);
  if (r.mode === "eyes") {
    for (const s of [-1, 1]) {
      c.fillStyle = "#fff";
      c.beginPath();
      c.arc(s * 3.6, -1, 3.2, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#22d3ee";
      c.beginPath();
      c.arc(s * 3.6 + r.dx * 1.2, -1 + r.dy * 1.2, 1.5, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    return;
  }
  if (r.mode === "pen") c.translate(0, Math.sin(t * 6 + r.phase) * 1.5);
  const fright = r.fright;
  const step = Math.sin(t * 18 + r.phase) > 0;
  c.fillStyle = "#37474f";
  c.fillRect(-6, 7, 4, step ? 4.5 : 3);
  c.fillRect(2, 7, 4, step ? 3 : 4.5);
  c.strokeStyle = "#b0bec5";
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(0, -8);
  c.lineTo(0, -11.5);
  c.stroke();
  c.fillStyle = Math.sin(t * 7 + r.phase) > 0 ? "#ff5252" : "#8a2a2a";
  c.beginPath();
  c.arc(0, -12.5, 2, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = fright ? (flash ? "#f1f5ff" : "#3b5bdb") : r.hue;
  rr(c, -9, -8, 18, 16, 5);
  c.fill();
  c.fillStyle = "#90a4ae";
  c.fillRect(-11, -2, 2, 5);
  c.fillRect(9, -2, 2, 5);
  c.fillStyle = "#101820";
  rr(c, -6.5, -5, 13, 7, 3);
  c.fill();
  c.fillStyle = fright ? "#fff" : "#ffee58";
  for (const s of [-3, 3]) {
    c.beginPath();
    c.arc(s + r.dx * 1.2, -1.5 + r.dy, 1.6, 0, Math.PI * 2);
    c.fill();
  }
  c.lineWidth = 1;
  if (fright) {
    c.strokeStyle = flash ? "#e03131" : "#fff";
    c.beginPath();
    c.moveTo(-5, 5.5);
    c.lineTo(-2.5, 4);
    c.lineTo(0, 5.5);
    c.lineTo(2.5, 4);
    c.lineTo(5, 5.5);
    c.stroke();
  } else {
    c.strokeStyle = "#263238";
    c.beginPath();
    for (const s of [-3, 0, 3]) {
      c.moveTo(s, 4);
      c.lineTo(s, 6.5);
    }
    c.stroke();
  }
  c.restore();
}

function banner(c: Ctx, text: string) {
  c.font = `700 17px ui-rounded, "Trebuchet MS", system-ui, sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.lineWidth = 4;
  c.strokeStyle = BG;
  c.strokeText(text, W / 2, 11.5 * TS);
  c.fillStyle = "#ffb347";
  c.fillText(text, W / 2, 11.5 * TS);
}

function draw(c: Ctx, g: Game, walls: HTMLCanvasElement) {
  c.fillStyle = BG;
  c.fillRect(0, 0, W, H);
  c.drawImage(walls, 0, 0, W, H);
  c.fillStyle = PINK;
  c.fillRect(9 * TS + 2, 8 * TS + TS / 2 - 1.5, TS - 4, 3);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const p = g.pellets[y][x];
      if (p === 1) drawCarrot(c, (x + 0.5) * TS, (y + 0.5) * TS, 5);
      else if (p === 2) drawCarrot(c, (x + 0.5) * TS, (y + 0.5) * TS, 8 + Math.sin(g.t * 6) * 1.5);
    }
  }

  const b = g.bunny;
  const bp = pos(b);
  const die = g.status === "dying" ? 1 - g.timer / 1.3 : 0;
  drawBunny(c, bp.x, bp.y, b.face, g.t, (b.dx !== 0 || b.dy !== 0) && g.status === "playing", die);

  const flash = g.scared < 2 && Math.floor(g.t * 6) % 2 === 0;
  for (const r of g.robots) {
    const rp = pos(r);
    drawRobot(c, r, rp.x, rp.y, g.t, flash);
  }

  for (const p of g.pops) {
    c.globalAlpha = Math.min(1, p.life * 2);
    c.font = `700 12px ui-rounded, system-ui, sans-serif`;
    c.textAlign = "center";
    c.fillStyle = "#fff";
    c.fillText(p.text, p.x, p.y - (0.9 - p.life) * 18);
    c.globalAlpha = 1;
  }

  if (g.status === "ready") banner(c, "Ready!");
  if (g.status === "cleared") banner(c, "Garden cleared!");
}

/* -------------------------------- component -------------------------------- */

interface Props {
  /** Optional: shows an Exit button that calls this (e.g. return to the game pool menu). */
  onExit?: () => void;
}

const snap = (g: Game) => ({ score: g.score, best: g.best, lives: g.lives, level: g.level, status: g.status });

export default function BunnyMaze({ onExit }: Props) {
  const [g] = useState(makeGame);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [hud, setHud] = useState(() => snap(g));

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    const walls = buildWalls(dpr);

    try { g.best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch { /* storage unavailable */ }
    g.dirty = true;

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      update(g, dt);
      draw(ctx, g, walls);
      if (g.dirty) {
        g.dirty = false;
        setHud(snap(g));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onKey = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (KEYS[k]) {
        e.preventDefault();
        input(g, KEYS[k]);
      } else if (k === " " || k === "p" || k === "Escape") {
        e.preventDefault();
        togglePause(g);
      }
    };
    const onHide = () => { if (document.hidden && g.status === "playing") setStatus(g, "paused"); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [g]);

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => { swipe.current = { x: e.clientX, y: e.clientY }; };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = swipe.current;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    input(g, Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) });
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onUp = () => { swipe.current = null; };

  const click = (fn: () => void) => (e: ReactMouseEvent<HTMLButtonElement>) => {
    fn();
    e.currentTarget.blur();
  };

  const overlay =
    hud.status === "idle" ? (
      <>
        <h2 style={S.title}>Bunny Maze</h2>
        <p style={S.copy}>Nibble every carrot and dodge the robots. Big carrots make the robots wobble, so chase them down for bonus points.</p>
        <button style={S.btn} onClick={click(() => startGame(g))}>Play</button>
        <p style={S.hint}>Arrow keys or WASD to hop. Swipe on touch screens.</p>
      </>
    ) : hud.status === "paused" ? (
      <>
        <h2 style={S.title}>Paused</h2>
        <button style={S.btn} onClick={click(() => togglePause(g))}>Resume</button>
      </>
    ) : hud.status === "over" ? (
      <>
        <h2 style={S.title}>Game over</h2>
        <p style={S.copy}>Score {hud.score}. Best {hud.best}.</p>
        <button style={S.btn} onClick={click(() => startGame(g))}>Play again</button>
      </>
    ) : null;

  const canPause = hud.status === "playing" || hud.status === "paused";

  return (
    <div style={S.wrap}>
      <div style={S.hud}>
        <span style={S.pill}>Score {hud.score}</span>
        <span style={S.pill}>Level {hud.level}</span>
        <span style={S.pill} aria-label={`${hud.lives} lives left`}>{"🐰".repeat(Math.max(0, hud.lives))}</span>
        <span style={{ flex: 1 }} />
        {canPause && (
          <button style={S.small} onClick={click(() => togglePause(g))}>
            {hud.status === "paused" ? "Resume" : "Pause"}
          </button>
        )}
        {onExit && <button style={S.small} onClick={click(onExit)}>Exit</button>}
      </div>

      <div style={S.stage}>
        <canvas
          ref={canvasRef}
          style={S.canvas}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onUp}
        />
        {overlay && <div style={S.overlay}>{overlay}</div>}
      </div>

      <div style={S.hint}>Best {hud.best}. Space pauses.</div>
    </div>
  );
}

/* --------------------------------- styles --------------------------------- */

const FONT = `ui-rounded, "Nunito", "Trebuchet MS", system-ui, sans-serif`;
const S: Record<string, CSSProperties> = {
  wrap: {
    display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 480, margin: "0 auto",
    padding: 12, boxSizing: "border-box", background: "#0b1a13", borderRadius: 16, color: "#eaf7ee", fontFamily: FONT,
  },
  hud: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  pill: { background: "#15382a", borderRadius: 999, padding: "4px 12px", fontSize: 14, fontWeight: 700 },
  small: {
    background: "transparent", color: "#eaf7ee", border: "1px solid #4fb883", borderRadius: 999,
    padding: "4px 12px", fontSize: 13, fontFamily: FONT, cursor: "pointer",
  },
  stage: { position: "relative", width: "100%" },
  canvas: {
    display: "block", width: "100%", height: "auto", aspectRatio: `${W} / ${H}`, borderRadius: 12,
    background: BG, touchAction: "none", userSelect: "none",
  },
  overlay: {
    position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", gap: 12, padding: 24, textAlign: "center", borderRadius: 12,
    background: "rgba(11,26,19,0.86)",
  },
  title: { margin: 0, fontSize: 30, color: "#ffb347" },
  copy: { margin: 0, fontSize: 15, lineHeight: 1.5, maxWidth: 320 },
  hint: { margin: 0, fontSize: 13, opacity: 0.7, textAlign: "center" },
  btn: {
    background: CARROT, color: "#2a1400", border: "none", borderRadius: 12, padding: "10px 28px",
    fontSize: 17, fontWeight: 800, fontFamily: FONT, cursor: "pointer",
  },
};

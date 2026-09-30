import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

/**
 * FlappyBird.tsx
 * - Intro screen, then play with SPACE (or click / tap).
 * - Obstacles are four different characters (monster, ghost, slime, robot).
 * - Background: one mountain + drifting clouds.
 * - Music and sound effects are synthesized with the Web Audio API (no audio files needed).
 * - High score and mute setting are saved in localStorage.
 *
 * Keys: SPACE = flap / start / retry, M = mute, ESC = back to intro.
 *
 * Usage:  <FlappyBird onExit={() => setSelectedGame(null)} />
 */

const W = 400;
const H = 600;
const GROUND_H = 80;
const BIRD_X = 100;
const BIRD_R = 14;
const HIT_R = 11; // slightly forgiving hitbox against obstacles
const GRAVITY = 0.45;
const FLAP = -7.5;
const PIPE_W = 68;
// The gap between obstacles shrinks as the game goes on
const GAP_START = 165; // gap for the first obstacle
const GAP_MIN = 115; // never gets tighter than this
const GAP_STEP = 3; // pixels removed per obstacle
const PIPE_SPEED = 2.6;
const PIPE_INTERVAL = 95;
const HS_KEY = "flappybird:highscore";
const MUTE_KEY = "flappybird:muted";
const FONT = '"Fredoka", "Trebuchet MS", "Segoe UI", sans-serif';

type Status = "intro" | "ready" | "playing" | "over";
type Obstacle = { x: number; gapY: number; gap: number; scored: boolean; kind: number };
type Cloud = { x: number; y: number; s: number; v: number };

const readStore = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeStore = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
};

/* ------------------------------------------------------------------ */
/* Audio: tiny synth for music + sound effects                         */
/* ------------------------------------------------------------------ */

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
// 32 eighth-note steps, 0 = rest
const MELODY = [
  72, 0, 76, 0, 79, 0, 76, 0, 77, 0, 81, 0, 79, 0, 76, 0,
  74, 0, 77, 0, 81, 0, 77, 0, 76, 0, 74, 0, 72, 0, 0, 0,
];
const BASS = [48, 45, 53, 55, 48, 45, 53, 43]; // one per 4 steps

class AudioEngine {
  ctx: AudioContext | null = null;
  muted = readStore(MUTE_KEY) === "1";
  private master!: GainNode;
  private music!: GainNode;
  private fx!: GainNode;
  private timer: number | null = null;
  private step = 0;
  private next = 0;

  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx: AudioContext = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(ctx.destination);
      this.music = ctx.createGain();
      this.music.gain.value = 0.1;
      this.music.connect(this.master);
      this.fx = ctx.createGain();
      this.fx.gain.value = 0.35;
      this.fx.connect(this.master);
    }
    this.ctx.resume();
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType, dest: GainNode, vol: number, endFreq?: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    o.connect(g);
    g.connect(dest);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  startMusic() {
    if (!this.ctx || this.timer !== null) return;
    const ctx = this.ctx;
    this.next = ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => {
      while (this.next < ctx.currentTime + 0.2) {
        const s = this.step % 32;
        const note = MELODY[s];
        if (note) this.tone(midi(note), this.next, 0.18, "square", this.music, 0.5);
        if (s % 4 === 0) this.tone(midi(BASS[s / 4]), this.next, 0.36, "triangle", this.music, 0.9);
        this.step++;
        this.next += 0.2;
      }
    }, 50);
  }

  duck(on: boolean) {
    if (this.ctx) this.music.gain.setTargetAtTime(on ? 0.03 : 0.1, this.ctx.currentTime, 0.1);
  }

  setMuted(m: boolean) {
    this.muted = m;
    writeStore(MUTE_KEY, m ? "1" : "0");
    if (this.ctx) this.master.gain.value = m ? 0 : 1;
  }

  flap() {
    if (!this.ctx) return;
    this.tone(350, this.ctx.currentTime, 0.11, "square", this.fx, 0.5, 700);
  }
  start() {
    if (!this.ctx) return;
    this.tone(400, this.ctx.currentTime, 0.18, "triangle", this.fx, 0.6, 900);
  }
  score() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(880, t, 0.09, "square", this.fx, 0.4);
    this.tone(1320, t + 0.08, 0.14, "square", this.fx, 0.4);
  }
  hit() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 0.6;
    src.connect(g);
    g.connect(this.fx);
    src.start(t);
    this.tone(300, t, 0.4, "sawtooth", this.fx, 0.5, 60);
    this.tone(220, t + 0.25, 0.5, "triangle", this.fx, 0.4, 80);
  }

  dispose() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.ctx?.close();
    this.ctx = null;
  }
}

/* ------------------------------------------------------------------ */
/* Characters (obstacles)                                              */
/* ------------------------------------------------------------------ */

const PAL = [
  { body: "#9b6ae0", dark: "#4b2a85", light: "#b98cf0" }, // monster
  { body: "#f3f0ff", dark: "#8f88c4", light: "#ffffff" }, // ghost
  { body: "#62d26f", dark: "#2a8a3c", light: "#93eb9b" }, // slime
  { body: "#b5c2d6", dark: "#56637c", light: "#dbe4f0" }, // robot
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

interface Props {
  onExit?: () => void;
}

export default function FlappyBird({ onExit }: Props) {
  const canvasRef = useRefCompat<HTMLCanvasElement>();
  const [sfx] = useState(() => new AudioEngine());
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState<number>(() => Number(readStore(HS_KEY)) || 0);
  const [status, setStatus] = useState<Status>("intro");
  const [muted, setMuted] = useState<boolean>(sfx.muted);

  const game = useGameState();

  const reset = useCallback(() => {
    const g = game.current;
    g.birdY = H / 2 - 40;
    g.vel = 0;
    g.pipes = [];
    g.spawned = 0;
    g.frame = 0;
    g.score = 0;
    g.flapAnim = 0;
    setScore(0);
  }, [game]);

  const flap = useCallback(() => {
    const g = game.current;
    if (g.status === "intro") {
      sfx.init();
      sfx.startMusic();
      sfx.start();
      reset();
      g.status = "ready";
      setStatus("ready");
      return;
    }
    if (g.status === "over") {
      if (performance.now() - g.overAt < 500) return; // avoid instant restart
      sfx.duck(false);
      reset();
      g.status = "playing";
      setStatus("playing");
    } else if (g.status === "ready") {
      g.frame = 0;
      g.status = "playing";
      setStatus("playing");
    }
    g.vel = FLAP;
    g.flapAnim = 10;
    sfx.flap();
  }, [game, reset, sfx]);

  const toggleMute = useCallback(() => {
    sfx.setMuted(!sfx.muted);
    setMuted(sfx.muted);
  }, [sfx]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) flap();
      } else if (e.code === "KeyM") {
        toggleMute();
      } else if (e.code === "Escape") {
        const g = game.current;
        if (g.status !== "intro") {
          g.status = "intro";
          setStatus("intro");
          reset();
          sfx.duck(false);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flap, toggleMute, game, reset, sfx]);

  // Stop audio on unmount
  useEffect(() => () => sfx.dispose(), [sfx]);

  // Load the display font for the canvas text
  useEffect(() => {
    document.fonts?.load('700 20px "Fredoka"').catch(() => {});
  }, []);

  // Main loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    const endGame = () => {
      const g = game.current;
      g.status = "over";
      g.overAt = performance.now();
      setStatus("over");
      sfx.hit();
      sfx.duck(true);
      if (g.score > g.high) {
        g.high = g.score;
        setHighScore(g.score);
        writeStore(HS_KEY, String(g.score));
      }
    };

    const update = () => {
      const g = game.current;
      g.t++;
      g.groundX = (g.groundX - PIPE_SPEED) % 24;

      for (const c of g.clouds) {
        c.x -= c.v;
        if (c.x < -120 * c.s) {
          c.x = W + 40;
          c.y = 40 + Math.random() * 220;
        }
      }

      if (g.status === "intro" || g.status === "ready") {
        g.frame++;
        g.birdY = H / 2 - 40 + Math.sin(g.frame / 8) * 8;
        return;
      }
      if (g.status !== "playing") return;

      g.frame++;
      g.vel += GRAVITY;
      g.birdY += g.vel;
      if (g.flapAnim > 0) g.flapAnim--;

      if (g.frame % PIPE_INTERVAL === 1) {
        const gap = Math.max(GAP_MIN, GAP_START - g.spawned * GAP_STEP);
        g.spawned++;
        const min = 100;
        const max = H - GROUND_H - gap - 100;
        g.pipes.push({
          x: W + 10,
          gapY: min + Math.random() * (max - min),
          gap,
          scored: false,
          kind: Math.floor(Math.random() * 4),
        });
      }

      for (const p of g.pipes) {
        p.x -= PIPE_SPEED;
        if (!p.scored && p.x + PIPE_W < BIRD_X - BIRD_R) {
          p.scored = true;
          g.score++;
          setScore(g.score);
          sfx.score();
        }
      }
      g.pipes = g.pipes.filter((p) => p.x > -PIPE_W - 10);

      if (g.birdY + BIRD_R >= H - GROUND_H) {
        g.birdY = H - GROUND_H - BIRD_R;
        endGame();
        return;
      }
      if (g.birdY - BIRD_R <= 0) {
        g.birdY = BIRD_R;
        g.vel = 0;
      }
      for (const p of g.pipes) {
        const inX = BIRD_X + HIT_R > p.x && BIRD_X - HIT_R < p.x + PIPE_W;
        const inGap = g.birdY - HIT_R > p.gapY && g.birdY + HIT_R < p.gapY + p.gap;
        if (inX && !inGap) {
          endGame();
          return;
        }
      }
    };

    /* ---------- drawing helpers ---------- */

    const drawMountain = () => {
      const b = H - GROUND_H;
      ctx.fillStyle = "#7a80c4";
      ctx.beginPath();
      ctx.moveTo(60, b);
      ctx.lineTo(255, b - 250);
      ctx.lineTo(450, b);
      ctx.closePath();
      ctx.fill();
      // shaded side
      ctx.fillStyle = "#5d63a8";
      ctx.beginPath();
      ctx.moveTo(255, b - 250);
      ctx.lineTo(450, b);
      ctx.lineTo(310, b);
      ctx.lineTo(268, b - 120);
      ctx.closePath();
      ctx.fill();
      // snow cap
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(255, b - 250);
      ctx.lineTo(212, b - 185);
      ctx.lineTo(234, b - 196);
      ctx.lineTo(250, b - 172);
      ctx.lineTo(272, b - 194);
      ctx.lineTo(300, b - 185);
      ctx.closePath();
      ctx.fill();
      // haze at the foot
      const haze = ctx.createLinearGradient(0, b - 90, 0, b);
      haze.addColorStop(0, "rgba(255,226,184,0)");
      haze.addColorStop(1, "rgba(255,226,184,0.85)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, b - 90, W, 90);
    };

    const drawCloud = (c: Cloud) => {
      const { x, y, s } = c;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(x, y, 18 * s, 0, Math.PI * 2);
      ctx.arc(x + 20 * s, y - 8 * s, 23 * s, 0, Math.PI * 2);
      ctx.arc(x + 44 * s, y, 17 * s, 0, Math.PI * 2);
      ctx.arc(x + 22 * s, y + 6 * s, 16 * s, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawCreature = (p: Obstacle, top: boolean) => {
      const g = game.current;
      const kind = top ? p.kind : (p.kind + 2) % 4;
      const C = PAL[kind];
      const edgeY = top ? p.gapY : p.gapY + p.gap;
      const len = (top ? edgeY : H - edgeY) + 20;
      const cx = p.x + PIPE_W / 2 + Math.sin(g.t / 25 + p.kind) * 1.5;

      // where the bird is, in the creature's local space (so eyes follow it)
      let lx = BIRD_X - cx;
      let ly = g.birdY - edgeY;
      if (top) {
        lx = -lx;
        ly = -ly;
      }
      const d = Math.hypot(lx, ly) || 1;
      const lookX = (lx / d) * 3;
      const lookY = (ly / d) * 3;

      const eye = (x: number, y: number, r: number) => {
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#222";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#1b1b1b";
        ctx.beginPath();
        ctx.arc(x + (lookX * r) / 8, y + (lookY * r) / 8, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
      };

      ctx.save();
      ctx.translate(cx, edgeY);
      if (top) ctx.rotate(Math.PI); // hangs from the ceiling

      // body
      ctx.fillStyle = C.body;
      ctx.strokeStyle = C.dark;
      ctx.lineWidth = 3;
      ctx.fillRect(-26, 48, 52, len - 48);
      ctx.strokeRect(-26, 48, 52, len - 48);
      ctx.fillStyle = C.light;
      ctx.fillRect(-19, 48, 6, len - 48);
      for (let y = 92; y < len; y += 46) {
        if (kind === 0) {
          ctx.fillStyle = C.dark;
          ctx.beginPath();
          ctx.arc(8, y, 6, 0, Math.PI * 2);
          ctx.arc(-10, y + 18, 4, 0, Math.PI * 2);
          ctx.fill();
        } else if (kind === 1) {
          ctx.fillStyle = "rgba(143,136,196,0.35)";
          ctx.fillRect(-26, y, 52, 8);
        } else if (kind === 2) {
          ctx.fillStyle = C.light;
          ctx.beginPath();
          ctx.arc(6, y, 5, 0, Math.PI * 2);
          ctx.arc(-8, y + 16, 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = C.dark;
          ctx.fillRect(-26, y + 14, 52, 3);
          ctx.beginPath();
          ctx.arc(-18, y, 3, 0, Math.PI * 2);
          ctx.arc(18, y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // head
      ctx.fillStyle = C.body;
      ctx.strokeStyle = C.dark;
      ctx.lineWidth = 3;
      if (kind === 0) {
        // monster with horns
        ctx.fillStyle = "#f5d76e";
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(s * 24, 24);
          ctx.lineTo(s * 20, 2);
          ctx.lineTo(s * 8, 16);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.fillStyle = C.body;
        ctx.beginPath();
        ctx.arc(0, 48, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        eye(-12, 42, 8);
        eye(12, 42, 8);
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.moveTo(-14, 58);
        ctx.lineTo(14, 58);
        ctx.lineTo(10, 68);
        ctx.lineTo(-10, 68);
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (kind === 1) {
        // ghost
        ctx.beginPath();
        ctx.arc(0, 14, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 48, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#2b2b3a";
        ctx.beginPath();
        ctx.ellipse(-11 + lookX * 0.6, 44 + lookY * 0.6, 5, 7, 0, 0, Math.PI * 2);
        ctx.ellipse(11 + lookX * 0.6, 44 + lookY * 0.6, 5, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,140,160,0.6)";
        ctx.beginPath();
        ctx.arc(-22, 56, 5, 0, Math.PI * 2);
        ctx.arc(22, 56, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2b2b3a";
        ctx.beginPath();
        ctx.ellipse(0, 62, 4, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === 2) {
        // one-eyed slime
        ctx.beginPath();
        ctx.arc(0, 15, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 48, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        eye(0, 44, 14);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 58, 9, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      } else {
        // robot
        ctx.beginPath();
        ctx.moveTo(0, 14);
        ctx.lineTo(0, 5);
        ctx.stroke();
        ctx.fillStyle = Math.floor(g.t / 20) % 2 ? "#ff4d4d" : "#8a2a2a";
        ctx.beginPath();
        ctx.arc(0, 5, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.body;
        ctx.fillRect(-32, 14, 64, 66);
        ctx.strokeRect(-32, 14, 64, 66);
        ctx.fillStyle = "#222";
        ctx.fillRect(-25, 32, 18, 14);
        ctx.fillRect(7, 32, 18, 14);
        ctx.fillStyle = "#ffde59";
        ctx.beginPath();
        ctx.arc(-16 + lookX, 39 + lookY * 0.6, 4, 0, Math.PI * 2);
        ctx.arc(16 + lookX, 39 + lookY * 0.6, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.dark;
        for (let i = 0; i < 4; i++) ctx.fillRect(-16 + i * 9, 58, 5, 14);
      }
      ctx.restore();
    };

    const drawBird = () => {
      const g = game.current;
      const tilt = g.status === "playing" || g.status === "over" ? Math.max(-0.5, Math.min(1.2, g.vel * 0.08)) : 0;
      ctx.save();
      ctx.translate(BIRD_X, g.birdY);
      ctx.rotate(tilt);
      ctx.fillStyle = "#ffd23f";
      ctx.beginPath();
      ctx.ellipse(0, 0, BIRD_R + 3, BIRD_R, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#b8860b";
      ctx.lineWidth = 2;
      ctx.stroke();
      const wingUp = g.status === "ready" ? Math.sin(g.frame / 3) > 0 : g.flapAnim > 5 || (g.vel < 0 && g.frame % 6 < 3);
      ctx.fillStyle = "#f4a300";
      ctx.beginPath();
      ctx.ellipse(-4, wingUp ? -3 : 4, 8, 5, wingUp ? -0.5 : 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(8, -5, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(10, -5, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ff6b35";
      ctx.beginPath();
      ctx.moveTo(14, -1);
      ctx.lineTo(24, 2);
      ctx.lineTo(14, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const text = (t: string, y: number, size: number, color = "#fff") => {
      ctx.font = `700 ${size}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.lineJoin = "round";
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#1b1b2b";
      ctx.strokeText(t, W / 2, y);
      ctx.fillStyle = color;
      ctx.fillText(t, W / 2, y);
    };

    const render = () => {
      const g = game.current;
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#58b6d8");
      sky.addColorStop(0.7, "#bfe6ee");
      sky.addColorStop(1, "#ffe2b8");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      drawMountain();
      g.clouds.forEach(drawCloud);

      g.pipes.forEach((p) => {
        drawCreature(p, true);
        drawCreature(p, false);
      });

      // ground
      ctx.fillStyle = "#e3d597";
      ctx.fillRect(0, H - GROUND_H, W, GROUND_H);
      ctx.fillStyle = "#73bf2e";
      ctx.fillRect(0, H - GROUND_H, W, 14);
      ctx.fillStyle = "#5a9a22";
      for (let x = g.groundX; x < W; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, H - GROUND_H);
        ctx.lineTo(x + 12, H - GROUND_H);
        ctx.lineTo(x + 24, H - GROUND_H + 14);
        ctx.lineTo(x + 12, H - GROUND_H + 14);
        ctx.closePath();
        ctx.fill();
      }

      if (g.status !== "intro") drawBird();

      if (g.status === "playing" || g.status === "over") text(String(g.score), 82, 54);
      if (g.status === "ready") {
        text("Get ready!", 210, 44, "#ffd23f");
        text("Press SPACE to flap", 262, 22);
      }
      if (g.status === "over") {
        ctx.fillStyle = "rgba(15,20,50,0.55)";
        ctx.fillRect(0, 0, W, H);
        text("Game over", 210, 48, "#ff7a7a");
        text(`Score ${g.score}`, 272, 30);
        text(`Best ${g.high}`, 314, 30, "#ffd23f");
        text("SPACE to retry  ·  ESC for menu", 384, 18);
      }
    };

    const loop = () => {
      update();
      render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, game, sfx]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 16, fontFamily: FONT }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;700&display=swap');
        @keyframes fb-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-14px) } }
        @keyframes fb-flap { from { transform: rotate(-25deg) } to { transform: rotate(20deg) } }
        @keyframes fb-pulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.06) } }
        .fb-float { animation: fb-float 1.8s ease-in-out infinite }
        .fb-wing { transform-box: fill-box; transform-origin: 80% 30%; animation: fb-flap .35s ease-in-out infinite alternate }
        .fb-play { animation: fb-pulse 1.4s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .fb-float, .fb-wing, .fb-play { animation: none } }
      `}</style>

      <div style={{ display: "flex", width: "100%", maxWidth: W, justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        {onExit ? (
          <button onClick={onExit} style={btn}>
            ← Back
          </button>
        ) : (
          <span />
        )}
        <span style={{ fontWeight: 700 }}>
          Score {score} &nbsp;|&nbsp; Best {highScore}
        </span>
        <button onClick={toggleMute} style={btn} aria-label={muted ? "Unmute sound" : "Mute sound"} title="Toggle sound (M)">
          {muted ? "🔇" : "🔊"}
        </button>
      </div>

      <div style={{ position: "relative", width: "100%", maxWidth: W }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onPointerDown={flap}
          style={{
            display: "block",
            width: "100%",
            borderRadius: 14,
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            cursor: "pointer",
            touchAction: "manipulation",
          }}
          aria-label={`Flappy Bird game, ${status}`}
        />

        {status === "intro" && (
          <div
            onPointerDown={flap}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 14,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              background: "rgba(20,30,70,0.28)",
              cursor: "pointer",
              textAlign: "center",
              color: "#fff",
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: 52,
                lineHeight: 1,
                color: "#ffd23f",
                WebkitTextStroke: "7px #1b1b2b",
                paintOrder: "stroke fill",
                letterSpacing: 1,
              }}
            >
              Flappy
              <br />
              Bird
            </h1>

            <div className="fb-float">
              <svg width="110" height="86" viewBox="0 0 60 46" aria-hidden="true">
                <ellipse cx="30" cy="24" rx="20" ry="16" fill="#ffd23f" stroke="#b8860b" strokeWidth="2" />
                <ellipse className="fb-wing" cx="24" cy="27" rx="9" ry="6" fill="#f4a300" />
                <circle cx="40" cy="18" r="6" fill="#fff" />
                <circle cx="42" cy="18" r="2.5" fill="#111" />
                <polygon points="48,22 60,26 48,31" fill="#ff6b35" />
              </svg>
            </div>

            <p style={{ margin: 0, fontSize: 18, fontWeight: 500, textShadow: "0 2px 6px rgba(0,0,0,0.5)", maxWidth: 260 }}>
              Slip between the monsters, ghosts, slimes and robots.
            </p>

            <button
              className="fb-play"
              onKeyDown={(e) => {
                if (e.key === "Enter") flap();
              }}
              style={{
                fontFamily: FONT,
                fontSize: 26,
                fontWeight: 700,
                padding: "10px 44px",
                borderRadius: 999,
                border: "4px solid #1b1b2b",
                background: "#73bf2e",
                color: "#fff",
                cursor: "pointer",
                boxShadow: "0 5px 0 #1b1b2b",
              }}
            >
              Play
            </button>

            <div style={{ fontSize: 15, textShadow: "0 2px 6px rgba(0,0,0,0.5)" }}>
              {highScore > 0 && <div style={{ fontWeight: 700, color: "#ffd23f", fontSize: 18 }}>Best {highScore}</div>}
              <div>Space to flap · M to mute</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small internal hooks                                                */
/* ------------------------------------------------------------------ */

function useRefCompat<T>() {
  return useRef<T>(null);
}

function useGameState() {
  return useRef({
    status: "intro" as Status,
    birdY: H / 2 - 40,
    vel: 0,
    pipes: [] as Obstacle[],
    spawned: 0,
    frame: 0,
    t: 0,
    score: 0,
    high: Number(readStore(HS_KEY)) || 0,
    groundX: 0,
    flapAnim: 0,
    overAt: 0,
    clouds: [
      { x: 60, y: 90, s: 1, v: 0.25 },
      { x: 250, y: 160, s: 0.7, v: 0.15 },
      { x: 380, y: 60, s: 0.85, v: 0.2 },
      { x: 150, y: 235, s: 0.6, v: 0.12 },
      { x: 320, y: 270, s: 0.75, v: 0.18 },
    ] as Cloud[],
  });
}

const btn: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #999",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 600,
  fontFamily: FONT,
};

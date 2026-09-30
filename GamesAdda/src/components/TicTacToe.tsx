import { useState, useEffect, useMemo } from "react";
import type { CSSProperties } from "react";

/* ---------- types ---------- */
type PlayerMark = "X" | "O";
type Cell = PlayerMark | null;
type BoardSize = 3 | 5;
type Mode = "cpu" | "pvp";
type WinInfo = { mark: PlayerMark; line: number[] };
type Result = ({ type: "win" } & WinInfo) | { type: "draw" } | null;
type Scores = { X: number; O: number; draws: number };

/* ---------- game config & logic ---------- */
// 3x3 needs 3 in a row, 5x5 needs 4 in a row (3 in a row on 5x5 is too easy)
const WIN_LENGTH: Record<BoardSize, number> = { 3: 3, 5: 4 };

function buildLines(size: number, win: number): number[][] {
  const lines: number[][] = [];
  const dirs: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      for (const [dr, dc] of dirs) {
        const er = r + dr * (win - 1);
        const ec = c + dc * (win - 1);
        if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
        lines.push(Array.from({ length: win }, (_, i) => (r + dr * i) * size + (c + dc * i)));
      }
  return lines;
}

function getWinner(board: Cell[], lines: number[][]): WinInfo | null {
  for (const l of lines) {
    const v = board[l[0]];
    if (v && l.every((i) => board[i] === v)) return { mark: v, line: l };
  }
  return null;
}

// Perfect play for 3x3
function minimax(
  board: Cell[], lines: number[][], turn: PlayerMark, ai: PlayerMark,
  depth: number, alpha: number, beta: number
): number {
  const w = getWinner(board, lines);
  if (w) return w.mark === ai ? 10 - depth : depth - 10;
  if (board.every(Boolean)) return 0;
  const human: PlayerMark = ai === "X" ? "O" : "X";
  const maximizing = turn === ai;
  let best = maximizing ? -Infinity : Infinity;
  for (let i = 0; i < board.length; i++) {
    if (board[i]) continue;
    board[i] = turn;
    const s = minimax(board, lines, maximizing ? human : ai, ai, depth + 1, alpha, beta);
    board[i] = null;
    if (maximizing) { best = Math.max(best, s); alpha = Math.max(alpha, best); }
    else { best = Math.min(best, s); beta = Math.min(beta, best); }
    if (beta <= alpha) break;
  }
  return best;
}

// Window-scoring heuristic for 5x5 (win > block > build > centre)
function heuristicScore(
  board: Cell[], lines: number[][], size: number, i: number,
  me: PlayerMark, foe: PlayerMark, win: number
): number {
  let score = 0;
  for (const l of lines) {
    if (!l.includes(i)) continue;
    let mine = 0, theirs = 0;
    for (const j of l) { if (board[j] === me) mine++; else if (board[j] === foe) theirs++; }
    if (mine && theirs) continue;
    if (mine === win - 1) score += 10000;
    else if (theirs === win - 1) score += 5000;
    else if (mine) score += [1, 4, 30][mine - 1] ?? 30;
    else if (theirs) score += [1, 3, 20][theirs - 1] ?? 20;
    else score += 0.5;
  }
  const mid = (size - 1) / 2;
  const d = Math.abs(i % size - mid) + Math.abs(Math.floor(i / size) - mid);
  return score - d * 0.3 + Math.random() * 0.4;
}

function pickMove(board: Cell[], lines: number[][], size: number, ai: PlayerMark): number {
  const foe: PlayerMark = ai === "X" ? "O" : "X";
  const empty = board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (size === 3) {
    let best = -Infinity;
    let moves: number[] = [];
    for (const i of empty) {
      const b = board.slice();
      b[i] = ai;
      const s = minimax(b, lines, foe, ai, 1, -Infinity, Infinity);
      if (s > best) { best = s; moves = [i]; } else if (s === best) moves.push(i);
    }
    return moves[Math.floor(Math.random() * moves.length)] ?? empty[0];
  }
  let best = -Infinity, move = empty[0];
  for (const i of empty) {
    const s = heuristicScore(board, lines, size, i, ai, foe, WIN_LENGTH[size as BoardSize]);
    if (s > best) { best = s; move = i; }
  }
  return move;
}

/* ---------- marks ---------- */
function Mark({ mark, className = "" }: { mark: PlayerMark; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={`ttt-mark ${mark === "X" ? "is-x" : "is-o"} ${className}`} aria-hidden="true">
      {mark === "X" ? (
        <>
          <path d="M26 26 L74 74" pathLength="1" />
          <path d="M74 26 L26 74" pathLength="1" style={{ animationDelay: "0.12s" }} />
        </>
      ) : (
        <circle cx="50" cy="50" r="26" pathLength="1" />
      )}
    </svg>
  );
}

/* ---------- component ---------- */
export default function TicTacToe() {
  const [size, setSize] = useState<BoardSize>(3);
  const [mode, setMode] = useState<Mode>("cpu");
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<PlayerMark>("X"); // X (player one) always starts
  const [result, setResult] = useState<Result>(null);
  const [scores, setScores] = useState<Scores>({ X: 0, O: 0, draws: 0 });
  const [round, setRound] = useState(0);

  const lines = useMemo(() => buildLines(size, WIN_LENGTH[size]), [size]);
  const names: Record<PlayerMark, string> = mode === "cpu" ? { X: "You", O: "Computer" } : { X: "Player 1", O: "Player 2" };
  const cpuTurn = mode === "cpu" && turn === "O" && !result;

  const newRound = (s: number = size) => {
    setBoard(Array(s * s).fill(null));
    setTurn("X");
    setResult(null);
    setRound((r) => r + 1);
  };

  const configure = (nextSize: BoardSize, nextMode: Mode) => {
    setSize(nextSize);
    setMode(nextMode);
    setScores({ X: 0, O: 0, draws: 0 });
    newRound(nextSize);
  };

  const play = (i: number) => {
    if (board[i] || result) return;
    const next = board.slice();
    next[i] = turn;
    setBoard(next);
    const w = getWinner(next, lines);
    if (w) {
      setResult({ type: "win", ...w });
      setScores((s) => ({ ...s, [w.mark]: s[w.mark] + 1 }));
    } else if (next.every(Boolean)) {
      setResult({ type: "draw" });
      setScores((s) => ({ ...s, draws: s.draws + 1 }));
    } else {
      setTurn(turn === "X" ? "O" : "X");
    }
  };

  // computer move
  useEffect(() => {
    if (!cpuTurn) return;
    const t = setTimeout(() => play(pickMove(board, lines, size, "O")), 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpuTurn, board]);

  const status = result
    ? result.type === "win" ? `${names[result.mark]} ${names[result.mark] === "You" ? "win" : "wins"}!` : "It's a draw"
    : cpuTurn ? "Computer is thinking…" : names[turn] === "You" ? "Your move" : `${names[turn]}'s move`;

  const winSet = new Set<number>(result?.type === "win" ? result.line : []);
  let winLine: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (result?.type === "win") {
    const a = result.line[0], b = result.line[result.line.length - 1];
    winLine = {
      x1: (a % size) + 0.5, y1: Math.floor(a / size) + 0.5,
      x2: (b % size) + 0.5, y2: Math.floor(b / size) + 0.5,
    };
  }

  return (
    <div className="ttt">
      <style>{CSS}</style>

      <h1 className="ttt-title">Tic Tac Toe</h1>

      <div className="ttt-controls">
        <div className="ttt-seg" role="group" aria-label="Board size">
          {([3, 5] as BoardSize[]).map((s) => (
            <button key={s} className={size === s ? "on" : ""} onClick={() => size !== s && configure(s, mode)}>
              {s}×{s}
            </button>
          ))}
        </div>
        <div className="ttt-seg" role="group" aria-label="Opponent">
          <button className={mode === "cpu" ? "on" : ""} onClick={() => mode !== "cpu" && configure(size, "cpu")}>vs Computer</button>
          <button className={mode === "pvp" ? "on" : ""} onClick={() => mode !== "pvp" && configure(size, "pvp")}>vs Friend</button>
        </div>
      </div>

      <div className="ttt-scores">
        {(["X", "O"] as PlayerMark[]).map((m) => (
          <div key={m} className={`ttt-score ${!result && turn === m ? "active" : ""} ${m === "X" ? "sx" : "so"}`}>
            <Mark mark={m} className="static" />
            <span className="nm">{names[m]}</span>
            <b key={scores[m]} className="pts">{scores[m]}</b>
          </div>
        ))}
      </div>

      <div
        key={`${size}-${round}`}
        className={`ttt-board ${result?.type === "draw" ? "shake" : ""} ${cpuTurn ? "locked" : ""}`}
        style={{ "--n": size } as CSSProperties}
      >
        {board.map((v, i) => (
          <button
            key={i}
            className={`ttt-cell ${v ? "filled" : ""} ${winSet.has(i) ? "win" : ""} ${result?.type === "win" && !winSet.has(i) ? "dim" : ""}`}
            style={{ "--i": i } as CSSProperties}
            onClick={() => play(i)}
            disabled={!!v || !!result || cpuTurn}
            aria-label={`Row ${Math.floor(i / size) + 1}, column ${(i % size) + 1}${v ? `, ${v}` : ""}`}
          >
            <span className="tile" />
            {v ? <Mark mark={v} /> : <Mark mark={turn} className="ghost" />}
          </button>
        ))}
        {winLine && (
          <svg className="ttt-winline" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
            <line {...winLine} pathLength="1" />
          </svg>
        )}
      </div>

      <div className={`ttt-status ${result ? "done" : ""}`} key={status} role="status">{status}</div>

      <div className="ttt-actions">
        {result && <button className="primary" onClick={() => newRound()}>Play again</button>}
        <button onClick={() => setScores({ X: 0, O: 0, draws: 0 })}>Reset scores</button>
      </div>
      <p className="ttt-foot">
        {WIN_LENGTH[size]} in a row wins · Draws: {scores.draws}
      </p>
    </div>
  );
}

/* ---------- styles ---------- */
const CSS = `
.ttt{--bg:#14112b;--tile:#231e48;--tile2:#2c2658;--ink:#f3f0ff;--mute:#9a93c9;--x:#ff4f9a;--o:#3de0c5;--gold:#ffd166;
  min-height:100%;box-sizing:border-box;padding:28px 16px 36px;display:flex;flex-direction:column;align-items:center;gap:18px;
  background:radial-gradient(120% 80% at 50% 0%,#241d52 0%,var(--bg) 60%);color:var(--ink);
  font-family:"Avenir Next","Trebuchet MS",system-ui,sans-serif}
.ttt *{box-sizing:border-box}
.ttt-title{margin:0;font-size:clamp(28px,6vw,40px);font-weight:800;letter-spacing:-.02em}
.ttt button{font:inherit;color:inherit;cursor:pointer}
.ttt button:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
.ttt-controls{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}
.ttt-seg{display:flex;background:var(--tile);border-radius:999px;padding:4px}
.ttt-seg button{border:0;background:transparent;padding:8px 16px;border-radius:999px;font-weight:600;color:var(--mute);transition:background .25s,color .25s,transform .15s}
.ttt-seg button:active{transform:scale(.95)}
.ttt-seg button.on{background:var(--ink);color:var(--bg)}
.ttt-scores{display:flex;gap:12px;width:min(92vw,440px)}
.ttt-score{flex:1;display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:16px;background:var(--tile);border:2px solid transparent;transition:border-color .3s,transform .3s,box-shadow .3s}
.ttt-score.active.sx{border-color:var(--x);box-shadow:0 0 22px -4px var(--x);transform:translateY(-3px)}
.ttt-score.active.so{border-color:var(--o);box-shadow:0 0 22px -4px var(--o);transform:translateY(-3px)}
.ttt-score .ttt-mark{width:26px;height:26px;flex:none}
.ttt-score .nm{font-weight:600;font-size:14px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ttt-score .pts{font-size:22px;animation:pop .45s cubic-bezier(.3,1.6,.5,1)}

.ttt-board{position:relative;width:min(92vw,440px);aspect-ratio:1;display:grid;grid-template-columns:repeat(var(--n),1fr);grid-template-rows:repeat(var(--n),1fr)}
.ttt-board.shake{animation:shake .5s}
.ttt-cell{position:relative;border:0;background:none;padding:0;perspective:400px}
.ttt-cell:disabled{cursor:default}
.ttt-board.locked .ttt-cell{cursor:progress}
.ttt-cell .tile{position:absolute;inset:calc(18% / var(--n) * 1.6);border-radius:clamp(8px,calc(40px / var(--n)),18px);
  background:linear-gradient(145deg,var(--tile2),var(--tile));box-shadow:0 6px 0 rgba(0,0,0,.25);
  animation:tileIn .5s cubic-bezier(.3,1.4,.5,1) both;animation-delay:calc(var(--i)*28ms);
  transition:transform .2s,background .3s,opacity .4s}
.ttt-cell:not(:disabled):hover .tile{transform:translateY(-4px) rotateX(10deg)}
.ttt-cell:not(:disabled):active .tile{transform:translateY(2px) scale(.96)}
.ttt-cell.win .tile{background:linear-gradient(145deg,#4a3d86,#382f6d);animation:tileIn .5s both,winPulse .9s ease-in-out .4s 3}
.ttt-cell.dim .tile,.ttt-cell.dim .ttt-mark{opacity:.35}

.ttt-mark{position:absolute;inset:14%;width:72%;height:72%;fill:none;stroke-width:9;stroke-linecap:round;pointer-events:none}
.ttt-mark path,.ttt-mark circle{stroke-dasharray:1;stroke-dashoffset:1;animation:draw .38s ease-out forwards}
.ttt-mark.is-x{stroke:var(--x);filter:drop-shadow(0 0 6px rgba(255,79,154,.6))}
.ttt-mark.is-o{stroke:var(--o);filter:drop-shadow(0 0 6px rgba(61,224,197,.6))}
.ttt-mark.static{position:static;inset:auto}
.ttt-mark.static path,.ttt-mark.static circle{stroke-dashoffset:0;animation:none}
.ttt-mark.ghost{opacity:0;transition:opacity .2s}
.ttt-mark.ghost path,.ttt-mark.ghost circle{stroke-dashoffset:0;animation:none}
.ttt-cell:not(:disabled):hover .ttt-mark.ghost{opacity:.28}
.ttt-board.locked .ttt-mark.ghost{display:none}
.ttt-cell.filled .ttt-mark{animation:markPop .4s cubic-bezier(.3,1.6,.5,1)}

.ttt-winline{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.ttt-winline line{stroke:var(--gold);stroke-width:.09;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1;
  animation:draw .55s ease-out .25s forwards;filter:drop-shadow(0 0 .08px var(--gold)) drop-shadow(0 0 .14px var(--gold))}

.ttt-status{font-size:20px;font-weight:700;min-height:28px;animation:slideUp .35s ease-out}
.ttt-status.done{color:var(--gold);animation:pop .5s cubic-bezier(.3,1.6,.5,1)}
.ttt-actions{display:flex;gap:10px}
.ttt-actions button{border:2px solid var(--tile2);background:transparent;padding:10px 18px;border-radius:999px;font-weight:600;color:var(--mute);transition:transform .15s,border-color .2s,color .2s}
.ttt-actions button:hover{border-color:var(--mute);color:var(--ink)}
.ttt-actions button:active{transform:scale(.95)}
.ttt-actions button.primary{background:var(--gold);border-color:var(--gold);color:#2b2100;animation:pop .4s cubic-bezier(.3,1.6,.5,1)}
.ttt-foot{margin:0;color:var(--mute);font-size:13px}

@keyframes tileIn{from{opacity:0;transform:scale(.4) rotate(-8deg)}to{opacity:1;transform:none}}
@keyframes draw{to{stroke-dashoffset:0}}
@keyframes markPop{0%{transform:scale(.5)}100%{transform:scale(1)}}
@keyframes pop{0%{transform:scale(.6);opacity:.4}100%{transform:scale(1);opacity:1}}
@keyframes slideUp{from{transform:translateY(8px);opacity:0}to{transform:none;opacity:1}}
@keyframes winPulse{50%{transform:scale(1.07)}}
@keyframes shake{20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
@media (prefers-reduced-motion:reduce){.ttt *{animation-duration:.01ms!important;animation-delay:0s!important;transition-duration:.01ms!important}}
`;

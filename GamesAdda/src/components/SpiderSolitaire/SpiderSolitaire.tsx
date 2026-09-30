import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import CardView from './CardView';
import { canPickUp, NUM_COLUMNS, TOTAL_RUNS } from './gameLogic';
import { colX, computeLayout, computeMetrics, pickDropColumn } from './layout';
import type { SuitCount } from './types';
import { useSpiderSolitaire } from './useSpiderSolitaire';
import './SpiderSolitaire.css';

interface DragState {
  col: number;
  index: number;
  ids: number[];
  dx: number;
  dy: number;
}

const formatTime = (total: number) =>
  `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;

export default function SpiderSolitaire() {
  const game = useSpiderSolitaire(1);
  const { state, stateRef } = game;

  // ---- responsive board -------------------------------------------------
  const boardRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const metrics = useMemo(() => computeMetrics(width), [width]);
  const metricsRef = useRef(metrics);
  metricsRef.current = metrics;

  const layout = useMemo(
    () => computeLayout(state, metrics),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.tableau, state.stock, state.foundations, metrics],
  );

  // ---- feedback: shake + drag ------------------------------------------
  const [shaking, setShaking] = useState<number[]>([]);
  const shakeTimer = useRef<number | undefined>(undefined);
  const shake = useCallback((ids: number[]) => {
    setShaking(ids);
    window.clearTimeout(shakeTimer.current);
    shakeTimer.current = window.setTimeout(() => setShaking([]), 450);
  }, []);
  useEffect(() => () => window.clearTimeout(shakeTimer.current), []);

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragIds = useMemo(() => (drag ? new Set(drag.ids) : null), [drag]);
  const dropTarget = drag ? pickDropColumn(state, metrics, drag.col, drag.index, drag.dx) : null;

  const { autoMove, move, clearFx } = game;

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent, col: number, index: number) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();

      const column = stateRef.current.tableau[col];
      if (!canPickUp(column, index)) {
        shake([column[index].id]);
        return;
      }
      const ids = column.slice(index).map((c) => c.id);
      const startX = e.clientX;
      const startY = e.clientY;
      let dragging = false;

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
      };

      function onMove(ev: PointerEvent) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!dragging) {
          if (Math.hypot(dx, dy) < 6) return;
          dragging = true;
          clearFx();
        }
        setDrag({ col, index, ids, dx, dy });
      }

      function onUp(ev: PointerEvent) {
        cleanup();
        if (!dragging) {
          if (!autoMove(col, index)) shake(ids);
          return;
        }
        const target = pickDropColumn(
          stateRef.current,
          metricsRef.current,
          col,
          index,
          ev.clientX - startX,
        );
        setDrag(null);
        if (target !== null) move(col, index, target);
      }

      function onCancel() {
        cleanup();
        setDrag(null);
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    },
    [autoMove, move, clearFx, shake, stateRef],
  );

  // ---- keyboard shortcuts ----------------------------------------------
  const { undo, deal, showHint } = game;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (e.key === 'h' || e.key === 'H') {
        showHint();
      } else if (e.key === 'd' || e.key === 'D') {
        deal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, deal, showHint]);

  // ---- derived view data -------------------------------------------------
  const hintedIds = useMemo(() => {
    const set = new Set<number>();
    const { hint } = game;
    if (!hint) return set;
    if (hint.kind === 'move') {
      state.tableau[hint.fromCol].slice(hint.fromIndex).forEach((c) => set.add(c.id));
    } else {
      state.stock.slice(-NUM_COLUMNS).forEach((c) => set.add(c.id));
    }
    return set;
  }, [game, state.tableau, state.stock]);

  const confetti = useMemo(
    () =>
      Array.from({ length: 70 }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * 2.5,
        duration: 2.6 + Math.random() * 2.4,
        hue: Math.floor(Math.random() * 360),
        spin: 360 + Math.random() * 720,
      })),
    [],
  );

  const dealsLeft = Math.floor(state.stock.length / NUM_COLUMNS);

  const chooseDifficulty = (n: SuitCount) => {
    if (n === state.suitCount && state.moves === 0) return;
    if (state.moves > 0 && !state.won && !window.confirm('Start a new game? Your current progress will be lost.')) {
      return;
    }
    game.newGame(n);
  };

  const requestNewGame = () => {
    if (state.moves > 0 && !state.won && !window.confirm('Start a new game? Your current progress will be lost.')) {
      return;
    }
    game.newGame();
  };

  const boardStyle = { height: layout.boardHeight, '--cw': `${metrics.cardW}px` } as CSSProperties;

  return (
    <div className="ss-root">
      <header className="ss-header">
        <h1 className="ss-title">Spider Solitaire</h1>

        <div className="ss-stats" aria-live="polite">
          <div className="ss-stat">
            <span className="ss-stat-label">Score</span>
            <span className="ss-stat-value">{state.score}</span>
          </div>
          <div className="ss-stat">
            <span className="ss-stat-label">Moves</span>
            <span className="ss-stat-value">{state.moves}</span>
          </div>
          <div className="ss-stat">
            <span className="ss-stat-label">Time</span>
            <span className="ss-stat-value">{formatTime(game.seconds)}</span>
          </div>
          <div className="ss-stat">
            <span className="ss-stat-label">Runs</span>
            <span className="ss-stat-value">
              {state.foundations.length}/{TOTAL_RUNS}
            </span>
          </div>
        </div>

        <div className="ss-controls">
          <div className="ss-segment" role="group" aria-label="Difficulty">
            {([1, 2, 4] as SuitCount[]).map((n) => (
              <button
                key={n}
                type="button"
                className={n === state.suitCount ? 'active' : ''}
                aria-pressed={n === state.suitCount}
                onClick={() => chooseDifficulty(n)}
              >
                {n} {n === 1 ? 'suit' : 'suits'}
              </button>
            ))}
          </div>
          <button type="button" className="ss-btn" onClick={game.undo} disabled={!game.canUndo}>
            Undo
          </button>
          <button type="button" className="ss-btn" onClick={game.showHint}>
            Hint
          </button>
          <button type="button" className="ss-btn" onClick={game.deal} disabled={dealsLeft === 0}>
            Deal ({dealsLeft})
          </button>
          <button type="button" className="ss-btn primary" onClick={requestNewGame}>
            New game
          </button>
        </div>
      </header>

      <div className="ss-board" ref={boardRef} style={boardStyle}>
        {/* column slots: outline empty columns, glow on valid drop targets */}
        {Array.from({ length: NUM_COLUMNS }, (_, col) => {
          const hintTarget = game.hint?.kind === 'move' && game.hint.toCol === col;
          const cls = ['ss-slot', dropTarget === col && 'target', hintTarget && 'hint']
            .filter(Boolean)
            .join(' ');
          return (
            <div
              key={col}
              className={cls}
              style={{
                left: colX(metrics, col),
                top: metrics.pad,
                width: metrics.cardW,
                height: layout.colTops[col] - metrics.pad + metrics.cardH,
              }}
            />
          );
        })}

        {/* foundation + stock outlines */}
        {Array.from({ length: TOTAL_RUNS }, (_, k) => (
          <div
            key={`f${k}`}
            className="ss-slot ss-slot-foundation"
            style={{
              left: Math.round(metrics.left + k * metrics.cardW * 0.3),
              top: layout.bottomY,
              width: metrics.cardW,
              height: metrics.cardH,
            }}
          />
        ))}
        <div
          className="ss-slot ss-slot-stock"
          style={{ left: layout.stockX, top: layout.bottomY, width: metrics.cardW, height: metrics.cardH }}
          onClick={game.deal}
        />
        <div
          className="ss-stock-caption"
          style={{ left: layout.stockX - metrics.cardW * 1.5, top: layout.bottomY + metrics.cardH + 4, width: metrics.cardW * 2.5 }}
        >
          {dealsLeft === 0 ? 'Stock empty' : `${dealsLeft} ${dealsLeft === 1 ? 'deal' : 'deals'} left`}
        </div>

        {layout.items.map((it) => {
          const isDragged = dragIds?.has(it.card.id) ?? false;
          return (
            <CardView
              key={it.card.id}
              card={it.card}
              kind={it.kind}
              col={it.col}
              index={it.index}
              x={it.x + (isDragged && drag ? drag.dx : 0)}
              y={it.y + (isDragged && drag ? drag.dy : 0)}
              z={it.z}
              w={metrics.cardW}
              h={metrics.cardH}
              delay={state.fx[it.card.id]}
              movable={it.movable}
              dragging={isDragged}
              hinted={hintedIds.has(it.card.id)}
              shaking={shaking.includes(it.card.id)}
              onPointerDown={handlePointerDown}
              onStockClick={game.deal}
            />
          );
        })}

        {state.notice && (
          <div key={state.notice.id} className="ss-toast" role="status">
            {state.notice.text}
          </div>
        )}

        {state.won && (
          <div className="ss-win" role="dialog" aria-label="You won">
            {confetti.map((c, i) => (
              <span
                key={i}
                className="ss-confetti"
                style={
                  {
                    left: `${c.left}%`,
                    background: `hsl(${c.hue} 75% 60%)`,
                    animationDelay: `${c.delay}s`,
                    animationDuration: `${c.duration}s`,
                    '--spin': `${c.spin}deg`,
                  } as CSSProperties
                }
              />
            ))}
            <div className="ss-win-card">
              <h2>All eight runs complete</h2>
              <p>
                {state.score} points in {state.moves} moves, {formatTime(game.seconds)}.
              </p>
              <button type="button" className="ss-btn primary" onClick={() => game.newGame()}>
                Play again
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="ss-help">
        Drag a same-suit run onto a card one rank higher, or click a card to move it automatically.
        Shortcuts: <kbd>H</kbd> hint, <kbd>D</kbd> deal, <kbd>Ctrl/⌘+Z</kbd> undo.
      </p>
    </div>
  );
}

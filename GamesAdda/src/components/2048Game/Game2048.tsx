import type { CSSProperties } from 'react';
import { SIZE } from './logic';
import { useControls } from './useControls';
import { useGame2048 } from './useGame2048';
import './Game2048.css';

const CELLS = Array.from({ length: SIZE * SIZE }, (_, i) => i);

export default function Game2048() {
  const {
    tiles,
    ghosts,
    score,
    best,
    won,
    over,
    keepPlaying,
    canUndo,
    move,
    undo,
    restart,
    continuePlaying,
  } = useGame2048();
  const swipe = useControls(move);

  const showWin = won && !keepPlaying && !over;

  // One list so a tile that merges keeps its DOM node and slides into place.
  const items = [
    ...ghosts.map((tile) => ({ tile, ghost: true })),
    ...tiles.map((tile) => ({ tile, ghost: false })),
  ];

  const status = over
    ? `Game over. Final score ${score}.`
    : showWin
      ? 'You made 2048.'
      : `Score ${score}.`;

  return (
    <section className="g2048" aria-label="2048">
      <header className="g2048-header">
        <h2 className="g2048-title">2048</h2>
        <div className="g2048-scores">
          <div className="g2048-score">
            <span className="g2048-score__label">Score</span>
            <span className="g2048-score__value">{score}</span>
          </div>
          <div className="g2048-score">
            <span className="g2048-score__label">Best</span>
            <span className="g2048-score__value">{best}</span>
          </div>
        </div>
      </header>

      <div className="g2048-toolbar">
        <p className="g2048-hint">Swipe or use the arrow keys or WASD. Match numbers to reach 2048.</p>
        <div className="g2048-actions">
          <button type="button" className="g2048-btn" onClick={undo} disabled={!canUndo}>
            Undo
          </button>
          <button type="button" className="g2048-btn g2048-btn--primary" onClick={restart}>
            New game
          </button>
        </div>
      </div>

      <div className="g2048-board" role="group" aria-label="Game board" {...swipe}>
        <div className="g2048-grid" aria-hidden="true">
          {CELLS.map((i) => (
            <div key={i} className="g2048-cell" />
          ))}
        </div>

        <div className="g2048-tiles" aria-hidden="true">
          {items.map(({ tile, ghost }) => {
            const innerClass = [
              'g2048-tile__inner',
              tile.isNew && 'is-new',
              tile.isMerged && 'is-merged',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <div
                key={tile.id}
                className={ghost ? 'g2048-tile is-ghost' : 'g2048-tile'}
                data-value={tile.value <= 2048 ? tile.value : 'super'}
                data-digits={String(tile.value).length}
                style={{ '--row': tile.row, '--col': tile.col } as CSSProperties}
              >
                <div className={innerClass}>{tile.value}</div>
              </div>
            );
          })}
        </div>

        {(showWin || over) && (
          <div className="g2048-overlay">
            <p className="g2048-overlay__title">{over ? 'No moves left' : 'You made 2048'}</p>
            <p className="g2048-overlay__text">
              {over ? `Final score: ${score}` : `Score: ${score}. Keep going to set a higher score.`}
            </p>
            <div className="g2048-actions">
              {showWin && (
                <button type="button" className="g2048-btn g2048-btn--primary" onClick={continuePlaying}>
                  Keep playing
                </button>
              )}
              {over && canUndo && (
                <button type="button" className="g2048-btn" onClick={undo}>
                  Undo
                </button>
              )}
              <button
                type="button"
                className={showWin ? 'g2048-btn' : 'g2048-btn g2048-btn--primary'}
                onClick={restart}
              >
                New game
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="g2048-sr" aria-live="polite">
        {status}
      </p>
    </section>
  );
}

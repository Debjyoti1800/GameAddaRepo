import { useCallback, useEffect, useReducer, useState } from 'react';
import { WIN_VALUE, canMove, createInitialTiles, slide, spawnTile } from './logic';
import type { Direction, GameState, Snapshot, Tile } from './types';

const BEST_KEY = 'gamepool:2048:best';
const MAX_HISTORY = 20;
const GHOST_MS = 160;

type Action =
  | { type: 'move'; dir: Direction }
  | { type: 'undo' }
  | { type: 'restart' }
  | { type: 'keepPlaying' }
  | { type: 'clearGhosts' };

function createGame(): GameState {
  return {
    tiles: createInitialTiles(),
    ghosts: [],
    score: 0,
    won: false,
    keepPlaying: false,
    over: false,
    history: [],
  };
}

const stripFlags = (tiles: Tile[]): Tile[] =>
  tiles.map(({ id, value, row, col }) => ({ id, value, row, col }));

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'move': {
      // Input is paused while the game is over or the win prompt is showing.
      if (state.over || (state.won && !state.keepPlaying)) return state;

      const res = slide(state.tiles, action.dir);
      if (!res.moved) return state;

      const spawned = spawnTile(res.tiles);
      const tiles = spawned ? [...res.tiles, spawned] : res.tiles;
      const snapshot: Snapshot = {
        tiles: stripFlags(state.tiles),
        score: state.score,
        won: state.won,
        keepPlaying: state.keepPlaying,
      };

      return {
        ...state,
        tiles,
        ghosts: res.ghosts,
        score: state.score + res.gained,
        won: state.won || res.tiles.some((t) => t.value >= WIN_VALUE),
        over: !canMove(tiles),
        history: [...state.history.slice(-(MAX_HISTORY - 1)), snapshot],
      };
    }
    case 'undo': {
      const prev = state.history[state.history.length - 1];
      if (!prev) return state;
      return {
        ...state,
        ...prev,
        ghosts: [],
        over: false,
        history: state.history.slice(0, -1),
      };
    }
    case 'restart':
      return createGame();
    case 'keepPlaying':
      return { ...state, keepPlaying: true };
    case 'clearGhosts':
      return state.ghosts.length ? { ...state, ghosts: [] } : state;
    default:
      return state;
  }
}

function readBest(): number {
  try {
    const value = Number(window.localStorage.getItem(BEST_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeBest(value: number) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    /* storage unavailable (private mode, quota) - best score just won't persist */
  }
}

export function useGame2048() {
  const [state, dispatch] = useReducer(reducer, undefined, createGame);
  const [best, setBest] = useState<number>(readBest);

  useEffect(() => {
    if (state.score > best) {
      setBest(state.score);
      writeBest(state.score);
    }
  }, [state.score, best]);

  // Merged tiles slide into place, then get removed.
  useEffect(() => {
    if (state.ghosts.length === 0) return;
    const timer = window.setTimeout(() => dispatch({ type: 'clearGhosts' }), GHOST_MS);
    return () => window.clearTimeout(timer);
  }, [state.ghosts]);

  const move = useCallback((dir: Direction) => dispatch({ type: 'move', dir }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const restart = useCallback(() => dispatch({ type: 'restart' }), []);
  const continuePlaying = useCallback(() => dispatch({ type: 'keepPlaying' }), []);

  return {
    tiles: state.tiles,
    ghosts: state.ghosts,
    score: state.score,
    best,
    won: state.won,
    over: state.over,
    keepPlaying: state.keepPlaying,
    canUndo: state.history.length > 0,
    move,
    undo,
    restart,
    continuePlaying,
  };
}

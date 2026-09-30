import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  dealFromStock,
  findBestTarget,
  findHint,
  moveCards,
  newSnapshot,
  TOTAL_RUNS,
} from './gameLogic';
import type { GameState, Hint, MoveResult, Snapshot, SuitCount } from './types';

type Action =
  | { type: 'new'; suitCount: SuitCount }
  | { type: 'move'; from: number; index: number; to: number }
  | { type: 'deal' }
  | { type: 'undo' }
  | { type: 'clearFx' }
  | { type: 'notice'; text: string };

function createGame(suitCount: SuitCount, gameId: number): GameState {
  return { ...newSnapshot(suitCount), suitCount, gameId, history: [], fx: {}, won: false, notice: null };
}

function toSnapshot(s: GameState): Snapshot {
  return { tableau: s.tableau, stock: s.stock, foundations: s.foundations, moves: s.moves, score: s.score };
}

function locationMap(s: Snapshot): Map<number, string> {
  const m = new Map<number, string>();
  s.tableau.forEach((col, i) => col.forEach((c) => m.set(c.id, `t${i}`)));
  s.stock.forEach((c) => m.set(c.id, 's'));
  s.foundations.forEach((run, i) => run.forEach((c) => m.set(c.id, `f${i}`)));
  return m;
}

function notify(state: GameState, text: string): GameState {
  return { ...state, notice: { id: (state.notice?.id ?? 0) + 1, text } };
}

function commit(state: GameState, result: MoveResult): GameState {
  return {
    ...state,
    ...result.snapshot,
    history: [...state.history, toSnapshot(state)],
    fx: result.fx,
    won: result.snapshot.foundations.length === TOTAL_RUNS,
    notice: null,
  };
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'new':
      return createGame(action.suitCount, state.gameId + 1);

    case 'move': {
      const result = moveCards(state, action.from, action.index, action.to);
      return result ? commit(state, result) : state;
    }

    case 'deal': {
      const result = dealFromStock(state);
      if (result === 'empty-stock') return notify(state, 'The stock is empty.');
      if (result === 'empty-column') return notify(state, 'Fill every empty column before dealing.');
      return commit(state, result);
    }

    case 'undo': {
      const prev = state.history[state.history.length - 1];
      if (!prev) return state;
      const before = locationMap(state);
      const after = locationMap(prev);
      const fx: Record<number, number> = {};
      after.forEach((loc, id) => {
        if (before.get(id) !== loc) fx[id] = 0;
      });
      return {
        ...state,
        ...prev,
        history: state.history.slice(0, -1),
        fx,
        won: false,
        notice: null,
      };
    }

    case 'clearFx':
      return Object.keys(state.fx).length ? { ...state, fx: {} } : state;

    case 'notice':
      return notify(state, action.text);

    default:
      return state;
  }
}

export function useSpiderSolitaire(initialSuitCount: SuitCount = 1) {
  const [state, dispatch] = useReducer(reducer, initialSuitCount, (n) => createGame(n, 1));
  const stateRef = useRef(state);
  stateRef.current = state;

  const [hint, setHint] = useState<Hint | null>(null);
  const [seconds, setSeconds] = useState(0);

  // Animation hints only matter for a moment; clear them so later drags aren't delayed.
  useEffect(() => {
    if (Object.keys(state.fx).length === 0) return;
    const t = window.setTimeout(() => dispatch({ type: 'clearFx' }), 1400);
    return () => window.clearTimeout(t);
  }, [state.fx]);

  // A hint is stale as soon as the board changes, and fades on its own.
  useEffect(() => {
    setHint(null);
  }, [state.tableau, state.stock]);
  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(null), 2600);
    return () => window.clearTimeout(t);
  }, [hint]);

  // Timer: starts on the first move, stops on a win.
  useEffect(() => {
    setSeconds(0);
  }, [state.gameId]);
  const started = state.moves > 0;
  useEffect(() => {
    if (!started || state.won) return;
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [started, state.won, state.gameId]);

  const newGame = useCallback((suitCount?: SuitCount) => {
    dispatch({ type: 'new', suitCount: suitCount ?? stateRef.current.suitCount });
  }, []);

  const move = useCallback((from: number, index: number, to: number) => {
    dispatch({ type: 'move', from, index, to });
  }, []);

  /** Returns false when the card has nowhere to go. */
  const autoMove = useCallback((from: number, index: number): boolean => {
    const to = findBestTarget(stateRef.current, from, index);
    if (to === null) return false;
    dispatch({ type: 'move', from, index, to });
    return true;
  }, []);

  const deal = useCallback(() => dispatch({ type: 'deal' }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const clearFx = useCallback(() => dispatch({ type: 'clearFx' }), []);

  const showHint = useCallback(() => {
    const h = findHint(stateRef.current);
    if (h) setHint(h);
    else dispatch({ type: 'notice', text: 'No moves left. Try undoing a few moves.' });
  }, []);

  return {
    state,
    stateRef,
    seconds,
    hint,
    canUndo: state.history.length > 0,
    newGame,
    move,
    autoMove,
    deal,
    undo,
    clearFx,
    showHint,
  };
}

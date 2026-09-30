import type { Card, Hint, MoveResult, Snapshot, Suit, SuitCount } from './types';

export const NUM_COLUMNS = 10;
export const TOTAL_RUNS = 8;

export const SUIT_SYMBOL: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

export const RANK_LABEL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const SUITS_BY_COUNT: Record<SuitCount, Suit[]> = {
  1: ['spades'],
  2: ['spades', 'hearts'],
  4: ['spades', 'hearts', 'diamonds', 'clubs'],
};

export function createDeck(suitCount: SuitCount): Card[] {
  const suits = SUITS_BY_COUNT[suitCount];
  const copies = TOTAL_RUNS / suits.length;
  const cards: Card[] = [];
  let id = 0;
  for (let c = 0; c < copies; c++) {
    for (const suit of suits) {
      for (let rank = 1; rank <= 13; rank++) {
        cards.push({ id: id++, suit, rank, faceUp: false });
      }
    }
  }
  return cards;
}

export function shuffle<T>(input: T[]): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function newSnapshot(suitCount: SuitCount): Snapshot {
  const deck = shuffle(createDeck(suitCount));
  const tableau: Card[][] = Array.from({ length: NUM_COLUMNS }, () => []);
  let p = 0;
  for (let col = 0; col < NUM_COLUMNS; col++) {
    const n = col < 4 ? 6 : 5;
    for (let i = 0; i < n; i++) {
      tableau[col].push({ ...deck[p++], faceUp: i === n - 1 });
    }
  }
  return { tableau, stock: deck.slice(p), foundations: [], moves: 0, score: 500 };
}

/** A card can be picked up if it and everything below it is a face-up, same-suit, descending run. */
export function canPickUp(column: Card[], index: number): boolean {
  const first = column[index];
  if (!first || !first.faceUp) return false;
  for (let i = index; i < column.length - 1; i++) {
    const a = column[i];
    const b = column[i + 1];
    if (!b.faceUp || a.suit !== b.suit || a.rank !== b.rank + 1) return false;
  }
  return true;
}

/** Any card may go on an empty column, otherwise it must be exactly one rank lower than the top card. */
export function canDrop(moving: Card, target: Card[]): boolean {
  if (target.length === 0) return true;
  return target[target.length - 1].rank === moving.rank + 1;
}

function flipTop(column: Card[]): Card[] {
  const last = column[column.length - 1];
  if (last && !last.faceUp) {
    const copy = column.slice();
    copy[copy.length - 1] = { ...last, faceUp: true };
    return copy;
  }
  return column;
}

/** Remove any finished K→A runs from the tableau and send them to the foundations. */
function collectCompleted(
  tableau: Card[][],
  foundations: Card[][],
  fx: Record<number, number>,
): { tableau: Card[][]; foundations: Card[][]; completed: number } {
  let completed = 0;
  let nextFoundations = foundations;
  const nextTableau = tableau.map((col) => {
    if (col.length < 13) return col;
    const run = col.slice(-13);
    const ok = run.every((c, i) => c.faceUp && c.suit === run[0].suit && c.rank === 13 - i);
    if (!ok) return col;
    completed++;
    nextFoundations = [...nextFoundations, run];
    run.forEach((c, i) => {
      fx[c.id] = i * 45;
    });
    return flipTop(col.slice(0, -13));
  });
  return { tableau: nextTableau, foundations: nextFoundations, completed };
}

export function moveCards(s: Snapshot, from: number, index: number, to: number): MoveResult | null {
  if (from === to) return null;
  const src = s.tableau[from];
  if (!canPickUp(src, index)) return null;
  const moving = src.slice(index);
  if (!canDrop(moving[0], s.tableau[to])) return null;

  const fx: Record<number, number> = {};
  moving.forEach((c) => {
    fx[c.id] = 0;
  });

  const tableau = s.tableau.slice();
  tableau[from] = flipTop(src.slice(0, index));
  tableau[to] = [...s.tableau[to], ...moving];

  const settled = collectCompleted(tableau, s.foundations, fx);
  return {
    snapshot: {
      tableau: settled.tableau,
      stock: s.stock,
      foundations: settled.foundations,
      moves: s.moves + 1,
      score: Math.max(0, s.score - 1 + settled.completed * 100),
    },
    fx,
  };
}

export function dealFromStock(s: Snapshot): MoveResult | 'empty-stock' | 'empty-column' {
  if (s.stock.length === 0) return 'empty-stock';
  if (s.tableau.some((c) => c.length === 0)) return 'empty-column';

  const dealt = s.stock.slice(-NUM_COLUMNS);
  const stock = s.stock.slice(0, -NUM_COLUMNS);
  const fx: Record<number, number> = {};
  dealt.forEach((c, i) => {
    fx[c.id] = i * 70;
  });
  const tableau = s.tableau.map((col, i) => [...col, { ...dealt[i], faceUp: true }]);
  const settled = collectCompleted(tableau, s.foundations, fx);
  return {
    snapshot: {
      tableau: settled.tableau,
      stock,
      foundations: settled.foundations,
      moves: s.moves + 1,
      score: Math.max(0, s.score - 1 + settled.completed * 100),
    },
    fx,
  };
}

/** Where should a clicked card go? Prefer same-suit stacks, then any stack, then an empty column. */
export function findBestTarget(s: Snapshot, from: number, index: number): number | null {
  const column = s.tableau[from];
  if (!canPickUp(column, index)) return null;
  const card = column[index];
  let best: number | null = null;
  let bestScore = 0;
  s.tableau.forEach((dst, to) => {
    if (to === from || !canDrop(card, dst)) return;
    let score: number;
    if (dst.length === 0) {
      if (index === 0) return; // moving a whole column to an empty one achieves nothing
      score = 1;
    } else {
      score = dst[dst.length - 1].suit === card.suit ? 3 : 2;
    }
    if (score > bestScore) {
      best = to;
      bestScore = score;
    }
  });
  return best;
}

export function findHint(s: Snapshot): Hint | null {
  let best: { hint: Hint; score: number } | null = null;

  s.tableau.forEach((src, fromCol) => {
    for (let fromIndex = 0; fromIndex < src.length; fromIndex++) {
      if (!canPickUp(src, fromIndex)) continue;
      const card = src[fromIndex];
      const below = fromIndex > 0 ? src[fromIndex - 1] : undefined;

      s.tableau.forEach((dst, toCol) => {
        if (toCol === fromCol || !canDrop(card, dst)) return;
        if (dst.length === 0 && fromIndex === 0) return;

        const sameSuitTarget = dst.length > 0 && dst[dst.length - 1].suit === card.suit;
        let score = 0;
        if (sameSuitTarget) score += 4;
        if (below && !below.faceUp) score += 3; // reveals a hidden card
        if (dst.length > 0) score += 1;

        // Card already sits on a valid parent: only worth moving if it improves the suit match.
        if (below && below.faceUp && below.rank === card.rank + 1) {
          if (below.suit === card.suit || !sameSuitTarget) return;
        }

        score += Math.min(src.length - fromIndex, 3) * 0.1;
        if (!best || score > best.score) {
          best = { hint: { kind: 'move', fromCol, fromIndex, toCol }, score };
        }
      });
    }
  });

  if (best) return (best as { hint: Hint; score: number }).hint;
  if (s.stock.length > 0 && s.tableau.every((c) => c.length > 0)) return { kind: 'deal' };
  return null;
}

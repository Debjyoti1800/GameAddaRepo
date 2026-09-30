import { canDrop, canPickUp, NUM_COLUMNS } from './gameLogic';
import type { Card, Snapshot } from './types';

export interface Metrics {
  width: number;
  cardW: number;
  cardH: number;
  gap: number;
  pad: number;
  left: number;
  downStep: number;
  upStep: number;
}

export function computeMetrics(width: number): Metrics {
  const pad = Math.max(6, Math.round(width * 0.012));
  const gap = Math.max(4, Math.round(width * 0.008));
  const cardW = Math.max(28, Math.min(96, Math.floor((width - pad * 2 - gap * 9) / NUM_COLUMNS)));
  const cardH = Math.round(cardW * 1.4);
  const left = Math.round((width - (NUM_COLUMNS * cardW + (NUM_COLUMNS - 1) * gap)) / 2);
  return {
    width,
    cardW,
    cardH,
    gap,
    pad,
    left,
    downStep: Math.round(cardH * 0.11),
    upStep: Math.round(cardH * 0.27),
  };
}

export const colX = (m: Metrics, col: number) => m.left + col * (m.cardW + m.gap);

export interface LayoutItem {
  card: Card;
  kind: 'tableau' | 'stock' | 'foundation';
  col: number;
  index: number;
  x: number;
  y: number;
  z: number;
  movable: boolean;
}

export interface Layout {
  /** Always sorted by card id so React never reorders the DOM (keeps CSS transitions alive). */
  items: LayoutItem[];
  boardHeight: number;
  bottomY: number;
  /** y of the top edge of the last card in each column. */
  colTops: number[];
  stockX: number;
}

export function computeLayout(s: Snapshot, m: Metrics): Layout {
  const items: LayoutItem[] = [];
  const maxSpan = m.cardH * 3.8; // columns compress once they get taller than this
  const colTops: number[] = [];

  s.tableau.forEach((column, col) => {
    let natural = 0;
    for (let i = 0; i < column.length - 1; i++) natural += column[i].faceUp ? m.upStep : m.downStep;
    const scale = natural > maxSpan ? maxSpan / natural : 1;

    let y = m.pad;
    let lastY = m.pad;
    column.forEach((card, index) => {
      lastY = y;
      items.push({
        card,
        kind: 'tableau',
        col,
        index,
        x: colX(m, col),
        y: Math.round(y),
        z: 10 + index,
        movable: canPickUp(column, index),
      });
      y += (card.faceUp ? m.upStep : m.downStep) * scale;
    });
    colTops.push(Math.round(lastY));
  });

  const bottomY = Math.round(m.pad + maxSpan + m.cardH + m.pad * 1.5);
  const stockX = colX(m, NUM_COLUMNS - 1);
  const stockStep = m.cardW * 0.16;

  s.stock.forEach((card, i) => {
    const pile = Math.floor(i / NUM_COLUMNS);
    items.push({
      card,
      kind: 'stock',
      col: -1,
      index: i,
      x: Math.round(stockX - pile * stockStep),
      y: bottomY,
      z: 10 + i,
      movable: false,
    });
  });

  s.foundations.forEach((run, k) => {
    run.forEach((card, i) => {
      items.push({
        card,
        kind: 'foundation',
        col: -1,
        index: i,
        x: Math.round(m.left + k * m.cardW * 0.3),
        y: bottomY,
        z: 10 + k * 20 + i,
        movable: false,
      });
    });
  });

  items.sort((a, b) => a.card.id - b.card.id);

  return {
    items,
    boardHeight: bottomY + m.cardH + m.pad + 22,
    bottomY,
    colTops,
    stockX,
  };
}

/** Which column would a dragged stack land on, judging by how far it has moved sideways? */
export function pickDropColumn(
  s: Snapshot,
  m: Metrics,
  from: number,
  index: number,
  dx: number,
): number | null {
  const card = s.tableau[from]?.[index];
  if (!card) return null;
  const centre = colX(m, from) + m.cardW / 2 + dx;
  const limit = (m.cardW + m.gap) * 0.65;
  let best: number | null = null;
  let bestDist = Infinity;
  s.tableau.forEach((col, to) => {
    if (to === from || !canDrop(card, col)) return;
    const d = Math.abs(centre - (colX(m, to) + m.cardW / 2));
    if (d < limit && d < bestDist) {
      best = to;
      bestDist = d;
    }
  });
  return best;
}

import { memo } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { RANK_LABEL, SUIT_SYMBOL } from './gameLogic';
import type { Card } from './types';

interface Props {
  card: Card;
  kind: 'tableau' | 'stock' | 'foundation';
  col: number;
  index: number;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  /** Transition delay in ms when this card is part of the last action, otherwise undefined. */
  delay: number | undefined;
  movable: boolean;
  dragging: boolean;
  hinted: boolean;
  shaking: boolean;
  onPointerDown: (e: ReactPointerEvent, col: number, index: number) => void;
  onStockClick: () => void;
}

function CardViewBase(p: Props) {
  const { card } = p;
  const lifted = p.delay !== undefined;
  const zIndex = p.dragging ? 1000 + p.index : lifted ? 500 + p.z : p.z;
  const red = card.suit === 'hearts' || card.suit === 'diamonds';
  const symbol = SUIT_SYMBOL[card.suit];
  const label = RANK_LABEL[card.rank];

  const style = {
    width: p.w,
    height: p.h,
    zIndex,
    transform: `translate3d(${p.x}px, ${p.y}px, 0)`,
    '--delay': `${p.delay ?? 0}ms`,
  } as CSSProperties;

  const className = [
    'ss-card',
    p.movable && 'movable',
    p.dragging && 'dragging',
    p.hinted && 'hint',
    p.shaking && 'shake',
    p.kind === 'stock' && 'in-stock',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      style={style}
      data-card-id={card.id}
      aria-label={card.faceUp ? `${label} of ${card.suit}` : 'Face-down card'}
      onPointerDown={p.kind === 'tableau' ? (e) => p.onPointerDown(e, p.col, p.index) : undefined}
      onClick={p.kind === 'stock' ? p.onStockClick : undefined}
    >
      <div className={`ss-card-inner${card.faceUp ? ' up' : ''}`}>
        <div className={`ss-face ss-front${red ? ' red' : ''}`}>
          <div className="ss-corner tl">
            <span>{label}</span>
            <span>{symbol}</span>
          </div>
          <div className="ss-pip">{symbol}</div>
          <div className="ss-corner br">
            <span>{label}</span>
            <span>{symbol}</span>
          </div>
        </div>
        <div className="ss-face ss-back" />
      </div>
    </div>
  );
}

export default memo(CardViewBase);

import { useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import type { Direction } from './types';

const SWIPE_MIN_PX = 24;

const KEY_MAP: Record<string, Direction> = {
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

/**
 * Keyboard (arrows / WASD) and swipe (touch, pen, mouse drag) input.
 * Spread the returned handlers onto the board element.
 */
export function useControls(onMove: (dir: Direction) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) {
        return;
      }

      const dir = KEY_MAP[e.key.toLowerCase()];
      if (!dir) return;
      e.preventDefault(); // stop arrow keys from scrolling the page
      onMove(dir);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onMove]);

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    start.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const from = start.current;
    start.current = null;
    if (!from) return;

    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return;

    if (Math.abs(dx) > Math.abs(dy)) onMove(dx > 0 ? 'right' : 'left');
    else onMove(dy > 0 ? 'down' : 'up');
  };

  const onPointerCancel = () => {
    start.current = null;
  };

  return { onPointerDown, onPointerUp, onPointerCancel };
}

import type { Direction, Tile } from './types';

export const SIZE = 4;
export const WIN_VALUE = 2048;

let idCounter = 0;
const nextId = () => ++idCounter;

export interface SlideResult {
  tiles: Tile[];
  ghosts: Tile[];
  gained: number;
  moved: boolean;
}

/** Adds a 2 (90%) or 4 (10%) on a random empty cell. Returns null if the board is full. */
export function spawnTile(tiles: Tile[]): Tile | null {
  const taken = new Set(tiles.map((t) => t.row * SIZE + t.col));
  const empty: number[] = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (!taken.has(i)) empty.push(i);
  }
  if (empty.length === 0) return null;

  const cell = empty[Math.floor(Math.random() * empty.length)];
  return {
    id: nextId(),
    value: Math.random() < 0.9 ? 2 : 4,
    row: Math.floor(cell / SIZE),
    col: cell % SIZE,
    isNew: true,
  };
}

export function createInitialTiles(): Tile[] {
  const first = spawnTile([]) as Tile;
  const second = spawnTile([first]) as Tile;
  return [first, second];
}

/** Slides and merges every tile toward `dir`. Does not spawn a new tile. */
export function slide(tiles: Tile[], dir: Direction): SlideResult {
  const vertical = dir === 'up' || dir === 'down';
  const reverse = dir === 'right' || dir === 'down';

  const result: Tile[] = [];
  const ghosts: Tile[] = [];
  let gained = 0;
  let moved = false;

  for (let line = 0; line < SIZE; line++) {
    // Tiles in this row/column, nearest to the wall we're sliding toward first.
    const inLine = tiles
      .filter((t) => (vertical ? t.col : t.row) === line)
      .sort((a, b) => (vertical ? a.row - b.row : a.col - b.col) * (reverse ? -1 : 1));

    let pos = 0;
    for (let k = 0; k < inLine.length; k++) {
      const cur = inLine[k];
      const next = inLine[k + 1];
      const index = reverse ? SIZE - 1 - pos : pos;
      const row = vertical ? index : line;
      const col = vertical ? line : index;

      if (next && next.value === cur.value) {
        const value = cur.value * 2;
        result.push({ id: nextId(), value, row, col, isMerged: true });
        ghosts.push({ id: cur.id, value: cur.value, row, col });
        ghosts.push({ id: next.id, value: next.value, row, col });
        gained += value;
        moved = true;
        k++; // next tile is consumed
      } else {
        if (cur.row !== row || cur.col !== col) moved = true;
        result.push({ id: cur.id, value: cur.value, row, col });
      }
      pos++;
    }
  }

  return { tiles: result, ghosts, gained, moved };
}

/** True if any move is still possible. */
export function canMove(tiles: Tile[]): boolean {
  if (tiles.length < SIZE * SIZE) return true;

  const grid: number[][] = Array.from({ length: SIZE }, () => new Array<number>(SIZE).fill(0));
  tiles.forEach((t) => {
    grid[t.row][t.col] = t.value;
  });

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (c + 1 < SIZE && grid[r][c] === grid[r][c + 1]) return true;
      if (r + 1 < SIZE && grid[r][c] === grid[r + 1][c]) return true;
    }
  }
  return false;
}

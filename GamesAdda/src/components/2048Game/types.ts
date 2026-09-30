export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Tile {
  id: number;
  value: number;
  row: number;
  col: number;
  /** Spawned this move (plays the appear animation). */
  isNew?: boolean;
  /** Created by a merge this move (plays the pop animation). */
  isMerged?: boolean;
}

/** What Undo restores. */
export interface Snapshot {
  tiles: Tile[];
  score: number;
  won: boolean;
  keepPlaying: boolean;
}

export interface GameState {
  tiles: Tile[];
  /** Tiles that just merged; they slide into place, then are removed. */
  ghosts: Tile[];
  score: number;
  won: boolean;
  keepPlaying: boolean;
  over: boolean;
  history: Snapshot[];
}

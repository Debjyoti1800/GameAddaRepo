export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type SuitCount = 1 | 2 | 4;

export interface Card {
  id: number;
  suit: Suit;
  /** 1 = Ace ... 13 = King */
  rank: number;
  faceUp: boolean;
}

/** Everything that changes during play (and is therefore undoable). */
export interface Snapshot {
  tableau: Card[][];
  /** Undealt cards. Each deal takes the last 10. */
  stock: Card[];
  /** Completed K→A runs. */
  foundations: Card[][];
  moves: number;
  score: number;
}

export interface GameState extends Snapshot {
  suitCount: SuitCount;
  gameId: number;
  history: Snapshot[];
  /**
   * Animation hints for the last action: card id → transition delay (ms).
   * A card being present in this map also lifts it above its neighbours
   * while it is in flight.
   */
  fx: Record<number, number>;
  won: boolean;
  notice: { id: number; text: string } | null;
}

export type Hint =
  | { kind: 'move'; fromCol: number; fromIndex: number; toCol: number }
  | { kind: 'deal' };

export interface MoveResult {
  snapshot: Snapshot;
  fx: Record<number, number>;
}

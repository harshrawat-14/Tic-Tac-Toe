// ─── Pure game-logic utilities ────────────────────────────────────────────────
// Zero dependencies on Nakama runtime — safe to import in both the match
// handler (Goja VM) and Vitest unit tests (Node.js).

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * All 8 winning index triplets for a 3x3 board stored in row-major order.
 * Index 0 = top-left, index 8 = bottom-right.
 *
 *  0 | 1 | 2
 *  ---------
 *  3 | 4 | 5
 *  ---------
 *  6 | 7 | 8
 */
export const WIN_LINES: ReadonlyArray<[number, number, number]> = [
  [0, 1, 2], // top row
  [3, 4, 5], // mid row
  [6, 7, 8], // bot row
  [0, 3, 6], // left col
  [1, 4, 7], // mid col
  [2, 5, 8], // right col
  [0, 4, 8], // diagonal ↘
  [2, 4, 6], // diagonal ↙
] as const;

/** K-factor used in ELO calculation — re-exported so tests can reference it. */
export const ELO_K = 32;

/** Default ELO for a brand-new player. */
export const DEFAULT_ELO = 1000;

// ─── Board helpers ────────────────────────────────────────────────────────────

/**
 * Returns the winning symbol ('X' or 'O') if any win-line is complete,
 * or `null` if the game has no winner yet.
 *
 * @param board — flat 9-element array, `null` = empty cell
 */
export function checkWinner(board: ReadonlyArray<string | null>): string | null {
  for (let i = 0; i < WIN_LINES.length; i++) {
    const [a, b, c] = WIN_LINES[i];
    if (board[a] !== null && board[a] === board[b] && board[b] === board[c]) {
      return board[a] as string;
    }
  }
  return null;
}

/**
 * Returns `true` when every cell is non-null (i.e. the board is full).
 * Does NOT check for a winner — call `checkWinner` first.
 */
export function isBoardFull(board: ReadonlyArray<string | null>): boolean {
  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) return false;
  }
  return true;
}

/**
 * Returns a fresh 9-element board initialised to `null`.
 */
export function emptyBoard(): (string | null)[] {
  return new Array<string | null>(9).fill(null);
}

/**
 * Returns `true` if `cellIndex` is a valid board position (0–8).
 */
export function isValidCellIndex(cellIndex: number): boolean {
  return Number.isInteger(cellIndex) && cellIndex >= 0 && cellIndex <= 8;
}

// ─── ELO ─────────────────────────────────────────────────────────────────────

export interface EloResult {
  newA: number;
  newB: number;
  deltaA: number;
  deltaB: number;
}

/**
 * Standard ELO calculation with K=32.
 *
 * @param ratingA — current ELO of player A
 * @param ratingB — current ELO of player B
 * @param resultA — outcome from A's perspective: 1 = win, 0 = loss, 0.5 = draw
 * @returns new ratings and signed deltas for both players
 *
 * Formula:
 *   expected_A = 1 / (1 + 10^((ratingB - ratingA) / 400))
 *   new_A      = round(ratingA + K * (resultA - expected_A))
 */
export function calculateEloChange(
  ratingA: number,
  ratingB: number,
  resultA: 0 | 0.5 | 1,
): EloResult {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;

  const newA = Math.round(ratingA + ELO_K * (resultA - expectedA));
  const newB = Math.round(ratingB + ELO_K * ((1 - resultA) - expectedB));

  return {
    newA,
    newB,
    deltaA: newA - ratingA,
    deltaB: newB - ratingB,
  };
}

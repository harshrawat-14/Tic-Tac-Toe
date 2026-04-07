/**
 * /backend/src/__tests__/game-logic.test.ts
 *
 * Unit tests for:
 *  - checkWinner (all 8 win combos for X and O + edge cases)
 *  - calculateEloChange (standard ELO math)
 *  - Move validation (via handleMove-equivalent logic)
 *  - switchTurn
 *
 * NOTE: checkWinner and switchTurn are not exported from match_handler.ts
 * (they are file-private). We test them via a test-helper re-export or
 * by duplicating their pure implementations here. Since the functions are
 * pure and small, we duplicate them to avoid adding test-only exports to
 * production code.
 */

import { describe, it, expect } from 'vitest';
import { calculateEloChange, DEFAULT_ELO, ELO_K } from '../leaderboard';
import type { MatchState, PlayerState, GameStatus } from '../types';

// ─── Re-implement file-private functions under test ──────────────────────────
// (Mirrors match_handler.ts exactly — if you change the impl, update here too)

const WIN_LINES: [number, number, number][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function checkWinner(board: (string | null)[]): string | null {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] !== null && board[a] === board[b] && board[b] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function isBoardFull(board: (string | null)[]): boolean {
  return board.every((cell) => cell !== null);
}

function empty(): (string | null)[] {
  return Array(9).fill(null);
}

// ─── Helpers for MatchState fixtures ─────────────────────────────────────────

function makePlayer(userId: string, symbol: 'X' | 'O', overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    userId,
    displayName: `Player ${symbol}`,
    symbol,
    connected: true,
    eloRating: DEFAULT_ELO,
    wins: 0,
    losses: 0,
    draws: 0,
    winStreak: 0,
    ...overrides,
  };
}

function makeState(overrides: Partial<MatchState> = {}): MatchState {
  const X_ID = 'user-x';
  const O_ID = 'user-o';
  return {
    board: empty(),
    currentTurn: X_ID,
    players: {
      [X_ID]: makePlayer(X_ID, 'X'),
      [O_ID]: makePlayer(O_ID, 'O'),
    },
    playerOrder: [X_ID, O_ID],
    status: 'PLAYER_X_TURN' as GameStatus,
    winner: null,
    isDraw: false,
    turnTimeLeft: -1,
    turnForfeits: { [X_ID]: 0, [O_ID]: 0 },
    mode: 'classic',
    moveHistory: [],
    matchId: 'test-match',
    reconnectDeadline: {},
    ...overrides,
  };
}

// switchTurn mirror
function switchTurn(state: MatchState): MatchState {
  const currentIndex = state.playerOrder.indexOf(state.currentTurn);
  const nextIndex = currentIndex === 0 ? 1 : 0;
  state = { ...state };
  state.currentTurn = state.playerOrder[nextIndex];
  const nextPlayer = state.players[state.currentTurn];
  state.status = nextPlayer.symbol === 'X' ? 'PLAYER_X_TURN' : 'PLAYER_O_TURN';
  return state;
}

// Simplified move validation (mirrors handleMove guard logic)
function validateMove(
  state: MatchState,
  userId: string,
  cellIndex: number,
): { valid: boolean; reason?: string } {
  if (userId !== state.currentTurn) return { valid: false, reason: 'not your turn' };
  if (state.status !== 'PLAYER_X_TURN' && state.status !== 'PLAYER_O_TURN') {
    return { valid: false, reason: `invalid status: ${state.status}` };
  }
  if (typeof cellIndex !== 'number' || cellIndex < 0 || cellIndex > 8) {
    return { valid: false, reason: `invalid cellIndex: ${cellIndex}` };
  }
  if (state.board[cellIndex] !== null) return { valid: false, reason: 'cell occupied' };
  return { valid: true };
}

function applyMove(state: MatchState, userId: string, cellIndex: number): MatchState {
  const player = state.players[userId];
  const newBoard = [...state.board];
  newBoard[cellIndex] = player.symbol;
  return { ...state, board: newBoard, moveHistory: [...state.moveHistory, cellIndex] };
}

// ─── Tests: checkWinner ───────────────────────────────────────────────────────

describe('checkWinner', () => {
  describe('returns null for empty / partial / draw boards', () => {
    it('returns null for an empty board', () => {
      expect(checkWinner(empty())).toBeNull();
    });

    it('returns null for a partial board with no winner', () => {
      const b = empty();
      b[0] = 'X'; b[4] = 'O'; b[1] = 'X';
      expect(checkWinner(b)).toBeNull();
    });

    it('returns null for a fully-drawn board', () => {
      // X O X / O X O / O X O — no three in a row for either
      const b = ['X', 'O', 'X', 'O', 'X', 'O', 'O', 'X', 'O'];
      expect(checkWinner(b)).toBeNull();
      expect(isBoardFull(b)).toBe(true);
    });
  });

  describe.each([
    { name: 'top row',    line: [0, 1, 2] },
    { name: 'mid row',    line: [3, 4, 5] },
    { name: 'bot row',    line: [6, 7, 8] },
    { name: 'left col',   line: [0, 3, 6] },
    { name: 'mid col',    line: [1, 4, 7] },
    { name: 'right col',  line: [2, 5, 8] },
    { name: 'diag ↘',     line: [0, 4, 8] },
    { name: 'diag ↙',     line: [2, 4, 6] },
  ])('WIN_LINE — $name ($line)', ({ line }: { name: string; line: number[] }) => {
    it('detects X winning along this line', () => {
      const b = empty();
      line.forEach((i: number) => { b[i] = 'X'; });
      expect(checkWinner(b)).toBe('X');
    });

    it('detects O winning along this line', () => {
      const b = empty();
      line.forEach((i: number) => { b[i] = 'O'; });
      expect(checkWinner(b)).toBe('O');
    });
  });
});

// ─── Tests: calculateEloChange ────────────────────────────────────────────────

describe('calculateEloChange', () => {
  it('both players at equal rating: winner gains, loser loses by same amount', () => {
    const r = calculateEloChange(1000, 1000, 1);
    expect(r.deltaA).toBeGreaterThan(0);
    expect(r.deltaB).toBeLessThan(0);
    expect(r.deltaA).toBe(-r.deltaB);         // symmetric
    expect(r.deltaA).toBe(ELO_K / 2);        // expected score = 0.5
  });

  it('higher rated beats lower rated — small gain', () => {
    const high = calculateEloChange(1400, 1000, 1);
    const low  = calculateEloChange(1000, 1400, 1); // lower beats higher
    expect(high.deltaA).toBeGreaterThan(0);
    expect(high.deltaA).toBeLessThan(low.deltaA);  // lower-rated win gets bigger delta
  });

  it('lower-rated player beats higher-rated — large gain', () => {
    const r = calculateEloChange(1000, 1400, 1); // A (1000) beats B (1400)
    expect(r.deltaA).toBeGreaterThan(ELO_K / 2);  // beats expectation → big gain
    expect(r.newA).toBeGreaterThan(1000);
    expect(r.newB).toBeLessThan(1400);
  });

  it('draw at equal ratings — no ELO change', () => {
    const r = calculateEloChange(1000, 1000, 0.5);
    expect(r.deltaA).toBe(0);
    expect(r.deltaB).toBe(0);
  });

  it('loss: A loses to B — A gains negative delta', () => {
    const r = calculateEloChange(1000, 1000, 0);  // A loses
    expect(r.deltaA).toBeLessThan(0);
    expect(r.deltaB).toBeGreaterThan(0);
    expect(r.deltaA).toBe(-ELO_K / 2);
  });

  it('results are integer-rounded', () => {
    const r = calculateEloChange(1200, 1050, 1);
    expect(Number.isInteger(r.newA)).toBe(true);
    expect(Number.isInteger(r.newB)).toBe(true);
  });

  it('newA = ratingA + deltaA', () => {
    const r = calculateEloChange(1100, 950, 1);
    expect(r.newA).toBe(1100 + r.deltaA);
    expect(r.newB).toBe(950 + r.deltaB);
  });
});

// ─── Tests: move validation ───────────────────────────────────────────────────

describe('move validation (handleMove guards)', () => {
  const X_ID = 'user-x';
  const O_ID = 'user-o';

  it('valid move returns valid=true and updates board', () => {
    const state = makeState();
    const result = validateMove(state, X_ID, 4);
    expect(result.valid).toBe(true);
    const after = applyMove(state, X_ID, 4);
    expect(after.board[4]).toBe('X');
  });

  it('rejects move on occupied cell', () => {
    const b = empty(); b[4] = 'O';
    const state = makeState({ board: b });
    const result = validateMove(state, X_ID, 4);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('occupied');
  });

  it('rejects move when not your turn', () => {
    const state = makeState({ currentTurn: X_ID });
    const result = validateMove(state, O_ID, 0);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not your turn');
  });

  it('rejects move with invalid cell index (-1)', () => {
    const state = makeState();
    const result = validateMove(state, X_ID, -1);
    expect(result.valid).toBe(false);
  });

  it('rejects move with invalid cell index (9)', () => {
    const state = makeState();
    const result = validateMove(state, X_ID, 9);
    expect(result.valid).toBe(false);
  });

  it('rejects move when game status is GAME_OVER', () => {
    const state = makeState({ status: 'GAME_OVER' });
    const result = validateMove(state, X_ID, 0);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('GAME_OVER');
  });

  it('rejects move when game status is WAITING', () => {
    const state = makeState({ status: 'WAITING' });
    const result = validateMove(state, X_ID, 0);
    expect(result.valid).toBe(false);
  });

  it('allows O to move when it is O turn', () => {
    const state = makeState({
      currentTurn: O_ID,
      status: 'PLAYER_O_TURN',
    });
    const result = validateMove(state, O_ID, 0);
    expect(result.valid).toBe(true);
  });
});

// ─── Tests: switchTurn ────────────────────────────────────────────────────────

describe('switchTurn', () => {
  const X_ID = 'user-x';
  const O_ID = 'user-o';

  it('switches from X to O', () => {
    const state = makeState({ currentTurn: X_ID, status: 'PLAYER_X_TURN' });
    const next = switchTurn(state);
    expect(next.currentTurn).toBe(O_ID);
    expect(next.status).toBe('PLAYER_O_TURN');
  });

  it('switches from O back to X', () => {
    const state = makeState({ currentTurn: O_ID, status: 'PLAYER_O_TURN' });
    const next = switchTurn(state);
    expect(next.currentTurn).toBe(X_ID);
    expect(next.status).toBe('PLAYER_X_TURN');
  });

  it('does not mutate the original state', () => {
    const state = makeState({ currentTurn: X_ID });
    const frozen = Object.freeze({ ...state });
    const next = switchTurn({ ...state });
    expect(next).not.toBe(frozen);
    expect(state.currentTurn).toBe(X_ID); // original unchanged
  });

  it('alternates correctly over 4 consecutive switches', () => {
    let s = makeState({ currentTurn: X_ID });
    const sequence: string[] = [s.currentTurn];
    for (let i = 0; i < 4; i++) {
      s = switchTurn(s);
      sequence.push(s.currentTurn);
    }
    expect(sequence).toEqual([X_ID, O_ID, X_ID, O_ID, X_ID]);
  });
});

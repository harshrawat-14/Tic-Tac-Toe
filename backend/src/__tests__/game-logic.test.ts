/**
 * backend/src/__tests__/game-logic.test.ts
 *
 * Unit tests for the pure game-logic utility module:
 *   backend/src/utils/game-logic.ts
 *
 * This module has zero Nakama runtime dependency, so it runs cleanly in
 * Vitest/Node without any mocking.
 *
 * Coverage:
 *   - checkWinner: all 8 win lines × 2 symbols, empty/partial/draw boards
 *   - isBoardFull: empty, partial, full
 *   - isValidCellIndex: boundaries, non-integers
 *   - emptyBoard: shape and values
 *   - calculateEloChange: win / loss / draw at equal ratings,
 *     high-rated-beats-low, low-rated-beats-high, integer rounding,
 *     newA = ratingA + deltaA invariant
 */

import { describe, it, expect } from 'vitest';
import {
  WIN_LINES,
  checkWinner,
  isBoardFull,
  emptyBoard,
  isValidCellIndex,
  calculateEloChange,
  ELO_K,
  DEFAULT_ELO,
} from '../utils/game-logic';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── emptyBoard ───────────────────────────────────────────────────────────────

describe('emptyBoard()', () => {
  it('returns a 9-element array', () => {
    expect(emptyBoard()).toHaveLength(9);
  });

  it('every cell is null', () => {
    expect(emptyBoard().every((c) => c === null)).toBe(true);
  });

  it('returns a new array each call (no shared reference)', () => {
    const a = emptyBoard();
    const b = emptyBoard();
    expect(a).not.toBe(b);
  });
});

// ─── isValidCellIndex ────────────────────────────────────────────────────────

describe('isValidCellIndex()', () => {
  it.each([0, 1, 4, 8])('accepts valid index %i', (i) => {
    expect(isValidCellIndex(i)).toBe(true);
  });

  it.each([-1, 9, 100, -100])('rejects out-of-range index %i', (i) => {
    expect(isValidCellIndex(i)).toBe(false);
  });

  it('rejects non-integers', () => {
    expect(isValidCellIndex(4.5)).toBe(false);
    expect(isValidCellIndex(NaN)).toBe(false);
    expect(isValidCellIndex(Infinity)).toBe(false);
  });
});

// ─── isBoardFull ─────────────────────────────────────────────────────────────

describe('isBoardFull()', () => {
  it('returns false for an empty board', () => {
    expect(isBoardFull(emptyBoard())).toBe(false);
  });

  it('returns false when one cell is still null', () => {
    const b = new Array(9).fill('X') as (string | null)[];
    b[4] = null;
    expect(isBoardFull(b)).toBe(false);
  });

  it('returns true when all 9 cells are filled', () => {
    expect(isBoardFull(new Array(9).fill('X'))).toBe(true);
  });

  it('returns true for a drawn board', () => {
    // X O X / O X O / O X O — no winner
    expect(isBoardFull(['X', 'O', 'X', 'O', 'X', 'O', 'O', 'X', 'O'])).toBe(true);
  });
});

// ─── checkWinner ─────────────────────────────────────────────────────────────

describe('checkWinner()', () => {
  it('returns null for an empty board', () => {
    expect(checkWinner(emptyBoard())).toBeNull();
  });

  it('returns null for a partial board with no winner', () => {
    const b = emptyBoard();
    b[0] = 'X'; b[4] = 'O'; b[8] = 'X';
    expect(checkWinner(b)).toBeNull();
  });

  it('returns null for a fully-drawn board (X O X / O X O / O X O)', () => {
    expect(checkWinner(['X', 'O', 'X', 'O', 'X', 'O', 'O', 'X', 'O'])).toBeNull();
  });

  // Verify all 8 win lines × 2 symbols
  describe.each(WIN_LINES.map((line, i) => ({ line, i })))(
    'WIN_LINE[$i] = [$line]',
    ({ line }: { line: readonly [number, number, number]; i: number }) => {

      it('detects X winning', () => {
        const b = emptyBoard();
        line.forEach((idx) => { b[idx] = 'X'; });
        expect(checkWinner(b)).toBe('X');
      });

      it('detects O winning', () => {
        const b = emptyBoard();
        line.forEach((idx) => { b[idx] = 'O'; });
        expect(checkWinner(b)).toBe('O');
      });

      it('does not trigger with only 2 of 3 cells filled', () => {
        const b = emptyBoard();
        b[line[0]] = 'X';
        b[line[1]] = 'X';
        // line[2] intentionally empty
        expect(checkWinner(b)).toBeNull();
      });

      it('does not trigger when the line has mixed symbols', () => {
        const b = emptyBoard();
        b[line[0]] = 'X';
        b[line[1]] = 'O';
        b[line[2]] = 'X';
        expect(checkWinner(b)).toBeNull();
      });
    },
  );
});

// ─── WIN_LINES constant ───────────────────────────────────────────────────────

describe('WIN_LINES constant', () => {
  it('has exactly 8 entries', () => {
    expect(WIN_LINES).toHaveLength(8);
  });

  it('every entry is a 3-tuple of valid indices', () => {
    for (const [a, b, c] of WIN_LINES) {
      expect(isValidCellIndex(a)).toBe(true);
      expect(isValidCellIndex(b)).toBe(true);
      expect(isValidCellIndex(c)).toBe(true);
    }
  });

  it('contains no duplicate lines', () => {
    const serialised = WIN_LINES.map((l) => l.join(','));
    const unique = new Set(serialised);
    expect(unique.size).toBe(WIN_LINES.length);
  });
});

// ─── calculateEloChange ───────────────────────────────────────────────────────

describe('calculateEloChange()', () => {
  it('DEFAULT_ELO is 1000', () => {
    expect(DEFAULT_ELO).toBe(1000);
  });

  it('ELO_K is 32', () => {
    expect(ELO_K).toBe(32);
  });

  describe('equal ratings (1000 vs 1000)', () => {
    it('win: deltaA = +K/2 = +16, deltaB = -16', () => {
      const r = calculateEloChange(1000, 1000, 1);
      expect(r.deltaA).toBe(ELO_K / 2);
      expect(r.deltaB).toBe(-ELO_K / 2);
    });

    it('loss: deltaA = -K/2 = -16, deltaB = +16', () => {
      const r = calculateEloChange(1000, 1000, 0);
      expect(r.deltaA).toBe(-ELO_K / 2);
      expect(r.deltaB).toBe(ELO_K / 2);
    });

    it('draw: no ELO change', () => {
      const r = calculateEloChange(1000, 1000, 0.5);
      expect(r.deltaA).toBe(0);
      expect(r.deltaB).toBe(0);
    });

    it('win + loss are symmetric (deltaA = -deltaB)', () => {
      const win  = calculateEloChange(1000, 1000, 1);
      const loss = calculateEloChange(1000, 1000, 0);
      expect(win.deltaA).toBe(-win.deltaB);
      expect(loss.deltaA).toBe(-loss.deltaB);
    });
  });

  describe('README example: A(1200) beats B(1000)', () => {
    // expected_A = 1 / (1 + 10^((1000-1200)/400)) = 1/(1+10^(-0.5)) ≈ 0.7597
    // delta_A    = round(32 * (1 - 0.7597)) ≈ round(7.69) = 8
    it('wins produce delta_A ≈ +8', () => {
      const r = calculateEloChange(1200, 1000, 1);
      expect(r.deltaA).toBe(8);
      expect(r.deltaB).toBe(-8);
    });
  });

  describe('upset: lower-rated A(1000) beats higher-rated B(1400)', () => {
    it('A gains more than K/2', () => {
      const r = calculateEloChange(1000, 1400, 1);
      expect(r.deltaA).toBeGreaterThan(ELO_K / 2);
    });

    it('is a bigger gain than high-rated-beats-low', () => {
      const upset  = calculateEloChange(1000, 1400, 1);
      const normal = calculateEloChange(1400, 1000, 1);
      expect(upset.deltaA).toBeGreaterThan(normal.deltaA);
    });

    it('new ratings move in the right direction', () => {
      const r = calculateEloChange(1000, 1400, 1);
      expect(r.newA).toBeGreaterThan(1000);
      expect(r.newB).toBeLessThan(1400);
    });
  });

  describe('invariants', () => {
    it('newA = ratingA + deltaA', () => {
      const r = calculateEloChange(1150, 980, 1);
      expect(r.newA).toBe(1150 + r.deltaA);
    });

    it('newB = ratingB + deltaB', () => {
      const r = calculateEloChange(1150, 980, 1);
      expect(r.newB).toBe(980 + r.deltaB);
    });

    it('results are integers (Math.round applied)', () => {
      // Use ratings that produce a fractional expected score
      const r = calculateEloChange(1057, 1213, 1);
      expect(Number.isInteger(r.newA)).toBe(true);
      expect(Number.isInteger(r.newB)).toBe(true);
    });

    it('deltaA + deltaB = 0 (zero-sum)', () => {
      const cases: [number, number, 0 | 0.5 | 1][] = [
        [1000, 1000, 1],
        [1200, 800, 0.5],
        [900, 1100, 0],
      ];
      for (const [a, b, res] of cases) {
        const r = calculateEloChange(a, b, res);
        // Due to rounding, sum may be ±1 but never more
        expect(Math.abs(r.deltaA + r.deltaB)).toBeLessThanOrEqual(1);
      }
    });
  });
});

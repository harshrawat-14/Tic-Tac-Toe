// ─── Leaderboard & Player Stats persistence ─────────────────────────────────
// Uses Nakama storage for per-player stats and the built-in leaderboard API
// for ranked ELO. All functions use the global `nkruntime` namespace.

// ─── Constants ────────────────────────────────────────────────────────────────

export const LEADERBOARD_ID = 'global_elo';
export const STATS_COLLECTION = 'player_stats';
export const STATS_KEY = 'stats';

// DEFAULT_ELO, ELO_K, EloResult, and calculateEloChange are the single source
// of truth in ./utils/game-logic (zero Nakama dependency — testable in Node).
// They are re-exported here so existing call-sites don't need to change imports.
export {
  DEFAULT_ELO,
  ELO_K,
  calculateEloChange,
} from './utils/game-logic';
export type { EloResult } from './utils/game-logic';

// Private import for use inside getOrCreatePlayerStats default object
import { DEFAULT_ELO } from './utils/game-logic';

// ─── Internal Types ───────────────────────────────────────────────────────────

/** What we persist to Nakama storage (superset of LeaderboardEntry fields). */
export interface PlayerStats {
  userId: string;
  displayName: string;
  wins: number;
  losses: number;
  draws: number;
  winStreak: number;
  bestStreak: number;
  totalGames: number;
  eloRating: number;
}

// ─── Leaderboard Lifecycle ────────────────────────────────────────────────────

/**
 * Idempotently creates the `global_elo` leaderboard.
 * Call once from InitModule. Uses `set` operator so each
 * leaderboardRecordWrite replaces the score with the player's current ELO.
 *
 *  sortOrder     : 'desc' — higher ELO = better rank
 *  operator      : 'set'  — latest ELO overwrites previous
 *  resetSchedule : undefined — never resets automatically
 */
export function initLeaderboard(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
): void {
  const sortOrder = 'desc' as unknown as nkruntime.SortOrder;
  const operator = 'set' as unknown as nkruntime.Operator;

  try {
    nk.leaderboardCreate(
      LEADERBOARD_ID,   // id
      false,            // authoritative — false so RPCs can write
      sortOrder,        // sortOrder
      operator,         // operator — latest ELO overwrites previous
      undefined,        // resetSchedule  (never resets)
      undefined,        // metadata
      true,             // enableRank — so records get a rank number
    );
    logger.info('Leaderboard "%s" created / verified', LEADERBOARD_ID);
  } catch (e) {
    const msg = String(e);
    if (msg.toLowerCase().includes('already exists')) {
      logger.info('Leaderboard "%s" already exists, skipping create', LEADERBOARD_ID);
      return;
    }
    logger.error('Failed to create leaderboard "%s": %s', LEADERBOARD_ID, msg);
  }
}

// ─── Player Stats CRUD ───────────────────────────────────────────────────────

/**
 * Read a player's stats from storage, returning sensible defaults if the
 * record doesn't exist yet (first time a player joins a match).
 */
export function getOrCreatePlayerStats(
  nk: nkruntime.Nakama,
  userId: string,
  displayName?: string,
): PlayerStats {
  const objects = nk.storageRead([
    {
      collection: STATS_COLLECTION,
      key: STATS_KEY,
      userId: userId,
    },
  ]);

  if (objects && objects.length > 0) {
    const stored = JSON.parse(JSON.stringify(objects[0].value)) as PlayerStats;
    // Backfill displayName if it was updated since last write
    if (displayName && stored.displayName !== displayName) {
      stored.displayName = displayName;
    }
    return stored;
  }

  // First-time defaults
  return {
    userId: userId,
    displayName: displayName || '',
    wins: 0,
    losses: 0,
    draws: 0,
    winStreak: 0,
    bestStreak: 0,
    totalGames: 0,
    eloRating: DEFAULT_ELO,
  };
}

/**
 * Persist player stats to Nakama storage AND update the ELO leaderboard score.
 *
 * Storage permissions:
 *   permissionRead  = 1 (owner can read, server can always read)
 *   permissionWrite = 0 (only server can write — prevents client tampering)
 */
export function writePlayerStats(
  nk: nkruntime.Nakama,
  userId: string,
  stats: PlayerStats,
  logger: nkruntime.Logger,
): void {
  // 1. Write to storage
  nk.storageWrite([
    {
      collection: STATS_COLLECTION,
      key: STATS_KEY,
      userId: userId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      value: stats as unknown as { [key: string]: any },
      permissionRead: 1,
      permissionWrite: 0,
    },
  ]);

  // 2. Update leaderboard score (operator 'set' replaces previous)
  try {
    nk.leaderboardRecordWrite(
      LEADERBOARD_ID,
      userId,
      stats.displayName || userId,
      stats.eloRating,
      0,                // subscore
      undefined,        // metadata
      undefined,        // operator override — use leaderboard default ('set')
    );
  } catch (e) {
    const msg = String(e);
    logger.warn('writePlayerStats: leaderboard write failed, attempting create+retry: %s', msg);

    try {
      initLeaderboard(nk, logger);
      nk.leaderboardRecordWrite(
        LEADERBOARD_ID,
        userId,
        stats.displayName || userId,
        stats.eloRating,
        0,
        undefined,
        undefined,
      );
    } catch (retryErr) {
      logger.error('writePlayerStats: leaderboard write retry failed: %s', String(retryErr));
    }
  }
}

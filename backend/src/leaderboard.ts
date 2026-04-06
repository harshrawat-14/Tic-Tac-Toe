// ─── Leaderboard & Player Stats persistence ─────────────────────────────────
// Uses Nakama storage for per-player stats and the built-in leaderboard API
// for ranked ELO. All functions use the global `nkruntime` namespace.

// ─── Constants ───────────────────────────────────────────────────────────────

export const LEADERBOARD_ID = 'global_elo';
export const STATS_COLLECTION = 'player_stats';
export const STATS_KEY = 'stats';

/** Default ELO for new players. */
export const DEFAULT_ELO = 1000;

/** K-factor for ELO calculation. */
export const ELO_K = 32;

// ─── Internal Types ──────────────────────────────────────────────────────────

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

// ─── Leaderboard Lifecycle ───────────────────────────────────────────────────

/**
 * Idempotently creates the `global_elo` leaderboard.
 * Call once from InitModule. Uses `set` operator so each
 * leaderboardRecordWrite replaces the score with the player's current ELO.
 *
 *  sortOrder  : 'desc' — higher ELO = better rank
 *  operator   : 'set'  — latest ELO overwrites previous
 *  resetSchedule : undefined — never resets
 */
export function initLeaderboard(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
): void {
  try {
    nk.leaderboardCreate(
      LEADERBOARD_ID,   // id
      false,            // authoritative — false so RPCs can write
      nkruntime.SortOrder.DESCENDING, // sortOrder
      nkruntime.Operator.SET,         // operator — latest ELO overwrites previous
      undefined,        // resetSchedule  (never resets)
      undefined,        // metadata
      true,             // enableRank — so records get a rank number
    );
    logger.info('Leaderboard "%s" created / verified', LEADERBOARD_ID);
  } catch (e) {
    // leaderboardCreate throws if it already exists — that's fine
    logger.info('Leaderboard "%s" already exists, skipping create', LEADERBOARD_ID);
  }
}

// ─── Player Stats CRUD ──────────────────────────────────────────────────────

/**
 * Read a player's stats from storage, returning sensible defaults if the
 * record doesn't exist yet.
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
): void {
  // 1. Write to storage
  nk.storageWrite([
    {
      collection: STATS_COLLECTION,
      key: STATS_KEY,
      userId: userId,
      value: stats as unknown as { [key: string]: any },
      permissionRead: 1,
      permissionWrite: 0,
    },
  ]);

  // 2. Update leaderboard score (operator 'set' replaces previous)
  nk.leaderboardRecordWrite(
    LEADERBOARD_ID,
    userId,
    stats.displayName || userId,
    stats.eloRating,
    0,                // subscore
    undefined,        // metadata
    undefined,        // operator override — use leaderboard default ('set')
  );
}

// ─── ELO Calculation ─────────────────────────────────────────────────────────

export interface EloResult {
  newA: number;
  newB: number;
  deltaA: number;
  deltaB: number;
}

/**
 * Standard ELO calculation.
 *
 * @param ratingA — current ELO of player A
 * @param ratingB — current ELO of player B
 * @param resultA — 1 = A wins, 0 = A loses, 0.5 = draw
 * @returns new ratings and signed deltas for both players
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

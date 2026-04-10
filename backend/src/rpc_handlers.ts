// ─── RPC Handlers ────────────────────────────────────────────────────────────
// Each export matches `nkruntime.RpcFunction` signature:
//   (ctx, logger, nk, payload: string) => string | void

import type {
  CreateRoomRequest,
  CreateRoomResponse,
  GetLeaderboardRequest,
  GetLeaderboardResponse,
  LeaderboardEntry,
  PlayerStatsResponse,
  GameMode,
} from './types';

import {
  LEADERBOARD_ID,
  getOrCreatePlayerStats,
} from './leaderboard';

// ─── create_room ─────────────────────────────────────────────────────────────

/**
 * Creates a new authoritative match with the given game mode.
 * Client calls: `nakamaClient.rpc(session, 'create_room', payload)`
 *
 * Request:  { mode: 'classic' | 'timed' }
 * Response: { matchId: string }
 */
export const rpcCreateRoom: nkruntime.RpcFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  let mode: GameMode = 'classic';

  if (payload && payload.length > 0) {
    try {
      const req = JSON.parse(payload) as CreateRoomRequest;
      if (req.mode === 'classic' || req.mode === 'timed') {
        mode = req.mode;
      }
    } catch (_e) {
      logger.warn('create_room: invalid JSON payload, defaulting to classic');
    }
  }

  const matchId = nk.matchCreate('tictactoe', { mode: mode, type: 'private' });
  logger.info(
    'create_room: user=%s created match=%s mode=%s',
    ctx.userId,
    matchId,
    mode,
  );

  const response: CreateRoomResponse = { matchId };
  return JSON.stringify(response);
};

// ─── get_leaderboard ─────────────────────────────────────────────────────────

/**
 * Returns a paginated ELO leaderboard.
 *
 * Request:  { limit: number, cursor?: string }
 * Response: { entries: LeaderboardEntry[], nextCursor?: string }
 */
export const rpcGetLeaderboard: nkruntime.RpcFunction = function (
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  let limit = 10;
  let cursor: string | undefined;

  if (payload && payload.length > 0) {
    try {
      const req = JSON.parse(payload) as GetLeaderboardRequest;
      if (typeof req.limit === 'number' && req.limit > 0) {
        limit = Math.min(req.limit, 50);
      }
      if (req.cursor) {
        cursor = req.cursor;
      }
    } catch (_e) {
      logger.warn('get_leaderboard: invalid payload, using defaults');
    }
  }

  const result = nk.leaderboardRecordsList(
    LEADERBOARD_ID,
    [],            // ownerIds — empty = all
    limit,
    cursor,
    undefined,     // expiry override
  );

  const entries: LeaderboardEntry[] = [];

  if (result && result.records) {
    for (let i = 0; i < result.records.length; i++) {
      const record = result.records[i];
      const stats = getOrCreatePlayerStats(
        nk,
        record.ownerId,
        record.username || undefined,
      );

      entries.push({
        rank:        record.rank,
        userId:      record.ownerId,
        displayName: record.username || stats.displayName || record.ownerId,
        wins:        stats.wins,
        losses:      stats.losses,
        draws:       stats.draws,
        winStreak:   stats.winStreak,
        bestStreak:  stats.bestStreak,
        eloRating:   stats.eloRating,
      });
    }
  }

  const response: GetLeaderboardResponse = {
    entries,
    nextCursor: result && result.nextCursor ? result.nextCursor : undefined,
  };

  return JSON.stringify(response);
};

// ─── get_player_stats ────────────────────────────────────────────────────────

/**
 * Returns full stats for a single player including leaderboard rank.
 *
 * Request:  { userId?: string }   — omit to get own stats
 * Response: PlayerStatsResponse
 */
export const rpcGetPlayerStats: nkruntime.RpcFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  let targetUserId = ctx.userId;

  if (payload && payload.length > 0) {
    try {
      const req = JSON.parse(payload) as { userId?: string };
      if (req.userId && req.userId.length > 0) {
        targetUserId = req.userId;
      }
    } catch (_e) {
      logger.warn('get_player_stats: invalid payload, using ctx.userId');
    }
  }

  if (!targetUserId) {
    throw new Error('get_player_stats: no userId available');
  }

  const stats = getOrCreatePlayerStats(nk, targetUserId);

  // Fetch rank from leaderboard
  let rank = 0;
  try {
    const lbResult = nk.leaderboardRecordsList(
      LEADERBOARD_ID,
      [targetUserId],
      1,
      undefined,
      undefined,
    );
    if (lbResult && lbResult.ownerRecords && lbResult.ownerRecords.length > 0) {
      rank = lbResult.ownerRecords[0].rank;
    }
  } catch (_e) {
    logger.warn('get_player_stats: could not fetch leaderboard rank for %s', targetUserId);
  }

  const response: PlayerStatsResponse = {
    rank:        rank,
    userId:      stats.userId,
    displayName: stats.displayName,
    wins:        stats.wins,
    losses:      stats.losses,
    draws:       stats.draws,
    winStreak:   stats.winStreak,
    bestStreak:  stats.bestStreak,
    eloRating:   stats.eloRating,
    totalGames:  stats.totalGames,
  };

  return JSON.stringify(response);
};

// ─── get_active_matches ──────────────────────────────────────────────────────

interface ActiveMatchInfo {
  matchId: string;
  label: string;
  size: number;
}

/**
 * Lists currently active matches (for lobby display / spectator).
 *
 * Request:  (none)
 * Response: ActiveMatchInfo[]
 */
export const rpcGetActiveMatches: nkruntime.RpcFunction = function (
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _payload: string,
): string {
  const matches = nk.matchList(
    10,        // limit
    true,      // authoritative only
    undefined, // label filter
    1,         // min size (at least 1 player)
    2,         // max size
    '*',       // query — all
  );

  const result: ActiveMatchInfo[] = [];

  if (matches) {
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      result.push({
        matchId: m.matchId,
        label:   m.label || '',
        size:    m.size,
      });
    }
  }

  logger.debug('get_active_matches: found %d matches', result.length);
  return JSON.stringify(result);
};

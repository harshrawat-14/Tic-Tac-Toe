// ─── Nakama Runtime Entry Point ──────────────────────────────────────────────

import {
  matchInit,
  matchJoinAttempt,
  matchJoin,
  matchLeave,
  matchLoop,
  matchSignal,
  matchTerminate,
} from './match_handler';

import {
  rpcCreateRoom,
  rpcGetLeaderboard,
  rpcGetPlayerStats,
  rpcGetActiveMatches,
} from './rpc_handlers';

import { initLeaderboard } from './leaderboard';

export function InitModule(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _initializer: nkruntime.Initializer,
) {
  // 1. Create leaderboard
  initLeaderboard(nk, logger);

  // 2. Register matcher
  // initializer.registerMatch('tictactoe', {
  //   matchInit,
  //   matchJoinAttempt,
  //   matchJoin,
  //   matchLeave,
  //   matchLoop,
  //   matchSignal,
  //   matchTerminate,
  // });

  // 3. Register RPCs
  // initializer.registerRpc('create_room', rpcCreateRoom);
  // initializer.registerRpc('get_leaderboard', rpcGetLeaderboard);
  // initializer.registerRpc('get_player_stats', rpcGetPlayerStats);
  // initializer.registerRpc('get_active_matches', rpcGetActiveMatches);

  logger.info(
    'Tic-Tac-Toe module v%s initialized',
    ctx.env['NAKAMA_MODULE_VERSION'] || '1.0.0'
  );
}

// ─── Global Scope Assignments for Goja VM ──────────────────────────────────
// Nakama requires all handlers (both InitModule and registered match/RPC handlers)
// to exist in the global environment so it can map their names.

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

g.InitModule = InitModule;
g.matchInit = matchInit;
g.matchJoinAttempt = matchJoinAttempt;
g.matchJoin = matchJoin;
g.matchLeave = matchLeave;
g.matchLoop = matchLoop;
g.matchSignal = matchSignal;
g.matchTerminate = matchTerminate;
g.rpcCreateRoom = rpcCreateRoom;
g.rpcGetLeaderboard = rpcGetLeaderboard;
g.rpcGetPlayerStats = rpcGetPlayerStats;
g.rpcGetActiveMatches = rpcGetActiveMatches;

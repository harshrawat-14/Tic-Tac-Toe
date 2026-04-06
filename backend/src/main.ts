// ─── Nakama Runtime Entry Point ──────────────────────────────────────────────
// This file is the single entry point bundled by esbuild into build/index.js.
// Nakama discovers and calls `InitModule` on server startup.
//
// IMPORTANT: `nkruntime` is a global namespace provided by Nakama's runtime.
// Never `import` it — TypeScript sees it via @heroiclabs/nakama-runtime types.

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

// ─── InitModule ──────────────────────────────────────────────────────────────

function InitModule(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer,
) {
  // 1. Create leaderboard (idempotent)
  initLeaderboard(nk, logger);

  // 2. Register the authoritative match handler
  initializer.registerMatch('tictactoe', {
    matchInit,
    matchJoinAttempt,
    matchJoin,
    matchLeave,
    matchLoop,
    matchSignal,
    matchTerminate,
  });

  // 3. Register RPCs
  initializer.registerRpc('create_room', rpcCreateRoom);
  initializer.registerRpc('get_leaderboard', rpcGetLeaderboard);
  initializer.registerRpc('get_player_stats', rpcGetPlayerStats);
  initializer.registerRpc('get_active_matches', rpcGetActiveMatches);

  logger.info(
    'Tic-Tac-Toe module v%s initialized (node=%s)',
    ctx.env['NAKAMA_MODULE_VERSION'] || '1.0.0',
    ctx.env['NAKAMA_NODE_NAME'] || 'local',
  );
}

// Expose InitModule globally so Nakama's Goja VM can discover it,
// and so esbuild doesn't tree-shake it away.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).InitModule = InitModule;


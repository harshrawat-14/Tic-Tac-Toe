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

function matchmakerMatched(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  matches: nkruntime.MatchmakerResult[],
): string | void {
  if (!matches || matches.length < 2) {
    return;
  }

  const mode = matches[0]?.properties?.mode === 'timed' ? 'timed' : 'classic';
  const matchId = nk.matchCreate('tictactoe', { mode, type: 'matchmaker' });
  logger.info('matchmakerMatched: created match=%s mode=%s players=%d', matchId, mode, matches.length);
  return matchId;
}

function probeMatchInit(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _params: { [key: string]: string },
): { state: nkruntime.MatchState; tickRate: number; label: string } {
  return {
    state: {} as nkruntime.MatchState,
    tickRate: 1,
    label: 'probe',
  };
}

function probeMatchJoinAttempt(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: nkruntime.MatchState,
  _presence: nkruntime.Presence,
  _metadata: { [key: string]: string },
): { state: nkruntime.MatchState; accept: boolean; rejectMessage?: string } | null {
  return { state, accept: true };
}

function probeMatchJoin(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: nkruntime.MatchState,
  _presences: nkruntime.Presence[],
): { state: nkruntime.MatchState } | null {
  return { state };
}

function probeMatchLeave(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: nkruntime.MatchState,
  _presences: nkruntime.Presence[],
): { state: nkruntime.MatchState } | null {
  return { state };
}

function probeMatchLoop(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: nkruntime.MatchState,
  _messages: nkruntime.MatchMessage[],
): { state: nkruntime.MatchState } | null {
  return { state };
}

function probeMatchSignal(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: nkruntime.MatchState,
  data: string,
): { state: nkruntime.MatchState; data?: string } | null {
  return { state, data };
}

function probeMatchTerminate(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: nkruntime.MatchState,
  _graceSeconds: number,
): { state: nkruntime.MatchState } | null {
  return { state };
}

function InternalInitModule(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer,
) {
  initLeaderboard(nk, logger);

  initializer.registerMatch('probe', {
    matchInit: probeMatchInit,
    matchJoinAttempt: probeMatchJoinAttempt,
    matchJoin: probeMatchJoin,
    matchLeave: probeMatchLeave,
    matchLoop: probeMatchLoop,
    matchSignal: probeMatchSignal,
    matchTerminate: probeMatchTerminate,
  });

  initializer.registerMatchmakerMatched(matchmakerMatched);

  initializer.registerRpc('create_room', rpcCreateRoom);
  initializer.registerRpc('get_leaderboard', rpcGetLeaderboard);
  initializer.registerRpc('get_player_stats', rpcGetPlayerStats);
  initializer.registerRpc('get_active_matches', rpcGetActiveMatches);

  logger.info(
    'Tic-Tac-Toe module v%s initialized',
    ctx.env['NAKAMA_MODULE_VERSION'] || '1.0.0',
  );
}

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;
g.InternalInitModule = InternalInitModule;
g.matchInit = matchInit;
g.matchJoinAttempt = matchJoinAttempt;
g.matchJoin = matchJoin;
g.matchLeave = matchLeave;
g.matchLoop = matchLoop;
g.matchSignal = matchSignal;
g.matchTerminate = matchTerminate;
g.matchmakerMatched = matchmakerMatched;
g.initLeaderboard = initLeaderboard;
g.probeMatchInit = probeMatchInit;
g.probeMatchJoinAttempt = probeMatchJoinAttempt;
g.probeMatchJoin = probeMatchJoin;
g.probeMatchLeave = probeMatchLeave;
g.probeMatchLoop = probeMatchLoop;
g.probeMatchSignal = probeMatchSignal;
g.probeMatchTerminate = probeMatchTerminate;
g.rpcCreateRoom = rpcCreateRoom;
g.rpcGetLeaderboard = rpcGetLeaderboard;
g.rpcGetPlayerStats = rpcGetPlayerStats;
g.rpcGetActiveMatches = rpcGetActiveMatches;

const esbuild = require('esbuild');
const fs = require('fs');

esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'build/index.js',
  target: 'es6',
  format: 'iife',
  globalName: '__nakamaExports'
}).then(() => {
  let js = fs.readFileSync('build/index.js', 'utf8');

  // Nakama JS runtime statically inspects top-level InitModule AST to extract
  // callback identifiers. Keep this compatibility layer as plain top-level
  // function declarations and direct register* calls.
  const foot = `
function tttMatchInit(ctx, logger, nk, params) {
  return globalThis.matchInit(ctx, logger, nk, params);
}

function tttMatchJoinAttempt(ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
  return globalThis.matchJoinAttempt(ctx, logger, nk, dispatcher, tick, state, presence, metadata);
}

function tttMatchJoin(ctx, logger, nk, dispatcher, tick, state, presences) {
  return globalThis.matchJoin(ctx, logger, nk, dispatcher, tick, state, presences);
}

function tttMatchLeave(ctx, logger, nk, dispatcher, tick, state, presences) {
  return globalThis.matchLeave(ctx, logger, nk, dispatcher, tick, state, presences);
}

function tttMatchLoop(ctx, logger, nk, dispatcher, tick, state, messages) {
  return globalThis.matchLoop(ctx, logger, nk, dispatcher, tick, state, messages);
}

function tttMatchSignal(ctx, logger, nk, dispatcher, tick, state, data) {
  return globalThis.matchSignal(ctx, logger, nk, dispatcher, tick, state, data);
}

function tttMatchTerminate(ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
  return globalThis.matchTerminate(ctx, logger, nk, dispatcher, tick, state, graceSeconds);
}

function tttMatchmakerMatched(ctx, logger, nk, matches) {
  return globalThis.matchmakerMatched(ctx, logger, nk, matches);
}

function tttRpcCreateRoom(ctx, logger, nk, payload) {
  return globalThis.rpcCreateRoom(ctx, logger, nk, payload);
}

function tttRpcGetLeaderboard(ctx, logger, nk, payload) {
  return globalThis.rpcGetLeaderboard(ctx, logger, nk, payload);
}

function tttRpcGetPlayerStats(ctx, logger, nk, payload) {
  return globalThis.rpcGetPlayerStats(ctx, logger, nk, payload);
}

function tttRpcGetActiveMatches(ctx, logger, nk, payload) {
  return globalThis.rpcGetActiveMatches(ctx, logger, nk, payload);
}

function InitModule(ctx, logger, nk, initializer) {
  if (typeof globalThis.initLeaderboard === 'function') {
    globalThis.initLeaderboard(nk, logger);
  }

  initializer.registerMatch('tictactoe', {
    matchInit: tttMatchInit,
    matchJoinAttempt: tttMatchJoinAttempt,
    matchJoin: tttMatchJoin,
    matchLeave: tttMatchLeave,
    matchLoop: tttMatchLoop,
    matchSignal: tttMatchSignal,
    matchTerminate: tttMatchTerminate,
  });

  initializer.registerMatchmakerMatched(tttMatchmakerMatched);

  initializer.registerRpc('create_room', tttRpcCreateRoom);
  initializer.registerRpc('get_leaderboard', tttRpcGetLeaderboard);
  initializer.registerRpc('get_player_stats', tttRpcGetPlayerStats);
  initializer.registerRpc('get_active_matches', tttRpcGetActiveMatches);

  logger.info('Tic-Tac-Toe module compatibility InitModule initialized');
}

globalThis.InitModule = InitModule;
`;
  fs.writeFileSync('build/index.js', js + "\n" + foot);
  console.log('Built successfully and appended Nakama compatibility wrappers.');
}).catch(() => process.exit(1));

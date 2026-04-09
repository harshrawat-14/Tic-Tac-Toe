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
  
  // Explicit standard var declarations so Nakama Goja finds them globally
  const foot = `
var InitModule = __nakamaExports.InitModule;
var matchInit = __nakamaExports.matchInit;
var matchJoinAttempt = __nakamaExports.matchJoinAttempt;
var matchJoin = __nakamaExports.matchJoin;
var matchLeave = __nakamaExports.matchLeave;
var matchLoop = __nakamaExports.matchLoop;
var matchSignal = __nakamaExports.matchSignal;
var matchTerminate = __nakamaExports.matchTerminate;
var rpcCreateRoom = __nakamaExports.rpcCreateRoom;
var rpcGetLeaderboard = __nakamaExports.rpcGetLeaderboard;
var rpcGetPlayerStats = __nakamaExports.rpcGetPlayerStats;
var rpcGetActiveMatches = __nakamaExports.rpcGetActiveMatches;
`;
  fs.writeFileSync('build/index.js', js + "\n" + foot);
  console.log("Built successfully and appended global bindings via var declarations.");
}).catch(() => process.exit(1));

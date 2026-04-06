# CONTEXT_HANDOFF.md — Nakama Tic-Tac-Toe Monorepo
> Sessions 1–2 of N | Last updated: 2026-04-06

---

## Project Layout

```
Tic-Tac-Toe/
├── backend/   (Nakama JS/TS runtime module)
└── frontend/  (React 18 + TypeScript + Vite SPA)
```

---

## SESSION 1 — DONE ✅ (Scaffold & Shared Types)

| File | Status |
|---|---|
| `backend/src/types.ts` | ✅ DONE |
| `backend/package.json` | ✅ DONE |
| `backend/tsconfig.json` | ✅ DONE |
| `frontend/package.json` | ✅ DONE |
| `frontend/tsconfig.json` | ✅ DONE |
| `frontend/tsconfig.node.json` | ✅ DONE |
| `frontend/vite.config.ts` | ✅ DONE |
| `frontend/tailwind.config.ts` | ✅ DONE |
| `folder-structure.md` | ✅ DONE |

## SESSION 2 — DONE ✅ (Backend Match Handler + RPCs + Leaderboard)

| File | Status |
|---|---|
| `backend/src/main.ts` | ✅ DONE |
| `backend/src/match_handler.ts` | ✅ DONE |
| `backend/src/leaderboard.ts` | ✅ DONE |
| `backend/src/rpc_handlers.ts` | ✅ DONE |
| `backend/build/index.js` | ✅ DONE (22.3kb, esbuild es2015) |

**Verification**: `tsc --noEmit` passes (0 errors). `npm run build` produces a valid 22.3kb bundle.

---

## Canonical Types (`backend/src/types.ts`) — ✅ DONE (unchanged from Session 1)

```ts
export enum OpCode { GAME_STATE=1, MOVE=2, MOVE_RESULT=3, GAME_OVER=4, PLAYER_JOINED=5, PLAYER_LEFT=6, RECONNECT_WINDOW=7, TIMER_TICK=8, FORFEIT=9 }
export type GameStatus = 'WAITING' | 'READY' | 'PLAYER_X_TURN' | 'PLAYER_O_TURN' | 'GAME_OVER';
export type GameMode = 'classic' | 'timed';
export interface PlayerState { userId, displayName, symbol:'X'|'O', connected, eloRating, wins, losses, draws, winStreak }
export interface MatchState { board:(string|null)[], currentTurn, players, playerOrder, status, winner, isDraw, turnTimeLeft, turnForfeits, mode, moveHistory, matchId, reconnectDeadline }
// Message payloads: MovePayload, MoveResultPayload, GameOverPayload, ReconnectWindowPayload, TimerTickPayload, ForfeitPayload, GameStatePayload
// RPC types: CreateRoomRequest, CreateRoomResponse, GetLeaderboardRequest, GetLeaderboardResponse, LeaderboardEntry, PlayerStatsResponse
```

---

## Leaderboard Module (`backend/src/leaderboard.ts`) — ✅ DONE

```ts
export const LEADERBOARD_ID = 'global_elo';
export const STATS_COLLECTION = 'player_stats';
export const STATS_KEY = 'stats';
export const DEFAULT_ELO = 1000;
export const ELO_K = 32;

export interface PlayerStats { userId, displayName, wins, losses, draws, winStreak, bestStreak, totalGames, eloRating }
export interface EloResult { newA, newB, deltaA, deltaB }

export function initLeaderboard(nk: nkruntime.Nakama, logger: nkruntime.Logger): void;
export function getOrCreatePlayerStats(nk: nkruntime.Nakama, userId: string, displayName?: string): PlayerStats;
export function writePlayerStats(nk: nkruntime.Nakama, userId: string, stats: PlayerStats): void;
export function calculateEloChange(ratingA: number, ratingB: number, resultA: 0|0.5|1): EloResult;
```

**Decision**: `leaderboardCreate` uses `nkruntime.SortOrder.DESCENDING` and `nkruntime.Operator.SET` (not string literals).
**Decision**: `writePlayerStats` writes to storage AND updates leaderboard score in one call.
**Decision**: `getOrCreatePlayerStats` returns defaults if no storage record exists (never throws).

---

## Match Handler (`backend/src/match_handler.ts`) — ✅ DONE

### Exported Functions (individually, not as object)
```ts
export { matchInit, matchJoinAttempt, matchJoin, matchLeave, matchLoop, matchSignal, matchTerminate };
```

### Internal Constants
```ts
const TURN_TIME_SECONDS = 30;
const RECONNECT_WINDOW_SECONDS = 30;
const MAX_TURN_FORFEITS = 3;
const MAX_PLAYERS = 2;
const WIN_LINES: [number,number,number][] = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
```

### Internal Helpers
```ts
function broadcastMessage(dispatcher, opCode: OpCode, payload: object, presences?, sender?): void;
function checkWinner(board: (string|null)[]): string | null;
function isBoardFull(board: (string|null)[]): boolean;
function switchTurn(state: MatchState): MatchState;
function connectedPlayerCount(state: MatchState): number;
function resolveGameEnd(state, winnerUserId, loserUserId, isDraw, nk, dispatcher, logger): MatchState;
function updateAndWriteStats(nk, userId, stats: PlayerStats, result: 'win'|'loss'|'draw', newElo, logger): void;
function handleMove(state, userId, payload: MovePayload, dispatcher, nk, logger): MatchState;
```

### Key Behaviors
- **matchInit**: default mode='classic', initializes empty 9-cell board, tickRate=1, label = `{mode}`
- **matchJoinAttempt**: allows reconnection for existing players, rejects if 2 players or GAME_OVER
- **matchJoin**: reconnecting players get full GAME_STATE; new players assigned X(first)/O(second); game starts when 2 players present
- **matchLeave**: sets reconnectDeadline = Date.now() + 30000; removes player entirely if still WAITING
- **matchLoop**: processes MOVE and FORFEIT opcodes; checks reconnect deadlines; handles timed-mode decrement
- **Timer**: decrements each tick, auto-skips turn on timeout, forfeits match after 3 consecutive timeouts
- **handleMove**: validates turn/cell/status, applies move, checks win (checkWinner) then draw (isBoardFull), calls resolveGameEnd or switchTurn
- **resolveGameEnd**: calculates ELO, writes stats via writePlayerStats, broadcasts GAME_OVER
- **matchTerminate**: broadcasts GAME_OVER with isDraw=true if game wasn't already over
- **Message data**: uses `nk.binaryToString(message.data)` to decode MatchMessage.data (ArrayBuffer)

---

## RPC Handlers (`backend/src/rpc_handlers.ts`) — ✅ DONE

```ts
export const rpcCreateRoom: nkruntime.RpcFunction;      // RPC id: 'create_room'
export const rpcGetLeaderboard: nkruntime.RpcFunction;   // RPC id: 'get_leaderboard'
export const rpcGetPlayerStats: nkruntime.RpcFunction;   // RPC id: 'get_player_stats'
export const rpcGetActiveMatches: nkruntime.RpcFunction; // RPC id: 'get_active_matches'
```

- `create_room`: parses `CreateRoomRequest`, calls `nk.matchCreate('tictactoe', {mode})`, returns `CreateRoomResponse`
- `get_leaderboard`: max limit 50, uses `leaderboardRecordsList` + `getOrCreatePlayerStats` for each record
- `get_player_stats`: uses `ctx.userId` by default, fetches rank from `leaderboardRecordsList(LEADERBOARD_ID, [userId], 1)`
- `get_active_matches`: `nk.matchList(10, true, undefined, 1, 2, '*')`, returns `{matchId, label, size}[]`

---

## Entry Point (`backend/src/main.ts`) — ✅ DONE

```ts
function InitModule(ctx, logger, nk, initializer): void;
(globalThis as any).InitModule = InitModule;
```

**Decision**: Uses `globalThis.InitModule` assignment (not `!InitModule && InitModule.bind`). Without this, esbuild tree-shakes the function.

Registers: match='tictactoe', RPCs: 'create_room', 'get_leaderboard', 'get_player_stats', 'get_active_matches'.

---

## Key Implementation Decisions (cumulative)

- **`playerOrder[0]` is always X**, `playerOrder[1]` always O.
- **`turnTimeLeft = -1`** = classic mode. Timer ticks never sent.
- **`board` is flat 9-element**, row-major (0=top-left, 8=bottom-right).
- **`reconnectDeadline`** stores ms timestamps. Compare with `Date.now()`.
- **`turnForfeits`** >= 3 → entire match forfeited.
- **ELO K-factor = 32**. `calculateEloChange()` uses `Math.round()`.
- **Draw does NOT reset win streak** (only losses do).
- **Timed mode resets `turnTimeLeft` to 30** on every valid move AND on turn skip.
- **MoveResultPayload.nextTurn = ''** (empty string) when game ends on that move.
- **matchLeave during WAITING** removes player entirely (splice from playerOrder, delete from players).
- **matchLoop returns null** only when all players disconnect after GAME_OVER (terminates match).

## Toolchain Decisions (updated)

- **Backend build target is `es2015`** (NOT es5 — esbuild can't transpile const/let to es5). Nakama's Goja supports es2015.
- **Backend tsconfig** uses `typeRoots: ["./node_modules"]` and `types: ["nakama-runtime"]` to resolve the `nkruntime` global namespace.
- **nakama-runtime** installed as `"nakama-runtime": "github:heroiclabs/nakama-common"` (no npm published package).
- **Frontend module resolution is `bundler`**; `allowImportingTsExtensions: true`.
- **`@/*` alias** → `./src/*` in both tsconfig and vite.config.ts.
- **`/api` proxy** → `http://localhost:7350` with `ws: true`.
- **Tailwind dark mode** is `class`-based.

## Tailwind Custom Tokens — ✅ DONE (unchanged)

```
brand.*         teal (50→950), primary = brand-500 (#14b8a6)
game-x.DEFAULT  #E24B4A   (.light .dark .glow)
game-o.DEFAULT  #378ADD   (.light .dark .glow)
game-bg.DEFAULT #0f172a   (.surface .elevated .border .muted)
```

---

## Deviation Log

| Planned | Actual | Reason |
|---|---|---|
| Separate `match/handler.ts`, `match/logic.ts`, `match/timer.ts` | Single `match_handler.ts` | Logic, timer, and handler are tightly coupled; splitting would cause circular deps and excessive state passing |
| Separate `rpc/createRoom.ts`, `rpc/getStats.ts`, `rpc/leaderboard.ts` | Single `rpc_handlers.ts` | All RPCs share imports and patterns; separate files add overhead without benefit |
| Separate `utils/elo.ts`, `utils/codec.ts` | Merged into `leaderboard.ts` | ELO calc is only used by leaderboard/match; codec is just JSON.parse/stringify |
| `hooks/afterAuth.ts` | Not implemented | Can be added later; player stats are auto-created on first game join via `getOrCreatePlayerStats` |
| esbuild `--target=es5` | `--target=es2015` | esbuild cannot transpile const/let/arrow to ES5; Goja supports ES2015 fine |

---

## TODO — Session 3 (Frontend Foundation)

```
frontend/src/main.tsx
frontend/src/App.tsx
frontend/src/types/game.ts        re-export backend types (copy, not symlink)
frontend/src/lib/nakama.ts        singleton Client + Socket factory
frontend/src/lib/queryClient.ts
frontend/src/lib/utils.ts         cn() helper
frontend/src/store/authStore.ts
frontend/src/store/gameStore.ts
frontend/src/store/settingsStore.ts
frontend/src/styles/globals.css
frontend/postcss.config.cjs
frontend/index.html
```

## TODO — Session 4 (UI Components + Pages)

```
All files under frontend/src/components/
All files under frontend/src/pages/
All files under frontend/src/hooks/
frontend/src/test/setup.ts
```

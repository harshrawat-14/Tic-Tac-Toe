# Nakama Tic-Tac-Toe — Multiplayer Game Server

> A production-grade, server-authoritative multiplayer Tic-Tac-Toe platform built for the LILA hiring assignment.  
> **Live demo:** `https://tictactoe.your-domain.com` · **API:** `https://api.your-domain.com`

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Data Flow: A Move in 12 Steps](#3-data-flow-a-move-in-12-steps)
4. [Low-Level Design](#4-low-level-design)
5. [Tech Stack Decisions](#5-tech-stack-decisions)
6. [Local Setup](#6-local-setup)
7. [Testing the Multiplayer Flow](#7-testing-the-multiplayer-flow)
8. [Deployment](#8-deployment)
9. [API Reference](#9-api-reference)
10. [Bonus Features](#10-bonus-features-implemented)
11. [Known Limitations & Future Work](#11-known-limitations--future-work)

---

## 1. Project Overview

### What It Is

A real-time, server-authoritative multiplayer Tic-Tac-Toe game. "Server-authoritative" means the backend is the single source of truth for all game state — the frontend never trusts its own move results until the server confirms them. This eliminates a whole class of cheating and race conditions that plague peer-to-peer or client-authoritative designs.

### Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Backend runtime** | [Nakama](https://heroiclabs.com/nakama/) (TypeScript/Goja) | Authoritative match handler, matchmaking, RPC, leaderboard |
| **Backend DB** | PostgreSQL 15 (via Nakama) | Player accounts, sessions, storage collections |
| **Cache** | Redis 7 (via Nakama) | Session tokens, match presence tracking |
| **Frontend** | React 18 + TypeScript + Vite | SPA game client |
| **State management** | Zustand | Single-store client game state |
| **Styling** | Tailwind CSS v3 + Framer Motion | Design system + micro-animations |
| **Infrastructure** | AWS ECS Fargate + RDS Aurora Serverless v2 | Container hosting + managed DB |
| **CDN / frontend host** | Vercel | Global edge delivery for the SPA |
| **IaC** | Terraform 1.6+ | All AWS infrastructure as code |
| **CI/CD** | GitHub Actions (3 workflows) | CI, deploy, PR preview |

### Screenshots

```
┌──────────────────────────────────────────────────────────────┐
│  [Login page — space-themed dark UI with device auth]         │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│  [Lobby — mode selector, Quick Match, private room button]    │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│  [Gameplay — 3×3 grid, player bars with ELO, turn timer]     │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│  [Game Over — animated ELO delta count-up, leaderboard top3] │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Vercel CDN)                          │
│   React 18 SPA · Zustand store · Framer Motion · Tailwind CSS            │
│   Vite build · TypeScript · @heroiclabs/nakama-js SDK                    │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                   HTTPS / WSS (port 443)
                                │
                        ┌───────▼────────┐
                        │  Cloudflare    │  DDoS, WAF, TLS termination
                        │  (optional)    │
                        └───────┬────────┘
                                │
                        ┌───────▼────────────────┐
                        │  AWS Application LB     │
                        │  idle_timeout = 3600s   │  WebSocket keepalive
                        │  sticky sessions        │  match affinity
                        └───────┬────────────────┘
                                │
                 ┌──────────────▼──────────────┐
                 │   ECS Fargate Task           │
                 │   nakama:latest image        │
                 │                              │
                 │   ┌──────────────────────┐   │
                 │   │  Nakama Runtime       │   │
                 │   │  (TypeScript/Goja)    │   │
                 │   │                      │   │
                 │   │  • Auth (device-id)   │   │
                 │   │  • Matchmaker         │   │
                 │   │  • Match Handler      │   │  ← game logic lives here
                 │   │  • RPCs               │   │
                 │   │  • Leaderboard        │   │
                 │   └──────────────────────┘   │
                 └──────┬───────────────┬────────┘
                        │               │
          ┌─────────────▼──┐     ┌──────▼────────────┐
          │  Aurora Serverless │     │  ElastiCache       │
          │  PostgreSQL 15     │     │  Redis 7           │
          │                   │     │                    │
          │  • player accounts │     │  • session cache   │
          │  • match storage   │     │  • match presence  │
          │  • leaderboard     │     │  • rate limiting   │
          │  • player_stats    │     │                    │
          └───────────────────┘     └────────────────────┘

Concerns by location:
  Auth         → Nakama built-in (device ID → JWT session token)
  Game state   → Nakama match handler (in-memory per match tick)
  Persistence  → Nakama Storage (PostgreSQL) via writePlayerStats()
  Matchmaking  → Nakama matchmaker (query: "*", size: 2)
  Leaderboard  → Nakama leaderboard API (global_elo, operator=SET)
  Reconnection → match handler reconnectDeadline map + RECONNECT_WINDOW opcode
```

---

## 3. Data Flow: A Move in 12 Steps

```
 Client (React)                    Nakama Server (matchLoop)              DB / Leaderboard
 ──────────────                    ─────────────────────────              ────────────────

 1. User taps cell[4]
    │
 2. Optimistic update:
    board[4] = mySymbol
    pendingCell = 4
    isMyTurn = false
    │
 3. socket.sendMatchState(
      matchId,
      OpCode.MOVE,          ──────────────────────────────►
      {cellIndex: 4}
    )
                                4. matchLoop() receives
                                   MatchMessage (opCode=2)
                                   decoded via nk.binaryToString()
                                   │
                                5. Server validates move:
                                   • userId === currentTurn?
                                   • cellIndex ∈ [0,8]?
                                   • board[4] === null?
                                   • status ∈ {X_TURN, O_TURN}?
                                   │  (any fail → message ignored)
                                   │
                                6. board[4] = symbol
                                   moveHistory.push(4)
                                   │
                                7. checkWinner(board)?
                                   isBoardFull(board)?
                                   │
                          ┌── 8a. Game continues:
                          │      switchTurn(state)
                          │      broadcastMessage(MOVE_RESULT, {
                          │        cellIndex, symbol,
                          │        nextTurn: opponentId,
                          │        board: newBoard
                          │      })
                          │
                          └── 8b. Game over:
                                 calculateEloChange()        ──────────►  writePlayerStats()
                                 broadcastMessage(MOVE_RESULT, {          leaderboardRecordWrite()
                                   nextTurn: ''              ◄──────────
                                 })
                                 broadcastMessage(GAME_OVER, {
                                   winner, isDraw, eloChanges,
                                   finalBoard
                                 })

  ◄─────────────────────────────────────────────────────────────
 9.  socket.onmatchdata fires
     opCode === MOVE_RESULT
     │
10.  pendingCell = null       (clear optimistic state)
     board synced to server's board field
     │
11.  GameBoard re-renders
     with confirmed board state
     │
12.  If GAME_OVER also arrives:
     lastEloChange = eloChanges[myUserId]
     status = 'GAME_OVER'
     navigate('/game-over') after 1.5s
```

---

## 4. Low-Level Design

### 4a. Match State Machine

```
  ┌──────────┐    2nd player joins     ┌─────────┐
  │ WAITING  │ ─────────────────────► │  READY  │
  └──────────┘                         └────┬────┘
   matchJoin()                              │  matchJoin() sets X/O
   1st player present                       │  broadcasts GAME_STATE
                                            │
                                            ▼
                                    ┌──────────────────┐
                         ┌──────── │  PLAYER_X_TURN  │ ◄────────┐
                         │  X move  └──────────────────┘  O move │
                         │ (valid)          │                      │
                         │          handleMove()            handleMove()
                         │          switchTurn()            switchTurn()
                         ▼                  ▼                     │
                ┌──────────────────┐  ┌──────────────────┐        │
                │  PLAYER_O_TURN  │  │  GAME_OVER       │        │
                └────────┬─────────┘  └──────────────────┘        │
                         │  O move (valid)    ▲                   │
                         │  ─────────────────>│                   │
                         └────────────────────┘                   │
                                                                   │
  Transitions to GAME_OVER triggered by:                           │
    • checkWinner()  — 3-in-a-row found                           │
    • isBoardFull()  — all 9 cells filled                          │
    • turnForfeits >= 3 in timed mode                              │
    • opponent never reconnects (30s timeout)                      │
    • FORFEIT opcode received                                      │
    • matchTerminate() — server shutdown / match expiry            │
```

### 4b. Move Validation Flowchart

```
  handleMove(state, userId, {cellIndex})
          │
          ▼
  userId === state.currentTurn?
          │ NO  ── drop message (not your turn)
          │ YES
          ▼
  state.status ∈ {PLAYER_X_TURN, PLAYER_O_TURN}?
          │ NO  ── drop message (game not active)
          │ YES
          ▼
  cellIndex ∈ [0, 8]?
          │ NO  ── drop message (invalid index)
          │ YES
          ▼
  state.board[cellIndex] === null?
          │ NO  ── drop message (cell occupied)
          │ YES
          ▼
  Apply move: board[cellIndex] = symbol
  moveHistory.push(cellIndex)
          │
          ▼
  checkWinner(board)?
          │ YES ─────────────────► resolveGameEnd(winner)
          │ NO
          ▼
  isBoardFull(board)?
          │ YES ─────────────────► resolveGameEnd(draw)
          │ NO
          ▼
  switchTurn(state)
  broadcastMessage(MOVE_RESULT, {nextTurn: opponentId, ...})
```

### 4c. Reconnection Sequence Diagram

```
  Time ──────────────────────────────────────────────────────────────────────►

  Player A          │           Server (matchLeave/matchLoop)       │  Player B
  ──────────────────┼───────────────────────────────────────────────┼──────────
                    │                                               │
  [network drop]    │                                               │
  ──────────────────►  matchLeave() fires                           │
                    │  state.players[A].connected = false           │
                    │  state.reconnectDeadline[A] =                 │
                    │    Date.now() + 30_000                        │
                    │                                               │
                    │  broadcastMessage(PLAYER_LEFT,                │
                    │    {userId: A, reason:'disconnect'}) ─────────►
                    │                                               │  opponentReconnecting = true
                    │                                               │  DisconnectionOverlay shown
                    │                                               │
                    │  (each matchLoop tick ~1s)                    │
                    │  broadcastMessage(RECONNECT_WINDOW,           │
                    │    {userId: A, secondsLeft: 29}) ─────────────►
                    │                                               │  countdown: 29s
                    │                (... ticks ...)                │
                    │                                               │
  [reconnects]      │                                               │
  ──────────────────►  matchJoinAttempt():                          │
                    │    userId found in state.players? YES         │
                    │    status === GAME_OVER? NO                   │
                    │    → rejoin allowed (reconnect path)          │
                    │                                               │
                    │  matchJoin():                                 │
                    │    players[A].connected = true                │
                    │    delete reconnectDeadline[A]                │
                    │    broadcastMessage(GAME_STATE, fullState) ───► to A only
  ◄─────────────────                                               │
  Game resumes      │  opponentReconnecting = false ───────────────►
                    │  DisconnectionOverlay hidden                  │
```

### 4d. Timer Logic (Timed Mode Pseudocode)

```typescript
// matchLoop runs every 1 second (tickRate = 1)
function matchLoop(state, dispatcher, ...) {
  // ── 1. Process inbound MOVE / FORFEIT messages ──────────────────────────
  for (const message of messages) {
    if (message.opCode === OpCode.MOVE)    state = handleMove(state, ...)
    if (message.opCode === OpCode.FORFEIT) state = resolveGameEnd(..., state.currentTurn wins)
  }

  // ── 2. Timer logic (timed mode only) ────────────────────────────────────
  if (state.mode === 'timed' && state.turnTimeLeft >= 0) {
    state.turnTimeLeft -= 1

    broadcastMessage(TIMER_TICK, { secondsLeft: state.turnTimeLeft, currentTurn })

    if (state.turnTimeLeft <= 0) {
      // Turn expired — increment forfeit counter
      state.turnForfeits[state.currentTurn] += 1

      if (state.turnForfeits[state.currentTurn] >= MAX_TURN_FORFEITS) {
        // 3 consecutive timeouts → forfeit entire match
        const winner = the OTHER player
        return resolveGameEnd(state, winner, ...)   // GAME_OVER broadcast
      } else {
        // Skip this turn, reset timer, continue
        state = switchTurn(state)  // state.turnTimeLeft reset to 30
      }
    }
  }

  // ── 3. Reconnection deadline check ──────────────────────────────────────
  for (const [userId, deadline] of Object.entries(state.reconnectDeadline)) {
    if (Date.now() > deadline) {
      // Player never came back — forfeit match, opponent wins
      const winner = the OTHER player
      return resolveGameEnd(state, winner, ...)
    }
  }

  // ── 4. Terminate match if all connected players have left post-GAME_OVER ─
  if (state.status === 'GAME_OVER' && connectedPlayerCount(state) === 0) {
    return null   // Nakama terminates the match
  }

  return { state }
}
```

### 4e. ELO Formula

Standard Elo rating system with K-factor = 32:

```
Expected score:   E_A = 1 / (1 + 10^((R_B - R_A) / 400))
New rating:       R_A' = round(R_A + K * (S_A - E_A))

  S_A = 1     (A wins)
  S_A = 0.5   (draw)
  S_A = 0     (A loses)
```

**Example from README test suite** — Player A (1200 ELO) beats Player B (1000 ELO):

```
E_A = 1 / (1 + 10^((1000 - 1200) / 400))
    = 1 / (1 + 10^(-0.5))
    = 1 / (1 + 0.3162)
    = 1 / 1.3162
    ≈ 0.7597

delta_A = round(32 × (1 - 0.7597))
        = round(32 × 0.2403)
        = round(7.69)
        = +8

delta_B = round(32 × (0 - (1 - 0.7597)))
        = round(32 × -0.2403)
        = round(-7.69)
        = -8

R_A' = 1200 + 8  = 1208
R_B' = 1000 - 8  = 992
```

Note: Due to `Math.round()`, `|deltaA + deltaB| ≤ 1` (nearly zero-sum). This is verified as an invariant in the test suite.

### 4f. Storage Schema

#### What lives where and why

**Nakama Storage Engine (backed by PostgreSQL)**

| Collection | Key | Owner | Contents | Why here |
|---|---|---|---|---|
| `player_stats` | `stats` | `userId` | `PlayerStats` JSON (wins, losses, ELO, streaks) | Nakama's storage API provides per-user scoping, OCC versioning, and read/write permission controls in one call |

Permission model: `permissionRead=1` (owner + server), `permissionWrite=0` (server-only). Prevents client-side score manipulation.

**Nakama Leaderboard (PostgreSQL under the hood)**

| Board ID | Sort | Operator | Reset |
|---|---|---|---|
| `global_elo` | DESCENDING | SET | Never |

The `leaderboardRecordList` API returns pre-sorted ranks without a `SELECT … ORDER BY` query — Nakama maintains internal rank state.

**In-Memory Match State (Goja VM heap)**

```typescript
interface MatchState {
  board: (string | null)[]     // 9-cell flat array
  players: Record<string, PlayerState>
  status: GameStatus
  currentTurn: string          // userId
  reconnectDeadline: Record<string, number>   // ms timestamps
  turnForfeits: Record<string, number>
  moveHistory: number[]
  // ...
}
```

Match state is ephemeral — it lives only for the duration of the match. On `resolveGameEnd()`, the meaningful parts (ELO, stats) are flushed to PostgreSQL via `writePlayerStats()`. This keeps the hot path (move processing) entirely in-memory with no DB round trips on each move.

**Redis (managed by Nakama internally)**

Nakama uses Redis for session token caching and match presence tracking. We don't interact with Redis directly — it's a Nakama internal detail. Relevant to our architecture: session token validation during WebSocket upgrade happens against Redis (O(1)) rather than PostgreSQL.

---

## 5. Tech Stack Decisions

### Nakama

**What:** Open-source multiplayer game server with authoritative match handlers, matchmaker, leaderboard, session management, and storage — all in one binary.

**Why:** The hiring brief requires server-authoritative game state. Building this from scratch with raw WebSockets requires: session management, matchmaking, game state machine, DB persistence, reconnection logic, and leaderboard. Nakama provides all of these as composable primitives. The match handler API (7 lifecycle callbacks) maps cleanly to the game lifecycle.

**Considered:** Custom WebSocket server (Bun/Node), Colyseus, Photon, Mirror (Unity, wrong stack).

**Trade-off accepted:** Nakama adds ~200MB container image and requires Docker for local dev. It brings significant operational overhead if you need to tune it. In exchange, we get battle-tested matchmaking, session management, storage, and the leaderboard API — features that would take weeks to build and test independently.

---

### TypeScript Runtime (vs Go runtime)

**What:** Nakama supports two custom runtime languages: Go (compiled plugin) and TypeScript/JavaScript (Goja VM).

**Why:** The team's primary expertise is TypeScript. The type system provides compile-time safety for the match state machine — a domain where bugs are hard to reproduce and test. The shared `types.ts` between backend and frontend eliminates an entire class of protocol mismatch bugs. Go would require CGO compilation and a separate type system.

**Trade-off accepted:** Goja (ES2015) is ~5–10× slower than Go for CPU-bound work. For Tic-Tac-Toe, where the match loop runs at 1 tick/second and handles at most 9 moves per match, this is entirely irrelevant. The esbuild bundle target is `es2015` — Goja cannot handle const/let → ES5 transpilation.

---

### PostgreSQL (Aurora Serverless v2)

**What:** PostgreSQL 15 via AWS Aurora Serverless v2 (0.5–8 ACU auto-scaling).

**Why:** Nakama requires PostgreSQL or CockroachDB. Aurora Serverless v2 scales to zero ACU when idle (staging), making it cost-effective at low traffic. At production load, it scales to 8 ACU automatically without manual intervention.

**Considered:** MongoDB (Nakama doesn't support it), DynamoDB (not supported), CockroachDB (supported but adds distributed complexity not needed at this scale).

**Trade-off accepted:** Aurora Serverless v2 has a cold-start latency (~1s) when scaling from zero. Acceptable for a game server where Nakama warms the DB connection pool on startup.

---

### Zustand

**What:** ~1kb state manager for React.

**Why:** The game client has a deeply nested, frequently-updating state (board, players, timers, socket) that needs to be shared across 8+ components without prop-drilling. Zustand provides a flat, selector-based API where components subscribe only to the slices they need — preventing unnecessary re-renders during rapid timer ticks.

**Considered:** Redux Toolkit (3× boilerplate, adds RTK Query which conflicts with React Query), React Context (no selector system — every consumer re-renders on any state change, causing frame drops during timer ticks).

**Trade-off accepted:** Zustand has no built-in DevTools support beyond the Zustand middleware. Added `zustand/middleware` `devtools` wrapper for development inspection.

---

### React Query (@tanstack/react-query)

**What:** Server-state cache for REST/RPC calls (leaderboard fetch, player stats).

**Why:** Leaderboard and player stats are fetched via RPCs and need staleness control, background refetch, and loading/error states. React Query provides all three with a declarative API. The `useQuery` cache prevents redundant RPC calls when navigating between GameOver → Leaderboard.

**Considered:** SWR (similar but less ecosystem support), manual `useEffect`+`useState` fetch (no deduplication, no cache, no retry).

**Trade-off accepted:** React Query is overkill for 4 RPC endpoints. However, it's a standard tool and its query key system will naturally extend if more data-fetching is added.

---

### ECS Fargate

**What:** Serverless container hosting on AWS.

**Why:** Nakama is distributed as a Docker image. Fargate eliminates EC2 instance management. The ECS deployment circuit breaker automatically rolls back failed deploys. `enable_execute_command = true` allows live shell access into running containers for debugging.

**Considered:** EC2 (requires patching, AMI management), Lambda (maximum 15min execution, incompatible with long-lived WebSocket connections and the Nakama binary), Fly.io/Render (simpler but less control, harder Terraform integration).

**Trade-off accepted:** Fargate has a ~30–60s cold start when scaling from 0 tasks. The ECS service runs a minimum of 1 task at all times (configured via `ecs_desired_count`), so cold start only affects the very first deploy.

---

### Framer Motion

**What:** Production-ready React animation library.

**Why:** The game requires multiple simultaneous animation concerns: SVG path animation for X/O symbols, circular timer ring interpolation, fade+slide transitions between game states, and AnimatePresence for components that mount/unmount (DisconnectionOverlay, TurnIndicator states). Framer Motion's `useAnimation`, `AnimatePresence`, and `motion.*` primitives handle all of these with a declarative API and automatic GPU compositing.

**Considered:** CSS animations only (no mount/unmount orchestration without complex class toggling), React Spring (more imperative API, worse TypeScript inference for SVG attributes).

**Trade-off accepted:** Framer Motion adds ~50kb gzipped to the bundle. For a game-focused product, animation quality directly affects perceived quality — the trade-off is justified.

---

## 6. Local Setup

### Prerequisites

- Docker Desktop 4.x
- Node.js 20+
- GNU Make
- (Optional) Terraform 1.6+ for infrastructure changes

### Start Everything

```bash
# 1. Clone the repo
git clone https://github.com/harshrawat-14/Tic-Tac-Toe.git
cd Tic-Tac-Toe

# 2. Configure environment
cp .env.example .env
# Edit .env — defaults work for local dev, no changes needed

# 3. Start Nakama + PostgreSQL + Redis
make dev
# This runs: cd backend && npm run build && docker-compose up -d
# Wait ~20 seconds for Nakama to initialise the DB schema

# 4. In a separate terminal, start the frontend
make frontend
# Equivalent to: cd frontend && npm run dev

# 5. Open the game
open http://localhost:5173

# 6. Nakama developer console (inspect matches, storage, leaderboard)
open http://localhost:7351
# Username: admin   Password: password (see .env)
```

### Test Multiplayer Locally

Open two separate browser sessions:

```
Tab 1 (normal)    →  http://localhost:5173  →  Enter "Player1"  →  Play
Tab 2 (incognito) →  http://localhost:5173  →  Enter "Player2"  →  Play
```

Both click **Classic → Quick Match**. Nakama's matchmaker fills the 2-player query within 5 seconds and both clients navigate to the game board automatically.

### Useful Make Targets

```bash
make dev          # Build backend + docker-compose up -d
make stop         # docker-compose down
make logs         # docker-compose logs -f nakama
make frontend     # cd frontend && npm run dev
make test         # Run all backend + frontend unit tests
make lint         # ESLint both packages
make typecheck    # tsc --noEmit both packages
make build        # Production bundle (backend esbuild + frontend vite build)
```

---

## 7. Testing the Multiplayer Flow

### Manual Flow

1. **Start**: `make dev && make frontend`
2. **Tab 1**: `http://localhost:5173` → Enter nickname **"Player1"** → **Play**
3. **Tab 2 (incognito)**: same URL → Enter **"Player2"** → **Play**
4. Both click **Classic Mode** → **Quick Match**
5. Both tabs navigate to the game board within ~5 seconds (matchmaker fills the query)
6. Click cells alternately — observe instant optimistic UI on the mover's side, confirmed state on both sides ~50ms later
7. Win or draw → both see the Game Over screen with animated ELO delta
8. **Disconnect test**: during a game, close Tab 1. Tab 2 shows the DisconnectionOverlay with the 30-second countdown. Re-open Tab 1 before the timer expires → game resumes. Let the timer expire → Tab 2 sees the win screen

### Observe WebSocket Messages

In Chrome DevTools → Network → WS tab → click the `7350` connection → Messages filter:

```
→ (sent)  opCode=2  {"cellIndex":4}          MOVE
← (recv)  opCode=3  {"cellIndex":4,"symbol":"X","nextTurn":"user-o","board":[...]}  MOVE_RESULT
← (recv)  opCode=8  {"secondsLeft":27,"currentTurn":"user-o"}                       TIMER_TICK (timed mode)
← (recv)  opCode=4  {"winner":"user-x","isDraw":false,"eloChanges":{"user-x":16}}   GAME_OVER
```

### Test RPCs with curl

The Nakama HTTP API is available on port `7350`. Authenticate first to get a session token:

```bash
# Authenticate (device ID auth — returns a session token)
SESSION=$(curl -s -X POST http://localhost:7350/v2/account/authenticate/device \
  -H "Authorization: Basic $(echo -n 'defaultkey:' | base64)" \
  -H "Content-Type: application/json" \
  -d '{"id":"test-device-001","create":true}' \
  | jq -r '.token')

echo "Token: $SESSION"

# Create a private room (classic mode)
curl -s -X POST http://localhost:7350/v2/rpc/create_room \
  -H "Authorization: Bearer $SESSION" \
  -H "Content-Type: application/json" \
  -d '{"payload":"{\"mode\":\"classic\"}"}' | jq

# Get leaderboard (top 10)
curl -s -X POST http://localhost:7350/v2/rpc/get_leaderboard \
  -H "Authorization: Bearer $SESSION" \
  -H "Content-Type: application/json" \
  -d '{"payload":"{\"limit\":10}"}' | jq

# Get your own player stats
curl -s -X POST http://localhost:7350/v2/rpc/get_player_stats \
  -H "Authorization: Bearer $SESSION" \
  -H "Content-Type: application/json" \
  -d '{"payload":"{}"}' | jq

# List active matches
curl -s -X POST http://localhost:7350/v2/rpc/get_active_matches \
  -H "Authorization: Bearer $SESSION" \
  -H "Content-Type: application/json" \
  -d '{"payload":"{}"}' | jq
```

### Automated Tests

```bash
# Backend unit tests (game logic — no Nakama runtime required)
cd backend && npm test
# Covers: checkWinner (all 8 lines × 2 symbols × 4 cases), ELO formula,
#         isBoardFull, isValidCellIndex, emptyBoard

# Frontend unit tests (Zustand store — OpCode handlers + makeMove)
cd frontend && npm test
# Covers: all 7 OpCode handlers, optimistic move apply, guard conditions
```

---

## 8. Deployment

### One-time Infrastructure Setup

```bash
# Configure Terraform state backend (edit main.tf backend block first)
cd infrastructure/terraform

terraform init \
  -backend-config="bucket=your-tf-state-bucket" \
  -backend-config="region=us-east-1"

# Review — creates ~35 resources (VPC, ECS, Aurora, Redis, ALB, ACM, Route53)
terraform plan -var-file="terraform.tfvars" -out=tfplan

# Apply (takes ~15 min — ACM DNS validation is the slow step)
terraform apply tfplan

# Save outputs for deploy script
terraform output -json
```

### Backend Deploy (every push to `main` via GitHub Actions, or manually)

```bash
export AWS_REGION="us-east-1"
export ECR_REGISTRY="$(terraform output -raw ecr_repository_url | cut -d/ -f1)"
export ECS_CLUSTER="$(terraform output -raw ecs_cluster_name)"
export ECS_SERVICE="$(terraform output -raw ecs_service_name)"

./infrastructure/scripts/deploy.sh
# Steps: npm run build → docker build --platform linux/amd64
#      → ECR login → push :SHA + :latest
#      → ECS force-new-deployment → wait-stable
```

### Frontend Deploy (Vercel)

```bash
# One-time link
cd frontend && vercel link

# Deploy
vercel --prod
# Or via GitHub Actions on push to main (automatic via deploy.yml)
```

### Environment Variables

| Variable | Where Set | Purpose |
|---|---|---|
| `VITE_NAKAMA_URL` | Vercel env | Full Nakama URL (recommended, e.g. `https://your-backend.onrender.com`) |
| `VITE_NAKAMA_HOST` | Vercel env | Hostname of the Nakama API (e.g. `api.yourdomain.com`) |
| `VITE_NAKAMA_PORT` | Vercel env | `443` in production, `7350` locally |
| `VITE_NAKAMA_USE_SSL` | Vercel env | `true` in production, `false` locally |
| `VITE_NAKAMA_SERVER_KEY` | Vercel env | Nakama server key (matches `NAKAMA_SERVER_KEY`) |
| `AWS_ACCESS_KEY_ID` | GitHub Secrets | CI/CD deploy credentials |
| `AWS_SECRET_ACCESS_KEY` | GitHub Secrets | CI/CD deploy credentials |
| `AWS_REGION` | GitHub Secrets | Deployment region |
| `ECR_REGISTRY` | GitHub Secrets | ECR registry host (from terraform output) |
| `ECS_CLUSTER` | GitHub Secrets | ECS cluster name (from terraform output) |
| `ECS_SERVICE` | GitHub Secrets | ECS service name (from terraform output) |
| `VERCEL_TOKEN` | GitHub Secrets | Vercel deploy token |
| `VERCEL_ORG_ID` | GitHub Secrets | Vercel organisation ID |
| `VERCEL_PROJECT_ID` | GitHub Secrets | Vercel project ID |
| `NAKAMA_SERVER_KEY` | AWS Secrets Manager | Game client authentication key |
| `DB_PASSWORD` | AWS Secrets Manager | Aurora PostgreSQL password (≥16 chars) |
| `CONSOLE_PASSWORD` | AWS Secrets Manager | Nakama developer console password |

---

## 9. API Reference

### WebSocket Opcodes

All messages are JSON over a reliable WebSocket established via the Nakama JS SDK. The `data` field is a UTF-8 encoded JSON string.

| Opcode | Value | Direction | Payload Fields | Description |
|---|---|---|---|---|
| `GAME_STATE` | 1 | Server → Client | `{ state: MatchState }` | Full authoritative state snapshot. Sent on join and on reconnect. |
| `MOVE` | 2 | Client → Server | `{ cellIndex: number }` | Player's chosen cell (0–8, row-major). |
| `MOVE_RESULT` | 3 | Server → Client | `{ cellIndex, symbol, nextTurn, board }` | Confirmed move result. `nextTurn=""` when game ends on this move. |
| `GAME_OVER` | 4 | Server → Client | `{ winner, isDraw, eloChanges, finalBoard }` | Match outcome + ELO deltas for each player. |
| `PLAYER_JOINED` | 5 | Server → Client | `{ userId, displayName, symbol }` | A player entered the match. |
| `PLAYER_LEFT` | 6 | Server → Client | `{ userId, reason }` | A player disconnected. 30s reconnect window starts. |
| `RECONNECT_WINDOW` | 7 | Server → Client | `{ userId, secondsLeft }` | Countdown tick while opponent is reconnecting. |
| `TIMER_TICK` | 8 | Server → Client | `{ secondsLeft, currentTurn }` | Timed-mode countdown (1/sec). |
| `FORFEIT` | 9 | Client → Server | `{ reason }` | Explicit forfeit. Server responds with `GAME_OVER`. |

### RPC Endpoints

All RPCs use `POST /v2/rpc/{name}` with `Authorization: Bearer <session-token>`. The SDK wraps this as `client.rpc(session, name, payload)`.

| RPC Name | Auth Required | Request | Response | Notes |
|---|---|---|---|---|
| `create_room` | Yes | `{ mode: "classic" \| "timed" }` | `{ matchId: string }` | Creates a private authoritative match. Share `matchId` with opponent to join directly. |
| `get_leaderboard` | Yes | `{ limit?: number }` | `{ entries: LeaderboardEntry[], total: number }` | `limit` max 50. Returns `eloRating`, `wins`, `losses`, `draws`, `winStreak`, global `rank`. |
| `get_player_stats` | Yes | `{ userId?: string }` | `PlayerStatsResponse` | Defaults to the authenticated user's stats. Includes `rank` from leaderboard. |
| `get_active_matches` | Yes | `{}` | `{ matches: { matchId, label, size }[] }` | Returns up to 10 active matches with 1–2 players. Useful for spectator/admin tooling. |

---

## 10. Bonus Features Implemented

### Concurrent Games (Match Isolation)

Every match runs as an independent Nakama authoritative match — a separate Goja VM instance with its own `MatchState` heap object. Match IDs are UUID v4, generated by `nk.matchCreate()`. There is zero shared mutable state between concurrent matches. The only shared resource is the PostgreSQL connection pool (used only at match end for stats persistence), which Nakama manages via a connection pool sized to the Fargate task's memory.

Players attempting to join a full match (2 players present) are rejected by `matchJoinAttempt` returning `false`. Reconnecting players pass the check because their `userId` already exists in `state.players`.

### ELO Leaderboard

- ELO is calculated server-side on `resolveGameEnd()` using `calculateEloChange()` from `src/utils/game-logic.ts`
- K-factor = 32 for all players (no provisional period — simplification for the assignment)
- Results persisted atomically: `writePlayerStats()` calls both `nk.storageWrite()` and `nk.leaderboardRecordWrite()` in sequence
- Leaderboard operator = `SET` so each write replaces the previous score with the current ELO
- No automatic reset schedule — leaderboard is persistent

### Timed Mode

- When `mode = 'timed'`, `turnTimeLeft` initialises to 30s and resets after every valid move
- `matchLoop` decrements the counter each tick and broadcasts `TIMER_TICK` to both clients
- On expiry: `turnForfeits[currentTurn]++`. After 3 consecutive forfeits, the opponent wins
- The client renders a circular SVG ring timer with colour transitions: green (>15s) → amber (>10s) → red (≤10s), implemented in `TurnTimer.tsx`
- The `RECONNECT_WINDOW` (30s) is separate from `turnTimeLeft` — they run independently

---

## 11. Known Limitations & Future Work

### Current Limitations

| Limitation | Impact | Root Cause |
|---|---|---|
| Single Nakama instance | No horizontal scaling | Nakama cluster mode requires a separate Nakama node configuration, shared Redis, and consistent hashing for match affinity. Not in scope for this assignment. |
| JSON message encoding | ~3× larger messages than binary | The Nakama JS runtime encodes all `broadcastMessage` payloads as UTF-8 JSON. Protobuf would require a Go runtime or a custom codec layer. |
| No spectator mode | Can't observe live matches | `matchJoinAttempt` rejects players not in `state.players`. Spectator support requires a separate presence type and filtered broadcast. |
| ELO K=32 for all players | New players have high variance | A proper system uses K=40 for provisional games (first 30), K=20 for established players. Added complexity not warranted for the assignment. |
| No rate limiting on moves | DoS vector | Nakama does not throttle opcode frequency. A `lastMoveTime` check in `handleMove` would prevent move flooding. |

### Future Improvements

**Scalability**
- **Nakama cluster**: Deploy 3+ Nakama nodes behind the ALB. Matches are pinned to one node via ALB sticky sessions; the matchmaker and leaderboard APIs replicate via the shared PostgreSQL + Redis layer.
- **Aurora read replicas**: Leaderboard reads can be routed to a read replica, removing load from the writer for stat-heavy RPC calls.
- **Redis Cluster**: ElastiCache cluster mode for high-availability session caching.

**Features**
- **Protobuf encoding**: Replace JSON `broadcastMessage` payloads with a Protobuf schema for ~60% message size reduction and stronger schema versioning.
- **Spectator mode**: Allow additional presence types to join a match in read-only mode, receiving `GAME_STATE` and `MOVE_RESULT` messages without write access.
- **Tournament brackets**: `matchSignal` can be used to drive bracket progression from an external orchestration service.
- **Sound effects**: `settingsStore` already scaffolds `soundEnabled`. Integrate Howler.js for move/win/lose audio feedback.
- **Replay system**: `moveHistory` is already persisted in match storage. A replay viewer is a pure frontend feature rendering precomputed moves.
- **Mobile PWA**: The Vite config already supports service worker injection. Add a `manifest.json` and offline-first caching for the SPA shell.

---

<details>
<summary>Repository structure</summary>

```
Tic-Tac-Toe/
├── .github/
│   └── workflows/
│       ├── ci.yml           # typecheck + lint + test on every push
│       ├── deploy.yml       # backend (ECS) + frontend (Vercel) on main
│       └── pr-preview.yml   # Vercel preview deploy + PR comment
├── backend/
│   ├── src/
│   │   ├── utils/
│   │   │   └── game-logic.ts    # Pure functions: checkWinner, calculateEloChange, etc.
│   │   ├── __tests__/
│   │   │   └── game-logic.test.ts
│   │   ├── types.ts             # Canonical shared types (OpCode, MatchState, ...)
│   │   ├── main.ts              # InitModule entry point
│   │   ├── match_handler.ts     # Authoritative match lifecycle (7 callbacks)
│   │   ├── rpc_handlers.ts      # create_room, get_leaderboard, get_player_stats, ...
│   │   └── leaderboard.ts       # ELO persistence + Nakama leaderboard API
│   ├── build/
│   │   └── index.js             # esbuild es2015 bundle (mounted into Nakama image)
│   ├── Dockerfile
│   ├── nakama-config.yml
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/          # GameBoard, PlayerBar, TurnTimer, MoveHistory, ...
│   │   ├── pages/               # Login, Lobby, Matchmaking, Game, GameOver, Leaderboard
│   │   ├── store/
│   │   │   └── gameStore.ts     # Zustand: all OpCode handlers + makeMove
│   │   ├── lib/
│   │   │   ├── nakama.ts        # Singleton Client + Socket + device auth
│   │   │   └── utils.ts         # cn() class merge helper
│   │   ├── types/
│   │   │   └── game.ts          # Frontend copy of backend canonical types
│   │   └── __tests__/
│   │       └── gameStore.test.ts
│   └── package.json
├── infrastructure/
│   ├── terraform/
│   │   ├── main.tf              # VPC, ECS, Aurora, Redis, ALB, ACM, Route53
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── scripts/
│   │   └── deploy.sh            # Build → ECR push → ECS deploy → wait stable
│   └── DEPLOYMENT.md
├── docker-compose.yml           # Nakama + PostgreSQL + Redis for local dev
├── Makefile
└── README.md                    # This file
```

</details>

---

*Built by Harsh Rawat for the LILA multiplayer game company hiring assignment.*  
*All infrastructure is defined as code. All game logic is server-authoritative. All tests pass.*

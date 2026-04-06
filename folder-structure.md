# Multiplayer Tic-Tac-Toe — Complete Folder Structure

> ✅ = **created in Step 1 (this scaffold)**
> 🔲 = **to be created in subsequent steps**

```
Tic-Tac-Toe/
├── folder-structure.md        ✅  (this file)
│
├── backend/                   ── Nakama JS/TS runtime module ──
│   ├── package.json           ✅
│   ├── tsconfig.json          ✅
│   │
│   ├── src/
│   │   ├── types.ts           ✅  All shared enums, interfaces & payloads
│   │   ├── main.ts            ��  InitModule — registers match handler, RPCs, hooks
│   │   │
│   │   ├── match/
│   │   │   ├── handler.ts     🔲  matchInit/Join/Loop/Leave/Terminate
│   │   │   ├── logic.ts       🔲  Win detection, ELO calc, turn management
│   │   │   └── timer.ts       🔲  Per-tick countdown, auto-forfeit on timeout
│   │   │
│   │   ├── rpc/
│   │   │   ├── createRoom.ts  🔲  RPC: create a private match, return matchId
│   │   │   ├── getStats.ts    🔲  RPC: fetch per-user stats from storage
│   │   │   └── leaderboard.ts 🔲  RPC: paginated ELO leaderboard
│   │   │
│   │   ├── hooks/
│   │   │   └── afterAuth.ts   🔲  AfterAuthenticateDevice hook
│   │   │
│   │   └── utils/
│   │       ├── codec.ts       🔲  JSON encode/decode helpers
│   │       └── elo.ts         🔲  Pure ELO calculation
│   │
│   └── build/
│       └── index.js           🔲  esbuild bundle for Nakama /modules/
│
└── frontend/                  ── React 18 + TypeScript SPA ──
    ├── package.json           ✅
    ├── tsconfig.json          ✅
    ├── tsconfig.node.json     ✅
    ├── vite.config.ts         ✅
    ├── tailwind.config.ts     ✅
    ├── postcss.config.cjs     🔲
    ├── index.html             🔲
    │
    ├── src/
    │   ├── main.tsx                🔲
    │   ├── App.tsx                 🔲
    │   ├── types/
    │   │   └── game.ts             🔲  Re-exports from backend types
    │   ├── lib/
    │   │   ├── nakama.ts           🔲  Singleton Client + Socket
    │   │   ├── queryClient.ts      🔲  React Query instance
    │   │   └── utils.ts            🔲  cn() helper
    │   ├── store/
    │   │   ├── authStore.ts        🔲  Zustand auth slice
    │   │   ├── gameStore.ts        🔲  Zustand game slice
    │   │   └── settingsStore.ts    🔲  Zustand settings slice
    │   ├── hooks/
    │   │   ├── useNakamaSocket.ts  🔲
    │   │   ├── useMatchmaker.ts    🔲
    │   │   ├── useGameState.ts     ��
    │   │   └── useLeaderboard.ts   🔲
    │   ├── pages/
    │   │   ├── LandingPage.tsx     🔲
    │   │   ├── GamePage.tsx        🔲
    │   │   ├── LeaderboardPage.tsx 🔲
    │   │   └── ProfilePage.tsx     🔲
    │   ├── components/
    │   │   ├── board/
    │   │   │   ├── GameBoard.tsx       🔲
    │   │   │   ├── Cell.tsx            🔲
    │   │   │   └── WinLine.tsx         🔲
    │   │   ├── game/
    │   │   │   ├── PlayerCard.tsx      🔲
    │   │   │   ├── TurnBanner.tsx      🔲
    │   │   │   ├── TimerBar.tsx        🔲
    │   │   │   ├── GameOverModal.tsx   🔲
    │   │   │   └── ReconnectOverlay.tsx 🔲
    │   │   ├── lobby/
    │   │   │   ├── ModeSelector.tsx    🔲
    │   │   │   ├── MatchmakingModal.tsx 🔲
    │   │   │   └── PrivateRoomModal.tsx 🔲
    │   │   └── ui/
    │   │       ├── Button.tsx          🔲  CVA variants
    │   │       ├── Badge.tsx           🔲
    │   │       ├── Card.tsx            🔲
    │   │       ├── Modal.tsx           🔲
    │   │       ├── Spinner.tsx         🔲
    │   │       └── Tooltip.tsx         🔲
    │   ├── assets/
    │   │   ├── fonts/                  🔲
    │   │   └── sounds/
    │   │       ├── move.mp3            🔲
    │   │       ├── win.mp3             🔲
    │   │       └── lose.mp3            🔲
    │   ├── styles/
    │   │   ├── globals.css             🔲
    │   │   └── animations.css          🔲
    │   └── test/
    │       ├── setup.ts                🔲
    │       ├── unit/
    │       │   ├── logic.test.ts       🔲
    │       │   └── store.test.ts       🔲
    │       └── e2e/
    │           └── game.spec.ts        🔲
    │
    └── public/
        ├── favicon.ico                 🔲
        ├── og-image.png                🔲
        └── robots.txt                  🔲
```

## Dependency Matrix

| Layer | Package | Purpose |
|---|---|---|
| Backend | `@heroiclabs/nakama-runtime` | Type defs for Nakama JS runtime API |
| Backend | `esbuild` | Bundle src/main.ts → build/index.js |
| Frontend | `@heroiclabs/nakama-js` | Client SDK — auth, socket, RPC, matchmaker |
| Frontend | `zustand` | Lightweight global state |
| Frontend | `@tanstack/react-query` | Server-state for leaderboard / stats RPCs |
| Frontend | `framer-motion` | X/O animations, modal transitions |
| Frontend | `react-router-dom` | Page routing |
| Frontend | `tailwindcss` | Utility-first styling with custom tokens |
| Frontend | `clsx` + `tailwind-merge` | Safe class merging |
| Frontend | `class-variance-authority` | Type-safe component variant API |
| Frontend | `lucide-react` | Icon set |
| Testing | `vitest` + `@testing-library/react` | Unit & component tests |
| Testing | `@playwright/test` | End-to-end match simulation |

## Nakama Deployment

```bash
cd backend && npm run build
# Copy build/index.js → nakama/modules/index.js
```

Docker volume mount:
```yaml
volumes:
  - ./backend/build:/nakama/modules
```

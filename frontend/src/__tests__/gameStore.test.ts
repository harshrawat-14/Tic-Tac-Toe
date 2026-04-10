/**
 * /frontend/src/__tests__/gameStore.test.ts
 *
 * Vitest unit tests for useGameStore:
 *  - handleSocketMessage correctly updates state for each OpCode
 *  - makeMove validates turn and applies optimistic update
 *  - ELO change stored after GAME_OVER
 *
 * We use Zustand's `create` directly and mock the Nakama SDK.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import type { MatchData } from '@heroiclabs/nakama-js';
import type { MatchState, PlayerState, GameStatus } from '@/types/game';
import { OpCode } from '@/types/game';

// ─── Mock @heroiclabs/nakama-js ───────────────────────────────────────────────

vi.mock('@heroiclabs/nakama-js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    authenticateDevice: vi.fn(),
  })),
  Session: {},
}));

// ─── Mock @/lib/nakama ──────────────────────────────────────────────────────

const mockSocket = {
  sendMatchState: vi.fn(),
  addMatchmaker: vi.fn().mockResolvedValue({ ticket: 'ticket-123' }),
  removeMatchmaker: vi.fn().mockResolvedValue(undefined),
  joinMatch: vi.fn().mockResolvedValue(undefined),
  leaveMatch: vi.fn().mockResolvedValue(undefined),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn(),
  ondisconnect: null as unknown,
  onmatchdata: null as unknown,
};

vi.mock('@/lib/nakama', () => ({
  nakamaClient: {
    createSocket: vi.fn().mockImplementation(() => mockSocket),
    rpc: vi.fn(),
  },
  authenticateDevice: vi.fn().mockResolvedValue({
    user_id: 'user-x',
    username: 'PlayerX',
    token: 'tok',
    refresh_token: 'rtok',
    created: true,
    isexpired: () => false,
    is_expired: false,
  }),
  restoreSession: vi.fn().mockReturnValue(null),
  connectWithRetry: vi.fn().mockResolvedValue(mockSocket),
  clearStoredSession: vi.fn(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const X_ID = 'user-x';
const O_ID = 'user-o';

function makePlayer(userId: string, symbol: 'X' | 'O', overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    userId,
    displayName: `Player ${symbol}`,
    symbol,
    connected: true,
    eloRating: 1000,
    wins: 0,
    losses: 0,
    draws: 0,
    winStreak: 0,
    ...overrides,
  };
}

function makeMatchState(overrides: Partial<MatchState> = {}): MatchState {
  return {
    board: Array(9).fill(null),
    currentTurn: X_ID,
    players: {
      [X_ID]: makePlayer(X_ID, 'X'),
      [O_ID]: makePlayer(O_ID, 'O'),
    },
    playerOrder: [X_ID, O_ID],
    status: 'PLAYER_X_TURN' as GameStatus,
    winner: null,
    isDraw: false,
    turnTimeLeft: -1,
    turnForfeits: { [X_ID]: 0, [O_ID]: 0 },
    mode: 'classic',
    moveHistory: [],
    matchId: 'match-001',
    reconnectDeadline: {},
    ...overrides,
  };
}

/** Encode a payload as Uint8Array to simulate Nakama MatchData.data */
function encodePayload(payload: object): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}

/** Build a fake MatchData object */
function buildMatchData(opCode: OpCode, payload: object): MatchData {
  return {
    op_code: opCode,
    data: encodePayload(payload),
    match_id: 'match-001',
    presence: {
      user_id: 'server',
      session_id: 'sess',
      username: 'server',
      node: 'node-1',
      status: '',
      persistence: false,
    },
    reliable: true,
  } as unknown as MatchData;
}

// ─── Store setup ─────────────────────────────────────────────────────────────

// Import AFTER mocks so the store picks up the mocked nakama module
async function getStore() {
  const { useGameStore } = await import('@/store/gameStore');
  return useGameStore;
}

// Note: we wire the callback directly via mockSocket.onmatchdata in connectWithRetry mock

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useGameStore — handleSocketMessage', () => {
  let useGameStore: Awaited<ReturnType<typeof getStore>>;

  beforeEach(async () => {
    // Reset module registry and clear mocks to get a fresh store and clean spies per test
    vi.resetModules();
    vi.clearAllMocks();
    vi.mock('@/lib/nakama', () => ({
      nakamaClient: {
        createSocket: vi.fn().mockImplementation(() => mockSocket),
        rpc: vi.fn(),
      },
      authenticateDevice: vi.fn().mockResolvedValue({
        user_id: X_ID,
        username: 'PlayerX',
        token: 'tok',
        refresh_token: 'rtok',
        created: true,
        isexpired: () => false,
      }),
      restoreSession: vi.fn().mockReturnValue(null),
      connectWithRetry: vi.fn().mockImplementation((_session: unknown, callbacks: { onMatchData?: (d: MatchData) => void }) => {
        // Wire up the onMatchData callback so tests can dispatch messages
        if (callbacks.onMatchData) {
          (mockSocket as { onmatchdata?: (d: MatchData) => void }).onmatchdata = callbacks.onMatchData;
        }
        return Promise.resolve(mockSocket);
      }),
      clearStoredSession: vi.fn(),
    }));

    useGameStore = await getStore();

    // Authenticate and connect
    await act(async () => {
      await useGameStore.getState().connect('PlayerX');
    });

    // Inject a match state so message handlers have context
    act(() => {
      useGameStore.setState({
        myUserId: X_ID,
        matchId: 'match-001',
        matchState: makeMatchState(),
        mySymbol: 'X',
        isMyTurn: true,
      });
    });
  });

  // ── GAME_STATE ─────────────────────────────────────────────────────────────

  it('OpCode.GAME_STATE — sets matchState and mySymbol', () => {
    const newState = makeMatchState({ status: 'PLAYER_X_TURN', currentTurn: X_ID });
    const msg = buildMatchData(OpCode.GAME_STATE, { state: newState });

    act(() => {
      const cb = (mockSocket as { onmatchdata?: (d: unknown) => void }).onmatchdata;
      cb?.(msg);
    });

    const state = useGameStore.getState();
    expect(state.matchState?.status).toBe('PLAYER_X_TURN');
    expect(state.mySymbol).toBe('X');
    expect(state.isMyTurn).toBe(true);
    expect(state.pendingCell).toBeNull();
  });

  // ── MOVE_RESULT ────────────────────────────────────────────────────────────

  it('OpCode.MOVE_RESULT — updates board and clears pendingCell', () => {
    const newBoard = Array(9).fill(null);
    newBoard[4] = 'X';
    const payload = {
      cellIndex: 4,
      symbol: 'X',
      nextTurn: O_ID,
      board: newBoard,
    };
    const msg = buildMatchData(OpCode.MOVE_RESULT, payload);

    // Set a pending cell first to verify it gets cleared
    act(() => {
      useGameStore.setState({ pendingCell: 4 });
    });

    act(() => {
      const cb = (mockSocket as { onmatchdata?: (d: unknown) => void }).onmatchdata;
      cb?.(msg);
    });

    const state = useGameStore.getState();
    expect(state.matchState?.board[4]).toBe('X');
    expect(state.pendingCell).toBeNull();
    expect(state.isMyTurn).toBe(false); // nextTurn is O_ID, not X_ID
  });

  it('OpCode.MOVE_RESULT — nextTurn="" leaves isMyTurn false (game ending)', () => {
    const newBoard = Array(9).fill(null);
    newBoard[0] = newBoard[1] = newBoard[2] = 'X';
    const msg = buildMatchData(OpCode.MOVE_RESULT, {
      cellIndex: 2,
      symbol: 'X',
      nextTurn: '',
      board: newBoard,
    });

    act(() => {
      const cb = (mockSocket as { onmatchdata?: (d: unknown) => void }).onmatchdata;
      cb?.(msg);
    });

    const state = useGameStore.getState();
    expect(state.isMyTurn).toBe(false);
    expect(state.pendingCell).toBeNull();
  });

  // ── GAME_OVER ──────────────────────────────────────────────────────────────

  it('OpCode.GAME_OVER — sets winner, lastEloChange, clears pendingCell', () => {
    const finalBoard = Array(9).fill(null);
    finalBoard[0] = finalBoard[1] = finalBoard[2] = 'X';
    const eloChanges: Record<string, number> = { [X_ID]: 16, [O_ID]: -16 };
    const msg = buildMatchData(OpCode.GAME_OVER, {
      winner: X_ID,
      isDraw: false,
      eloChanges,
      finalBoard,
    });

    act(() => {
      const cb = (mockSocket as { onmatchdata?: (d: unknown) => void }).onmatchdata;
      cb?.(msg);
    });

    const state = useGameStore.getState();
    expect(state.matchState?.status).toBe('GAME_OVER');
    expect(state.matchState?.winner).toBe(X_ID);
    expect(state.matchState?.isDraw).toBe(false);
    expect(state.lastEloChange).toBe(16); // eloChanges[X_ID]
    expect(state.isMyTurn).toBe(false);
    expect(state.pendingCell).toBeNull();
    expect(state.opponentReconnecting).toBe(false);
  });

  it('OpCode.GAME_OVER — draw: lastEloChange is the draw delta for myUserId', () => {
    const eloChanges: Record<string, number> = { [X_ID]: 0, [O_ID]: 0 };
    const msg = buildMatchData(OpCode.GAME_OVER, {
      winner: null,
      isDraw: true,
      eloChanges,
      finalBoard: Array(9).fill(null),
    });

    act(() => {
      const cb = (mockSocket as { onmatchdata?: (d: unknown) => void }).onmatchdata;
      cb?.(msg);
    });

    const state = useGameStore.getState();
    expect(state.matchState?.isDraw).toBe(true);
    expect(state.lastEloChange).toBe(0);
  });

  // ── PLAYER_LEFT ────────────────────────────────────────────────────────────

  it('OpCode.PLAYER_LEFT — marks opponent as disconnected and sets opponentReconnecting', () => {
    const msg = buildMatchData(OpCode.PLAYER_LEFT, { userId: O_ID, reason: 'disconnect' });

    act(() => {
      const cb = (mockSocket as { onmatchdata?: (d: unknown) => void }).onmatchdata;
      cb?.(msg);
    });

    const state = useGameStore.getState();
    expect(state.opponentReconnecting).toBe(true);
    expect(state.matchState?.players[O_ID].connected).toBe(false);
  });

  // ── RECONNECT_WINDOW ───────────────────────────────────────────────────────

  it('OpCode.RECONNECT_WINDOW — sets reconnectSecondsLeft', () => {
    const msg = buildMatchData(OpCode.RECONNECT_WINDOW, { userId: O_ID, secondsLeft: 25 });

    act(() => {
      const cb = (mockSocket as { onmatchdata?: (d: unknown) => void }).onmatchdata;
      cb?.(msg);
    });

    const state = useGameStore.getState();
    expect(state.reconnectSecondsLeft).toBe(25);
    expect(state.opponentReconnecting).toBe(true);
  });

  // ── TIMER_TICK ─────────────────────────────────────────────────────────────

  it('OpCode.TIMER_TICK — updates turnTimeLeft and currentTurn', () => {
    act(() => {
      useGameStore.setState({
        matchState: makeMatchState({ mode: 'timed', turnTimeLeft: 30 }),
      });
    });

    const msg = buildMatchData(OpCode.TIMER_TICK, { secondsLeft: 22, currentTurn: X_ID });

    act(() => {
      const cb = (mockSocket as { onmatchdata?: (d: unknown) => void }).onmatchdata;
      cb?.(msg);
    });

    const state = useGameStore.getState();
    expect(state.matchState?.turnTimeLeft).toBe(22);
    expect(state.isMyTurn).toBe(true); // currentTurn === myUserId
  });

  // ── FORFEIT ────────────────────────────────────────────────────────────────

  it('OpCode.FORFEIT — clears opponentReconnecting when opponent forfeits', () => {
    act(() => {
      useGameStore.setState({ opponentReconnecting: true, reconnectSecondsLeft: 5 });
    });

    const msg = buildMatchData(OpCode.FORFEIT, { userId: O_ID, reason: 'disconnect' });

    act(() => {
      const cb = (mockSocket as { onmatchdata?: (d: unknown) => void }).onmatchdata;
      cb?.(msg);
    });

    // FORFEIT itself: the handler sets opponentReconnecting=false when forfeitPayload.userId !== myUserId
    // (GAME_OVER will follow and fully resolve state)
    const state = useGameStore.getState();
    expect(state.opponentReconnecting).toBe(false);
  });
});

// ─── Tests: makeMove ─────────────────────────────────────────────────────────

describe('useGameStore — makeMove', () => {
  let useGameStore: Awaited<ReturnType<typeof getStore>>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.mock('@/lib/nakama', () => ({
      nakamaClient: {
        createSocket: vi.fn().mockImplementation(() => mockSocket),
        rpc: vi.fn(),
      },
      authenticateDevice: vi.fn().mockResolvedValue({
        user_id: X_ID,
        username: 'PlayerX',
        token: 'tok',
        refresh_token: 'rtok',
        created: true,
        isexpired: () => false,
      }),
      restoreSession: vi.fn().mockReturnValue(null),
      connectWithRetry: vi.fn().mockResolvedValue(mockSocket),
      clearStoredSession: vi.fn(),
    }));

    useGameStore = await getStore();

    await act(async () => {
      await useGameStore.getState().connect('PlayerX');
    });

    act(() => {
      useGameStore.setState({
        myUserId: X_ID,
        mySymbol: 'X',
        isMyTurn: true,
        matchId: 'match-001',
        socket: mockSocket as unknown as import('@heroiclabs/nakama-js').Socket,
        matchState: makeMatchState(),
      });
    });
  });

  it('makeMove applies optimistic update and sends to server', () => {
    act(() => {
      useGameStore.getState().makeMove(4);
    });

    const state = useGameStore.getState();
    expect(state.matchState?.board[4]).toBe('X');
    expect(state.pendingCell).toBe(4);
    expect(state.isMyTurn).toBe(false);
    expect(mockSocket.sendMatchState).toHaveBeenCalledWith(
      'match-001',
      OpCode.MOVE,
      JSON.stringify({ cellIndex: 4 }),
    );
  });

  it('makeMove is ignored when not your turn', () => {
    act(() => {
      useGameStore.setState({ isMyTurn: false });
    });

    act(() => {
      useGameStore.getState().makeMove(0);
    });

    const state = useGameStore.getState();
    expect(state.matchState?.board[0]).toBeNull();
    expect(state.pendingCell).toBeNull();
    expect(mockSocket.sendMatchState).not.toHaveBeenCalled();
  });

  it('makeMove is ignored on occupied cell', () => {
    const boardWithOccupied = Array(9).fill(null);
    boardWithOccupied[3] = 'O';
    act(() => {
      useGameStore.setState({
        matchState: makeMatchState({ board: boardWithOccupied }),
      });
    });

    act(() => {
      useGameStore.getState().makeMove(3);
    });

    const state = useGameStore.getState();
    expect(state.matchState?.board[3]).toBe('O'); // unchanged
    expect(state.pendingCell).toBeNull();
    expect(mockSocket.sendMatchState).not.toHaveBeenCalled();
  });

  it('makeMove is ignored when socket is null', () => {
    act(() => {
      useGameStore.setState({ socket: null });
    });

    act(() => {
      useGameStore.getState().makeMove(0);
    });

    expect(mockSocket.sendMatchState).not.toHaveBeenCalled();
    expect(useGameStore.getState().pendingCell).toBeNull();
  });
});

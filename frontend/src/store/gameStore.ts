import { create } from 'zustand';
import { Session, Socket, MatchData } from '@heroiclabs/nakama-js';
import {
  OpCode,
  GameMode,
  MatchState,
  MoveResultPayload,
  GameOverPayload,
  GameStatePayload,
  ReconnectWindowPayload,
  TimerTickPayload,
  ForfeitPayload,
} from '@/types/game';
import {
  authenticateDevice,
  restoreSession,
  clearStoredSession,
  nakamaClient,
} from '@/lib/nakama';

// ─── State Interface ──────────────────────────────────────────────────────────

export interface GameStoreState {
  // Auth
  session: Session | null;
  myUserId: string;
  myDisplayName: string;

  // Connection
  socket: Socket | null;
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  connectionError: string | null;

  // Matchmaking
  matchmakingTicket: string | null;

  // Game
  matchId: string | null;
  matchState: MatchState | null;
  mySymbol: 'X' | 'O' | null;
  isMyTurn: boolean;
  lastEloChange: number | null;

  // UI state
  pendingCell: number | null;
  reconnectSecondsLeft: number;
  opponentReconnecting: boolean;

  // Actions
  connect: (nickname: string) => Promise<void>;
  restoreAndConnect: () => Promise<boolean>;
  joinMatchmaking: (mode: GameMode) => Promise<void>;
  cancelMatchmaking: () => Promise<void>;
  joinMatch: (matchId: string) => Promise<void>;
  makeMove: (cellIndex: number) => void;
  sendForfeit: () => void;
  leaveMatch: () => void;
  resetGame: () => void;
  disconnect: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeMySymbol(state: MatchState, userId: string): 'X' | 'O' | null {
  const player = state.players[userId];
  return player?.symbol ?? null;
}

function computeIsMyTurn(state: MatchState, userId: string): boolean {
  return (
    state.currentTurn === userId &&
    (state.status === 'PLAYER_X_TURN' || state.status === 'PLAYER_O_TURN')
  );
}

const INITIAL_GAME_STATE = {
  matchId: null as string | null,
  matchState: null as MatchState | null,
  mySymbol: null as 'X' | 'O' | null,
  isMyTurn: false,
  lastEloChange: null as number | null,
  pendingCell: null as number | null,
  reconnectSecondsLeft: 0,
  opponentReconnecting: false,
  matchmakingTicket: null as string | null,
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useGameStore = create<GameStoreState>((set, get) => {

  // ── Socket event callbacks ────────────────────────────────────────────────

    function handleMatchData(rawMatchData: unknown): void {
    const matchData = rawMatchData as MatchData;
    const opCode = matchData.op_code; 
    const dataStr = matchData.data
      ? new TextDecoder().decode(matchData.data as Uint8Array)
      : '{}';

    console.log(`[GameStore] OpCode=${opCode} Payload=`, dataStr);

    let payload: any;
    try {
      payload = JSON.parse(dataStr);
    } catch {
      console.error('[GameStore] Failed to parse match data:', dataStr);
      return;
    }

    const { myUserId } = get();

    switch (opCode) {
      case OpCode.GAME_STATE: {
        const gsPayload = payload as GameStatePayload;
        const newState = gsPayload.state;
        set({
          matchState: newState,
          mySymbol: computeMySymbol(newState, myUserId),
          isMyTurn: computeIsMyTurn(newState, myUserId),
          pendingCell: null,
        });
        break;
      }

      case OpCode.MOVE_RESULT: {
        const mrPayload = payload as MoveResultPayload;
        const current = get().matchState;
        if (!current) break;

        // Authoritative board from server
        const updatedState: MatchState = {
          ...current,
          board: mrPayload.board,
          currentTurn: mrPayload.nextTurn,
          status: mrPayload.nextTurn === ''
            ? current.status  // Game is ending, GAME_OVER opcode will follow
            : current.playerOrder[0] === mrPayload.nextTurn
              ? 'PLAYER_X_TURN'
              : 'PLAYER_O_TURN',
          moveHistory: [...current.moveHistory, mrPayload.cellIndex],
          turnTimeLeft: current.mode === 'timed' ? 30 : -1,
        };

        set({
          matchState: updatedState,
          isMyTurn: computeIsMyTurn(updatedState, myUserId),
          pendingCell: null,  // Clear optimistic state — server confirmed
        });
        break;
      }

      case OpCode.GAME_OVER: {
        const goPayload = payload as GameOverPayload;
        const current = get().matchState;
        if (!current) break;

        const updatedState: MatchState = {
          ...current,
          board: goPayload.finalBoard,
          status: 'GAME_OVER',
          winner: goPayload.winner,
          isDraw: goPayload.isDraw,
        };

        const eloChange = goPayload.eloChanges[myUserId] ?? 0;

        set({
          matchState: updatedState,
          isMyTurn: false,
          lastEloChange: eloChange,
          pendingCell: null,
          opponentReconnecting: false,
        });
        break;
      }

      case OpCode.PLAYER_JOINED: {
        const pjPayload = payload as GameStatePayload;
        const newState = pjPayload.state;
        set({
          matchState: newState,
          mySymbol: computeMySymbol(newState, myUserId),
          isMyTurn: computeIsMyTurn(newState, myUserId),
        });
        break;
      }

      case OpCode.PLAYER_LEFT: {
        const plPayload = payload as ForfeitPayload;
        const current = get().matchState;
        if (!current) break;

        // Mark opponent as disconnected
        const targetUserId = plPayload.userId;
        if (targetUserId !== myUserId) {
          set({ opponentReconnecting: true });
        }

        // Update player connected status
        const updatedPlayers = { ...current.players };
        if (updatedPlayers[targetUserId]) {
          updatedPlayers[targetUserId] = {
            ...updatedPlayers[targetUserId],
            connected: false,
          };
        }
        set({
          matchState: {
            ...current,
            players: updatedPlayers,
          },
        });
        break;
      }

      case OpCode.RECONNECT_WINDOW: {
        const rwPayload = payload as ReconnectWindowPayload;
        const isOpponent = rwPayload.userId !== myUserId;
        set({
          opponentReconnecting: isOpponent,
          reconnectSecondsLeft: rwPayload.secondsLeft,
        });
        break;
      }

      case OpCode.TIMER_TICK: {
        const ttPayload = payload as TimerTickPayload;
        const current = get().matchState;
        if (!current) break;

        set({
          matchState: {
            ...current,
            turnTimeLeft: ttPayload.secondsLeft,
            currentTurn: ttPayload.currentTurn,
          },
          isMyTurn: ttPayload.currentTurn === myUserId,
        });
        break;
      }

      case OpCode.FORFEIT: {
        const fPayload = payload as ForfeitPayload;
        const current = get().matchState;
        if (!current) break;

        // Server will also send GAME_OVER, but we can preemptively update UI
        if (fPayload.userId !== myUserId) {
          set({ opponentReconnecting: false });
        }
        break;
      }

      default:
        console.warn('[GameStore] Unhandled opcode:', opCode);
    }
  }

  // ── Store definition ──────────────────────────────────────────────────────

  return {
    // Initial state
    session: null,
    myUserId: '',
    myDisplayName: '',
    socket: null,
    connectionStatus: 'idle',
    connectionError: null,
    ...INITIAL_GAME_STATE,

    // ── connect ───────────────────────────────────────────────────────────

    async connect(nickname: string): Promise<void> {
      set({ connectionStatus: 'connecting', connectionError: null });
      try {
        const session = await authenticateDevice(nickname);
        const { socket: oldSocket } = get();
        if (oldSocket) {
          oldSocket.disconnect(false);
        }

        const NAKAMA_SSL = import.meta.env.VITE_NAKAMA_USE_SSL === 'true';
        const socket = nakamaClient.createSocket(NAKAMA_SSL, false);

        socket.onmatchmakermatched = (matched: any) => {
          console.log('[GameStore] Matchmaker matched:', matched);
          const mId = matched.match_id || matched.matchId;
          if (mId) {
            set({ matchmakingTicket: null });
            get().joinMatch(mId);
          }
        };

        socket.onmatchdata = (matchData) => {
          handleMatchData(matchData);
        };

        socket.ondisconnect = () => {
          set({ connectionStatus: 'disconnected' });
        };

        await socket.connect(session, true);

        set({
          session,
          myUserId: session.user_id ?? '',
          myDisplayName: nickname,
          socket,
          connectionStatus: 'connected',
          connectionError: null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Connection failed';
        set({
          connectionStatus: 'disconnected',
          connectionError: message,
        });
        throw error;
      }
    },

    // ── restoreAndConnect ─────────────────────────────────────────────────

    async restoreAndConnect(): Promise<boolean> {
      const session = restoreSession();
      if (!session) return false;

      set({ connectionStatus: 'connecting', connectionError: null });
      try {
        const { socket: oldSocket } = get();
        if (oldSocket) {
          oldSocket.disconnect(false);
        }

        const NAKAMA_SSL = import.meta.env.VITE_NAKAMA_USE_SSL === 'true';
        const socket = nakamaClient.createSocket(NAKAMA_SSL, false);

        socket.onmatchmakermatched = (matched: any) => {
          console.log('[GameStore] Matchmaker matched:', matched);
          const mId = matched.match_id || matched.matchId;
          if (mId) {
            set({ matchmakingTicket: null });
            get().joinMatch(mId);
          }
        };

        socket.onmatchdata = (matchData) => {
          handleMatchData(matchData);
        };

        socket.ondisconnect = () => {
          set({ connectionStatus: 'disconnected' });
        };

        await socket.connect(session, true);

        set({
          session,
          myUserId: session.user_id ?? '',
          myDisplayName: session.username ?? '',
          socket,
          connectionStatus: 'connected',
          connectionError: null,
        });
        return true;
      } catch {
        set({ connectionStatus: 'idle', connectionError: null });
        return false;
      }
    },

    // ── joinMatchmaking ───────────────────────────────────────────────────

    async joinMatchmaking(mode: GameMode): Promise<void> {
      const { socket } = get();
      if (!socket) throw new Error('Not connected');

      const ticket = await socket.addMatchmaker(
        '*',       // query: match anyone
        2,         // minCount
        2,         // maxCount
        { mode: mode }, // string properties
      );

      set({ matchmakingTicket: ticket.ticket });
    },

    // ── cancelMatchmaking ─────────────────────────────────────────────────

    async cancelMatchmaking(): Promise<void> {
      const { socket, matchmakingTicket } = get();
      set({ matchmakingTicket: null });
      if (!socket || !matchmakingTicket) {
        console.warn('cancelMatchmaking called but no ticket or socket available');
        return;
      }

      try {
        await socket.removeMatchmaker(matchmakingTicket);
      } catch (err) {
        console.warn('Failed to remove matchmaking ticket', err);
      }
    },

    // ── joinMatch ─────────────────────────────────────────────────────────

    async joinMatch(matchId: string): Promise<void> {
      const { socket } = get();
      if (!socket) throw new Error('Not connected');

      await socket.joinMatch(matchId);
      set({ ...INITIAL_GAME_STATE, matchId });
    },

    // ── makeMove ──────────────────────────────────────────────────────────

    makeMove(cellIndex: number): void {
      const { socket, matchId, matchState, isMyTurn, mySymbol } = get();
      if (!socket || !matchId || !matchState || !isMyTurn || !mySymbol) return;

      // Validate cell is empty
      if (matchState.board[cellIndex] !== null) return;

      // Optimistic update: immediately show the piece
      const optimisticBoard = [...matchState.board];
      optimisticBoard[cellIndex] = mySymbol;

      const optimisticState: MatchState = {
        ...matchState,
        board: optimisticBoard,
        currentTurn: '', // Will be updated by server
        status: mySymbol === 'X' ? 'PLAYER_O_TURN' : 'PLAYER_X_TURN',
      };

      set({
        pendingCell: cellIndex,
        matchState: optimisticState,
        isMyTurn: false,
      });

      // Send to server
      socket.sendMatchState(
        matchId,
        OpCode.MOVE,
        JSON.stringify({ cellIndex }),
      );
    },

    // ── sendForfeit ───────────────────────────────────────────────────────

    sendForfeit(): void {
      const { socket, matchId, myUserId } = get();
      if (!socket || !matchId) return;

      socket.sendMatchState(
        matchId,
        OpCode.FORFEIT,
        JSON.stringify({ userId: myUserId, reason: 'disconnect' }),
      );
    },

    // ── leaveMatch ────────────────────────────────────────────────────────

    leaveMatch(): void {
      const { socket, matchId } = get();
      if (socket && matchId) {
        socket.leaveMatch(matchId).catch(console.error);
      }
      set({
        ...INITIAL_GAME_STATE,
      });
    },

    // ── resetGame ─────────────────────────────────────────────────────────

    resetGame(): void {
      set({
        ...INITIAL_GAME_STATE,
      });
    },

    // ── disconnect ────────────────────────────────────────────────────────

    disconnect(): void {
      const { socket, matchId } = get();
      if (socket) {
        if (matchId) {
          socket.leaveMatch(matchId).catch(console.error);
        }
        socket.disconnect(true);
      }
      clearStoredSession();
      set({
        session: null,
        myUserId: '',
        myDisplayName: '',
        socket: null,
        connectionStatus: 'idle',
        connectionError: null,
        ...INITIAL_GAME_STATE,
      });
    },
  };
});

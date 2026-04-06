export enum OpCode {
  GAME_STATE = 1,
  MOVE = 2,
  MOVE_RESULT = 3,
  GAME_OVER = 4,
  PLAYER_JOINED = 5,
  PLAYER_LEFT = 6,
  RECONNECT_WINDOW = 7,
  TIMER_TICK = 8,
  FORFEIT = 9,
}

export type GameStatus =
  | 'WAITING'
  | 'READY'
  | 'PLAYER_X_TURN'
  | 'PLAYER_O_TURN'
  | 'GAME_OVER';

export type GameMode = 'classic' | 'timed';

export interface PlayerState {
  userId: string;
  displayName: string;
  symbol: 'X' | 'O';
  connected: boolean;
  eloRating: number;
  wins: number;
  losses: number;
  draws: number;
  winStreak: number;
}

export interface MatchState {
  board: (string | null)[];        // 9 cells
  currentTurn: string;              // userId
  players: Record<string, PlayerState>;
  playerOrder: string[];            // [userId_X, userId_O]
  status: GameStatus;
  winner: string | null;
  isDraw: boolean;
  turnTimeLeft: number;             // -1 if classic
  turnForfeits: Record<string, number>;
  mode: GameMode;
  moveHistory: number[];
  matchId: string;
  reconnectDeadline: Record<string, number>; // userId -> timestamp ms
}

// ─── Message Payloads ───────────────────────────────────────────────────────

export interface MovePayload {
  cellIndex: number;
}

export interface MoveResultPayload {
  cellIndex: number;
  symbol: 'X' | 'O';
  nextTurn: string;
  board: (string | null)[];
}

export interface GameOverPayload {
  winner: string | null;
  isDraw: boolean;
  eloChanges: Record<string, number>;
  finalBoard: (string | null)[];
}

export interface ReconnectWindowPayload {
  userId: string;
  secondsLeft: number;
}

export interface TimerTickPayload {
  secondsLeft: number;
  currentTurn: string;
}

export interface ForfeitPayload {
  userId: string;
  reason: 'timeout' | 'disconnect';
}

export interface GameStatePayload {
  state: MatchState;
}

// ─── Matchmaker ──────────────────────────────────────────────────────────────

export interface MatchmakerProperties {
  mode: GameMode;
}

// ─── RPC Types ───────────────────────────────────────────────────────────────

export interface CreateRoomRequest {
  mode: GameMode;
}

export interface CreateRoomResponse {
  matchId: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  wins: number;
  losses: number;
  draws: number;
  winStreak: number;
  bestStreak: number;
  eloRating: number;
}

export interface GetLeaderboardRequest {
  limit: number;
  cursor?: string;
}

export interface GetLeaderboardResponse {
  entries: LeaderboardEntry[];
  nextCursor?: string;
}

export interface PlayerStatsResponse extends LeaderboardEntry {
  totalGames: number;
}

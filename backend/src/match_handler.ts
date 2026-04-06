// ─── Nakama Authoritative Match Handler ──────────────────────────────────────
// Implements all 7 lifecycle functions for a Tic-Tac-Toe authoritative match.
// `nkruntime` is a global namespace — never imported.

import {
  OpCode,
  MatchState,
  PlayerState,
  GameMode,
  GameStatus,
  MovePayload,
  MoveResultPayload,
  GameOverPayload,
  GameStatePayload,
  ReconnectWindowPayload,
  TimerTickPayload,
  ForfeitPayload,
} from './types';

import {
  getOrCreatePlayerStats,
  writePlayerStats,
  calculateEloChange,
  PlayerStats,
} from './leaderboard';

// ─── Constants ───────────────────────────────────────────────────────────────

const TURN_TIME_SECONDS = 30;
const RECONNECT_WINDOW_SECONDS = 30;
const MAX_TURN_FORFEITS = 3;
const MAX_PLAYERS = 2;

/** All 8 win conditions as index triplets (row-major, 0=top-left). */
const WIN_LINES: ReadonlyArray<[number, number, number]> = [
  [0, 1, 2], // top row
  [3, 4, 5], // mid row
  [6, 7, 8], // bot row
  [0, 3, 6], // left col
  [1, 4, 7], // mid col
  [2, 5, 8], // right col
  [0, 4, 8], // diag ↘
  [2, 4, 6], // diag ↙
];

// ─── Helper: broadcast wrapper ──────────────────────────────────────────────

function broadcastMessage(
  dispatcher: nkruntime.MatchDispatcher,
  opCode: OpCode,
  payload: object,
  presences?: nkruntime.Presence[] | null,
  sender?: nkruntime.Presence | null,
): void {
  dispatcher.broadcastMessage(
    opCode,
    JSON.stringify(payload),
    presences || null,
    sender || null,
    true, // reliable
  );
}

// ─── Helper: check winner ───────────────────────────────────────────────────

/**
 * Returns the winning symbol ('X' or 'O') if any line is complete, else null.
 */
function checkWinner(board: (string | null)[]): string | null {
  for (let i = 0; i < WIN_LINES.length; i++) {
    const a = WIN_LINES[i][0];
    const b = WIN_LINES[i][1];
    const c = WIN_LINES[i][2];
    if (board[a] !== null && board[a] === board[b] && board[b] === board[c]) {
      return board[a];
    }
  }
  return null;
}

/**
 * Returns true when every cell is filled and no winner exists.
 */
function isBoardFull(board: (string | null)[]): boolean {
  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) return false;
  }
  return true;
}

// ─── Helper: switch turn ────────────────────────────────────────────────────

function switchTurn(state: MatchState): MatchState {
  const currentIndex = state.playerOrder.indexOf(state.currentTurn);
  const nextIndex = currentIndex === 0 ? 1 : 0;
  state.currentTurn = state.playerOrder[nextIndex];

  const nextPlayer = state.players[state.currentTurn];
  state.status = nextPlayer.symbol === 'X' ? 'PLAYER_X_TURN' : 'PLAYER_O_TURN';

  if (state.mode === 'timed') {
    state.turnTimeLeft = TURN_TIME_SECONDS;
  }

  return state;
}

// ─── Helper: count connected players ────────────────────────────────────────

function connectedPlayerCount(state: MatchState): number {
  let count = 0;
  const userIds = Object.keys(state.players);
  for (let i = 0; i < userIds.length; i++) {
    if (state.players[userIds[i]].connected) {
      count++;
    }
  }
  return count;
}

// ─── Helper: resolve game end ───────────────────────────────────────────────

/**
 * Handles ELO updates and broadcasts GAME_OVER for a decisive result.
 *
 * @param winnerUserId — userId of winner, or null for a draw.
 * @param loserUserId  — userId of loser, or null for a draw.
 */
function resolveGameEnd(
  state: MatchState,
  winnerUserId: string | null,
  loserUserId: string | null,
  isDraw: boolean,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  logger: nkruntime.Logger,
): MatchState {
  state.status = 'GAME_OVER';
  state.winner = winnerUserId;
  state.isDraw = isDraw;

  const eloChanges: Record<string, number> = {};

  if (isDraw && state.playerOrder.length === 2) {
    // Both players get draw adjustment
    const userA = state.playerOrder[0];
    const userB = state.playerOrder[1];
    const statsA = getOrCreatePlayerStats(nk, userA, state.players[userA].displayName);
    const statsB = getOrCreatePlayerStats(nk, userB, state.players[userB].displayName);

    const elo = calculateEloChange(statsA.eloRating, statsB.eloRating, 0.5);

    updateAndWriteStats(nk, userA, statsA, 'draw', elo.newA, logger);
    updateAndWriteStats(nk, userB, statsB, 'draw', elo.newB, logger);

    eloChanges[userA] = elo.deltaA;
    eloChanges[userB] = elo.deltaB;

    // Update in-match player state
    state.players[userA].eloRating = elo.newA;
    state.players[userA].draws++;
    state.players[userB].eloRating = elo.newB;
    state.players[userB].draws++;
  } else if (winnerUserId && loserUserId) {
    const winnerStats = getOrCreatePlayerStats(nk, winnerUserId, state.players[winnerUserId].displayName);
    const loserStats = getOrCreatePlayerStats(nk, loserUserId, state.players[loserUserId].displayName);

    const elo = calculateEloChange(winnerStats.eloRating, loserStats.eloRating, 1);

    updateAndWriteStats(nk, winnerUserId, winnerStats, 'win', elo.newA, logger);
    updateAndWriteStats(nk, loserUserId, loserStats, 'loss', elo.newB, logger);

    eloChanges[winnerUserId] = elo.deltaA;
    eloChanges[loserUserId] = elo.deltaB;

    // Update in-match player state
    state.players[winnerUserId].eloRating = elo.newA;
    state.players[winnerUserId].wins++;
    state.players[winnerUserId].winStreak++;
    state.players[loserUserId].eloRating = elo.newB;
    state.players[loserUserId].losses++;
    state.players[loserUserId].winStreak = 0;
  }

  const gameOverPayload: GameOverPayload = {
    winner: winnerUserId,
    isDraw: isDraw,
    eloChanges: eloChanges,
    finalBoard: state.board.slice(),
  };
  broadcastMessage(dispatcher, OpCode.GAME_OVER, gameOverPayload);

  logger.info(
    'match=%s game_over winner=%s isDraw=%s',
    state.matchId,
    winnerUserId || 'none',
    String(isDraw),
  );

  return state;
}

/** Helper: update a PlayerStats struct and persist it. */
function updateAndWriteStats(
  nk: nkruntime.Nakama,
  userId: string,
  stats: PlayerStats,
  result: 'win' | 'loss' | 'draw',
  newElo: number,
  _logger: nkruntime.Logger,
): void {
  stats.eloRating = newElo;
  stats.totalGames++;

  if (result === 'win') {
    stats.wins++;
    stats.winStreak++;
    if (stats.winStreak > stats.bestStreak) {
      stats.bestStreak = stats.winStreak;
    }
  } else if (result === 'loss') {
    stats.losses++;
    stats.winStreak = 0;
  } else {
    stats.draws++;
    // Draw does NOT reset the win streak
  }

  writePlayerStats(nk, userId, stats);
}

// ─── Helper: handle a MOVE message ──────────────────────────────────────────

function handleMove(
  state: MatchState,
  userId: string,
  payload: MovePayload,
  dispatcher: nkruntime.MatchDispatcher,
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
): MatchState {
  // Validate: is it this player's turn?
  if (userId !== state.currentTurn) {
    logger.warn('match=%s user=%s tried to move but it is not their turn', state.matchId, userId);
    return state;
  }

  // Validate: game must be in an active turn state
  if (state.status !== 'PLAYER_X_TURN' && state.status !== 'PLAYER_O_TURN') {
    logger.warn('match=%s move rejected: game status is %s', state.matchId, state.status);
    return state;
  }

  // Validate: cellIndex must be 0–8
  const cellIndex = payload.cellIndex;
  if (typeof cellIndex !== 'number' || cellIndex < 0 || cellIndex > 8) {
    logger.warn('match=%s invalid cellIndex=%s', state.matchId, String(cellIndex));
    return state;
  }

  // Validate: cell must be empty
  if (state.board[cellIndex] !== null) {
    logger.warn('match=%s cell %d already occupied', state.matchId, cellIndex);
    return state;
  }

  // Apply move
  const player = state.players[userId];
  state.board[cellIndex] = player.symbol;
  state.moveHistory.push(cellIndex);

  // Check for winner
  const winningSymbol = checkWinner(state.board);

  if (winningSymbol !== null) {
    // Find loser
    const loserUserId = state.playerOrder[0] === userId
      ? state.playerOrder[1]
      : state.playerOrder[0];

    // Broadcast the final move result BEFORE game over
    const moveResult: MoveResultPayload = {
      cellIndex,
      symbol: player.symbol,
      nextTurn: '',      // no next turn — game over
      board: state.board.slice(),
    };
    broadcastMessage(dispatcher, OpCode.MOVE_RESULT, moveResult);

    return resolveGameEnd(state, userId, loserUserId, false, nk, dispatcher, logger);
  }

  // Check for draw
  if (isBoardFull(state.board)) {
    const moveResult: MoveResultPayload = {
      cellIndex,
      symbol: player.symbol,
      nextTurn: '',
      board: state.board.slice(),
    };
    broadcastMessage(dispatcher, OpCode.MOVE_RESULT, moveResult);

    return resolveGameEnd(state, null, null, true, nk, dispatcher, logger);
  }

  // No winner, no draw — switch turn
  state = switchTurn(state);

  // Broadcast move result with next turn info
  const moveResult: MoveResultPayload = {
    cellIndex,
    symbol: player.symbol,
    nextTurn: state.currentTurn,
    board: state.board.slice(),
  };
  broadcastMessage(dispatcher, OpCode.MOVE_RESULT, moveResult);

  return state;
}

// ─── matchInit ───────────────────────────────────────────────────────────────

const matchInit: nkruntime.MatchInitFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  params: { [key: string]: string },
): { state: nkruntime.MatchState; tickRate: number; label: string } {
  let mode: GameMode = 'classic';
  if (params && params['mode'] === 'timed') {
    mode = 'timed';
  }

  const state: MatchState = {
    board: [null, null, null, null, null, null, null, null, null],
    currentTurn: '',
    players: {},
    playerOrder: [],
    status: 'WAITING' as GameStatus,
    winner: null,
    isDraw: false,
    turnTimeLeft: mode === 'timed' ? TURN_TIME_SECONDS : -1,
    turnForfeits: {},
    mode: mode,
    moveHistory: [],
    matchId: ctx.matchId || '',
    reconnectDeadline: {},
  };

  const label = JSON.stringify({ mode: mode });
  logger.info('matchInit: match=%s mode=%s', ctx.matchId, mode);

  return {
    state: state as nkruntime.MatchState,
    tickRate: 1,
    label: label,
  };
};

// ─── matchJoinAttempt ────────────────────────────────────────────────────────

const matchJoinAttempt: nkruntime.MatchJoinAttemptFunction = function (
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: nkruntime.MatchState,
  presence: nkruntime.Presence,
  _metadata: { [key: string]: string },
): { state: nkruntime.MatchState; accept: boolean; rejectMessage?: string } | null {
  const s = state as unknown as MatchState;

  // Allow reconnection for existing players
  if (s.players[presence.userId]) {
    logger.info('matchJoinAttempt: user=%s reconnecting', presence.userId);
    return { state, accept: true };
  }

  // Reject if game is over
  if (s.status === 'GAME_OVER') {
    logger.info('matchJoinAttempt: user=%s rejected — game over', presence.userId);
    return { state, accept: false, rejectMessage: 'Match has ended' };
  }

  // Reject if already at capacity
  if (s.playerOrder.length >= MAX_PLAYERS) {
    logger.info('matchJoinAttempt: user=%s rejected — match full', presence.userId);
    return { state, accept: false, rejectMessage: 'Match is full' };
  }

  return { state, accept: true };
};

// ─── matchJoin ───────────────────────────────────────────────────────────────

const matchJoin: nkruntime.MatchJoinFunction = function (
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: nkruntime.MatchState,
  presences: nkruntime.Presence[],
): { state: nkruntime.MatchState } | null {
  const s = state as unknown as MatchState;

  for (let i = 0; i < presences.length; i++) {
    const presence = presences[i];
    const userId = presence.userId;

    // ── Reconnecting player ──
    if (s.players[userId]) {
      s.players[userId].connected = true;
      delete s.reconnectDeadline[userId];

      logger.info('matchJoin: user=%s reconnected', userId);

      // Send full game state to the reconnecting player
      const gameState: GameStatePayload = { state: s };
      broadcastMessage(dispatcher, OpCode.GAME_STATE, gameState, [presence]);
      continue;
    }

    // ── New player ──
    const symbol: 'X' | 'O' = s.playerOrder.length === 0 ? 'X' : 'O';

    // Fetch stored stats to hydrate PlayerState
    const stats = getOrCreatePlayerStats(nk, userId, presence.username || userId);

    const playerState: PlayerState = {
      userId: userId,
      displayName: presence.username || userId,
      symbol: symbol,
      connected: true,
      eloRating: stats.eloRating,
      wins: stats.wins,
      losses: stats.losses,
      draws: stats.draws,
      winStreak: stats.winStreak,
    };

    s.players[userId] = playerState;
    s.playerOrder.push(userId);
    s.turnForfeits[userId] = 0;

    logger.info(
      'matchJoin: user=%s joined as %s (player %d/2)',
      userId,
      symbol,
      s.playerOrder.length,
    );

    // Broadcast PLAYER_JOINED to everyone (including self)
    broadcastMessage(dispatcher, OpCode.PLAYER_JOINED, {
      userId: userId,
      displayName: playerState.displayName,
      symbol: symbol,
    });
  }

  // ── If two players present, start the game ──
  if (s.playerOrder.length === MAX_PLAYERS && s.status === 'WAITING') {
    s.status = 'PLAYER_X_TURN';
    s.currentTurn = s.playerOrder[0]; // playerOrder[0] is always X

    if (s.mode === 'timed') {
      s.turnTimeLeft = TURN_TIME_SECONDS;
    }

    logger.info('matchJoin: match=%s starting — X=%s O=%s', s.matchId, s.playerOrder[0], s.playerOrder[1]);

    // Send full state to all players
    const gameState: GameStatePayload = { state: s };
    broadcastMessage(dispatcher, OpCode.GAME_STATE, gameState);
  }

  return { state: s as unknown as nkruntime.MatchState };
};

// ─── matchLeave ──────────────────────────────────────────────────────────────

const matchLeave: nkruntime.MatchLeaveFunction = function (
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: nkruntime.MatchState,
  presences: nkruntime.Presence[],
): { state: nkruntime.MatchState } | null {
  const s = state as unknown as MatchState;

  for (let i = 0; i < presences.length; i++) {
    const presence = presences[i];
    const userId = presence.userId;

    if (!s.players[userId]) continue;

    s.players[userId].connected = false;

    // If game is already over, no reconnect window needed
    if (s.status === 'GAME_OVER') {
      logger.info('matchLeave: user=%s left after game over', userId);
      continue;
    }

    // If game hasn't started yet (still WAITING), remove the player entirely
    if (s.status === 'WAITING') {
      delete s.players[userId];
      const idx = s.playerOrder.indexOf(userId);
      if (idx !== -1) s.playerOrder.splice(idx, 1);
      delete s.turnForfeits[userId];
      logger.info('matchLeave: user=%s left during WAITING, removed from match', userId);
      continue;
    }

    // Active game — set reconnect deadline
    const deadline = Date.now() + RECONNECT_WINDOW_SECONDS * 1000;
    s.reconnectDeadline[userId] = deadline;

    logger.info(
      'matchLeave: user=%s disconnected, reconnect deadline=%d',
      userId,
      deadline,
    );

    // Notify remaining players
    const reconnectPayload: ReconnectWindowPayload = {
      userId: userId,
      secondsLeft: RECONNECT_WINDOW_SECONDS,
    };
    broadcastMessage(dispatcher, OpCode.RECONNECT_WINDOW, reconnectPayload);
  }

  // If ALL players have left and game is over, end the match
  if (s.status === 'GAME_OVER' && connectedPlayerCount(s) === 0) {
    logger.info('matchLeave: all players left after game over, ending match');
    return null; // returning null terminates the match
  }

  return { state: s as unknown as nkruntime.MatchState };
};

// ─── matchLoop ───────────────────────────────────────────────────────────────

const matchLoop: nkruntime.MatchLoopFunction = function (
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: nkruntime.MatchState,
  messages: nkruntime.MatchMessage[],
): { state: nkruntime.MatchState } | null {
  let s = state as unknown as MatchState;

  // ── If game is over, keep ticking briefly to let clients process, then end ──
  if (s.status === 'GAME_OVER') {
    // End match when all players have disconnected
    if (connectedPlayerCount(s) === 0) {
      return null;
    }
    // Stay alive so clients can read final state / request rematch
    return { state: s as unknown as nkruntime.MatchState };
  }

  // ── Process incoming messages ──
  if (messages) {
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const senderId = message.sender.userId;

      switch (message.opCode) {
        case OpCode.MOVE: {
          let movePayload: MovePayload;
          try {
            movePayload = JSON.parse(nk.binaryToString(message.data));
          } catch (_e) {
            logger.warn('matchLoop: invalid MOVE payload from user=%s', senderId);
            break;
          }
          s = handleMove(s, senderId, movePayload, dispatcher, nk, logger);
          break;
        }

        case OpCode.FORFEIT: {
          // Voluntary forfeit
          if (s.playerOrder.length === MAX_PLAYERS) {
            const winnerId = s.playerOrder[0] === senderId
              ? s.playerOrder[1]
              : s.playerOrder[0];

            const forfeitPayload: ForfeitPayload = {
              userId: senderId,
              reason: 'disconnect',
            };
            broadcastMessage(dispatcher, OpCode.FORFEIT, forfeitPayload);

            s = resolveGameEnd(s, winnerId, senderId, false, nk, dispatcher, logger);
          }
          break;
        }

        default:
          logger.warn('matchLoop: unknown opCode=%d from user=%s', message.opCode, senderId);
      }
    }
  }

  // ── Skip timer logic if game ended during message processing ──
  if (s.status === 'GAME_OVER') {
    return { state: s as unknown as nkruntime.MatchState };
  }

  // ── Only process timers when game is in an active turn state ──
  const isActiveTurn = s.status === 'PLAYER_X_TURN' || s.status === 'PLAYER_O_TURN';
  if (!isActiveTurn) {
    return { state: s as unknown as nkruntime.MatchState };
  }

  // ── Handle reconnect deadlines ──
  const now = Date.now();
  const deadlineUserIds = Object.keys(s.reconnectDeadline);
  for (let i = 0; i < deadlineUserIds.length; i++) {
    const deadlineUserId = deadlineUserIds[i];
    const deadline = s.reconnectDeadline[deadlineUserId];

    if (now >= deadline && s.players[deadlineUserId] && !s.players[deadlineUserId].connected) {
      delete s.reconnectDeadline[deadlineUserId];

      logger.info(
        'matchLoop: user=%s reconnect deadline expired, forfeiting',
        deadlineUserId,
      );

      // Broadcast forfeit
      const forfeitPayload: ForfeitPayload = {
        userId: deadlineUserId,
        reason: 'disconnect',
      };
      broadcastMessage(dispatcher, OpCode.FORFEIT, forfeitPayload);

      // Award win to the other player
      const winnerId = s.playerOrder[0] === deadlineUserId
        ? s.playerOrder[1]
        : s.playerOrder[0];

      s = resolveGameEnd(s, winnerId, deadlineUserId, false, nk, dispatcher, logger);
      return { state: s as unknown as nkruntime.MatchState };
    }

    // Broadcast countdown update for reconnect window
    if (s.players[deadlineUserId] && !s.players[deadlineUserId].connected) {
      const secondsLeft = Math.ceil((deadline - now) / 1000);
      const reconnectPayload: ReconnectWindowPayload = {
        userId: deadlineUserId,
        secondsLeft: secondsLeft,
      };
      broadcastMessage(dispatcher, OpCode.RECONNECT_WINDOW, reconnectPayload);
    }
  }

  // ── Handle turn timer (timed mode only) ──
  if (s.mode === 'timed' && s.turnTimeLeft > 0) {
    s.turnTimeLeft--;

    // Broadcast tick
    const timerPayload: TimerTickPayload = {
      secondsLeft: s.turnTimeLeft,
      currentTurn: s.currentTurn,
    };
    broadcastMessage(dispatcher, OpCode.TIMER_TICK, timerPayload);

    // Time ran out
    if (s.turnTimeLeft <= 0) {
      const timedOutUserId = s.currentTurn;
      s.turnForfeits[timedOutUserId] = (s.turnForfeits[timedOutUserId] || 0) + 1;

      logger.info(
        'matchLoop: user=%s timed out (forfeit count: %d/%d)',
        timedOutUserId,
        s.turnForfeits[timedOutUserId],
        MAX_TURN_FORFEITS,
      );

      if (s.turnForfeits[timedOutUserId] >= MAX_TURN_FORFEITS) {
        // Too many timeouts — forfeit the entire match
        const winnerId = s.playerOrder[0] === timedOutUserId
          ? s.playerOrder[1]
          : s.playerOrder[0];

        const forfeitPayload: ForfeitPayload = {
          userId: timedOutUserId,
          reason: 'timeout',
        };
        broadcastMessage(dispatcher, OpCode.FORFEIT, forfeitPayload);

        s = resolveGameEnd(s, winnerId, timedOutUserId, false, nk, dispatcher, logger);
      } else {
        // Skip turn — give the other player a chance
        s = switchTurn(s);

        // Broadcast updated timer info
        const switchPayload: TimerTickPayload = {
          secondsLeft: s.turnTimeLeft,
          currentTurn: s.currentTurn,
        };
        broadcastMessage(dispatcher, OpCode.TIMER_TICK, switchPayload);
      }
    }
  }

  return { state: s as unknown as nkruntime.MatchState };
};

// ─── matchSignal ─────────────────────────────────────────────────────────────

const matchSignal: nkruntime.MatchSignalFunction = function (
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: nkruntime.MatchState,
  data: string,
): { state: nkruntime.MatchState; data?: string } | null {
  const s = state as unknown as MatchState;

  if (data === 'end_match') {
    s.status = 'GAME_OVER';
    logger.info('matchSignal: match=%s forced to GAME_OVER via signal', s.matchId);
    return { state: s as unknown as nkruntime.MatchState, data: 'match_ended' };
  }

  logger.info('matchSignal: match=%s received signal: %s', s.matchId, data);
  return { state: s as unknown as nkruntime.MatchState, data: 'ok' };
};

// ─── matchTerminate ──────────────────────────────────────────────────────────

const matchTerminate: nkruntime.MatchTerminateFunction = function (
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: nkruntime.MatchState,
  graceSeconds: number,
): { state: nkruntime.MatchState } | null {
  const s = state as unknown as MatchState;

  logger.info(
    'matchTerminate: match=%s terminating (grace=%ds)',
    s.matchId,
    graceSeconds,
  );

  // If game wasn't already over, broadcast a final game-over notice
  if (s.status !== 'GAME_OVER') {
    s.status = 'GAME_OVER';
    const terminatePayload: GameOverPayload = {
      winner: null,
      isDraw: true,
      eloChanges: {},
      finalBoard: s.board.slice(),
    };
    broadcastMessage(dispatcher, OpCode.GAME_OVER, terminatePayload);
  }

  return { state: s as unknown as nkruntime.MatchState };
};

// ─── Exported Match Handler ──────────────────────────────────────────────────

export {
  matchInit,
  matchJoinAttempt,
  matchJoin,
  matchLeave,
  matchLoop,
  matchSignal,
  matchTerminate,
};

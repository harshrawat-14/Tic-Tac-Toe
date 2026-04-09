"use strict";
(() => {
  // src/utils/game-logic.ts
  var WIN_LINES = [
    [0, 1, 2],
    // top row
    [3, 4, 5],
    // mid row
    [6, 7, 8],
    // bot row
    [0, 3, 6],
    // left col
    [1, 4, 7],
    // mid col
    [2, 5, 8],
    // right col
    [0, 4, 8],
    // diagonal ↘
    [2, 4, 6]
    // diagonal ↙
  ];
  var ELO_K = 32;
  var DEFAULT_ELO = 1e3;
  function checkWinner(board) {
    for (let i = 0; i < WIN_LINES.length; i++) {
      const [a, b, c] = WIN_LINES[i];
      if (board[a] !== null && board[a] === board[b] && board[b] === board[c]) {
        return board[a];
      }
    }
    return null;
  }
  function isBoardFull(board) {
    for (let i = 0; i < board.length; i++) {
      if (board[i] === null)
        return false;
    }
    return true;
  }
  function calculateEloChange(ratingA, ratingB, resultA) {
    const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
    const expectedB = 1 - expectedA;
    const newA = Math.round(ratingA + ELO_K * (resultA - expectedA));
    const newB = Math.round(ratingB + ELO_K * (1 - resultA - expectedB));
    return {
      newA,
      newB,
      deltaA: newA - ratingA,
      deltaB: newB - ratingB
    };
  }

  // src/leaderboard.ts
  var LEADERBOARD_ID = "global_elo";
  var STATS_COLLECTION = "player_stats";
  var STATS_KEY = "stats";
  function initLeaderboard(nk, logger) {
    try {
      nk.leaderboardCreate(
        LEADERBOARD_ID,
        // id
        false,
        // authoritative — false so RPCs can write
        nkruntime.SortOrder.DESCENDING,
        // sortOrder
        nkruntime.Operator.SET,
        // operator — latest ELO overwrites previous
        void 0,
        // resetSchedule  (never resets)
        void 0,
        // metadata
        true
        // enableRank — so records get a rank number
      );
      logger.info('Leaderboard "%s" created / verified', LEADERBOARD_ID);
    } catch (e) {
      logger.info('Leaderboard "%s" already exists, skipping create', LEADERBOARD_ID);
    }
  }
  function getOrCreatePlayerStats(nk, userId, displayName) {
    const objects = nk.storageRead([
      {
        collection: STATS_COLLECTION,
        key: STATS_KEY,
        userId
      }
    ]);
    if (objects && objects.length > 0) {
      const stored = JSON.parse(JSON.stringify(objects[0].value));
      if (displayName && stored.displayName !== displayName) {
        stored.displayName = displayName;
      }
      return stored;
    }
    return {
      userId,
      displayName: displayName || "",
      wins: 0,
      losses: 0,
      draws: 0,
      winStreak: 0,
      bestStreak: 0,
      totalGames: 0,
      eloRating: DEFAULT_ELO
    };
  }
  function writePlayerStats(nk, userId, stats) {
    nk.storageWrite([
      {
        collection: STATS_COLLECTION,
        key: STATS_KEY,
        userId,
        value: stats,
        permissionRead: 1,
        permissionWrite: 0
      }
    ]);
    nk.leaderboardRecordWrite(
      LEADERBOARD_ID,
      userId,
      stats.displayName || userId,
      stats.eloRating,
      0,
      // subscore
      void 0,
      // metadata
      void 0
      // operator override — use leaderboard default ('set')
    );
  }

  // src/match_handler.ts
  var TURN_TIME_SECONDS = 30;
  var RECONNECT_WINDOW_SECONDS = 30;
  var MAX_TURN_FORFEITS = 3;
  var MAX_PLAYERS = 2;
  function broadcastMessage(dispatcher, opCode, payload, presences, sender) {
    dispatcher.broadcastMessage(
      opCode,
      JSON.stringify(payload),
      presences || null,
      sender || null,
      true
      // reliable
    );
  }
  function switchTurn(state) {
    const currentIndex = state.playerOrder.indexOf(state.currentTurn);
    const nextIndex = currentIndex === 0 ? 1 : 0;
    state.currentTurn = state.playerOrder[nextIndex];
    const nextPlayer = state.players[state.currentTurn];
    state.status = nextPlayer.symbol === "X" ? "PLAYER_X_TURN" : "PLAYER_O_TURN";
    if (state.mode === "timed") {
      state.turnTimeLeft = TURN_TIME_SECONDS;
    }
    return state;
  }
  function connectedPlayerCount(state) {
    let count = 0;
    const userIds = Object.keys(state.players);
    for (let i = 0; i < userIds.length; i++) {
      if (state.players[userIds[i]].connected) {
        count++;
      }
    }
    return count;
  }
  function resolveGameEnd(state, winnerUserId, loserUserId, isDraw, nk, dispatcher, logger) {
    state.status = "GAME_OVER";
    state.winner = winnerUserId;
    state.isDraw = isDraw;
    const eloChanges = {};
    if (isDraw && state.playerOrder.length === 2) {
      const userA = state.playerOrder[0];
      const userB = state.playerOrder[1];
      const statsA = getOrCreatePlayerStats(nk, userA, state.players[userA].displayName);
      const statsB = getOrCreatePlayerStats(nk, userB, state.players[userB].displayName);
      const elo = calculateEloChange(statsA.eloRating, statsB.eloRating, 0.5);
      updateAndWriteStats(nk, userA, statsA, "draw", elo.newA, logger);
      updateAndWriteStats(nk, userB, statsB, "draw", elo.newB, logger);
      eloChanges[userA] = elo.deltaA;
      eloChanges[userB] = elo.deltaB;
      state.players[userA].eloRating = elo.newA;
      state.players[userA].draws++;
      state.players[userB].eloRating = elo.newB;
      state.players[userB].draws++;
    } else if (winnerUserId && loserUserId) {
      const winnerStats = getOrCreatePlayerStats(nk, winnerUserId, state.players[winnerUserId].displayName);
      const loserStats = getOrCreatePlayerStats(nk, loserUserId, state.players[loserUserId].displayName);
      const elo = calculateEloChange(winnerStats.eloRating, loserStats.eloRating, 1);
      updateAndWriteStats(nk, winnerUserId, winnerStats, "win", elo.newA, logger);
      updateAndWriteStats(nk, loserUserId, loserStats, "loss", elo.newB, logger);
      eloChanges[winnerUserId] = elo.deltaA;
      eloChanges[loserUserId] = elo.deltaB;
      state.players[winnerUserId].eloRating = elo.newA;
      state.players[winnerUserId].wins++;
      state.players[winnerUserId].winStreak++;
      state.players[loserUserId].eloRating = elo.newB;
      state.players[loserUserId].losses++;
      state.players[loserUserId].winStreak = 0;
    }
    const gameOverPayload = {
      winner: winnerUserId,
      isDraw,
      eloChanges,
      finalBoard: state.board.slice()
    };
    broadcastMessage(dispatcher, 4 /* GAME_OVER */, gameOverPayload);
    logger.info(
      "match=%s game_over winner=%s isDraw=%s",
      state.matchId,
      winnerUserId || "none",
      String(isDraw)
    );
    return state;
  }
  function updateAndWriteStats(nk, userId, stats, result, newElo, _logger) {
    stats.eloRating = newElo;
    stats.totalGames++;
    if (result === "win") {
      stats.wins++;
      stats.winStreak++;
      if (stats.winStreak > stats.bestStreak) {
        stats.bestStreak = stats.winStreak;
      }
    } else if (result === "loss") {
      stats.losses++;
      stats.winStreak = 0;
    } else {
      stats.draws++;
    }
    writePlayerStats(nk, userId, stats);
  }
  function handleMove(state, userId, payload, dispatcher, nk, logger) {
    if (userId !== state.currentTurn) {
      logger.warn("match=%s user=%s tried to move but it is not their turn", state.matchId, userId);
      return state;
    }
    if (state.status !== "PLAYER_X_TURN" && state.status !== "PLAYER_O_TURN") {
      logger.warn("match=%s move rejected: game status is %s", state.matchId, state.status);
      return state;
    }
    const cellIndex = payload.cellIndex;
    if (typeof cellIndex !== "number" || cellIndex < 0 || cellIndex > 8) {
      logger.warn("match=%s invalid cellIndex=%s", state.matchId, String(cellIndex));
      return state;
    }
    if (state.board[cellIndex] !== null) {
      logger.warn("match=%s cell %d already occupied", state.matchId, cellIndex);
      return state;
    }
    const player = state.players[userId];
    state.board[cellIndex] = player.symbol;
    state.moveHistory.push(cellIndex);
    const winningSymbol = checkWinner(state.board);
    if (winningSymbol !== null) {
      const loserUserId = state.playerOrder[0] === userId ? state.playerOrder[1] : state.playerOrder[0];
      const moveResult2 = {
        cellIndex,
        symbol: player.symbol,
        nextTurn: "",
        // no next turn — game over
        board: state.board.slice()
      };
      broadcastMessage(dispatcher, 3 /* MOVE_RESULT */, moveResult2);
      return resolveGameEnd(state, userId, loserUserId, false, nk, dispatcher, logger);
    }
    if (isBoardFull(state.board)) {
      const moveResult2 = {
        cellIndex,
        symbol: player.symbol,
        nextTurn: "",
        board: state.board.slice()
      };
      broadcastMessage(dispatcher, 3 /* MOVE_RESULT */, moveResult2);
      return resolveGameEnd(state, null, null, true, nk, dispatcher, logger);
    }
    state = switchTurn(state);
    const moveResult = {
      cellIndex,
      symbol: player.symbol,
      nextTurn: state.currentTurn,
      board: state.board.slice()
    };
    broadcastMessage(dispatcher, 3 /* MOVE_RESULT */, moveResult);
    return state;
  }
  var matchInit = function matchInit2(ctx, logger, _nk, params) {
    let mode = "classic";
    if (params && params["mode"] === "timed") {
      mode = "timed";
    }
    let type = "matchmaker";
    if (params && params["type"] === "private") {
      type = "private";
    }
    const state = {
      board: [null, null, null, null, null, null, null, null, null],
      currentTurn: "",
      players: {},
      playerOrder: [],
      status: "WAITING",
      winner: null,
      isDraw: false,
      turnTimeLeft: mode === "timed" ? TURN_TIME_SECONDS : -1,
      turnForfeits: {},
      mode,
      moveHistory: [],
      matchId: ctx.matchId || "",
      reconnectDeadline: {}
    };
    const label = JSON.stringify({ mode, type });
    logger.info("matchInit: match=%s mode=%s type=%s", ctx.matchId, mode, type);
    return {
      state,
      tickRate: 1,
      label
    };
  };
  var matchJoinAttempt = function matchJoinAttempt2(_ctx, logger, _nk, _dispatcher, _tick, state, presence, _metadata) {
    const s = state;
    if (s.players[presence.userId]) {
      logger.info("matchJoinAttempt: user=%s reconnecting", presence.userId);
      return { state, accept: true };
    }
    if (s.status === "GAME_OVER") {
      logger.info("matchJoinAttempt: user=%s rejected \u2014 game over", presence.userId);
      return { state, accept: false, rejectMessage: "Match has ended" };
    }
    if (s.playerOrder.length >= MAX_PLAYERS) {
      logger.info("matchJoinAttempt: user=%s rejected \u2014 match full", presence.userId);
      return { state, accept: false, rejectMessage: "Match is full" };
    }
    return { state, accept: true };
  };
  var matchJoin = function matchJoin2(_ctx, logger, nk, dispatcher, _tick, state, presences) {
    const s = state;
    for (let i = 0; i < presences.length; i++) {
      const presence = presences[i];
      const userId = presence.userId;
      if (s.players[userId]) {
        s.players[userId].connected = true;
        delete s.reconnectDeadline[userId];
        logger.info("matchJoin: user=%s reconnected", userId);
        const gameState = { state: s };
        broadcastMessage(dispatcher, 1 /* GAME_STATE */, gameState, [presence]);
        continue;
      }
      const symbol = s.playerOrder.length === 0 ? "X" : "O";
      const stats = getOrCreatePlayerStats(nk, userId, presence.username || userId);
      const playerState = {
        userId,
        displayName: presence.username || userId,
        symbol,
        connected: true,
        eloRating: stats.eloRating,
        wins: stats.wins,
        losses: stats.losses,
        draws: stats.draws,
        winStreak: stats.winStreak
      };
      s.players[userId] = playerState;
      s.playerOrder.push(userId);
      s.turnForfeits[userId] = 0;
      logger.info(
        "matchJoin: user=%s joined as %s (player %d/2)",
        userId,
        symbol,
        s.playerOrder.length
      );
      broadcastMessage(dispatcher, 5 /* PLAYER_JOINED */, {
        userId,
        displayName: playerState.displayName,
        symbol
      });
    }
    if (s.playerOrder.length === MAX_PLAYERS && s.status === "WAITING") {
      let isPrivate = false;
      if (_ctx.matchLabel) {
        try {
          const labelData = JSON.parse(_ctx.matchLabel);
          isPrivate = labelData.type === "private";
        } catch (e) {
        }
      }
      if (isPrivate) {
        s.status = "READY";
        logger.info("matchJoin: private match=%s READY to start by host", s.matchId);
        const gameState = { state: s };
        broadcastMessage(dispatcher, 5 /* PLAYER_JOINED */, gameState);
      } else {
        s.status = "PLAYER_X_TURN";
        s.currentTurn = s.playerOrder[0];
        if (s.mode === "timed") {
          s.turnTimeLeft = TURN_TIME_SECONDS;
        }
        logger.info("matchJoin: match=%s starting \u2014 X=%s O=%s", s.matchId, s.playerOrder[0], s.playerOrder[1]);
        const gameState = { state: s };
        broadcastMessage(dispatcher, 1 /* GAME_STATE */, gameState);
      }
    }
    return { state: s };
  };
  var matchLeave = function matchLeave2(_ctx, logger, _nk, dispatcher, _tick, state, presences) {
    const s = state;
    for (let i = 0; i < presences.length; i++) {
      const presence = presences[i];
      const userId = presence.userId;
      if (!s.players[userId])
        continue;
      s.players[userId].connected = false;
      if (s.status === "GAME_OVER") {
        logger.info("matchLeave: user=%s left after game over", userId);
        continue;
      }
      if (s.status === "WAITING") {
        delete s.players[userId];
        const idx = s.playerOrder.indexOf(userId);
        if (idx !== -1)
          s.playerOrder.splice(idx, 1);
        delete s.turnForfeits[userId];
        logger.info("matchLeave: user=%s left during WAITING, removed from match", userId);
        continue;
      }
      const deadline = Date.now() + RECONNECT_WINDOW_SECONDS * 1e3;
      s.reconnectDeadline[userId] = deadline;
      logger.info(
        "matchLeave: user=%s disconnected, reconnect deadline=%d",
        userId,
        deadline
      );
      const reconnectPayload = {
        userId,
        secondsLeft: RECONNECT_WINDOW_SECONDS
      };
      broadcastMessage(dispatcher, 7 /* RECONNECT_WINDOW */, reconnectPayload);
    }
    if (s.status === "GAME_OVER" && connectedPlayerCount(s) === 0) {
      logger.info("matchLeave: all players left after game over, ending match");
      return null;
    }
    return { state: s };
  };
  var matchLoop = function matchLoop2(_ctx, logger, nk, dispatcher, _tick, state, messages) {
    let s = state;
    if (s.status === "GAME_OVER") {
      if (connectedPlayerCount(s) === 0) {
        return null;
      }
      return { state: s };
    }
    if (messages) {
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        const senderId = message.sender.userId;
        switch (message.opCode) {
          case 10 /* START_GAME */: {
            if (senderId !== s.playerOrder[0]) {
              logger.warn("matchLoop: START_GAME rejected, %s is not host", senderId);
              break;
            }
            if (s.status !== "WAITING" && s.status !== "READY") {
              logger.warn("matchLoop: START_GAME rejected, status is %s", s.status);
              break;
            }
            if (s.playerOrder.length !== MAX_PLAYERS) {
              logger.warn("matchLoop: START_GAME rejected, need %d players", MAX_PLAYERS);
              break;
            }
            s.status = "PLAYER_X_TURN";
            s.currentTurn = s.playerOrder[0];
            if (s.mode === "timed")
              s.turnTimeLeft = TURN_TIME_SECONDS;
            logger.info("matchLoop: host started match=%s", s.matchId);
            const gameState = { state: s };
            broadcastMessage(dispatcher, 1 /* GAME_STATE */, gameState);
            break;
          }
          case 2 /* MOVE */: {
            let movePayload;
            try {
              movePayload = JSON.parse(nk.binaryToString(message.data));
            } catch (_e) {
              logger.warn("matchLoop: invalid MOVE payload from user=%s", senderId);
              break;
            }
            s = handleMove(s, senderId, movePayload, dispatcher, nk, logger);
            break;
          }
          case 9 /* FORFEIT */: {
            if (s.playerOrder.length === MAX_PLAYERS) {
              const winnerId = s.playerOrder[0] === senderId ? s.playerOrder[1] : s.playerOrder[0];
              const forfeitPayload = {
                userId: senderId,
                reason: "disconnect"
              };
              broadcastMessage(dispatcher, 9 /* FORFEIT */, forfeitPayload);
              s = resolveGameEnd(s, winnerId, senderId, false, nk, dispatcher, logger);
            }
            break;
          }
          default:
            logger.warn("matchLoop: unknown opCode=%d from user=%s", message.opCode, senderId);
        }
      }
    }
    if (s.status === "GAME_OVER") {
      return { state: s };
    }
    const isActiveTurn = s.status === "PLAYER_X_TURN" || s.status === "PLAYER_O_TURN";
    if (!isActiveTurn) {
      return { state: s };
    }
    const now = Date.now();
    const deadlineUserIds = Object.keys(s.reconnectDeadline);
    for (let i = 0; i < deadlineUserIds.length; i++) {
      const deadlineUserId = deadlineUserIds[i];
      const deadline = s.reconnectDeadline[deadlineUserId];
      if (now >= deadline && s.players[deadlineUserId] && !s.players[deadlineUserId].connected) {
        delete s.reconnectDeadline[deadlineUserId];
        logger.info(
          "matchLoop: user=%s reconnect deadline expired, forfeiting",
          deadlineUserId
        );
        const forfeitPayload = {
          userId: deadlineUserId,
          reason: "disconnect"
        };
        broadcastMessage(dispatcher, 9 /* FORFEIT */, forfeitPayload);
        const winnerId = s.playerOrder[0] === deadlineUserId ? s.playerOrder[1] : s.playerOrder[0];
        s = resolveGameEnd(s, winnerId, deadlineUserId, false, nk, dispatcher, logger);
        return { state: s };
      }
      if (s.players[deadlineUserId] && !s.players[deadlineUserId].connected) {
        const secondsLeft = Math.ceil((deadline - now) / 1e3);
        const reconnectPayload = {
          userId: deadlineUserId,
          secondsLeft
        };
        broadcastMessage(dispatcher, 7 /* RECONNECT_WINDOW */, reconnectPayload);
      }
    }
    if (s.mode === "timed" && s.turnTimeLeft > 0) {
      s.turnTimeLeft--;
      const timerPayload = {
        secondsLeft: s.turnTimeLeft,
        currentTurn: s.currentTurn
      };
      broadcastMessage(dispatcher, 8 /* TIMER_TICK */, timerPayload);
      if (s.turnTimeLeft <= 0) {
        const timedOutUserId = s.currentTurn;
        s.turnForfeits[timedOutUserId] = (s.turnForfeits[timedOutUserId] || 0) + 1;
        logger.info(
          "matchLoop: user=%s timed out (forfeit count: %d/%d)",
          timedOutUserId,
          s.turnForfeits[timedOutUserId],
          MAX_TURN_FORFEITS
        );
        if (s.turnForfeits[timedOutUserId] >= MAX_TURN_FORFEITS) {
          const winnerId = s.playerOrder[0] === timedOutUserId ? s.playerOrder[1] : s.playerOrder[0];
          const forfeitPayload = {
            userId: timedOutUserId,
            reason: "timeout"
          };
          broadcastMessage(dispatcher, 9 /* FORFEIT */, forfeitPayload);
          s = resolveGameEnd(s, winnerId, timedOutUserId, false, nk, dispatcher, logger);
        } else {
          s = switchTurn(s);
          const switchPayload = {
            secondsLeft: s.turnTimeLeft,
            currentTurn: s.currentTurn
          };
          broadcastMessage(dispatcher, 8 /* TIMER_TICK */, switchPayload);
        }
      }
    }
    return { state: s };
  };
  var matchSignal = function matchSignal2(_ctx, logger, _nk, _dispatcher, _tick, state, data) {
    const s = state;
    if (data === "end_match") {
      s.status = "GAME_OVER";
      logger.info("matchSignal: match=%s forced to GAME_OVER via signal", s.matchId);
      return { state: s, data: "match_ended" };
    }
    logger.info("matchSignal: match=%s received signal: %s", s.matchId, data);
    return { state: s, data: "ok" };
  };
  var matchTerminate = function matchTerminate2(_ctx, logger, _nk, dispatcher, _tick, state, graceSeconds) {
    const s = state;
    logger.info(
      "matchTerminate: match=%s terminating (grace=%ds)",
      s.matchId,
      graceSeconds
    );
    if (s.status !== "GAME_OVER") {
      s.status = "GAME_OVER";
      const terminatePayload = {
        winner: null,
        isDraw: true,
        eloChanges: {},
        finalBoard: s.board.slice()
      };
      broadcastMessage(dispatcher, 4 /* GAME_OVER */, terminatePayload);
    }
    return { state: s };
  };

  // src/rpc_handlers.ts
  var rpcCreateRoom = function(ctx, logger, nk, payload) {
    let mode = "classic";
    if (payload && payload.length > 0) {
      try {
        const req = JSON.parse(payload);
        if (req.mode === "classic" || req.mode === "timed") {
          mode = req.mode;
        }
      } catch (_e) {
        logger.warn("create_room: invalid JSON payload, defaulting to classic");
      }
    }
    const matchId = nk.matchCreate("tictactoe", { mode, type: "private" });
    logger.info(
      "create_room: user=%s created match=%s mode=%s",
      ctx.userId,
      matchId,
      mode
    );
    const response = { matchId };
    return JSON.stringify(response);
  };
  var rpcGetLeaderboard = function(_ctx, logger, nk, payload) {
    let limit = 10;
    let cursor;
    if (payload && payload.length > 0) {
      try {
        const req = JSON.parse(payload);
        if (typeof req.limit === "number" && req.limit > 0) {
          limit = Math.min(req.limit, 50);
        }
        if (req.cursor) {
          cursor = req.cursor;
        }
      } catch (_e) {
        logger.warn("get_leaderboard: invalid payload, using defaults");
      }
    }
    const result = nk.leaderboardRecordsList(
      LEADERBOARD_ID,
      [],
      // ownerIds — empty = all
      limit,
      cursor,
      void 0
      // expiry override
    );
    const entries = [];
    if (result && result.records) {
      for (let i = 0; i < result.records.length; i++) {
        const record = result.records[i];
        const stats = getOrCreatePlayerStats(
          nk,
          record.ownerId,
          record.username || void 0
        );
        entries.push({
          rank: record.rank,
          userId: record.ownerId,
          displayName: record.username || stats.displayName || record.ownerId,
          wins: stats.wins,
          losses: stats.losses,
          draws: stats.draws,
          winStreak: stats.winStreak,
          bestStreak: stats.bestStreak,
          eloRating: stats.eloRating
        });
      }
    }
    const response = {
      entries,
      nextCursor: result && result.nextCursor ? result.nextCursor : void 0
    };
    return JSON.stringify(response);
  };
  var rpcGetPlayerStats = function(ctx, logger, nk, payload) {
    let targetUserId = ctx.userId;
    if (payload && payload.length > 0) {
      try {
        const req = JSON.parse(payload);
        if (req.userId && req.userId.length > 0) {
          targetUserId = req.userId;
        }
      } catch (_e) {
        logger.warn("get_player_stats: invalid payload, using ctx.userId");
      }
    }
    if (!targetUserId) {
      throw new Error("get_player_stats: no userId available");
    }
    const stats = getOrCreatePlayerStats(nk, targetUserId);
    let rank = 0;
    try {
      const lbResult = nk.leaderboardRecordsList(
        LEADERBOARD_ID,
        [targetUserId],
        1,
        void 0,
        void 0
      );
      if (lbResult && lbResult.ownerRecords && lbResult.ownerRecords.length > 0) {
        rank = lbResult.ownerRecords[0].rank;
      }
    } catch (_e) {
      logger.warn("get_player_stats: could not fetch leaderboard rank for %s", targetUserId);
    }
    const response = {
      rank,
      userId: stats.userId,
      displayName: stats.displayName,
      wins: stats.wins,
      losses: stats.losses,
      draws: stats.draws,
      winStreak: stats.winStreak,
      bestStreak: stats.bestStreak,
      eloRating: stats.eloRating,
      totalGames: stats.totalGames
    };
    return JSON.stringify(response);
  };
  var rpcGetActiveMatches = function(_ctx, logger, nk, _payload) {
    const matches = nk.matchList(
      10,
      // limit
      true,
      // authoritative only
      void 0,
      // label filter
      1,
      // min size (at least 1 player)
      2,
      // max size
      "*"
      // query — all
    );
    const result = [];
    if (matches) {
      for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        result.push({
          matchId: m.matchId,
          label: m.label || "",
          size: m.size
        });
      }
    }
    logger.debug("get_active_matches: found %d matches", result.length);
    return JSON.stringify(result);
  };

  // src/main.ts
  function InitModule(ctx, logger, nk, initializer) {
    initLeaderboard(nk, logger);
    logger.info(
      "Tic-Tac-Toe module v%s initialized",
      ctx.env["NAKAMA_MODULE_VERSION"] || "1.0.0"
    );
  }
  var g = typeof globalThis !== "undefined" ? globalThis : typeof global !== "undefined" ? global : {};
  g.InitModule = InitModule;
  g.matchInit = matchInit;
  g.matchJoinAttempt = matchJoinAttempt;
  g.matchJoin = matchJoin;
  g.matchLeave = matchLeave;
  g.matchLoop = matchLoop;
  g.matchSignal = matchSignal;
  g.matchTerminate = matchTerminate;
  g.rpcCreateRoom = rpcCreateRoom;
  g.rpcGetLeaderboard = rpcGetLeaderboard;
  g.rpcGetPlayerStats = rpcGetPlayerStats;
  g.rpcGetActiveMatches = rpcGetActiveMatches;
})();

// server/chess-rooms.js
// Dedicated Multiplayer Chess Room & Matchmaking Manager
// Operates on a completely segregated namespace: never collides with Voxel Realms rooms.
// Supports: Public Matchmaking Queues, Private Rooms with 4-digit PINs,
// Fischer Clocks, Draw Offers, Resignations, Spectator Broadcasting & Live Chat.

const { ChessEngine } = require('../public/src/chess/chess_engine');

const CHESS_MSG = {
  // Client -> Server
  JOIN_QUEUE: 'chess_join_queue',
  LEAVE_QUEUE: 'chess_leave_queue',
  CREATE_ROOM: 'chess_create_room',
  JOIN_ROOM: 'chess_join_room',
  MOVE: 'chess_move',
  OFFER_DRAW: 'chess_offer_draw',
  RESPOND_DRAW: 'chess_respond_draw',
  RESIGN: 'chess_resign',
  REMATCH: 'chess_rematch',
  SPECTATE_ROOM: 'chess_spectate_room',
  LEAVE_SPECTATE: 'chess_leave_spectate',
  LIST_PUBLIC_GAMES: 'chess_list_public_games',
  CHAT: 'chess_chat',

  // Server -> Client
  QUEUE_STATUS: 'chess_queue_status',
  GAME_START: 'chess_game_start',
  MOVE_BROADCAST: 'chess_move_broadcast',
  DRAW_OFFERED: 'chess_draw_offered',
  DRAW_DECLINED: 'chess_draw_declined',
  GAME_OVER: 'chess_game_over',
  SPECTATE_STATE: 'chess_spectate_state',
  PUBLIC_GAMES_LIST: 'chess_public_games_list',
  CLOCK_SYNC: 'chess_clock_sync',
  CHAT_BROADCAST: 'chess_chat_broadcast',
  ERROR: 'chess_error'
};

const TIME_CONTROLS = {
  bullet_1_0: { name: 'Bullet 1+0', initialSec: 60, incrementSec: 0 },
  bullet_1_1: { name: 'Bullet 1+1', initialSec: 60, incrementSec: 1 },
  blitz_3_0: { name: 'Blitz 3+0', initialSec: 180, incrementSec: 0 },
  blitz_3_2: { name: 'Blitz 3+2', initialSec: 180, incrementSec: 2 },
  blitz_5_0: { name: 'Blitz 5+0', initialSec: 300, incrementSec: 0 },
  blitz_5_3: { name: 'Blitz 5+3', initialSec: 300, incrementSec: 3 },
  rapid_10_0: { name: 'Rápido 10+0', initialSec: 600, incrementSec: 0 },
  rapid_15_10: { name: 'Rápido 15+10', initialSec: 900, incrementSec: 10 },
  unlimited: { name: 'Sin Límite', initialSec: 0, incrementSec: 0 }
};

class ChessRoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> ChessRoom
    this.queues = new Map(); // timeControl -> Array of { ws, meta, joinedAt }
    this.socketMeta = new Map(); // ws -> { id, name, roomId, isSpectating }
    this.roomCounter = 1;

    // Initialize queues for each time control
    for (const tc of Object.keys(TIME_CONTROLS)) {
      this.queues.set(tc, []);
    }

    // 100ms Clock tick loop
    this.clockInterval = setInterval(() => this.tickClocks(), 100);
  }

  destroy() {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
    }
    for (const r of this.rooms.values()) {
      r.cleanup();
    }
    this.rooms.clear();
    this.socketMeta.clear();
  }

  send(ws, type, data = {}) {
    if (!ws || ws.readyState !== 1) return; // 1 = OPEN
    try {
      ws.send(JSON.stringify({ type, data, timestamp: Date.now() }));
    } catch (_) {}
  }

  broadcast(room, type, data = {}, excludeWs = null) {
    const clients = [room.whiteWs, room.blackWs, ...room.spectators];
    for (const ws of clients) {
      if (ws && ws !== excludeWs) {
        this.send(ws, type, data);
      }
    }
  }

  /**
   * Main router for incoming chess WebSocket packets
   */
  handleMessage(ws, message) {
    let packet;
    try {
      packet = typeof message === 'string' ? JSON.parse(message) : message;
    } catch (_) {
      return;
    }

    if (!packet || typeof packet.type !== 'string' || !packet.type.startsWith('chess_')) {
      return; // Ignore non-chess packets
    }

    const meta = this.socketMeta.get(ws) || {
      id: `chess_${Math.random().toString(36).substr(2, 9)}`,
      name: 'Ajedrecista',
      roomId: null
    };
    this.socketMeta.set(ws, meta);

    const { type, data } = packet;

    switch (type) {
      case CHESS_MSG.JOIN_QUEUE:
        this.handleJoinQueue(ws, meta, data);
        break;
      case CHESS_MSG.LEAVE_QUEUE:
        this.handleLeaveQueue(ws, meta);
        break;
      case CHESS_MSG.CREATE_ROOM:
        this.handleCreateRoom(ws, meta, data);
        break;
      case CHESS_MSG.JOIN_ROOM:
        this.handleJoinRoom(ws, meta, data);
        break;
      case CHESS_MSG.MOVE:
        this.handleMove(ws, meta, data);
        break;
      case CHESS_MSG.OFFER_DRAW:
        this.handleOfferDraw(ws, meta);
        break;
      case CHESS_MSG.RESPOND_DRAW:
        this.handleRespondDraw(ws, meta, data);
        break;
      case CHESS_MSG.RESIGN:
        this.handleResign(ws, meta);
        break;
      case CHESS_MSG.REMATCH:
        this.handleRematch(ws, meta);
        break;
      case CHESS_MSG.SPECTATE_ROOM:
        this.handleSpectateRoom(ws, meta, data);
        break;
      case CHESS_MSG.LEAVE_SPECTATE:
        this.handleLeaveSpectate(ws, meta);
        break;
      case CHESS_MSG.LIST_PUBLIC_GAMES:
        this.handleListPublicGames(ws);
        break;
      case CHESS_MSG.CHAT:
        this.handleChat(ws, meta, data);
        break;
    }
  }

  handleDisconnect(ws) {
    this.handleLeaveQueue(ws);
    const meta = this.socketMeta.get(ws);
    if (!meta) return;

    if (meta.roomId) {
      const room = this.rooms.get(meta.roomId);
      if (room) {
        if (room.spectators.has(ws)) {
          room.spectators.delete(ws);
        } else if (!room.isGameOver) {
          // If active player disconnects during game, start 60s forfeit countdown
          const isWhite = room.whiteWs === ws;
          room.onPlayerDisconnect(isWhite, () => {
            // Forfeit callback
            const winner = isWhite ? 'b' : 'w';
            this.finishGame(room, {
              result: 'abandonment',
              winner,
              reason: `Victoria por abandono de ${isWhite ? room.whiteName : room.blackName}`
            });
          });
        }
      }
    }
    this.socketMeta.delete(ws);
  }

  // --- MATCHMAKING QUEUES ---

  handleJoinQueue(ws, meta, data = {}) {
    this.handleLeaveQueue(ws, meta); // Clean prior queues
    if (data.name) meta.name = data.name.slice(0, 30);

    const tc = data.timeControl && TIME_CONTROLS[data.timeControl] ? data.timeControl : 'blitz_3_2';
    const queue = this.queues.get(tc);

    // Look for matching opponent in queue
    const opp = queue.shift();
    if (opp && opp.ws !== ws && opp.ws.readyState === 1) {
      // Pair up!
      const roomId = `match_${this.roomCounter++}`;
      const isOppWhite = Math.random() > 0.5;

      const whiteWs = isOppWhite ? opp.ws : ws;
      const whiteMeta = isOppWhite ? opp.meta : meta;
      const blackWs = isOppWhite ? ws : opp.ws;
      const blackMeta = isOppWhite ? meta : opp.meta;

      this.createAndStartGame({
        roomId,
        whiteWs,
        whiteMeta,
        blackWs,
        blackMeta,
        timeControl: tc,
        isPrivate: false,
        allowSpectators: true
      });
    } else {
      queue.push({ ws, meta, joinedAt: Date.now() });
      this.send(ws, CHESS_MSG.QUEUE_STATUS, { status: 'waiting', timeControl: tc });
    }
  }

  handleLeaveQueue(ws, meta) {
    for (const queue of this.queues.values()) {
      const idx = queue.findIndex(item => item.ws === ws);
      if (idx !== -1) {
        queue.splice(idx, 1);
        this.send(ws, CHESS_MSG.QUEUE_STATUS, { status: 'idle' });
      }
    }
  }

  // --- PRIVATE & CUSTOM ROOMS ---

  handleCreateRoom(ws, meta, data = {}) {
    if (data.name) meta.name = data.name.slice(0, 30);
    const roomId = data.roomId ? data.roomId.trim().toLowerCase().slice(0, 24) : `chess_${this.roomCounter++}`;
    const pin = data.pin ? String(data.pin).slice(0, 8) : null;
    const tc = data.timeControl && TIME_CONTROLS[data.timeControl] ? data.timeControl : 'blitz_5_3';
    const allowSpectators = data.allowSpectators !== false;
    const prefColor = data.preferredColor || 'random';

    if (this.rooms.has(roomId)) {
      this.send(ws, CHESS_MSG.ERROR, { message: `La sala '${roomId}' ya existe. Elige otro nombre.` });
      return;
    }

    const room = new ChessRoom({
      id: roomId,
      pin,
      timeControl: tc,
      isPrivate: Boolean(pin),
      allowSpectators,
      creatorWs: ws,
      creatorMeta: meta,
      preferredColor: prefColor
    });

    this.rooms.set(roomId, room);
    meta.roomId = roomId;

    this.send(ws, CHESS_MSG.QUEUE_STATUS, {
      status: 'room_created',
      roomId,
      pin,
      timeControl: tc
    });
  }

  handleJoinRoom(ws, meta, data = {}) {
    if (!data || !data.roomId) {
      this.send(ws, CHESS_MSG.ERROR, { message: 'ID de sala requerido.' });
      return;
    }
    if (data.name) meta.name = data.name.slice(0, 30);

    const roomId = data.roomId.trim().toLowerCase();
    const room = this.rooms.get(roomId);

    if (!room) {
      this.send(ws, CHESS_MSG.ERROR, { message: `No se encontró la sala de ajedrez '${roomId}'.` });
      return;
    }

    if (room.pin && room.pin !== String(data.pin)) {
      this.send(ws, CHESS_MSG.ERROR, { message: 'PIN de acceso incorrecto.' });
      return;
    }

    if (room.isStarted) {
      this.send(ws, CHESS_MSG.ERROR, { message: 'La partida ya ha comenzado en esta sala.' });
      return;
    }

    // Join as opponent!
    meta.roomId = roomId;
    const creator = room.creatorMeta;
    const pref = room.preferredColor;

    let isCreatorWhite;
    if (pref === 'w') isCreatorWhite = true;
    else if (pref === 'b') isCreatorWhite = false;
    else isCreatorWhite = Math.random() > 0.5;

    const whiteWs = isCreatorWhite ? room.creatorWs : ws;
    const whiteMeta = isCreatorWhite ? creator : meta;
    const blackWs = isCreatorWhite ? ws : room.creatorWs;
    const blackMeta = isCreatorWhite ? meta : creator;

    this.createAndStartGame({
      room,
      roomId,
      whiteWs,
      whiteMeta,
      blackWs,
      blackMeta,
      timeControl: room.timeControl,
      isPrivate: room.isPrivate,
      allowSpectators: room.allowSpectators
    });
  }

  createAndStartGame(opts) {
    const { roomId, whiteWs, whiteMeta, blackWs, blackMeta, timeControl, isPrivate, allowSpectators } = opts;
    let room = opts.room || this.rooms.get(roomId);

    if (!room) {
      room = new ChessRoom({
        id: roomId,
        timeControl,
        isPrivate,
        allowSpectators
      });
      this.rooms.set(roomId, room);
    }

    room.initGame({
      whiteWs,
      whiteMeta,
      blackWs,
      blackMeta,
      timeControl
    });

    whiteMeta.roomId = roomId;
    blackMeta.roomId = roomId;

    const startPayload = {
      roomId,
      timeControl,
      timeControlName: TIME_CONTROLS[timeControl].name,
      fen: room.engine.getFen(),
      white: { id: whiteMeta.id, name: whiteMeta.name },
      black: { id: blackMeta.id, name: blackMeta.name },
      whiteTime: room.whiteTime,
      blackTime: room.blackTime,
      increment: room.increment
    };

    this.send(whiteWs, CHESS_MSG.GAME_START, { ...startPayload, yourColor: 'w' });
    this.send(blackWs, CHESS_MSG.GAME_START, { ...startPayload, yourColor: 'b' });
  }

  // --- GAME ACTIONS & MOVES ---

  handleMove(ws, meta, data = {}) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (!room || room.isGameOver || !room.isStarted) return;

    const isWhite = room.whiteWs === ws;
    const isBlack = room.blackWs === ws;
    if (!isWhite && !isBlack) return; // Spectators cannot move

    const turnColor = room.engine.turn;
    if ((isWhite && turnColor !== 'w') || (isBlack && turnColor !== 'b')) {
      this.send(ws, CHESS_MSG.ERROR, { message: 'No es tu turno.' });
      return;
    }

    const executed = room.engine.makeMove(data.from, data.to, data.promotion);
    if (!executed) {
      this.send(ws, CHESS_MSG.ERROR, { message: 'Movimiento ilegal.' });
      return;
    }

    // Add increment to player who just moved
    if (room.increment > 0) {
      if (isWhite) room.whiteTime += room.increment;
      else room.blackTime += room.increment;
    }

    // Switch active clock
    room.lastMoveTime = Date.now();

    const status = room.engine.getGameStatus();
    const movePayload = {
      roomId: room.id,
      move: executed,
      fen: executed.fenAfter,
      whiteTime: Math.max(0, Math.round(room.whiteTime * 10) / 10),
      blackTime: Math.max(0, Math.round(room.blackTime * 10) / 10),
      turn: room.engine.turn,
      isCheck: executed.isCheck,
      isCheckmate: executed.isCheckmate,
      isGameOver: status.isGameOver,
      status
    };

    this.broadcast(room, CHESS_MSG.MOVE_BROADCAST, movePayload);

    if (status.isGameOver) {
      this.finishGame(room, status);
    }
  }

  handleOfferDraw(ws, meta) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (!room || room.isGameOver) return;

    const isWhite = room.whiteWs === ws;
    const targetWs = isWhite ? room.blackWs : room.whiteWs;
    room.drawOfferFrom = isWhite ? 'w' : 'b';

    this.send(targetWs, CHESS_MSG.DRAW_OFFERED, {
      fromColor: room.drawOfferFrom,
      fromName: isWhite ? room.whiteName : room.blackName
    });
  }

  handleRespondDraw(ws, meta, data = {}) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (!room || room.isGameOver || !room.drawOfferFrom) return;

    const isWhite = room.whiteWs === ws;
    const respondingColor = isWhite ? 'w' : 'b';
    if (respondingColor === room.drawOfferFrom) return;

    if (data.accept) {
      this.finishGame(room, {
        isGameOver: true,
        result: 'mutual_agreement',
        winner: null,
        reason: 'Tablas por mutuo acuerdo'
      });
    } else {
      room.drawOfferFrom = null;
      const targetWs = isWhite ? room.whiteWs : room.blackWs;
      this.send(targetWs, CHESS_MSG.DRAW_DECLINED, { message: 'Oferta de tablas rechazada.' });
    }
  }

  handleResign(ws, meta) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (!room || room.isGameOver) return;

    const isWhite = room.whiteWs === ws;
    const isBlack = room.blackWs === ws;
    if (!isWhite && !isBlack) return;

    const winner = isWhite ? 'b' : 'w';
    this.finishGame(room, {
      isGameOver: true,
      result: 'resignation',
      winner,
      reason: `Rendición de ${isWhite ? room.whiteName : room.blackName}. Victoria para ${winner === 'w' ? 'Blancas' : 'Negras'}.`
    });
  }

  handleRematch(ws, meta) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (!room || !room.isGameOver) return;

    // Invert colors and restart
    const oldWhiteWs = room.whiteWs;
    const oldWhiteMeta = this.socketMeta.get(oldWhiteWs);
    const oldBlackWs = room.blackWs;
    const oldBlackMeta = this.socketMeta.get(oldBlackWs);

    this.createAndStartGame({
      room,
      roomId: room.id,
      whiteWs: oldBlackWs,
      whiteMeta: oldBlackMeta,
      blackWs: oldWhiteWs,
      blackMeta: oldWhiteMeta,
      timeControl: room.timeControl,
      isPrivate: room.isPrivate,
      allowSpectators: room.allowSpectators
    });
  }

  finishGame(room, status) {
    room.isGameOver = true;
    const pgn = room.engine.exportPgn({
      White: room.whiteName,
      Black: room.blackName,
      Result: status.winner === 'w' ? '1-0' : (status.winner === 'b' ? '0-1' : '1/2-1/2')
    });

    this.broadcast(room, CHESS_MSG.GAME_OVER, {
      roomId: room.id,
      result: status.result,
      winner: status.winner,
      reason: status.reason,
      pgn
    });
  }

  // --- SPECTATORS & BROADCASTING ---

  handleSpectateRoom(ws, meta, data = {}) {
    if (!data || !data.roomId) return;
    const room = this.rooms.get(data.roomId.trim().toLowerCase());
    if (!room) {
      this.send(ws, CHESS_MSG.ERROR, { message: 'Partida no encontrada.' });
      return;
    }
    if (!room.allowSpectators) {
      this.send(ws, CHESS_MSG.ERROR, { message: 'Esta partida es privada y no permite espectadores.' });
      return;
    }

    room.spectators.add(ws);
    meta.roomId = room.id;
    meta.isSpectating = true;

    this.send(ws, CHESS_MSG.SPECTATE_STATE, {
      roomId: room.id,
      fen: room.engine.getFen(),
      turn: room.engine.turn,
      white: { id: room.whiteMeta.id, name: room.whiteName },
      black: { id: room.blackMeta.id, name: room.blackName },
      whiteTime: room.whiteTime,
      blackTime: room.blackTime,
      history: room.engine.history,
      spectatorCount: room.spectators.size,
      isGameOver: room.isGameOver
    });
  }

  handleLeaveSpectate(ws, meta) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (room) {
      room.spectators.delete(ws);
    }
    meta.roomId = null;
    meta.isSpectating = false;
  }

  handleListPublicGames(ws) {
    const list = [];
    for (const r of this.rooms.values()) {
      if (r.isStarted && !r.isPrivate && r.allowSpectators) {
        list.push({
          roomId: r.id,
          whiteName: r.whiteName,
          blackName: r.blackName,
          timeControl: r.timeControl,
          timeControlName: TIME_CONTROLS[r.timeControl]?.name || r.timeControl,
          fen: r.engine.getFen(),
          moveCount: r.engine.history.length,
          spectators: r.spectators.size,
          isGameOver: r.isGameOver
        });
      }
    }
    this.send(ws, CHESS_MSG.PUBLIC_GAMES_LIST, { games: list });
  }

  handleChat(ws, meta, data = {}) {
    if (!meta.roomId || !data.text) return;
    const room = this.rooms.get(meta.roomId);
    if (!room) return;

    const cleanText = String(data.text).slice(0, 140).trim();
    if (!cleanText) return;

    this.broadcast(room, CHESS_MSG.CHAT_BROADCAST, {
      sender: meta.name || 'Jugador',
      text: cleanText,
      isSpectator: Boolean(meta.isSpectating),
      time: new Date().toLocaleTimeString()
    });
  }

  // --- CLOCK TICK LOOP ---

  tickClocks() {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      if (!room.isStarted || room.isGameOver || room.timeControl === 'unlimited') continue;

      const elapsedSec = (now - room.lastTick) / 1000;
      room.lastTick = now;

      if (room.engine.turn === 'w') {
        room.whiteTime = Math.max(0, room.whiteTime - elapsedSec);
        if (room.whiteTime <= 0) {
          const winner = room.engine.isInsufficientMaterial() ? null : 'b';
          this.finishGame(room, {
            isGameOver: true,
            result: 'timeout',
            winner,
            reason: winner ? 'Victoria por tiempo para las Negras' : 'Tablas por tiempo y material insuficiente'
          });
        }
      } else {
        room.blackTime = Math.max(0, room.blackTime - elapsedSec);
        if (room.blackTime <= 0) {
          const winner = room.engine.isInsufficientMaterial() ? null : 'w';
          this.finishGame(room, {
            isGameOver: true,
            result: 'timeout',
            winner,
            reason: winner ? 'Victoria por tiempo para las Blancas' : 'Tablas por tiempo y material insuficiente'
          });
        }
      }
    }
  }
}

class ChessRoom {
  constructor(opts) {
    this.id = opts.id;
    this.pin = opts.pin || null;
    this.timeControl = opts.timeControl || 'blitz_3_2';
    this.isPrivate = Boolean(opts.isPrivate);
    this.allowSpectators = opts.allowSpectators !== false;

    this.creatorWs = opts.creatorWs || null;
    this.creatorMeta = opts.creatorMeta || null;
    this.preferredColor = opts.preferredColor || 'random';

    this.whiteWs = null;
    this.whiteMeta = null;
    this.whiteName = 'Blancas';
    this.blackWs = null;
    this.blackMeta = null;
    this.blackName = 'Negras';

    this.engine = new ChessEngine();
    this.isStarted = false;
    this.isGameOver = false;
    this.spectators = new Set();
    this.drawOfferFrom = null;

    const tcCfg = TIME_CONTROLS[this.timeControl] || TIME_CONTROLS.blitz_3_2;
    this.whiteTime = tcCfg.initialSec;
    this.blackTime = tcCfg.initialSec;
    this.increment = tcCfg.incrementSec;
    this.lastTick = Date.now();
    this.lastMoveTime = Date.now();
    this.disconnectTimer = null;
  }

  initGame({ whiteWs, whiteMeta, blackWs, blackMeta, timeControl }) {
    this.whiteWs = whiteWs;
    this.whiteMeta = whiteMeta;
    this.whiteName = whiteMeta.name || 'Blancas';

    this.blackWs = blackWs;
    this.blackMeta = blackMeta;
    this.blackName = blackMeta.name || 'Negras';

    this.timeControl = timeControl;
    const tcCfg = TIME_CONTROLS[this.timeControl] || TIME_CONTROLS.blitz_3_2;
    this.whiteTime = tcCfg.initialSec;
    this.blackTime = tcCfg.initialSec;
    this.increment = tcCfg.incrementSec;

    this.engine.reset();
    this.isStarted = true;
    this.isGameOver = false;
    this.drawOfferFrom = null;
    this.lastTick = Date.now();
    this.lastMoveTime = Date.now();
  }

  onPlayerDisconnect(isWhite, onTimeoutCallback) {
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this.disconnectTimer = setTimeout(onTimeoutCallback, 60000); // 60s reconnection window
  }

  cleanup() {
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
    this.spectators.clear();
  }
}

module.exports = {
  ChessRoomManager,
  CHESS_MSG,
  TIME_CONTROLS
};

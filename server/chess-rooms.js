// server/chess-rooms.js
// Dedicated Multiplayer Chess Room & Matchmaking Manager
// Operates on a completely segregated namespace: never collides with Voxel Realms rooms.
// Supports: Public Matchmaking Queues, Private Rooms with 4-digit PINs,
// Fischer Clocks, Draw Offers, Resignations, Spectator Broadcasting & Live Chat,
// Token-Based Reconnection, and Room Garbage Collection.

const { ChessEngine } = require('../public/src/chess/chess_engine');

const CHESS_MSG = {
  // Client -> Server
  JOIN_QUEUE: 'chess_join_queue',
  LEAVE_QUEUE: 'chess_leave_queue',
  CREATE_ROOM: 'chess_create_room',
  JOIN_ROOM: 'chess_join_room',
  RECONNECT: 'chess_reconnect',
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
  SPECTATOR_COUNT_UPDATE: 'chess_spectator_count_update',
  PUBLIC_GAMES_LIST: 'chess_public_games_list',
  CLOCK_SYNC: 'chess_clock_sync',
  RECONNECT_SUCCESS: 'chess_reconnect_success',
  OPPONENT_RECONNECTED: 'chess_opponent_reconnected',
  OPPONENT_DISCONNECTED: 'chess_opponent_disconnected',
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
    this.pinToRoom = new Map(); // 4-digit PIN -> ChessRoom
    this.queues = new Map(); // timeControl -> Array of { ws, meta, joinedAt, aiTimer }
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
      this.clockInterval = null;
    }
    for (const queue of this.queues.values()) {
      for (const item of queue) {
        if (item.aiTimer) clearTimeout(item.aiTimer);
      }
      queue.length = 0;
    }
    for (const r of this.rooms.values()) {
      r.cleanup();
    }
    this.rooms.clear();
    this.pinToRoom.clear();
    this.socketMeta.clear();
  }

  /**
   * Generates a unique 4-digit PIN code for private room discovery
   */
  generateUniquePin() {
    for (let i = 0; i < 10000; i++) {
      const pin = String(Math.floor(1000 + Math.random() * 9000));
      if (!this.pinToRoom.has(pin)) return pin;
    }
    return String(Date.now()).slice(-4);
  }

  /**
   * Standardizes outgoing packet delivery to { type, data } while preserving
   * root-level property access for backwards compatibility.
   */
  send(ws, type, data = {}) {
    if (!ws || ws.readyState !== 1) return; // 1 = OPEN
    try {
      const payload = {
        type,
        data,
        ...data,
        timestamp: Date.now()
      };
      ws.send(JSON.stringify(payload));
    } catch (_) {}
  }

  /**
   * Broadcasts packet to room players and spectators
   */
  broadcast(room, type, data = {}, excludeWs = null) {
    if (!room) return;
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
      roomId: null,
      isSpectating: false
    };
    this.socketMeta.set(ws, meta);

    // Normalize packet data envelope: supports both { type, data: { ... } } and legacy flat properties
    const rawData = (packet.data && typeof packet.data === 'object') ? packet.data : {};
    const data = { ...packet, ...rawData };
    delete data.type;
    delete data.data;
    delete data.timestamp;

    if (data.playerName && !data.name) {
      data.name = data.playerName;
    }

    let type = packet.type;
    // Map client aliases if necessary
    if (type === 'chess_draw_offer') {
      type = CHESS_MSG.OFFER_DRAW;
    } else if (type === 'chess_draw_accept') {
      type = CHESS_MSG.RESPOND_DRAW;
      data.accept = true;
    } else if (type === 'chess_draw_decline') {
      type = CHESS_MSG.RESPOND_DRAW;
      data.accept = false;
    } else if (type === 'chess_list_games') {
      type = CHESS_MSG.LIST_PUBLIC_GAMES;
    } else if (type === 'chess_spectate') {
      type = CHESS_MSG.SPECTATE_ROOM;
    }

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
      case CHESS_MSG.RECONNECT:
        this.handleReconnect(ws, meta, data);
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
          this.broadcast(room, CHESS_MSG.SPECTATOR_COUNT_UPDATE, {
            roomId: room.id,
            spectatorCount: room.spectators.size
          });
        } else if (!room.isGameOver && room.isStarted) {
          const isWhite = room.whiteWs === ws;
          const isBlack = room.blackWs === ws;
          if (isWhite || isBlack) {
            // Notify opponent about disconnection
            const oppWs = isWhite ? room.blackWs : room.whiteWs;
            if (oppWs && oppWs.readyState === 1) {
              this.send(oppWs, CHESS_MSG.OPPONENT_DISCONNECTED, {
                color: isWhite ? 'w' : 'b',
                name: isWhite ? room.whiteName : room.blackName,
                timeoutSec: 60
              });
            }

            // Start 60s forfeit countdown
            room.onPlayerDisconnect(isWhite, () => {
              if (room.isGameOver) return;
              const winner = isWhite ? 'b' : 'w';
              this.finishGame(room, {
                isGameOver: true,
                result: 'abandonment',
                winner,
                reason: `Victoria por abandono de ${isWhite ? room.whiteName : room.blackName}`
              });
            });
          }
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

    // Look for matching opponent in queue (filter out stale or closed sockets)
    let opp = null;
    while (queue.length > 0) {
      const candidate = queue.shift();
      if (candidate.aiTimer) clearTimeout(candidate.aiTimer);
      if (candidate.ws !== ws && candidate.ws.readyState === 1) {
        opp = candidate;
        break;
      }
    }

    if (opp) {
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
      // Queue client and set 25-second AI suggestion timer
      const queueEntry = { ws, meta, joinedAt: Date.now(), aiTimer: null };
      queueEntry.aiTimer = setTimeout(() => {
        if (ws.readyState === 1) {
          const currentQueue = this.queues.get(tc);
          if (currentQueue && currentQueue.some(item => item.ws === ws)) {
            this.send(ws, CHESS_MSG.QUEUE_STATUS, {
              status: 'suggest_ai',
              timeControl: tc,
              message: 'El emparejamiento está tardando. ¿Deseas jugar contra la IA?'
            });
          }
        }
      }, 25000);

      queue.push(queueEntry);
      this.send(ws, CHESS_MSG.QUEUE_STATUS, { status: 'waiting', timeControl: tc });
    }
  }

  handleLeaveQueue(ws, meta) {
    for (const queue of this.queues.values()) {
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].ws === ws) {
          if (queue[i].aiTimer) {
            clearTimeout(queue[i].aiTimer);
          }
          queue.splice(i, 1);
          this.send(ws, CHESS_MSG.QUEUE_STATUS, { status: 'idle' });
        }
      }
    }
  }

  // --- PRIVATE & CUSTOM ROOMS ---

  handleCreateRoom(ws, meta, data = {}) {
    if (data.name) meta.name = data.name.slice(0, 30);

    const rawPin = (data.pin !== undefined && data.pin !== null) ? String(data.pin).trim() : null;
    let pin = rawPin && rawPin.length > 0 ? rawPin.slice(0, 8) : null;

    // Auto-generate 4-digit PIN if private room was requested without specific PIN
    if (!pin && data.isPrivate) {
      pin = this.generateUniquePin();
    }

    const roomId = data.roomId
      ? data.roomId.trim().toLowerCase().slice(0, 24)
      : (pin ? `room_${pin}` : `chess_${this.roomCounter++}`);
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
      isPrivate: Boolean(pin || data.isPrivate),
      allowSpectators,
      creatorWs: ws,
      creatorMeta: meta,
      preferredColor: prefColor
    });

    this.rooms.set(roomId, room);
    if (pin) {
      this.pinToRoom.set(pin, room);
    }
    meta.roomId = roomId;

    const createdPayload = {
      status: 'room_created',
      roomId,
      pin,
      timeControl: tc
    };

    this.send(ws, CHESS_MSG.QUEUE_STATUS, createdPayload);
    // Also dispatch chess_room_created for clients listening on explicit event name
    this.send(ws, 'chess_room_created', createdPayload);
  }

  handleJoinRoom(ws, meta, data = {}) {
    if (data.name) meta.name = data.name.slice(0, 30);

    let room = null;
    const reqPin = (data.pin !== undefined && data.pin !== null) ? String(data.pin).trim() : null;

    if (data.roomId) {
      const roomId = String(data.roomId).trim().toLowerCase();
      room = this.rooms.get(roomId);
      // Fallback: check if roomId was entered as a PIN
      if (!room && reqPin) {
        room = this.pinToRoom.get(reqPin);
      }
      if (!room && this.pinToRoom.has(roomId)) {
        room = this.pinToRoom.get(roomId);
      }
    } else if (reqPin) {
      // PIN-only room join route
      room = this.pinToRoom.get(reqPin);
      if (!room) {
        this.send(ws, CHESS_MSG.ERROR, { message: 'No se encontró ninguna sala con el código PIN proporcionado.' });
        return;
      }
    } else {
      this.send(ws, CHESS_MSG.ERROR, { message: 'ID de sala o código PIN requerido.' });
      return;
    }

    if (!room) {
      this.send(ws, CHESS_MSG.ERROR, { message: `No se encontró la sala de ajedrez '${data.roomId || reqPin}'.` });
      return;
    }

    // Verify PIN if the room is PIN-protected
    if (room.pin && reqPin && room.pin !== reqPin) {
      this.send(ws, CHESS_MSG.ERROR, { message: 'PIN de acceso incorrecto.' });
      return;
    }
    if (room.pin && !reqPin && !data.roomId) {
      this.send(ws, CHESS_MSG.ERROR, { message: 'PIN de acceso incorrecto.' });
      return;
    }
    if (room.pin && !reqPin && data.roomId) {
      this.send(ws, CHESS_MSG.ERROR, { message: 'PIN de acceso requerido para esta sala.' });
      return;
    }

    if (room.isStarted) {
      this.send(ws, CHESS_MSG.ERROR, { message: 'La partida ya ha comenzado en esta sala.' });
      return;
    }

    // Join as opponent!
    meta.roomId = room.id;
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
      roomId: room.id,
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
    whiteMeta.isSpectating = false;
    blackMeta.roomId = roomId;
    blackMeta.isSpectating = false;

    // Generate secure session reconnection tokens
    room.whiteToken = `tok_w_${Math.random().toString(36).substr(2, 10)}_${Date.now()}`;
    room.blackToken = `tok_b_${Math.random().toString(36).substr(2, 10)}_${Date.now()}`;

    const wTime = Math.max(0, Math.round(room.whiteTime * 10) / 10);
    const bTime = Math.max(0, Math.round(room.blackTime * 10) / 10);

    const startPayload = {
      roomId,
      timeControl,
      timeControlName: TIME_CONTROLS[timeControl]?.name || timeControl,
      fen: room.engine.getFen(),
      white: { id: whiteMeta.id, name: whiteMeta.name },
      black: { id: blackMeta.id, name: blackMeta.name },
      whitePlayer: { id: whiteMeta.id, name: whiteMeta.name },
      blackPlayer: { id: blackMeta.id, name: blackMeta.name },
      whiteTime: wTime,
      blackTime: bTime,
      clocks: { w: wTime, b: bTime, increment: room.increment },
      increment: room.increment
    };

    this.send(whiteWs, CHESS_MSG.GAME_START, {
      ...startPayload,
      yourColor: 'w',
      color: 'w',
      playerToken: room.whiteToken,
      token: room.whiteToken,
      opponent: { id: blackMeta.id, name: blackMeta.name }
    });

    this.send(blackWs, CHESS_MSG.GAME_START, {
      ...startPayload,
      yourColor: 'b',
      color: 'b',
      playerToken: room.blackToken,
      token: room.blackToken,
      opponent: { id: whiteMeta.id, name: whiteMeta.name }
    });
  }

  // --- TOKEN-BASED RECONNECTION ---

  handleReconnect(ws, meta, data = {}) {
    let room = null;
    if (data.roomId) {
      room = this.rooms.get(String(data.roomId).trim().toLowerCase());
    }
    const token = data.playerToken || data.token;
    if (!room && token) {
      for (const r of this.rooms.values()) {
        if (r.whiteToken === token || r.blackToken === token) {
          room = r;
          break;
        }
      }
    }

    if (!room) {
      this.send(ws, CHESS_MSG.ERROR, { message: 'Partida no encontrada o ya finalizada.' });
      return;
    }

    const isWhite = room.whiteToken && room.whiteToken === token;
    const isBlack = room.blackToken && room.blackToken === token;

    if (!isWhite && !isBlack) {
      this.send(ws, CHESS_MSG.ERROR, { message: 'Token de sesión inválido.' });
      return;
    }

    // Cancel forfeit / abandonment countdown
    if (room.disconnectTimer) {
      clearTimeout(room.disconnectTimer);
      room.disconnectTimer = null;
    }

    // Re-bind active socket
    if (isWhite) {
      room.whiteWs = ws;
    } else {
      room.blackWs = ws;
    }

    meta.roomId = room.id;
    meta.isSpectating = false;
    meta.name = isWhite ? room.whiteName : room.blackName;
    this.socketMeta.set(ws, meta);

    const wTime = Math.max(0, Math.round(room.whiteTime * 10) / 10);
    const bTime = Math.max(0, Math.round(room.blackTime * 10) / 10);

    // Dispatch authoritative state recovery
    this.send(ws, CHESS_MSG.RECONNECT_SUCCESS, {
      roomId: room.id,
      yourColor: isWhite ? 'w' : 'b',
      color: isWhite ? 'w' : 'b',
      playerToken: token,
      fen: room.engine.getFen(),
      turn: room.engine.turn,
      whiteTime: wTime,
      blackTime: bTime,
      clocks: { w: wTime, b: bTime },
      increment: room.increment,
      history: room.engine.history,
      isGameOver: room.isGameOver,
      white: { id: room.whiteMeta?.id, name: room.whiteName },
      black: { id: room.blackMeta?.id, name: room.blackName },
      whitePlayer: { id: room.whiteMeta?.id, name: room.whiteName },
      blackPlayer: { id: room.blackMeta?.id, name: room.blackName }
    });

    // Notify opponent of reconnection
    const oppWs = isWhite ? room.blackWs : room.whiteWs;
    if (oppWs && oppWs.readyState === 1) {
      this.send(oppWs, CHESS_MSG.OPPONENT_RECONNECTED, {
        color: isWhite ? 'w' : 'b',
        name: isWhite ? room.whiteName : room.blackName
      });
    }
  }

  // --- GAME ACTIONS & MOVES ---

  handleMove(ws, meta, data = {}) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (!room || room.isGameOver || !room.isStarted) return;

    const isWhite = room.whiteWs === ws;
    const isBlack = room.blackWs === ws;
    if (!isWhite && !isBlack) {
      this.send(ws, CHESS_MSG.ERROR, { message: 'Los espectadores no pueden mover piezas.' });
      return;
    }

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

    // Switch active clock timestamps
    room.lastMoveTime = Date.now();
    room.lastTick = Date.now();
    room.lastClockSync = Date.now();

    const status = room.engine.getGameStatus();
    const wTime = Math.max(0, Math.round(room.whiteTime * 10) / 10);
    const bTime = Math.max(0, Math.round(room.blackTime * 10) / 10);

    const movePayload = {
      roomId: room.id,
      move: executed,
      from: executed.from,
      to: executed.to,
      promotion: executed.promotion,
      san: executed.san,
      fen: executed.fenAfter,
      whiteTime: wTime,
      blackTime: bTime,
      clocks: { w: wTime, b: bTime },
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
    const isBlack = room.blackWs === ws;
    if (!isWhite && !isBlack) {
      this.send(ws, CHESS_MSG.ERROR, { message: 'Los espectadores no pueden modificar la partida.' });
      return;
    }

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
    const isBlack = room.blackWs === ws;
    if (!isWhite && !isBlack) {
      this.send(ws, CHESS_MSG.ERROR, { message: 'Los espectadores no pueden modificar la partida.' });
      return;
    }

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
    if (!isWhite && !isBlack) {
      this.send(ws, CHESS_MSG.ERROR, { message: 'Los espectadores no pueden modificar la partida.' });
      return;
    }

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

    const isWhite = room.whiteWs === ws;
    const isBlack = room.blackWs === ws;
    if (!isWhite && !isBlack) {
      this.send(ws, CHESS_MSG.ERROR, { message: 'Los espectadores no pueden solicitar revancha.' });
      return;
    }

    // Cancel 15-minute garbage collection timer on rematch restart
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }

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

    // 15-minute cleanup timer on finished games for garbage collection
    if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
    room.cleanupTimer = setTimeout(() => {
      this.destroyRoom(room.id);
    }, 15 * 60 * 1000);
  }

  destroyRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.pin) {
      this.pinToRoom.delete(String(room.pin));
    }
    room.cleanup();
    this.rooms.delete(roomId);
  }

  // --- SPECTATORS & BROADCASTING ---

  handleSpectateRoom(ws, meta, data = {}) {
    const roomId = data.roomId ? String(data.roomId).trim().toLowerCase() : null;
    if (!roomId) {
      this.send(ws, CHESS_MSG.ERROR, { message: 'ID de sala requerido para observar.' });
      return;
    }
    const room = this.rooms.get(roomId);
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

    const wTime = Math.max(0, Math.round(room.whiteTime * 10) / 10);
    const bTime = Math.max(0, Math.round(room.blackTime * 10) / 10);

    this.send(ws, CHESS_MSG.SPECTATE_STATE, {
      roomId: room.id,
      fen: room.engine.getFen(),
      turn: room.engine.turn,
      white: { id: room.whiteMeta?.id, name: room.whiteName },
      black: { id: room.blackMeta?.id, name: room.blackName },
      whitePlayer: { id: room.whiteMeta?.id, name: room.whiteName },
      blackPlayer: { id: room.blackMeta?.id, name: room.blackName },
      whiteTime: wTime,
      blackTime: bTime,
      clocks: { w: wTime, b: bTime },
      history: room.engine.history,
      spectatorCount: room.spectators.size,
      isGameOver: room.isGameOver
    });

    // Broadcast spectator count update to players & spectators
    this.broadcast(room, CHESS_MSG.SPECTATOR_COUNT_UPDATE, {
      roomId: room.id,
      spectatorCount: room.spectators.size
    });
  }

  handleLeaveSpectate(ws, meta) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (room) {
      room.spectators.delete(ws);
      this.broadcast(room, CHESS_MSG.SPECTATOR_COUNT_UPDATE, {
        roomId: room.id,
        spectatorCount: room.spectators.size
      });
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

  // --- CLOCK TICK & AUTHORITATIVE SYNCHRONIZATION LOOP ---

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
          continue;
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
          continue;
        }
      }

      // Authoritative clock sync broadcast:
      // Broadcast every 5 seconds during active play, and every 1 second when active player's clock < 30s
      const activeTime = room.engine.turn === 'w' ? room.whiteTime : room.blackTime;
      const syncInterval = (activeTime < 30 || room.whiteTime < 30 || room.blackTime < 30) ? 1000 : 5000;
      if (now - (room.lastClockSync || 0) >= syncInterval) {
        room.lastClockSync = now;
        const wTime = Math.max(0, Math.round(room.whiteTime * 10) / 10);
        const bTime = Math.max(0, Math.round(room.blackTime * 10) / 10);
        this.broadcast(room, CHESS_MSG.CLOCK_SYNC, {
          roomId: room.id,
          turn: room.engine.turn,
          whiteTime: wTime,
          blackTime: bTime,
          clocks: { w: wTime, b: bTime }
        });
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
    this.lastClockSync = Date.now();

    this.disconnectTimer = null;
    this.cleanupTimer = null;
    this.whiteToken = null;
    this.blackToken = null;
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
    this.lastClockSync = Date.now();
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
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.spectators.clear();
  }
}

module.exports = {
  ChessRoomManager,
  ChessRoom,
  CHESS_MSG,
  TIME_CONTROLS
};

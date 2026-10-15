// server/protocol.js
// Message types and validation for Voxel Realms

const MSG = {
  // Client -> Server
  JOIN: 'join',
  MOVE: 'move',
  BLOCK_MODIFY: 'block_modify',
  CHAT: 'chat',
  PING: 'ping',

  // Server -> Client
  INIT: 'init',
  PLAYER_JOINED: 'player_joined',
  PLAYER_LEFT: 'player_left',
  PLAYERS_UPDATE: 'players_update',
  BLOCK_UPDATE: 'block_update',
  BLOCK_REJECT: 'block_reject',
  CHAT_BROADCAST: 'chat_broadcast',
  PONG: 'pong',
  ERROR: 'error'
};

const MAX_NAME_LENGTH = 16;
const MAX_CHAT_LENGTH = 120;
const MAX_BLOCK_ID = 32;

/**
 * Sanitize username to prevent HTML injection and excessive length
 */
function sanitizeName(name) {
  if (typeof name !== 'string') return 'Player';
  const clean = name.replace(/[^a-zA-Z0-9_\-]/g, '').trim();
  if (clean.length === 0) return 'Player';
  return clean.substring(0, MAX_NAME_LENGTH);
}

/**
 * Sanitize chat message
 */
function sanitizeChat(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[<>]/g, '')
    .trim()
    .substring(0, MAX_CHAT_LENGTH);
}

/**
 * Validate block modification request
 */
function isValidBlockModify(data) {
  if (!data || typeof data !== 'object') return false;
  const { x, y, z, blockType } = data;
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return false;
  if (y < 0 || y > 128) return false;
  if (Math.abs(x) > 10000 || Math.abs(z) > 10000) return false;
  if (!Number.isInteger(blockType) || blockType < 0 || blockType > MAX_BLOCK_ID) return false;
  return true;
}

/**
 * Validate player move payload
 */
function isValidMove(data) {
  if (!data || typeof data !== 'object') return false;
  const { pos, rot } = data;
  if (!Array.isArray(pos) || pos.length !== 3) return false;
  if (!Array.isArray(rot) || rot.length < 2) return false;
  for (const n of pos) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return false;
  }
  for (const n of rot) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return false;
  }
  return true;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MSG,
    MAX_NAME_LENGTH,
    MAX_CHAT_LENGTH,
    MAX_BLOCK_ID,
    sanitizeName,
    sanitizeChat,
    isValidBlockModify,
    isValidMove
  };
}

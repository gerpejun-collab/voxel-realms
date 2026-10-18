// server/protocol.js
// Message types and validation for Voxel Realms

const MSG = {
  // Client -> Server
  JOIN: 'join',
  MOVE: 'move',
  BLOCK_MODIFY: 'block_modify',
  CHAT: 'chat',
  PING: 'ping',
  TELEPORT_TO_PLAYER: 'teleport_to_player',
  WEAPON_TOGGLE: 'weapon_toggle',
  WEAPON_SHOOT: 'weapon_shoot',
  TNT_TRIGGER: 'tnt_trigger',
  VEHICLE_DRIVE: 'vehicle_drive',
  VEHICLE_ENTER: 'vehicle_enter',
  VEHICLE_EXIT: 'vehicle_exit',
  ADMIN_AUTH: 'admin_auth',
  ADMIN_RESET_SERVER: 'admin_reset_server',
  ADMIN_LAUNCH_MISSILE: 'admin_launch_missile',
  MISSILE_DETONATE: 'missile_detonate',

  // Server -> Client
  INIT: 'init',
  PLAYER_JOINED: 'player_joined',
  PLAYER_LEFT: 'player_left',
  PLAYERS_UPDATE: 'players_update',
  BLOCK_UPDATE: 'block_update',
  BLOCK_REJECT: 'block_reject',
  CHAT_BROADCAST: 'chat_broadcast',
  TELEPORT_CONFIRM: 'teleport_confirm',
  WEAPON_HIT: 'weapon_hit',
  WEAPON_SHOT_FX: 'weapon_shot_fx',
  TNT_PRIMED: 'tnt_primed',
  TNT_EXPLODE: 'tnt_explode',
  MISSILE_SPAWN: 'missile_spawn',
  MISSILE_IMPACT: 'missile_impact',
  ANIMALS_UPDATE: 'animals_update',
  ANIMAL_BURST: 'animal_burst',
  ADMIN_STATE: 'admin_state',
  SERVER_RESET: 'server_reset',
  PONG: 'pong',
  ERROR: 'error'
};

const MAX_NAME_LENGTH = 16;
const MAX_CHAT_LENGTH = 160;
const MAX_BLOCK_ID = 32;
const MAX_PLAYER_ID_LENGTH = 64;

const ADMIN_EMAIL = 'jsieiragerpe@gmail.com';

/**
 * Checks whether email/identifier and key match the stealth admin credentials
 */
function isValidAdminCredentials(identifier, key) {
  if (typeof identifier !== 'string' || typeof key !== 'string') return false;
  const normEmail = identifier.trim().toLowerCase();
  if (normEmail !== ADMIN_EMAIL) return false;
  const normKey = key.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return normKey === 'ARGON4';
}

/**
 * Sanitize username to prevent HTML injection and excessive length
 */
function sanitizeName(name) {
  if (typeof name !== 'string') return 'Player';
  if (name.trim().toLowerCase() === ADMIN_EMAIL) {
    return 'jsieiragerpe';
  }
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
    .substring(0, 120);
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

/**
 * Validate teleport packet
 */
function validateTeleportPacket(packet) {
  if (!packet || typeof packet !== 'object') return false;
  const { targetPlayerId } = packet;
  if (typeof targetPlayerId !== 'string') return false;
  const clean = targetPlayerId.trim();
  if (clean.length === 0 || clean.length > MAX_PLAYER_ID_LENGTH) return false;
  if (!/^[a-zA-Z0-9_\-]+$/.test(clean)) return false;
  return true;
}

/**
 * Validate weapon shoot packet
 */
function isValidWeaponShoot(data) {
  if (!data || typeof data !== 'object') return false;
  const validWeapons = ['rifle', 'shotgun', 'sniper', 'tnt'];
  if (data.weaponType && !validWeapons.includes(data.weaponType)) return false;
  if (data.targetPlayerId !== undefined && data.targetPlayerId !== null) {
    if (typeof data.targetPlayerId !== 'string' || data.targetPlayerId.length > MAX_PLAYER_ID_LENGTH) return false;
  }
  if (data.targetAnimalId !== undefined && data.targetAnimalId !== null) {
    if (typeof data.targetAnimalId !== 'string' || data.targetAnimalId.length > 64) return false;
  }
  return true;
}

/**
 * Validate TNT trigger packet
 */
function isValidTntTrigger(data) {
  if (!data || typeof data !== 'object') return false;
  const { x, y, z, radius } = data;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return false;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
  if (y < 0 || y > 128 || Math.abs(x) > 10000 || Math.abs(z) > 10000) return false;
  if (radius !== undefined && radius !== null) {
    if (typeof radius !== 'number' || !Number.isFinite(radius) || radius < 1 || radius > 50) return false;
  }
  return true;
}

/**
 * Validate vehicle drive packet
 */
function isValidVehicleDrive(data) {
  if (!data || typeof data !== 'object') return false;
  const { vehicleId, x, y, z, yaw } = data;
  if (typeof vehicleId !== 'string' || vehicleId.length === 0 || vehicleId.length > MAX_PLAYER_ID_LENGTH) return false;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number' || typeof yaw !== 'number') return false;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(yaw)) return false;
  return true;
}

function isValidMissileLaunch(data) {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.targetPlayerId !== 'string' || data.targetPlayerId.length === 0 || data.targetPlayerId.length > MAX_PLAYER_ID_LENGTH) return false;
  return true;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MSG,
    MAX_NAME_LENGTH,
    MAX_CHAT_LENGTH,
    MAX_BLOCK_ID,
    MAX_PLAYER_ID_LENGTH,
    sanitizeName,
    sanitizeChat,
    isValidBlockModify,
    isValidMove,
    validateTeleportPacket,
    isValidWeaponShoot,
    isValidTntTrigger,
    isValidVehicleDrive,
    isValidMissileLaunch,
    ADMIN_EMAIL,
    isValidAdminCredentials
  };
}


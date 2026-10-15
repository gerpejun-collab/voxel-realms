// public/src/blocks.js
// Voxel block definitions, properties, and metadata

export const BLOCKS = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  DIRT_DRY: 3,
  STONE: 4,
  COBBLESTONE: 5,
  OAK_LOG: 6,
  OAK_LEAVES: 7,
  WOOD_PLANK: 8,
  SAND: 9,
  GRAVEL: 10,
  WATER: 11,
  SNOW: 12,
  ICE: 13,
  BRICK: 14,
  CLAY: 15,
  GLASS: 16,
  IRON_ORE: 17,
  GOLD_ORE: 18
};

// Texture slot indices within our procedural atlas
export const ATLAS_SLOTS = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  DIRT_DRY: 3,
  STONE: 4,
  COBBLESTONE: 5,
  OAK_LOG_SIDE: 6,
  OAK_LOG_TOP: 7,
  OAK_LEAVES: 8,
  WOOD_PLANK: 9,
  SAND: 10,
  GRAVEL: 11,
  WATER: 12,
  SNOW: 13,
  ICE: 14,
  BRICK: 15,
  CLAY: 16,
  GLASS: 17,
  IRON_ORE: 18,
  GOLD_ORE: 19
};

/**
 * Block specification:
 * name: Display name in Spanish
 * solid: Can collide with player
 * transparent: Light passes through / hidden faces not culled if transparent
 * faces: [top, bottom, left(-x), right(+x), front(+z), back(-z)] slot indices
 * sound: Audio type category
 */
export const BLOCK_DEFS = {
  [BLOCKS.AIR]: {
    id: BLOCKS.AIR,
    name: 'Aire',
    solid: false,
    transparent: true,
    faces: null
  },
  [BLOCKS.GRASS]: {
    id: BLOCKS.GRASS,
    name: 'Césped Exuberante',
    solid: true,
    transparent: false,
    // [Y+, Y-, X-, X+, Z+, Z-]
    faces: [
      ATLAS_SLOTS.GRASS_TOP,
      ATLAS_SLOTS.DIRT,
      ATLAS_SLOTS.GRASS_SIDE,
      ATLAS_SLOTS.GRASS_SIDE,
      ATLAS_SLOTS.GRASS_SIDE,
      ATLAS_SLOTS.GRASS_SIDE
    ]
  },
  [BLOCKS.DIRT]: {
    id: BLOCKS.DIRT,
    name: 'Tierra Fértil',
    solid: true,
    transparent: false,
    faces: [
      ATLAS_SLOTS.DIRT,
      ATLAS_SLOTS.DIRT,
      ATLAS_SLOTS.DIRT,
      ATLAS_SLOTS.DIRT,
      ATLAS_SLOTS.DIRT,
      ATLAS_SLOTS.DIRT
    ]
  },
  [BLOCKS.DIRT_DRY]: {
    id: BLOCKS.DIRT_DRY,
    name: 'Tierra Seca',
    solid: true,
    transparent: false,
    faces: [
      ATLAS_SLOTS.DIRT_DRY,
      ATLAS_SLOTS.DIRT_DRY,
      ATLAS_SLOTS.DIRT_DRY,
      ATLAS_SLOTS.DIRT_DRY,
      ATLAS_SLOTS.DIRT_DRY,
      ATLAS_SLOTS.DIRT_DRY
    ]
  },
  [BLOCKS.STONE]: {
    id: BLOCKS.STONE,
    name: 'Granito Rocoso',
    solid: true,
    transparent: false,
    faces: [
      ATLAS_SLOTS.STONE,
      ATLAS_SLOTS.STONE,
      ATLAS_SLOTS.STONE,
      ATLAS_SLOTS.STONE,
      ATLAS_SLOTS.STONE,
      ATLAS_SLOTS.STONE
    ]
  },
  [BLOCKS.COBBLESTONE]: {
    id: BLOCKS.COBBLESTONE,
    name: 'Piedra Labrada',
    solid: true,
    transparent: false,
    faces: [
      ATLAS_SLOTS.COBBLESTONE,
      ATLAS_SLOTS.COBBLESTONE,
      ATLAS_SLOTS.COBBLESTONE,
      ATLAS_SLOTS.COBBLESTONE,
      ATLAS_SLOTS.COBBLESTONE,
      ATLAS_SLOTS.COBBLESTONE
    ]
  },
  [BLOCKS.OAK_LOG]: {
    id: BLOCKS.OAK_LOG,
    name: 'Tronco de Roble',
    solid: true,
    transparent: false,
    faces: [
      ATLAS_SLOTS.OAK_LOG_TOP,
      ATLAS_SLOTS.OAK_LOG_TOP,
      ATLAS_SLOTS.OAK_LOG_SIDE,
      ATLAS_SLOTS.OAK_LOG_SIDE,
      ATLAS_SLOTS.OAK_LOG_SIDE,
      ATLAS_SLOTS.OAK_LOG_SIDE
    ]
  },
  [BLOCKS.OAK_LEAVES]: {
    id: BLOCKS.OAK_LEAVES,
    name: 'Follaje de Roble',
    solid: true,
    transparent: true,
    faces: [
      ATLAS_SLOTS.OAK_LEAVES,
      ATLAS_SLOTS.OAK_LEAVES,
      ATLAS_SLOTS.OAK_LEAVES,
      ATLAS_SLOTS.OAK_LEAVES,
      ATLAS_SLOTS.OAK_LEAVES,
      ATLAS_SLOTS.OAK_LEAVES
    ]
  },
  [BLOCKS.WOOD_PLANK]: {
    id: BLOCKS.WOOD_PLANK,
    name: 'Tablones de Roble',
    solid: true,
    transparent: false,
    faces: [
      ATLAS_SLOTS.WOOD_PLANK,
      ATLAS_SLOTS.WOOD_PLANK,
      ATLAS_SLOTS.WOOD_PLANK,
      ATLAS_SLOTS.WOOD_PLANK,
      ATLAS_SLOTS.WOOD_PLANK,
      ATLAS_SLOTS.WOOD_PLANK
    ]
  },
  [BLOCKS.SAND]: {
    id: BLOCKS.SAND,
    name: 'Arena Dorada',
    solid: true,
    transparent: false,
    faces: [
      ATLAS_SLOTS.SAND,
      ATLAS_SLOTS.SAND,
      ATLAS_SLOTS.SAND,
      ATLAS_SLOTS.SAND,
      ATLAS_SLOTS.SAND,
      ATLAS_SLOTS.SAND
    ]
  },
  [BLOCKS.GRAVEL]: {
    id: BLOCKS.GRAVEL,
    name: 'Grava y Guijarros',
    solid: true,
    transparent: false,
    faces: [
      ATLAS_SLOTS.GRAVEL,
      ATLAS_SLOTS.GRAVEL,
      ATLAS_SLOTS.GRAVEL,
      ATLAS_SLOTS.GRAVEL,
      ATLAS_SLOTS.GRAVEL,
      ATLAS_SLOTS.GRAVEL
    ]
  },
  [BLOCKS.WATER]: {
    id: BLOCKS.WATER,
    name: 'Agua Cristalina',
    solid: false,
    transparent: true,
    isFluid: true,
    faces: [
      ATLAS_SLOTS.WATER,
      ATLAS_SLOTS.WATER,
      ATLAS_SLOTS.WATER,
      ATLAS_SLOTS.WATER,
      ATLAS_SLOTS.WATER,
      ATLAS_SLOTS.WATER
    ]
  },
  [BLOCKS.SNOW]: {
    id: BLOCKS.SNOW,
    name: 'Nieve Pura',
    solid: true,
    transparent: false,
    faces: [
      ATLAS_SLOTS.SNOW,
      ATLAS_SLOTS.SNOW,
      ATLAS_SLOTS.SNOW,
      ATLAS_SLOTS.SNOW,
      ATLAS_SLOTS.SNOW,
      ATLAS_SLOTS.SNOW
    ]
  },
  [BLOCKS.ICE]: {
    id: BLOCKS.ICE,
    name: 'Hielo Glaciar',
    solid: true,
    transparent: true,
    faces: [
      ATLAS_SLOTS.ICE,
      ATLAS_SLOTS.ICE,
      ATLAS_SLOTS.ICE,
      ATLAS_SLOTS.ICE,
      ATLAS_SLOTS.ICE,
      ATLAS_SLOTS.ICE
    ]
  },
  [BLOCKS.BRICK]: {
    id: BLOCKS.BRICK,
    name: 'Ladrillos Rojos',
    solid: true,
    transparent: false,
    faces: [
      ATLAS_SLOTS.BRICK,
      ATLAS_SLOTS.BRICK,
      ATLAS_SLOTS.BRICK,
      ATLAS_SLOTS.BRICK,
      ATLAS_SLOTS.BRICK,
      ATLAS_SLOTS.BRICK
    ]
  },
  [BLOCKS.CLAY]: {
    id: BLOCKS.CLAY,
    name: 'Arcilla Mineral',
    solid: true,
    transparent: false,
    faces: [
      ATLAS_SLOTS.CLAY,
      ATLAS_SLOTS.CLAY,
      ATLAS_SLOTS.CLAY,
      ATLAS_SLOTS.CLAY,
      ATLAS_SLOTS.CLAY,
      ATLAS_SLOTS.CLAY
    ]
  },
  [BLOCKS.GLASS]: {
    id: BLOCKS.GLASS,
    name: 'Cristal Refinado',
    solid: true,
    transparent: true,
    faces: [
      ATLAS_SLOTS.GLASS,
      ATLAS_SLOTS.GLASS,
      ATLAS_SLOTS.GLASS,
      ATLAS_SLOTS.GLASS,
      ATLAS_SLOTS.GLASS,
      ATLAS_SLOTS.GLASS
    ]
  },
  [BLOCKS.IRON_ORE]: {
    id: BLOCKS.IRON_ORE,
    name: 'Veta de Hierro',
    solid: true,
    transparent: false,
    faces: [
      ATLAS_SLOTS.IRON_ORE,
      ATLAS_SLOTS.IRON_ORE,
      ATLAS_SLOTS.IRON_ORE,
      ATLAS_SLOTS.IRON_ORE,
      ATLAS_SLOTS.IRON_ORE,
      ATLAS_SLOTS.IRON_ORE
    ]
  },
  [BLOCKS.GOLD_ORE]: {
    id: BLOCKS.GOLD_ORE,
    name: 'Veta de Oro',
    solid: true,
    transparent: false,
    faces: [
      ATLAS_SLOTS.GOLD_ORE,
      ATLAS_SLOTS.GOLD_ORE,
      ATLAS_SLOTS.GOLD_ORE,
      ATLAS_SLOTS.GOLD_ORE,
      ATLAS_SLOTS.GOLD_ORE,
      ATLAS_SLOTS.GOLD_ORE
    ]
  }
};

/**
 * Ordered list of hotbar blocks available for quick placement
 */
export const HOTBAR_BLOCKS = [
  BLOCKS.GRASS,
  BLOCKS.DIRT,
  BLOCKS.STONE,
  BLOCKS.COBBLESTONE,
  BLOCKS.WOOD_PLANK,
  BLOCKS.OAK_LOG,
  BLOCKS.OAK_LEAVES,
  BLOCKS.BRICK,
  BLOCKS.GLASS
];

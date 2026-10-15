// public/src/textures.js
// Hyperrealistic Procedural PBR Texture & Normal Map Generator
import * as THREE from 'three';
import { ATLAS_SLOTS } from './blocks.js';

// Procedural 2D Simplex Noise implementation
class SimplexNoise {
  constructor(seed = 1337) {
    this.p = new Uint8Array(256);
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 256; i++) this.p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = this.p[i];
      this.p[i] = this.p[j];
      this.p[j] = t;
    }
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = this.p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  noise2D(xin, yin) {
    const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
    const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;

    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    const ii = i & 255;
    const jj = j & 255;

    const gi0 = this.permMod12[ii + this.perm[jj]];
    const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]];
    const gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]];

    const grad3 = [
      [1, 1], [-1, 1], [1, -1], [-1, -1],
      [1, 0], [-1, 0], [1, 0], [-1, 0],
      [0, 1], [0, -1], [0, 1], [0, -1]
    ];

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    let n0 = 0;
    if (t0 > 0) {
      t0 *= t0;
      const g = grad3[gi0];
      n0 = t0 * t0 * (g[0] * x0 + g[1] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    let n1 = 0;
    if (t1 > 0) {
      t1 *= t1;
      const g = grad3[gi1];
      n1 = t1 * t1 * (g[0] * x1 + g[1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    let n2 = 0;
    if (t2 > 0) {
      t2 *= t2;
      const g = grad3[gi2];
      n2 = t2 * t2 * (g[0] * x2 + g[1] * y2);
    }

    return 70.0 * (n0 + n1 + n2);
  }

  fbm(x, y, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    return total / maxValue;
  }
}

export const noise = new SimplexNoise(481516);

/**
 * Creates an offscreen canvas
 */
function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Generate Normal Map from grayscale heightmap canvas using 3x3 Sobel filter
 */
function generateNormalMap(srcCanvas, strength = 2.5) {
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const srcCtx = srcCanvas.getContext('2d');
  const srcData = srcCtx.getImageData(0, 0, w, h).data;

  const normalCanvas = createCanvas(w, h);
  const normalCtx = normalCanvas.getContext('2d');
  const normalImg = normalCtx.createImageData(w, h);
  const dst = normalImg.data;

  const getH = (x, y) => {
    const px = ((x + w) % w);
    const py = ((y + h) % h);
    const idx = (py * w + px) * 4;
    // Luminance height
    return (srcData[idx] * 0.299 + srcData[idx + 1] * 0.587 + srcData[idx + 2] * 0.114) / 255.0;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Sobel gradient
      const tl = getH(x - 1, y - 1);
      const t  = getH(x, y - 1);
      const tr = getH(x + 1, y - 1);
      const l  = getH(x - 1, y);
      const r  = getH(x + 1, y);
      const bl = getH(x - 1, y + 1);
      const b  = getH(x, y + 1);
      const br = getH(x + 1, y + 1);

      const dx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
      const dy = (bl + 2.0 * b + br) - (tl + 2.0 * t + tr);
      const dz = 1.0 / strength;

      // Normalize vector (-dx, -dy, dz)
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const nx = -dx / len;
      const ny = -dy / len;
      const nz = dz / len;

      const idx = (y * w + x) * 4;
      dst[idx]     = Math.floor((nx * 0.5 + 0.5) * 255);
      dst[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
      dst[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
      dst[idx + 3] = 255;
    }
  }

  normalCtx.putImageData(normalImg, 0, 0);
  return normalCanvas;
}

/**
 * Generate Roughness map based on height/texture details
 */
function generateRoughnessMap(srcCanvas, baseRoughness = 0.8, variation = 0.2) {
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const srcCtx = srcCanvas.getContext('2d');
  const srcData = srcCtx.getImageData(0, 0, w, h).data;

  const roughCanvas = createCanvas(w, h);
  const roughCtx = roughCanvas.getContext('2d');
  const roughImg = roughCtx.createImageData(w, h);
  const dst = roughImg.data;

  for (let i = 0; i < srcData.length; i += 4) {
    const lum = (srcData[i] + srcData[i + 1] + srcData[i + 2]) / (3 * 255);
    const r = Math.min(1.0, Math.max(0.0, baseRoughness + (lum - 0.5) * variation));
    const val = Math.floor(r * 255);
    dst[i] = val;
    dst[i + 1] = val;
    dst[i + 2] = val;
    dst[i + 3] = 255;
  }
  roughCtx.putImageData(roughImg, 0, 0);
  return roughCanvas;
}

// Tile resolution for high visual fidelity
const TILE_RES = 256;

/**
 * Procedural texture generators for each slot
 */
const TextureGenerators = {
  [ATLAS_SLOTS.GRASS_TOP]: (w, h) => {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n1 = noise.fbm(x / 32, y / 32, 4);
        const n2 = noise.noise2D(x / 4, y / 4);
        const blade = Math.sin(x * 1.5 + n2 * 4) * 0.15;

        // Rich natural green palette: olive, lush meadow, deep forest green
        const baseG = 135 + Math.floor(n1 * 40 + blade * 30);
        const baseR = Math.floor(baseG * 0.45);
        const baseB = Math.floor(baseG * 0.2);

        const idx = (y * w + x) * 4;
        d[idx] = Math.min(255, Math.max(0, baseR));
        d[idx + 1] = Math.min(255, Math.max(0, baseG));
        d[idx + 2] = Math.min(255, Math.max(0, baseB));
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  },

  [ATLAS_SLOTS.GRASS_SIDE]: (w, h) => {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n1 = noise.fbm(x / 24, y / 24, 4);
        const dirtR = 95 + Math.floor(n1 * 30);
        const dirtG = 65 + Math.floor(n1 * 20);
        const dirtB = 45 + Math.floor(n1 * 15);

        // Hanging organic grass edge at the top
        const grassReach = 0.22 + noise.fbm(x / 16, 0.5, 3) * 0.12;
        const normY = y / h;

        let r, g, b;
        if (normY < grassReach) {
          const gn = noise.fbm(x / 30, y / 30, 3);
          g = 130 + Math.floor(gn * 35);
          r = Math.floor(g * 0.45);
          b = Math.floor(g * 0.2);
        } else {
          r = dirtR;
          g = dirtG;
          b = dirtB;
        }

        const idx = (y * w + x) * 4;
        d[idx] = Math.min(255, Math.max(0, r));
        d[idx + 1] = Math.min(255, Math.max(0, g));
        d[idx + 2] = Math.min(255, Math.max(0, b));
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  },

  [ATLAS_SLOTS.DIRT]: (w, h) => {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = noise.fbm(x / 20, y / 20, 5, 0.55);
        const pebble = Math.abs(noise.noise2D(x / 6, y / 6)) > 0.6 ? 25 : 0;

        const r = 90 + Math.floor(n * 35) + pebble;
        const g = 60 + Math.floor(n * 24) + pebble;
        const b = 40 + Math.floor(n * 16) + pebble;

        const idx = (y * w + x) * 4;
        d[idx] = Math.min(255, Math.max(0, r));
        d[idx + 1] = Math.min(255, Math.max(0, g));
        d[idx + 2] = Math.min(255, Math.max(0, b));
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  },

  [ATLAS_SLOTS.DIRT_DRY]: (w, h) => {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = noise.fbm(x / 28, y / 28, 4);
        // Cracked earth fissures
        const crack = Math.min(1.0, Math.pow(Math.abs(noise.noise2D(x / 14, y / 14)), 3) * 3);
        const r = Math.floor((125 + n * 30) * (1 - crack * 0.45));
        const g = Math.floor((105 + n * 25) * (1 - crack * 0.45));
        const b = Math.floor((80 + n * 20) * (1 - crack * 0.45));

        const idx = (y * w + x) * 4;
        d[idx] = Math.min(255, Math.max(0, r));
        d[idx + 1] = Math.min(255, Math.max(0, g));
        d[idx + 2] = Math.min(255, Math.max(0, b));
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  },

  [ATLAS_SLOTS.STONE]: (w, h) => {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Granite/basalt layers with fine quartz specks
        const n1 = noise.fbm(x / 32, y / 32, 5);
        const n2 = noise.fbm(x / 8, y / 8, 3);
        const speck = Math.abs(noise.noise2D(x / 3, y / 3)) > 0.65 ? 30 : 0;

        const base = 120 + Math.floor(n1 * 40 + n2 * 15) + speck;
        const idx = (y * w + x) * 4;
        d[idx] = Math.min(255, Math.max(0, base));
        d[idx + 1] = Math.min(255, Math.max(0, base - 2));
        d[idx + 2] = Math.min(255, Math.max(0, base + 2));
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  },

  [ATLAS_SLOTS.COBBLESTONE]: (w, h) => {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Voronoi/cellular mortar grid
        const cellX = (x % 64) - 32;
        const cellY = (y % 64) - 32;
        const dist = Math.sqrt(cellX * cellX + cellY * cellY) / 32.0;
        const mortar = Math.min(1.0, Math.max(0, (dist - 0.75) * 5.0));

        const n = noise.fbm(x / 16, y / 16, 4);
        const stoneVal = 130 + Math.floor(n * 35);
        const mortarVal = 70 + Math.floor(n * 15);

        const val = Math.floor(stoneVal * (1 - mortar) + mortarVal * mortar);
        const idx = (y * w + x) * 4;
        d[idx] = Math.min(255, Math.max(0, val));
        d[idx + 1] = Math.min(255, Math.max(0, val - 3));
        d[idx + 2] = Math.min(255, Math.max(0, val - 2));
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  },

  [ATLAS_SLOTS.OAK_LOG_SIDE]: (w, h) => {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Vertical bark grooves
        const barkNoise = noise.noise2D(x / 8, y / 64);
        const ridge = Math.cos((x / 12 + barkNoise * 1.5) * Math.PI * 2);
        const n = noise.fbm(x / 16, y / 32, 4);

        const darkGroove = ridge < -0.4 ? 0.6 : 1.0;
        const r = Math.floor((90 + n * 30 + ridge * 25) * darkGroove);
        const g = Math.floor((65 + n * 20 + ridge * 18) * darkGroove);
        const b = Math.floor((40 + n * 15 + ridge * 10) * darkGroove);

        const idx = (y * w + x) * 4;
        d[idx] = Math.min(255, Math.max(0, r));
        d[idx + 1] = Math.min(255, Math.max(0, g));
        d[idx + 2] = Math.min(255, Math.max(0, b));
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  },

  [ATLAS_SLOTS.OAK_LOG_TOP]: (w, h) => {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;

    const cx = w / 2;
    const cy = h / 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const normDist = dist / (w * 0.48);

        const ring = Math.sin(dist * 0.45 + noise.noise2D(x / 16, y / 16) * 3) * 15;
        const n = noise.fbm(x / 20, y / 20, 3);

        let r, g, b;
        if (normDist > 0.88) {
          // Outer bark ring
          r = 75 + Math.floor(n * 20);
          g = 50 + Math.floor(n * 15);
          b = 30 + Math.floor(n * 10);
        } else {
          // Heartwood rings
          r = 175 + Math.floor(ring + n * 20);
          g = 135 + Math.floor(ring * 0.8 + n * 15);
          b = 90 + Math.floor(ring * 0.5 + n * 10);
        }

        const idx = (y * w + x) * 4;
        d[idx] = Math.min(255, Math.max(0, r));
        d[idx + 1] = Math.min(255, Math.max(0, g));
        d[idx + 2] = Math.min(255, Math.max(0, b));
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  },

  [ATLAS_SLOTS.OAK_LEAVES]: (w, h) => {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = noise.fbm(x / 12, y / 12, 4);
        const leafPattern = Math.sin(x * 0.8) * Math.cos(y * 0.8) + n * 1.2;

        const isLeaf = leafPattern > -0.2;
        const idx = (y * w + x) * 4;

        if (isLeaf) {
          const g = 120 + Math.floor(n * 45);
          d[idx] = Math.floor(g * 0.35);
          d[idx + 1] = g;
          d[idx + 2] = Math.floor(g * 0.15);
          d[idx + 3] = 255;
        } else {
          // Transparent gaps between leaf clusters
          d[idx] = 0;
          d[idx + 1] = 0;
          d[idx + 2] = 0;
          d[idx + 3] = 0;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  },

  [ATLAS_SLOTS.WOOD_PLANK]: (w, h) => {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;

    const plankHeight = h / 4;
    for (let y = 0; y < h; y++) {
      const plankIdx = Math.floor(y / plankHeight);
      const isSeam = (y % plankHeight === 0) || (y % plankHeight === 1);

      for (let x = 0; x < w; x++) {
        const fiber = noise.fbm(x / 48, y / 6 + plankIdx * 10, 4);
        let r = 168 + Math.floor(fiber * 30);
        let g = 120 + Math.floor(fiber * 22);
        let b = 75 + Math.floor(fiber * 15);

        if (isSeam) {
          r = Math.floor(r * 0.45);
          g = Math.floor(g * 0.45);
          b = Math.floor(b * 0.45);
        }

        const idx = (y * w + x) * 4;
        d[idx] = Math.min(255, Math.max(0, r));
        d[idx + 1] = Math.min(255, Math.max(0, g));
        d[idx + 2] = Math.min(255, Math.max(0, b));
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  },

  [ATLAS_SLOTS.SAND]: (w, h) => {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Wind ripples + tiny sand granules
        const ripple = Math.sin(x * 0.15 + y * 0.05 + noise.noise2D(x / 20, y / 20) * 2) * 12;
        const grain = noise.fbm(x / 4, y / 4, 3) * 18;

        const r = 215 + Math.floor(ripple + grain);
        const g = 190 + Math.floor(ripple * 0.85 + grain * 0.85);
        const b = 135 + Math.floor(ripple * 0.65 + grain * 0.65);

        const idx = (y * w + x) * 4;
        d[idx] = Math.min(255, Math.max(0, r));
        d[idx + 1] = Math.min(255, Math.max(0, g));
        d[idx + 2] = Math.min(255, Math.max(0, b));
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  },

  [ATLAS_SLOTS.GRAVEL]: (w, h) => {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = noise.fbm(x / 10, y / 10, 4);
        const pebble = Math.floor(Math.abs(noise.noise2D(x / 7, y / 7)) * 45);

        const val = 115 + Math.floor(n * 35) + pebble;
        const idx = (y * w + x) * 4;
        d[idx] = Math.min(255, Math.max(0, val + 5));
        d[idx + 1] = Math.min(255, Math.max(0, val));
        d[idx + 2] = Math.min(255, Math.max(0, val - 4));
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  },

  [ATLAS_SLOTS.WATER]: (w, h) => {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const wave = Math.sin(x * 0.1) * Math.cos(y * 0.1) * 20;
        const n = noise.fbm(x / 16, y / 16, 3) * 25;

        const idx = (y * w + x) * 4;
        d[idx] = 25 + Math.floor(wave * 0.2);
        d[idx + 1] = 115 + Math.floor(wave + n);
        d[idx + 2] = 205 + Math.floor(wave * 0.5);
        d[idx + 3] = 190; // semi-transparent
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  },

  [ATLAS_SLOTS.SNOW]: (w, h) => {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = noise.fbm(x / 16, y / 16, 3);
        const sparkle = Math.abs(noise.noise2D(x / 2, y / 2)) > 0.8 ? 15 : 0;

        const val = 238 + Math.floor(n * 15) + sparkle;
        const idx = (y * w + x) * 4;
        d[idx] = Math.min(255, val - 5);
        d[idx + 1] = Math.min(255, val);
        d[idx + 2] = Math.min(255, val + 2);
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  },

  [ATLAS_SLOTS.ICE]: (w, h) => {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const crack = Math.abs(noise.noise2D(x / 20, y / 20)) < 0.05 ? 50 : 0;
        const n = noise.fbm(x / 24, y / 24, 3);

        const idx = (y * w + x) * 4;
        d[idx] = 140 + Math.floor(n * 20) + crack;
        d[idx + 1] = 185 + Math.floor(n * 25) + crack;
        d[idx + 2] = 225 + Math.floor(n * 25);
        d[idx + 3] = 210;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  },

  [ATLAS_SLOTS.BRICK]: (w, h) => {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;

    const rowH = h / 8;
    for (let y = 0; y < h; y++) {
      const row = Math.floor(y / rowH);
      const isHorizMortar = (y % rowH < 2);
      const xOffset = (row % 2 === 1) ? (w / 8) : 0;

      for (let x = 0; x < w; x++) {
        const isVertMortar = ((x + xOffset) % (w / 4) < 2);
        const isMortar = isHorizMortar || isVertMortar;

        const n = noise.fbm(x / 12, y / 12, 3);
        let r, g, b;
        if (isMortar) {
          r = 180 + Math.floor(n * 20);
          g = 175 + Math.floor(n * 20);
          b = 165 + Math.floor(n * 20);
        } else {
          r = 165 + Math.floor(n * 35);
          g = 65 + Math.floor(n * 20);
          b = 45 + Math.floor(n * 15);
        }

        const idx = (y * w + x) * 4;
        d[idx] = Math.min(255, Math.max(0, r));
        d[idx + 1] = Math.min(255, Math.max(0, g));
        d[idx + 2] = Math.min(255, Math.max(0, b));
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  },

  [ATLAS_SLOTS.CLAY]: (w, h) => {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = noise.fbm(x / 24, y / 24, 4);
        const r = 155 + Math.floor(n * 25);
        const g = 145 + Math.floor(n * 25);
        const b = 150 + Math.floor(n * 25);

        const idx = (y * w + x) * 4;
        d[idx] = r;
        d[idx + 1] = g;
        d[idx + 2] = b;
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  },

  [ATLAS_SLOTS.GLASS]: (w, h) => {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;

    for (let y = 0; y < h; y++) {
      const isEdge = (x) => (x <= 3 || x >= w - 4 || y <= 3 || y >= h - 4);
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        if (isEdge(x)) {
          // Bevel border
          d[idx] = 220;
          d[idx + 1] = 240;
          d[idx + 2] = 255;
          d[idx + 3] = 220;
        } else {
          // Faint reflective streak
          const streak = Math.abs((x - y) - 40) < 6 ? 60 : 0;
          d[idx] = 190 + streak;
          d[idx + 1] = 220 + streak;
          d[idx + 2] = 245 + streak;
          d[idx + 3] = 30 + streak;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  },

  [ATLAS_SLOTS.IRON_ORE]: (w, h) => {
    const canvas = TextureGenerators[ATLAS_SLOTS.STONE](w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;

    // Metallic rust-iron spots
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const cluster = noise.noise2D(x / 14, y / 14) + noise.fbm(x / 6, y / 6, 2) * 0.5;
        if (cluster > 0.6) {
          const idx = (y * w + x) * 4;
          d[idx] = 190;
          d[idx + 1] = 145;
          d[idx + 2] = 120;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  },

  [ATLAS_SLOTS.GOLD_ORE]: (w, h) => {
    const canvas = TextureGenerators[ATLAS_SLOTS.STONE](w, h);
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;

    // Gleaming gold nugget flecks
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nugget = noise.noise2D((x + 50) / 12, (y + 50) / 12) + noise.fbm(x / 5, y / 5, 2) * 0.5;
        if (nugget > 0.65) {
          const idx = (y * w + x) * 4;
          d[idx] = 245;
          d[idx + 1] = 195;
          d[idx + 2] = 45;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }
};

/**
 * Texture Atlas Manager
 * Packs all textures into an 8x4 grid (2048x1024)
 */
export class TextureAtlasManager {
  constructor() {
    this.cols = 8;
    this.rows = 4;
    this.tileRes = TILE_RES;
    this.atlasWidth = this.cols * this.tileRes;
    this.atlasHeight = this.rows * this.tileRes;

    this.diffuseCanvas = createCanvas(this.atlasWidth, this.atlasHeight);
    this.normalCanvas = createCanvas(this.atlasWidth, this.atlasHeight);
    this.roughnessCanvas = createCanvas(this.atlasWidth, this.atlasHeight);

    this.diffuseTexture = null;
    this.normalTexture = null;
    this.roughnessTexture = null;

    this.tileCanvases = new Map(); // slot -> tileCanvas
    this.build();
  }

  build() {
    const diffCtx = this.diffuseCanvas.getContext('2d');
    const normCtx = this.normalCanvas.getContext('2d');
    const roughCtx = this.roughnessCanvas.getContext('2d');

    const totalSlots = Object.keys(TextureGenerators).length;

    for (const [slotStr, generator] of Object.entries(TextureGenerators)) {
      const slot = Number(slotStr);
      const tileCanvas = generator(this.tileRes, this.tileRes);
      this.tileCanvases.set(slot, tileCanvas);

      // Derive normal map
      const normalStrength = (slot === ATLAS_SLOTS.WATER || slot === ATLAS_SLOTS.GLASS) ? 1.2 : 2.8;
      const normalTile = generateNormalMap(tileCanvas, normalStrength);

      // Derive roughness map
      let baseRough = 0.8;
      if (slot === ATLAS_SLOTS.GLASS) baseRough = 0.1;
      else if (slot === ATLAS_SLOTS.ICE) baseRough = 0.2;
      else if (slot === ATLAS_SLOTS.WATER) baseRough = 0.1;
      else if (slot === ATLAS_SLOTS.GOLD_ORE || slot === ATLAS_SLOTS.IRON_ORE) baseRough = 0.45;
      else if (slot === ATLAS_SLOTS.WOOD_PLANK) baseRough = 0.65;
      const roughTile = generateRoughnessMap(tileCanvas, baseRough, 0.25);

      // Calculate atlas grid coordinates
      const col = slot % this.cols;
      const row = Math.floor(slot / this.cols);
      const px = col * this.tileRes;
      const py = row * this.tileRes;

      diffCtx.drawImage(tileCanvas, px, py);
      normCtx.drawImage(normalTile, px, py);
      roughCtx.drawImage(roughTile, px, py);
    }

    // Create Three.js textures
    this.diffuseTexture = new THREE.CanvasTexture(this.diffuseCanvas);
    this.diffuseTexture.magFilter = THREE.LinearFilter;
    this.diffuseTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.diffuseTexture.colorSpace = THREE.SRGBColorSpace;
    this.diffuseTexture.generateMipmaps = true;

    this.normalTexture = new THREE.CanvasTexture(this.normalCanvas);
    this.normalTexture.magFilter = THREE.LinearFilter;
    this.normalTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.normalTexture.generateMipmaps = true;

    this.roughnessTexture = new THREE.CanvasTexture(this.roughnessCanvas);
    this.roughnessTexture.magFilter = THREE.LinearFilter;
    this.roughnessTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.roughnessTexture.generateMipmaps = true;
  }

  /**
   * Returns UV coordinates [u0, v0, u1, v1] for a slot index.
   * Three.js UV origin is bottom-left (V=0 is bottom, V=1 is top).
   */
  getUV(slot) {
    const col = slot % this.cols;
    const row = Math.floor(slot / this.cols);

    const u0 = col / this.cols;
    const u1 = (col + 1) / this.cols;

    // Invert V because canvas Y=0 is top
    const v1 = 1.0 - (row / this.rows);
    const v0 = 1.0 - ((row + 1) / this.rows);

    return [u0, v0, u1, v1];
  }

  getTileDataURL(slot) {
    const tile = this.tileCanvases.get(slot);
    return tile ? tile.toDataURL() : '';
  }
}

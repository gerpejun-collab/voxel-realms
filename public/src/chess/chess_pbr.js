/**
 * Grandmaster Chess - Procedural PBR Texture & Environment Generator
 * 
 * Generates 100% algorithmic procedural textures in memory using offscreen HTML5 Canvas:
 * - Dark Walnut wood: Growth rings, directional micro-grain streaks, Sobel normal bump map, clearcoat gloss
 * - Light Maple wood: Curly flame chatoyancy, satin finish
 * - Carrara Marble: Multi-octave fBm turbulent veining, smoky grey & amber veins over white, diamond clearcoat
 * - Black Marquina Marble: Sharp calcite fractures over deep obsidian, diamond clearcoat
 * - Studio Equirectangular HDR Environment Canvas for PMREM IBL reflections
 * - Beveled board frame algebraic coordinates (files a-h, ranks 1-8)
 * - Radial contact shadow alpha map
 * 
 * Zero external downloaded assets.
 */

import * as THREE_MODULE from 'three';

const THREE = typeof window !== 'undefined' && window.THREE ? window.THREE : THREE_MODULE;

/**
 * High-performance 2D Simplex Noise with fractional Brownian motion (fBm)
 */
export class SimplexNoise {
    constructor(seed = 481516) {
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

    turbulence(x, y, octaves = 4) {
        let total = 0;
        let frequency = 1;
        let amplitude = 1;
        let maxValue = 0;
        for (let i = 0; i < octaves; i++) {
            total += Math.abs(this.noise2D(x * frequency, y * frequency)) * amplitude;
            maxValue += amplitude;
            amplitude *= 0.5;
            frequency *= 2.0;
        }
        return total / maxValue;
    }
}

/**
 * Procedural PBR Texture & Material Generator
 */
export class ProceduralPBRGenerator {
    static noise = new SimplexNoise(773301);

    /**
     * Create an offscreen HTML5 canvas or mock in headless Node
     */
    static createCanvas(width, height) {
        if (typeof document !== 'undefined' && document.createElement) {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            return canvas;
        }
        // Minimal fallback for Node.js environments
        return {
            width,
            height,
            getContext: () => ({
                createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
                getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
                putImageData: () => {},
                fillRect: () => {},
                fillText: () => {},
                beginPath: () => {},
                arc: () => {},
                fill: () => {},
                createRadialGradient: () => ({ addColorStop: () => {} }),
                measureText: () => ({ width: 10 })
            })
        };
    }

    /**
     * Applies standard mipmapping, filtering and anisotropy to a CanvasTexture
     */
    static configureTexture(texture, renderer = null) {
        if (!texture) return texture;
        texture.generateMipmaps = true;
        if (THREE.LinearMipmapLinearFilter) texture.minFilter = THREE.LinearMipmapLinearFilter;
        if (THREE.LinearFilter) texture.magFilter = THREE.LinearFilter;
        if (renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy) {
            texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
        } else {
            texture.anisotropy = 4;
        }
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * Computes a 3x3 Sobel gradient normal map from grayscale height data
     */
    static generateSobelNormalMap(heightMap, width, height, strength = 2.5) {
        const normalCanvas = this.createCanvas(width, height);
        const ctx = normalCanvas.getContext('2d');
        const img = ctx.createImageData(width, height);
        const dst = img.data;

        const getH = (x, y) => {
            const px = (x + width) % width;
            const py = (y + height) % height;
            return heightMap[py * width + px];
        };

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // Sobel kernels
                const tl = getH(x - 1, y - 1);
                const t  = getH(x,     y - 1);
                const tr = getH(x + 1, y - 1);
                const l  = getH(x - 1, y);
                const r  = getH(x + 1, y);
                const bl = getH(x - 1, y + 1);
                const b  = getH(x,     y + 1);
                const br = getH(x + 1, y + 1);

                const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
                const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);

                // Normal vector [-dx * strength, -dy * strength, 1.0]
                let nx = -dx * strength;
                let ny = -dy * strength;
                let nz = 1.0;

                const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
                nx /= len;
                ny /= len;
                nz /= len;

                const idx = (y * width + x) * 4;
                dst[idx]     = Math.floor((nx * 0.5 + 0.5) * 255);
                dst[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
                dst[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
                dst[idx + 3] = 255;
            }
        }

        ctx.putImageData(img, 0, 0);
        return normalCanvas;
    }

    /**
     * Spec 54, 55, 56: Procedural Dark Walnut Wood PBR Textures (512x512)
     * Concentric growth rings, directional micro-grain streaks, Sobel normal map, roughness map
     */
    static generateWalnutTextures(width = 512, height = 512, renderer = null) {
        const albedoCanvas = this.createCanvas(width, height);
        const roughnessCanvas = this.createCanvas(width, height);
        const albedoCtx = albedoCanvas.getContext('2d');
        const roughCtx = roughnessCanvas.getContext('2d');

        const albedoImg = albedoCtx.createImageData(width, height);
        const roughImg = roughCtx.createImageData(width, height);
        const aData = albedoImg.data;
        const rData = roughImg.data;

        const heightMap = new Float32Array(width * height);
        const noise = this.noise;

        // Dark Walnut Palette: #3b2314 to #24140b with golden pore flecks
        const cBaseR = 59, cBaseG = 35, cBaseB = 20;
        const cDarkR = 36, cDarkG = 20, cDarkB = 11;
        const cRingR = 26, cRingG = 14, cRingB = 8;

        const x0 = width * 0.45;
        const y0 = height * 0.52;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const hIdx = y * width + x;

                // 1. Concentric annual growth rings modulated by noise
                const dx = (x - x0);
                const dy = (y - y0);
                const dist = Math.sqrt(dx * dx * 0.12 + dy * dy * 1.8);
                const ringPerturb = noise.fbm(x * 0.04, y * 0.04, 3) * 7.5;
                const ringVal = 0.5 + 0.5 * Math.sin(dist + ringPerturb);

                // 2. High-frequency directional micro-grain streaks (stretched along Y)
                const streak = 0.5 + 0.5 * noise.noise2D(x * 0.18, y * 0.015);
                const poreNoise = 0.5 + 0.5 * noise.noise2D(x * 0.35, y * 0.08);

                // 3. Composite tone modulation
                const t = ringVal * 0.65 + streak * 0.25 + poreNoise * 0.10;
                heightMap[hIdx] = t;

                // Color interpolation
                let r, g, b;
                if (ringVal < 0.4) {
                    const k = ringVal / 0.4;
                    r = cRingR + (cDarkR - cRingR) * k;
                    g = cRingG + (cDarkG - cRingG) * k;
                    b = cRingB + (cDarkB - cRingB) * k;
                } else {
                    const k = (ringVal - 0.4) / 0.6;
                    r = cDarkR + (cBaseR - cDarkR) * k;
                    g = cDarkG + (cBaseG - cDarkG) * k;
                    b = cDarkB + (cBaseB - cDarkB) * k;
                }

                // Apply micro-streak modulation
                const streakMod = 0.88 + streak * 0.24;
                r = Math.min(255, Math.floor(r * streakMod));
                g = Math.min(255, Math.floor(g * streakMod));
                b = Math.min(255, Math.floor(b * streakMod));

                aData[idx]     = r;
                aData[idx + 1] = g;
                aData[idx + 2] = b;
                aData[idx + 3] = 255;

                // Roughness: 0.24 (polished early-wood) to 0.38 (open late-wood pores)
                const roughVal = Math.floor((0.24 + (1.0 - ringVal) * 0.14) * 255);
                rData[idx]     = roughVal;
                rData[idx + 1] = roughVal;
                rData[idx + 2] = roughVal;
                rData[idx + 3] = 255;
            }
        }

        albedoCtx.putImageData(albedoImg, 0, 0);
        roughCtx.putImageData(roughImg, 0, 0);

        const normalCanvas = this.generateSobelNormalMap(heightMap, width, height, 3.2);

        const map = this.configureTexture(new THREE.CanvasTexture(albedoCanvas), renderer);
        const normalMap = this.configureTexture(new THREE.CanvasTexture(normalCanvas), renderer);
        const roughnessMap = this.configureTexture(new THREE.CanvasTexture(roughnessCanvas), renderer);

        return { map, normalMap, roughnessMap, albedoCanvas, normalCanvas, roughnessCanvas };
    }

    /**
     * Spec 57, 58: Procedural Light Maple Wood PBR Textures (512x512)
     * Curly flame chatoyancy, satin finish, golden sycamore luster
     */
    static generateMapleTextures(width = 512, height = 512, renderer = null) {
        const albedoCanvas = this.createCanvas(width, height);
        const roughnessCanvas = this.createCanvas(width, height);
        const albedoCtx = albedoCanvas.getContext('2d');
        const roughCtx = roughnessCanvas.getContext('2d');

        const albedoImg = albedoCtx.createImageData(width, height);
        const roughImg = roughCtx.createImageData(width, height);
        const aData = albedoImg.data;
        const rData = roughImg.data;

        const heightMap = new Float32Array(width * height);
        const noise = this.noise;

        // Maple Palette: #faebd7 (ivory cream) to #f3dbb3 (golden warm sycamore)
        const cLightR = 250, cLightG = 235, cLightB = 215;
        const cWarmR  = 243, cWarmG  = 219, cWarmB  = 179;
        const cFlameR = 224, cFlameG = 196, cFlameB = 152;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const hIdx = y * width + x;

                // 1. Curly flame chatoyancy wave figure
                const flame = 0.5 + 0.5 * Math.sin(y * 0.08 + Math.cos(x * 0.06) * 3.0);
                // 2. Soft longitudinal grain
                const grain = 0.5 + 0.5 * noise.noise2D(x * 0.12, y * 0.012);
                // 3. Subtle bird's-eye pore speckle
                const speckle = 0.5 + 0.5 * noise.noise2D(x * 0.28, y * 0.28);

                const t = flame * 0.55 + grain * 0.35 + speckle * 0.10;
                heightMap[hIdx] = t;

                // Color blending
                let r, g, b;
                if (flame > 0.5) {
                    const k = (flame - 0.5) * 2.0;
                    r = cWarmR + (cFlameR - cWarmR) * k;
                    g = cWarmG + (cFlameG - cWarmG) * k;
                    b = cWarmB + (cFlameB - cWarmB) * k;
                } else {
                    const k = flame * 2.0;
                    r = cLightR + (cWarmR - cLightR) * k;
                    g = cLightG + (cWarmG - cLightG) * k;
                    b = cLightB + (cWarmB - cLightB) * k;
                }

                // Grain shading
                const grainMod = 0.94 + grain * 0.12;
                r = Math.min(255, Math.floor(r * grainMod));
                g = Math.min(255, Math.floor(g * grainMod));
                b = Math.min(255, Math.floor(b * grainMod));

                aData[idx]     = r;
                aData[idx + 1] = g;
                aData[idx + 2] = b;
                aData[idx + 3] = 255;

                // Satin finish roughness: ~0.28 uniform with subtle grain highlight
                const roughVal = Math.floor((0.26 + (1.0 - t) * 0.05) * 255);
                rData[idx]     = roughVal;
                rData[idx + 1] = roughVal;
                rData[idx + 2] = roughVal;
                rData[idx + 3] = 255;
            }
        }

        albedoCtx.putImageData(albedoImg, 0, 0);
        roughCtx.putImageData(roughImg, 0, 0);

        const normalCanvas = this.generateSobelNormalMap(heightMap, width, height, 1.8);

        const map = this.configureTexture(new THREE.CanvasTexture(albedoCanvas), renderer);
        const normalMap = this.configureTexture(new THREE.CanvasTexture(normalCanvas), renderer);
        const roughnessMap = this.configureTexture(new THREE.CanvasTexture(roughnessCanvas), renderer);

        return { map, normalMap, roughnessMap, albedoCanvas, normalCanvas, roughnessCanvas };
    }

    /**
     * Spec 59, 61: Procedural White Carrara Marble PBR Textures (512x512)
     * Multi-octave fBm turbulent veining, diamond clearcoat
     */
    static generateCarraraTextures(width = 512, height = 512, renderer = null) {
        const albedoCanvas = this.createCanvas(width, height);
        const roughnessCanvas = this.createCanvas(width, height);
        const albedoCtx = albedoCanvas.getContext('2d');
        const roughCtx = roughnessCanvas.getContext('2d');

        const albedoImg = albedoCtx.createImageData(width, height);
        const roughImg = roughCtx.createImageData(width, height);
        const aData = albedoImg.data;
        const rData = roughImg.data;

        const heightMap = new Float32Array(width * height);
        const noise = this.noise;

        // Base: #f8f9fa with smoky grey (#71717a) and delicate golden amber (#b45309) veins
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const hIdx = y * width + x;

                // Multi-octave fBm turbulent veining
                const f = noise.fbm(x * 0.015, y * 0.015, 5, 0.55, 2.2);
                const vein = Math.abs(Math.sin(x * 0.03 + 3.8 * f));

                heightMap[hIdx] = vein;

                // Base white
                let r = 248, g = 249, b = 250;

                // Smoke veining
                if (vein < 0.35) {
                    const k = 1.0 - (vein / 0.35);
                    const greyR = 113, greyG = 113, greyB = 122;
                    r = Math.floor(r * (1 - k * 0.55) + greyR * (k * 0.55));
                    g = Math.floor(g * (1 - k * 0.55) + greyG * (k * 0.55));
                    b = Math.floor(b * (1 - k * 0.55) + greyB * (k * 0.55));

                    // Golden calcite rim
                    if (vein > 0.20) {
                        const goldK = (vein - 0.20) / 0.15;
                        r = Math.min(255, r + Math.floor(20 * goldK));
                        g = Math.min(255, g + Math.floor(12 * goldK));
                    }
                }

                aData[idx]     = r;
                aData[idx + 1] = g;
                aData[idx + 2] = b;
                aData[idx + 3] = 255;

                // Mirror diamond polish: roughness 0.10
                rData[idx]     = 26;
                rData[idx + 1] = 26;
                rData[idx + 2] = 26;
                rData[idx + 3] = 255;
            }
        }

        albedoCtx.putImageData(albedoImg, 0, 0);
        roughCtx.putImageData(roughImg, 0, 0);

        const normalCanvas = this.generateSobelNormalMap(heightMap, width, height, 1.2);

        const map = this.configureTexture(new THREE.CanvasTexture(albedoCanvas), renderer);
        const normalMap = this.configureTexture(new THREE.CanvasTexture(normalCanvas), renderer);
        const roughnessMap = this.configureTexture(new THREE.CanvasTexture(roughnessCanvas), renderer);

        return { map, normalMap, roughnessMap, albedoCanvas, normalCanvas, roughnessCanvas };
    }

    /**
     * Spec 60, 61: Procedural Black Marquina Marble PBR Textures (512x512)
     * Obsidian black with sharp calcite fractures
     */
    static generateMarquinaTextures(width = 512, height = 512, renderer = null) {
        const albedoCanvas = this.createCanvas(width, height);
        const roughnessCanvas = this.createCanvas(width, height);
        const albedoCtx = albedoCanvas.getContext('2d');
        const roughCtx = roughnessCanvas.getContext('2d');

        const albedoImg = albedoCtx.createImageData(width, height);
        const roughImg = roughCtx.createImageData(width, height);
        const aData = albedoImg.data;
        const rData = roughImg.data;

        const heightMap = new Float32Array(width * height);
        const noise = this.noise;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const hIdx = y * width + x;

                // Sharp calcite fractures
                const f = noise.fbm(x * 0.02, y * 0.02, 6, 0.6, 2.4);
                const vein = Math.abs(Math.sin((x + y) * 0.025 + 4.2 * f));

                heightMap[hIdx] = vein;

                // Obsidian base: #18181b
                let r = 24, g = 24, b = 27;

                // White calcite lightning fracture
                if (vein < 0.12) {
                    const k = Math.pow(1.0 - (vein / 0.12), 2.5);
                    r = Math.min(255, Math.floor(r + 225 * k));
                    g = Math.min(255, Math.floor(g + 225 * k));
                    b = Math.min(255, Math.floor(b + 230 * k));
                }

                aData[idx]     = r;
                aData[idx + 1] = g;
                aData[idx + 2] = b;
                aData[idx + 3] = 255;

                // Diamond polish roughness: 0.10
                rData[idx]     = 26;
                rData[idx + 1] = 26;
                rData[idx + 2] = 26;
                rData[idx + 3] = 255;
            }
        }

        albedoCtx.putImageData(albedoImg, 0, 0);
        roughCtx.putImageData(roughImg, 0, 0);

        const normalCanvas = this.generateSobelNormalMap(heightMap, width, height, 1.5);

        const map = this.configureTexture(new THREE.CanvasTexture(albedoCanvas), renderer);
        const normalMap = this.configureTexture(new THREE.CanvasTexture(normalCanvas), renderer);
        const roughnessMap = this.configureTexture(new THREE.CanvasTexture(roughnessCanvas), renderer);

        return { map, normalMap, roughnessMap, albedoCanvas, normalCanvas, roughnessCanvas };
    }

    /**
     * Spec 68: Procedural Radial Contact Shadow Alpha Gradient Texture
     */
    static generateContactShadowTexture(size = 512, renderer = null) {
        const canvas = this.createCanvas(size, size);
        const ctx = canvas.getContext('2d');
        const half = size / 2;

        if (ctx.createRadialGradient) {
            const grad = ctx.createRadialGradient(half, half, half * 0.25, half, half, half * 0.98);
            grad.addColorStop(0.0, 'rgba(0, 0, 0, 0.75)');
            grad.addColorStop(0.45, 'rgba(0, 0, 0, 0.50)');
            grad.addColorStop(0.80, 'rgba(0, 0, 0, 0.18)');
            grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, size, size);
        }

        const texture = new THREE.CanvasTexture(canvas);
        return this.configureTexture(texture, renderer);
    }

    /**
     * Spec 64, 65: Procedural Coordinate Strip Textures (Files a-h or Ranks 1-8)
     * Engraved with gold deboss styling on wooden frame borders
     */
    static generateCoordinatesStrip(chars, isHorizontal = true, width = 1024, height = 64, renderer = null) {
        const canvas = this.createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        if (ctx.clearRect) {
            ctx.clearRect(0, 0, width, height);

            const n = chars.length;
            const step = width / n;

            ctx.font = 'bold 28px Cinzel, "Times New Roman", serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            for (let i = 0; i < n; i++) {
                const char = chars[i];
                const x = isHorizontal ? (i + 0.5) * step : width * 0.5;
                const y = isHorizontal ? height * 0.5 : (i + 0.5) * (height / n);

                // Debossed drop shadow
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.fillText(char, x + 1, y + 2);

                // Royal gold debossed text
                ctx.fillStyle = '#d4af37';
                ctx.fillText(char, x, y);

                // Subtle highlight
                ctx.fillStyle = 'rgba(255, 248, 220, 0.45)';
                ctx.fillText(char, x - 0.5, y - 0.5);
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        return this.configureTexture(texture, renderer);
    }

    /**
     * Spec 87: Equirectangular Studio HDR Environment Canvas (1024x512)
     * Generates a 3-point softbox studio environment with:
     * - Key lightbox (intensity 3.5, 3200K warm) at azimuth 45°, elevation 60°
     * - Cool diffuse skylight (intensity 1.2, 6500K)
     * - Neutral dark studio floor reflection below the horizon
     */
    static generateStudioEquirectangularCanvas(width = 1024, height = 512) {
        const canvas = this.createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(width, height);
        const data = img.data;

        for (let y = 0; y < height; y++) {
            const v = y / height; // 0 = zenith (top), 0.5 = horizon, 1 = nadir (bottom)
            const elevation = (0.5 - v) * Math.PI; // +PI/2 to -PI/2

            for (let x = 0; x < width; x++) {
                const u = x / width; // 0 to 1
                const azimuth = (u - 0.5) * 2.0 * Math.PI; // -PI to +PI

                const idx = (y * width + x) * 4;

                let r = 16, g = 18, b = 24; // Ambient dark studio room

                if (elevation > 0) {
                    // Sky gradient: subtle cool daylight at top
                    const skyFactor = Math.sin(elevation);
                    r += Math.floor(30 * skyFactor);
                    g += Math.floor(45 * skyFactor);
                    b += Math.floor(65 * skyFactor);

                    // Key Softbox Light: Azimuth ~ 45 deg (PI/4), Elevation ~ 60 deg (PI/3)
                    const keyAz = Math.PI * 0.25;
                    const keyEl = Math.PI * 0.33;
                    const dAz = azimuth - keyAz;
                    const dEl = elevation - keyEl;
                    const keyDist = Math.sqrt(dAz * dAz + dEl * dEl);

                    if (keyDist < 0.45) {
                        const intensity = Math.pow(1.0 - (keyDist / 0.45), 2.0) * 3.5;
                        r += Math.floor(255 * Math.min(1.0, intensity));
                        g += Math.floor(235 * Math.min(1.0, intensity));
                        b += Math.floor(200 * Math.min(1.0, intensity));
                    }

                    // Fill Softbox Light: Azimuth ~ -135 deg (-3PI/4), Elevation ~ 40 deg
                    const fillAz = -Math.PI * 0.75;
                    const fillEl = Math.PI * 0.22;
                    const dFillAz = azimuth - fillAz;
                    const dFillEl = elevation - fillEl;
                    const fillDist = Math.sqrt(dFillAz * dFillAz + dFillEl * dFillEl);

                    if (fillDist < 0.55) {
                        const intensity = Math.pow(1.0 - (fillDist / 0.55), 2.0) * 1.4;
                        r += Math.floor(160 * Math.min(1.0, intensity));
                        g += Math.floor(190 * Math.min(1.0, intensity));
                        b += Math.floor(240 * Math.min(1.0, intensity));
                    }
                } else {
                    // Floor reflection: dark slate floor with soft gradient
                    const floorFactor = Math.sin(-elevation);
                    r = Math.floor(r * (1.0 - floorFactor * 0.4));
                    g = Math.floor(g * (1.0 - floorFactor * 0.4));
                    b = Math.floor(b * (1.0 - floorFactor * 0.4));
                }

                data[idx]     = Math.min(255, r);
                data[idx + 1] = Math.min(255, g);
                data[idx + 2] = Math.min(255, b);
                data[idx + 3] = 255;
            }
        }

        ctx.putImageData(img, 0, 0);
        return canvas;
    }

    /**
     * Complete PBR Material Set for Wood Board
     */
    static createWoodBoardMaterials(renderer = null) {
        const walnut = this.generateWalnutTextures(512, 512, renderer);
        const maple = this.generateMapleTextures(512, 512, renderer);

        const darkSquare = new THREE.MeshStandardMaterial({
            map: walnut.map,
            normalMap: walnut.normalMap,
            normalScale: new THREE.Vector2(0.35, 0.35),
            roughnessMap: walnut.roughnessMap,
            roughness: 0.32,
            metalness: 0.04
        });

        const lightSquare = new THREE.MeshStandardMaterial({
            map: maple.map,
            normalMap: maple.normalMap,
            normalScale: new THREE.Vector2(0.25, 0.25),
            roughnessMap: maple.roughnessMap,
            roughness: 0.28,
            metalness: 0.02
        });

        const frame = new THREE.MeshStandardMaterial({
            map: walnut.map,
            normalMap: walnut.normalMap,
            normalScale: new THREE.Vector2(0.5, 0.5),
            roughness: 0.28,
            metalness: 0.06
        });

        const brassInlay = new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            roughness: 0.20,
            metalness: 0.88
        });

        return { darkSquare, lightSquare, frame, brassInlay, walnut, maple };
    }

    /**
     * Complete PBR Material Set for Marble Board
     */
    static createMarbleBoardMaterials(renderer = null) {
        const marquina = this.generateMarquinaTextures(512, 512, renderer);
        const carrara = this.generateCarraraTextures(512, 512, renderer);

        const darkSquare = new THREE.MeshPhysicalMaterial ? new THREE.MeshPhysicalMaterial({
            map: marquina.map,
            normalMap: marquina.normalMap,
            normalScale: new THREE.Vector2(0.2, 0.2),
            roughnessMap: marquina.roughnessMap,
            roughness: 0.10,
            metalness: 0.02,
            clearcoat: 0.85,
            clearcoatRoughness: 0.08
        }) : new THREE.MeshStandardMaterial({
            map: marquina.map,
            normalMap: marquina.normalMap,
            roughness: 0.10,
            metalness: 0.02
        });

        const lightSquare = new THREE.MeshPhysicalMaterial ? new THREE.MeshPhysicalMaterial({
            map: carrara.map,
            normalMap: carrara.normalMap,
            normalScale: new THREE.Vector2(0.2, 0.2),
            roughnessMap: carrara.roughnessMap,
            roughness: 0.10,
            metalness: 0.02,
            clearcoat: 0.85,
            clearcoatRoughness: 0.08
        }) : new THREE.MeshStandardMaterial({
            map: carrara.map,
            normalMap: carrara.normalMap,
            roughness: 0.10,
            metalness: 0.02
        });

        const frame = darkSquare.clone();

        const brassInlay = new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            roughness: 0.18,
            metalness: 0.90
        });

        return { darkSquare, lightSquare, frame, brassInlay, marquina, carrara };
    }
}

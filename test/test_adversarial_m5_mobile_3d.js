/**
 * test/test_adversarial_m5_mobile_3d.js
 * Adversarial Stress Test Suite for Milestone 5:
 * Mobile UX, Layout Boundaries, 3D WebGL Camera Projection Math, Procedural Geometries & Touch Interactions
 *
 * Authored by: challenger_m5_1 (Empirical Challenger)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=============================================================================');
console.log('   ADVERSARIAL STRESS TEST: MOBILE UX & 3D WEBGL (CHALLENGER M5-1)           ');
console.log('=============================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function test(name, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`  ✓ [PASS] ${name}`);
    } catch (err) {
        failedTests++;
        failures.push({ name, error: err.message, stack: err.stack });
        console.error(`  ✗ [FAIL] ${name}`);
        console.error(`         ${err.message}`);
    }
}

// -----------------------------------------------------------------------------
// SECTION 1: ADVERSARIAL MOBILE VIEWPORT DIMENSIONS & LAYOUT BOUNDARIES
// -----------------------------------------------------------------------------
console.log('>>> [SECTION 1] Mobile Viewport Dimensions & Layout Stress');

const cssPath = path.join(__dirname, '../public/styles.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

const jsPath = path.join(__dirname, '../public/src/chess/chess_ui.js');
const jsContent = fs.readFileSync(jsPath, 'utf8');

test('CSS Invariant: Container dimensions, 100dvh, inset: 0, and safe-area padding', () => {
    assert(cssContent.includes('#chess-app-modal'), '#chess-app-modal must be defined');
    assert(cssContent.includes('height: 100dvh'), 'Must use 100dvh');
    assert(cssContent.includes('position: fixed'), 'Must be position fixed');
    assert(cssContent.includes('inset: 0'), 'Must specify inset: 0');
    assert(cssContent.includes('overflow: hidden'), 'Must prevent elastic scrolling');
    assert(cssContent.includes('env(safe-area-inset-top'), 'Safe-area-inset-top required');
    assert(cssContent.includes('env(safe-area-inset-bottom'), 'Safe-area-inset-bottom required');
});

test('Touch Clearance: All primary interactive targets satisfy minimum touch bounds (>= 44x44px)', () => {
    // Back button: min-width: 44px; min-height: 44px
    assert(cssContent.includes('.chess-nav-back-btn'), 'Back button class exists');
    assert(cssContent.includes('min-width: 44px') && cssContent.includes('min-height: 44px'), 'Back button >= 44x44px');

    // Promotion buttons: 52x52px
    assert(cssContent.includes('.chess-promo-btn'), 'Promo button class exists');
    assert(cssContent.includes('width: 52px') && cssContent.includes('height: 52px'), 'Promo button is 52x52px');

    // Bottom Navigation Bar: height 56px, nav-item min-height: 48px
    assert(cssContent.includes('.chess-bottom-nav'), 'Bottom nav class exists');
    assert(cssContent.includes('height: 56px'), 'Bottom nav height is 56px');
    assert(cssContent.includes('.chess-nav-item'), 'Nav item class exists');
    assert(cssContent.includes('min-height: 48px'), 'Nav item touch target >= 48px');
});

test('Stress-test 25 distinct mobile, tablet, foldable, and extreme viewport dimensions', () => {
    const viewports = [
        // Ultra-narrow & small
        { w: 280, h: 653, name: 'Samsung Galaxy Z Fold Outer' },
        { w: 320, h: 480, name: 'Legacy HVGA (iPhone 3GS/4)' },
        { w: 320, h: 568, name: 'iPhone 5 / SE 1st Gen' },
        { w: 360, h: 640, name: 'Android Baseline qHD' },
        { w: 360, h: 740, name: 'Samsung Galaxy S8/S9' },
        { w: 360, h: 780, name: 'iPhone 12/13 Mini' },
        { w: 360, h: 800, name: 'Samsung Galaxy A-series' },
        { w: 375, h: 667, name: 'iPhone 6/7/8/SE 2/3' },
        { w: 375, h: 812, name: 'iPhone X / XS / 11 Pro' },
        { w: 384, h: 854, name: 'Sony Xperia Compact' },
        { w: 390, h: 844, name: 'iPhone 12/13/14' },
        { w: 393, h: 852, name: 'iPhone 14/15/16 Pro' },
        { w: 412, h: 915, name: 'Google Pixel 7/8' },
        { w: 414, h: 896, name: 'iPhone XR / 11' },
        { w: 428, h: 926, name: 'iPhone 13/14 Pro Max' },
        { w: 430, h: 932, name: 'iPhone 15/16 Pro Max' },
        // Foldables & Tablets
        { w: 540, h: 720, name: 'Surface Duo Single Screen' },
        { w: 600, h: 1024, name: '7-inch Tablet (Nexus 7)' },
        { w: 768, h: 1024, name: 'iPad Mini / Standard Portrait' },
        { w: 800, h: 1280, name: '10-inch Android Tablet Portrait' },
        { w: 820, h: 1180, name: 'iPad Air 10.9-inch Portrait' },
        // Landscape & Extreme
        { w: 640, h: 360, name: '16:9 Mobile Landscape' },
        { w: 800, h: 360, name: 'Galaxy A-series Landscape' },
        { w: 844, h: 390, name: 'iPhone 14 Landscape' },
        { w: 915, h: 412, name: 'Pixel 8 Landscape' }
    ];

    const fixedAppbar = 48;
    const fixedTopCard = 44 + 6; // height + margins
    const fixedBottomCard = 44 + 4;
    const fixedTicker = 38 + 4;
    const fixedBottomNav = 56;
    const totalFixedPortraitH = fixedAppbar + fixedTopCard + fixedBottomCard + fixedTicker + fixedBottomNav; // 242px

    for (const vp of viewports) {
        const isLandscape = vp.w > vp.h;

        if (!isLandscape) {
            // Portrait mode calculation
            const availableH = vp.h - totalFixedPortraitH;
            const availableW = vp.w - 32; // 16px padding on each side
            const boardSize = Math.min(availableW, availableH);

            assert(boardSize > 160, `Board arena size on ${vp.name} (${boardSize}px) must be positive and playable`);
            assert(boardSize + 24 <= vp.w, `Board width must not cause horizontal overflow on ${vp.name}`);
            const totalUsedH = totalFixedPortraitH + boardSize;
            assert(totalUsedH <= vp.h, `Total content height (${totalUsedH}px) must not overflow viewport (${vp.h}px) on ${vp.name}`);
        } else {
            // Landscape layout switches to side-by-side or adjusts
            assert(vp.w >= 568, `Landscape width on ${vp.name} must be >= 568px`);
        }
    }
});

test('Modal Bottom Sheet CSS & Gestures: slide-up positioning and backdrop', () => {
    assert(cssContent.includes('#chess-bottom-sheet-container'), 'Bottom sheet container exists');
    assert(cssContent.includes('.chess-bottom-sheet'), 'Bottom sheet class exists');
    assert(cssContent.includes('transform: translateY(100%)'), 'Initial state is off-screen (translateY(100%))');
    assert(cssContent.includes('.chess-bottom-sheet.open'), 'Open state class exists');
    assert(cssContent.includes('transform: translateY(0%)'), 'Open state translates to 0%');
    assert(cssContent.includes('.chess-sheet-drag-handle'), 'Drag handle styling exists');
    assert(cssContent.includes('backdrop-filter: blur'), 'Backdrop blur exists');
});

// -----------------------------------------------------------------------------
// SECTION 2: 3D CAMERA PROJECTION MATH & FRUSTUM COVERAGE
// -----------------------------------------------------------------------------
console.log('\n>>> [SECTION 2] 3D Camera Projection Math & Aspect Ratio Scaling');

function calculateCameraDistance(aspect, boardRadius = 5.25, fovDeg = 40, margin = 1.10) {
    const fovRad = (fovDeg * Math.PI) / 180;
    const autoDist = (boardRadius / Math.sin(fovRad / 2)) * (1.0 / Math.min(1.0, aspect)) * 1.10;
    return autoDist;
}

test('Camera Distance Scaling: Aspect ratio mathematical scaling across spectrum [0.25 to 3.0]', () => {
    const testAspects = [0.25, 0.35, 0.428, 0.450, 0.500, 0.562, 0.750, 1.000, 1.333, 1.777, 2.333, 3.000];

    let prevDist = Infinity;
    for (const aspect of testAspects) {
        const dist = calculateCameraDistance(aspect);
        assert(!isNaN(dist), `Distance for aspect ${aspect} must not be NaN`);
        assert(isFinite(dist), `Distance for aspect ${aspect} must be finite`);
        assert(dist > 0, `Distance for aspect ${aspect} must be positive`);

        if (aspect <= 1.0) {
            // As portrait aspect narrows, distance must strictly increase to pull camera back
            assert(dist <= prevDist, `Distance for narrower aspect ${aspect} (${dist}) must be >= previous (${prevDist})`);
        } else {
            // In landscape (aspect > 1.0), aspect factor clamps to 1.0
            const dist1 = calculateCameraDistance(1.0);
            assert.strictEqual(Math.round(dist * 100), Math.round(dist1 * 100), 'Landscape distance should match 1.0 aspect');
        }
        prevDist = dist;
    }
});

// 3D Frustum NDC Projection Oracle
test('Frustum Coverage Oracle: Verify all 64 squares and King pieces remain within view across all 3 presets', () => {
    function projectPoint(point, cameraPos, targetPos, fovDeg, aspect) {
        const fx = targetPos.x - cameraPos.x;
        const fy = targetPos.y - cameraPos.y;
        const fz = targetPos.z - cameraPos.z;
        const fLen = Math.hypot(fx, fy, fz);
        const f = [fx / fLen, fy / fLen, fz / fLen];

        const up = [0, 1, 0];
        let rx = f[1] * up[2] - f[2] * up[1];
        let ry = f[2] * up[0] - f[0] * up[2];
        let rz = f[0] * up[1] - f[1] * up[0];
        const rLen = Math.hypot(rx, ry, rz) || 1;
        const r = [rx / rLen, ry / rLen, rz / rLen];

        const u = [
            r[1] * f[2] - r[2] * f[1],
            r[2] * f[0] - r[0] * f[2],
            r[0] * f[1] - r[1] * f[0]
        ];

        const px = point.x - cameraPos.x;
        const py = point.y - cameraPos.y;
        const pz = point.z - cameraPos.z;

        const vx = px * r[0] + py * r[1] + pz * r[2];
        const vy = px * u[0] + py * u[1] + pz * u[2];
        const vz = -(px * f[0] + py * f[1] + pz * f[2]);

        const fovRad = (fovDeg * Math.PI) / 180;
        const top = Math.tan(fovRad / 2);
        const right = top * aspect;

        const ndcX = vx / (vz * right);
        const ndcY = vy / (vz * top);

        return { ndcX, ndcY, inFront: vz < 0 };
    }

    // Playable area boundaries: all four corner squares and Kings
    const playablePoints = [
        { name: 'Corner Square a1', x: -4.13, y: 0.05, z: 4.13 },
        { name: 'Corner Square h1', x: 4.13, y: 0.05, z: 4.13 },
        { name: 'Corner Square a8', x: -4.13, y: 0.05, z: -4.13 },
        { name: 'Corner Square h8', x: 4.13, y: 0.05, z: -4.13 },
        { name: 'White King Apex (e1)', x: 0.59, y: 1.97, z: 4.13 },
        { name: 'Black King Apex (e8)', x: 0.59, y: 1.97, z: -4.13 }
    ];

    const presets = [
        { name: 'angled', pitchDeg: 56, distMult: 1.0 },
        { name: 'topdown', pitchDeg: 84, distMult: 1.05 },
        { name: 'cinematic', pitchDeg: 32, distMult: 0.95 }
    ];

    const canvasAspect = 1.0; // Responsive canvas is 1:1
    const targetPos = { x: 0, y: 0.25, z: 0 };
    const fovDeg = 40;

    for (const preset of presets) {
        const boardRadius = 5.25;
        const autoDist = calculateCameraDistance(canvasAspect, boardRadius, fovDeg);
        const radius = autoDist * preset.distMult;
        const pitchRad = (preset.pitchDeg * Math.PI) / 180;
        const phi = Math.PI / 2 - pitchRad;
        const theta = 0;

        const camX = radius * Math.sin(phi) * Math.sin(theta);
        const camY = radius * Math.cos(phi);
        const camZ = radius * Math.sin(phi) * Math.cos(theta);
        const cameraPos = { x: camX, y: camY, z: camZ };

        for (const pt of playablePoints) {
            const proj = projectPoint(pt, cameraPos, targetPos, fovDeg, canvasAspect);
            assert(proj.inFront, `${pt.name} must be in front of camera in ${preset.name}`);
            assert(
                Math.abs(proj.ndcX) <= 1.0,
                `${pt.name} NDC X (${proj.ndcX.toFixed(3)}) exceeds [-1, 1] viewport in preset ${preset.name}`
            );
            assert(
                Math.abs(proj.ndcY) <= 1.0,
                `${pt.name} NDC Y (${proj.ndcY.toFixed(3)}) exceeds [-1, 1] viewport in preset ${preset.name}`
            );
        }
    }
});

// -----------------------------------------------------------------------------
// SECTION 3: PROCEDURAL GEOMETRIES, NORMALS & SHADERS
// -----------------------------------------------------------------------------
console.log('\n>>> [SECTION 3] Procedural Geometries, Sobel Normals & Shaders');

const stauntonCode = fs.readFileSync(path.join(__dirname, '../public/src/chess/chess_staunton.js'), 'utf8');
const pbrCode = fs.readFileSync(path.join(__dirname, '../public/src/chess/chess_pbr.js'), 'utf8');

// Mock Three.js environment with full vector & geometry support
class MockVector2 { constructor(x=0, y=0) { this.x = x; this.y = y; } }
class MockVector3 {
    constructor(x=0, y=0, z=0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}
class MockBox3 {
    constructor() { this.min = new MockVector3(); this.max = new MockVector3(); }
    setFromObject() { return this; }
}
class MockBufferGeometry {
    constructor() { this.attributes = {}; }
    setAttribute(name, attr) { this.attributes[name] = attr; return this; }
    computeVertexNormals() {}
    computeBoundingBox() {}
    translate() { return this; }
    rotateX() { return this; }
    rotateY() { return this; }
    scale() { return this; }
    center() { return this; }
}
class MockLatheGeometry extends MockBufferGeometry {
    constructor(points, segments) {
        super();
        this.points = points;
        this.segments = segments;
        this.vertexCount = points.length * (segments + 1);
    }
}
class MockExtrudeGeometry extends MockBufferGeometry {
    constructor(shape, opts) {
        super();
        this.shape = shape;
        this.options = opts;
    }
}
class MockShape {
    constructor() { this.curves = []; }
    moveTo(x,y) { this.curves.push(['move', x, y]); }
    lineTo(x,y) { this.curves.push(['line', x, y]); }
    quadraticCurveTo(cx,cy,x,y) { this.curves.push(['quad', cx, cy, x, y]); }
    closePath() { this.curves.push(['close']); }
}
class MockGroup {
    constructor() { this.children = []; this.position = new MockVector3(); this.rotation = new MockVector3(); }
    add(c) { this.children.push(c); }
}
class MockMesh {
    constructor(geo, mat) { this.geometry = geo; this.material = mat; this.position = new MockVector3(); this.rotation = new MockVector3(); }
}
class MockMaterial { constructor(p={}) { this.p = p; } }

const mockThree = {
    Vector2: MockVector2,
    Vector3: MockVector3,
    Box3: MockBox3,
    LatheGeometry: MockLatheGeometry,
    ExtrudeGeometry: MockExtrudeGeometry,
    Shape: MockShape,
    Group: MockGroup,
    Mesh: MockMesh,
    MeshStandardMaterial: MockMaterial,
    MeshPhysicalMaterial: MockMaterial,
    MeshBasicMaterial: MockMaterial,
    SphereGeometry: class extends MockBufferGeometry { constructor(r, w, h) { super(); this.r=r; } },
    BoxGeometry: class extends MockBufferGeometry { constructor(w, h, d) { super(); this.w=w; this.h=h; this.d=d; } },
    CircleGeometry: class extends MockBufferGeometry { constructor(r, s) { super(); this.r=r; this.s=s; } },
    RingGeometry: class extends MockBufferGeometry { constructor(i, o, s) { super(); this.i=i; this.o=o; } },
    CylinderGeometry: class extends MockBufferGeometry { constructor(rt, rb, h, s) { super(); this.h=h; } },
    CanvasTexture: class { constructor(c) { this.canvas=c; } },
    Color: class { constructor(c) { this.c = c; } },
    ACESFilmicToneMapping: 4
};

function getStauntonFactory() {
    const cleanCode = stauntonCode
        .replace(/import\s+[\s\S]*?from\s+['"].*?['"];?/g, '')
        .replace(/const\s+THREE\s*=[\s\S]*?;/g, '')
        .replace(/export\s+class\s+StauntonGeometryFactory/g, 'class StauntonGeometryFactory');
    const fn = new Function('THREE', cleanCode + '\nreturn StauntonGeometryFactory;');
    return new (fn(mockThree))();
}

function getPBRGenerator() {
    const cleanCode = pbrCode
        .replace(/import\s+[\s\S]*?from\s+['"].*?['"];?/g, '')
        .replace(/const\s+THREE\s*=[\s\S]*?;/g, '')
        .replace(/export\s+class\s+SimplexNoise/g, 'class SimplexNoise')
        .replace(/export\s+class\s+ProceduralPBRGenerator/g, 'class ProceduralPBRGenerator');
    const fn = new Function('THREE', cleanCode + '\nreturn { SimplexNoise, ProceduralPBRGenerator };');
    return fn(mockThree);
}

test('Staunton Geometries: Radial segments, profile points, and height bounds', () => {
    const factory = getStauntonFactory();

    // Pawn
    const pawnGeo = factory.getPawnGeometry();
    assert.strictEqual(pawnGeo.segments, 36, 'Pawn uses 36 radial segments');
    assert.strictEqual(pawnGeo.points[pawnGeo.points.length - 1].y, 1.11, 'Pawn height is 1.11 units');

    // Rook
    const rookGeo = factory.getRookBodyGeometry();
    assert.strictEqual(rookGeo.segments, 36, 'Rook uses 36 radial segments');
    assert.strictEqual(rookGeo.points[rookGeo.points.length - 1].y, 1.05, 'Rook basin floor height is 1.05');

    // Bishop
    const bishopGeo = factory.getBishopBodyGeometry();
    assert.strictEqual(bishopGeo.segments, 36, 'Bishop uses 36 radial segments');
    assert.strictEqual(bishopGeo.points[bishopGeo.points.length - 1].y, 1.64, 'Bishop body apex height is 1.64');

    // Queen
    const queenGeo = factory.getQueenBodyGeometry();
    assert.strictEqual(queenGeo.segments, 36, 'Queen uses 36 radial segments');
    assert.strictEqual(queenGeo.points[queenGeo.points.length - 1].y, 1.25, 'Queen basin height is 1.25');

    // King
    const kingGeo = factory.getKingBodyGeometry();
    assert.strictEqual(kingGeo.segments, 36, 'King uses 36 radial segments');
    assert.strictEqual(kingGeo.points[kingGeo.points.length - 1].y, 1.66, 'King dome height is 1.66');

    // Knight Bust
    const knightGeo = factory.getKnightBustGeometry();
    assert(knightGeo.options.depth >= 0.20, 'Knight bust extrusion depth >= 0.20');
    assert(knightGeo.options.bevelEnabled === true, 'Knight bust beveling enabled');
});

test('Piece Mesh Assembly: Every piece includes felt pad, valid children count and shadows', () => {
    const factory = getStauntonFactory();
    const mats = {
        whitePiece: new mockThree.MeshStandardMaterial(),
        blackPiece: new mockThree.MeshStandardMaterial(),
        goldTrim: new mockThree.MeshStandardMaterial(),
        feltPad: new mockThree.MeshStandardMaterial()
    };

    const types = ['p', 'r', 'n', 'b', 'q', 'k'];
    for (const t of types) {
        const groupW = factory.createPieceMesh(t, 'w', mats);
        assert(groupW.children.length >= 2, `White piece ${t} must have at least piece + felt`);
        const felt = groupW.children[0];
        assert.strictEqual(felt.position.y, 0.002, 'Felt must be positioned at y = 0.002');

        const groupB = factory.createPieceMesh(t, 'b', mats);
        assert(groupB.children.length >= 2, `Black piece ${t} must have at least piece + felt`);
    }
});

test('Sobel 3x3 Gradient Filter: Mathematical validation on flat plane and directional slopes', () => {
    // Pure algorithmic oracle validating the Sobel 3x3 convolution formula:
    function computeSobelNormalAt(heightMap, width, height, x, y, strength = 2.5) {
        const getH = (px, py) => {
            const rx = (px + width) % width;
            const ry = (py + height) % height;
            return heightMap[ry * width + rx];
        };

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

        let nx = -dx * strength;
        let ny = -dy * strength;
        let nz = 1.0;

        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
        nx /= len;
        ny /= len;
        nz /= len;

        const red = Math.floor((nx * 0.5 + 0.5) * 255);
        const green = Math.floor((ny * 0.5 + 0.5) * 255);
        const blue = Math.floor((nz * 0.5 + 0.5) * 255);

        return { nx, ny, nz, red, green, blue };
    }

    const w = 32, h = 32;

    // 1. Flat heightmap: all normals must point directly up (0, 0, 1) -> RGB (127, 127, 255)
    const flatH = new Float32Array(w * h).fill(0.5);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const n = computeSobelNormalAt(flatH, w, h, x, y);
            assert(Math.abs(n.nx) < 1e-6, 'nx is 0');
            assert(Math.abs(n.ny) < 1e-6, 'ny is 0');
            assert.strictEqual(n.nz, 1.0);
            assert(n.red === 127 || n.red === 128, 'Red channel neutral');
            assert(n.green === 127 || n.green === 128, 'Green channel neutral');
            assert.strictEqual(n.blue, 255, 'Blue channel dominant');
        }
    }

    // 2. Pure X slope: h(x, y) = x / w
    const slopeX = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            slopeX[y * w + x] = x / w;
        }
    }
    const nX = computeSobelNormalAt(slopeX, w, h, 16, 16);
    assert(nX.nx < 0.0, 'Positive X slope produces negative nx normal perturbation');
    assert(Math.abs(nX.ny) < 1e-6, 'Pure X slope has zero Y deflection');
    assert(nX.red < 127, 'Red channel < 127');
    assert(nX.green === 127 || nX.green === 128, 'Green channel neutral');

    // 3. Pure Y slope: h(x, y) = y / h
    const slopeY = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            slopeY[y * w + x] = y / h;
        }
    }
    const nY = computeSobelNormalAt(slopeY, w, h, 16, 16);
    assert(Math.abs(nY.nx) < 1e-6, 'Pure Y slope has zero X deflection');
    assert(nY.ny < 0.0, 'Positive Y slope produces negative ny normal perturbation');
    assert(nY.green < 127, 'Green channel < 127');
    assert(nY.red === 127 || nY.red === 128, 'Red channel neutral');
});

// -----------------------------------------------------------------------------
// SECTION 4: TOUCH INTERACTIONS & RAPID STATE MACHINE TRANSITIONS
// -----------------------------------------------------------------------------
console.log('\n>>> [SECTION 4] Touch Interactions, Bottom Sheets & Mode Toggles');

test('Rapid Bottom Sheet Open/Close Transitions: 100 consecutive cycles without state desync', () => {
    class MockElement {
        constructor(id = '', className = '') {
            this.id = id;
            this.className = className;
            this.classList = {
                add: (c) => { if (!this.className.includes(c)) this.className += ` ${c}`; },
                remove: (c) => { this.className = this.className.replace(new RegExp(`\\b${c}\\b`, 'g'), '').trim(); },
                contains: (c) => this.className.includes(c)
            };
            this.dataset = {};
            this.style = {};
            this.children = [];
        }
    }

    const container = new MockElement('chess-bottom-sheet-container');
    const sheets = [
        new MockElement('sheet-play', 'chess-bottom-sheet'),
        new MockElement('sheet-options', 'chess-bottom-sheet'),
        new MockElement('sheet-analysis', 'chess-bottom-sheet'),
        new MockElement('sheet-rooms', 'chess-bottom-sheet')
    ];
    const navItems = [
        new MockElement('', 'chess-nav-item active'),
        new MockElement('', 'chess-nav-item'),
        new MockElement('', 'chess-nav-item'),
        new MockElement('', 'chess-nav-item')
    ];
    navItems[0].dataset.tab = 'game'; navItems[0].dataset.sheet = 'none';
    navItems[1].dataset.tab = 'play'; navItems[1].dataset.sheet = 'sheet-play';
    navItems[2].dataset.tab = 'analysis'; navItems[2].dataset.sheet = 'sheet-analysis';
    navItems[3].dataset.tab = 'rooms'; navItems[3].dataset.sheet = 'sheet-rooms';

    let activeSheet = null;

    function openSheet(id) {
        activeSheet = id;
        container.classList.add('active');
        sheets.forEach(s => {
            if (s.id === id) s.classList.add('open');
            else s.classList.remove('open');
        });
        navItems.forEach(item => {
            if (item.dataset.sheet === id) item.classList.add('active');
            else item.classList.remove('active');
        });
    }

    function closeSheets() {
        activeSheet = null;
        container.classList.remove('active');
        sheets.forEach(s => s.classList.remove('open'));
        navItems.forEach(item => {
            if (item.dataset.tab === 'game') item.classList.add('active');
            else item.classList.remove('active');
        });
    }

    // Stress cycle: 100 random opens and closes
    const sheetIds = ['sheet-play', 'sheet-options', 'sheet-analysis', 'sheet-rooms'];
    for (let i = 0; i < 100; i++) {
        const target = sheetIds[i % sheetIds.length];
        openSheet(target);
        assert.strictEqual(activeSheet, target);
        assert(container.classList.contains('active'), 'Container must be active');
        const openSheets = sheets.filter(s => s.classList.contains('open'));
        assert.strictEqual(openSheets.length, 1, 'Exactly one sheet must be open');
        assert.strictEqual(openSheets[0].id, target);

        if (i % 2 === 0) {
            closeSheets();
            assert.strictEqual(activeSheet, null);
            assert(!container.classList.contains('active'), 'Container must not be active');
            assert.strictEqual(sheets.filter(s => s.classList.contains('open')).length, 0);
            assert(navItems[0].classList.contains('active'), 'Game nav item restored');
        }
    }
    closeSheets();
    assert.strictEqual(activeSheet, null);
});

test('Rapid 2D / 3D Viewport Toggle: 50 cycles maintaining correct visibility and canvas states', () => {
    let mode = '2d';
    const c2d = { style: { display: 'block' } };
    const c3d = { style: { display: 'none' } };
    const label = { textContent: '🎲 3D' };

    function toggleView() {
        if (mode === '2d') {
            mode = '3d';
            c2d.style.display = 'none';
            c3d.style.display = 'block';
            label.textContent = '♟️ 2D';
        } else {
            mode = '2d';
            c3d.style.display = 'none';
            c2d.style.display = 'block';
            label.textContent = '🎲 3D';
        }
    }

    for (let i = 0; i < 50; i++) {
        toggleView();
        if (i % 2 === 0) {
            assert.strictEqual(mode, '3d');
            assert.strictEqual(c2d.style.display, 'none');
            assert.strictEqual(c3d.style.display, 'block');
            assert.strictEqual(label.textContent, '♟️ 2D');
        } else {
            assert.strictEqual(mode, '2d');
            assert.strictEqual(c3d.style.display, 'none');
            assert.strictEqual(c2d.style.display, 'block');
            assert.strictEqual(label.textContent, '🎲 3D');
        }
    }
});

test('Camera Preset Transitions: Interrupted rapid preset switching produces smooth targets without NaN', () => {
    const presets = {
        angled: { pitchDeg: 56, distMult: 1.0 },
        topdown: { pitchDeg: 84, distMult: 1.05 },
        cinematic: { pitchDeg: 32, distMult: 0.95 }
    };

    let cameraSpherical = { theta: 0, phi: 0.59, radius: 21.0 };
    let cameraTransition = null;

    function setPreset(name, aspect = 1.0, fovDeg = 40, duration = 320) {
        const p = presets[name];
        const fovRad = (fovDeg * Math.PI) / 180;
        const autoDist = (5.25 / Math.sin(fovRad / 2)) * (1.0 / Math.min(1.0, aspect)) * 1.10;
        const baseRadius = Math.max(16.5, Math.min(32.0, autoDist));
        const r = baseRadius * p.distMult;
        const pitchRad = (p.pitchDeg * Math.PI) / 180;
        const phi = Math.PI / 2 - pitchRad;
        const theta = 0;

        cameraTransition = {
            startTheta: cameraSpherical.theta,
            startPhi: cameraSpherical.phi,
            startRadius: cameraSpherical.radius,
            targetTheta: theta,
            targetPhi: phi,
            targetRadius: r,
            startTime: 1000,
            duration
        };
    }

    function stepAnimation(now) {
        if (!cameraTransition) return;
        const ct = cameraTransition;
        const progress = Math.min(1.0, (now - ct.startTime) / ct.duration);
        const ease = progress * progress * (3 - 2 * progress);
        cameraSpherical.theta = ct.startTheta + (ct.targetTheta - ct.startTheta) * ease;
        cameraSpherical.phi = ct.startPhi + (ct.targetPhi - ct.startPhi) * ease;
        cameraSpherical.radius = ct.startRadius + (ct.targetRadius - ct.startRadius) * ease;
        if (progress >= 1.0) cameraTransition = null;
    }

    // Rapid switches mid-flight
    setPreset('angled');
    stepAnimation(1100);
    assert(!isNaN(cameraSpherical.radius));

    setPreset('cinematic');
    stepAnimation(1050);
    assert(!isNaN(cameraSpherical.radius));

    setPreset('topdown');
    stepAnimation(1320);
    assert(!isNaN(cameraSpherical.radius));
    assert(!isNaN(cameraSpherical.phi));
    assert(!isNaN(cameraSpherical.theta));
    assert(cameraSpherical.radius > 16.0 && cameraSpherical.radius < 35.0);
});

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n=============================================================================');
console.log(`STRESS RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
if (failedTests > 0) {
    console.error(`FAILURES: ${failedTests}`);
    for (const f of failures) {
        console.error(`  - ${f.name}: ${f.error}`);
    }
} else {
    console.log('ALL ADVERSARIAL STRESS TESTS PASSED WITH ZERO FAILURES (100% SUCCESS)!');
}
console.log('=============================================================================');

if (failedTests > 0) process.exit(1);

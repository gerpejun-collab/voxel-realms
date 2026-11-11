/**
 * Grandmaster Chess - 3D PBR Staunton Board & Pieces View
 * Built with Three.js:
 * - Procedural Staunton piece geometries (King, Queen, Rook, Bishop, Knight, Pawn)
 * - PBR Ivory & Ebony wood materials with specular highlights and soft shadows
 * - Parabolic arc move animations
 * - Legal move glowing landing discs
 * - Raycaster click-to-move interaction
 * - Built-in smooth orbit / tilt camera controls
 */

import * as THREE_MODULE from 'three';
import { ChessEngine } from './chess_engine.js';

const THREE = typeof window !== 'undefined' && window.THREE ? window.THREE : THREE_MODULE;

export class ChessView3D {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {Object} options
     */
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.orientation = options.orientation || 'w';
        this.onMoveAttempt = options.onMoveAttempt || (() => {});
        this.onPromotionNeeded = options.onPromotionNeeded || null;

        this.engine = null;
        this.selectedSquare = null; // { row, col }
        this.legalDestinations = [];
        this.pieceMeshes = new Map(); // key "r,c" -> THREE.Group
        this.highlightMeshes = [];
        this.animatingPieces = [];

        this.initScene();
        this.createBoard();
        this.setupInteraction();
        this.setupOrbitControls();
        this.resize();

        this.animate = this.animate.bind(this);
        this.animationFrameId = requestAnimationFrame(this.animate);
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x12141a);

        const width = this.canvas.clientWidth || 560;
        const height = this.canvas.clientHeight || 560;

        this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
        this.updateCameraOrientation();

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(width, height, false);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Lighting setup
        const ambient = new THREE.AmbientLight(0xffffff, 0.75);
        this.scene.add(ambient);

        const dirLight = new THREE.DirectionalLight(0xfffaed, 1.25);
        dirLight.position.set(10, 20, 12);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 45;
        dirLight.shadow.camera.left = -10;
        dirLight.shadow.camera.right = 10;
        dirLight.shadow.camera.top = 10;
        dirLight.shadow.camera.bottom = -10;
        dirLight.shadow.bias = -0.0005;
        this.scene.add(dirLight);

        const fillLight = new THREE.PointLight(0x88bbff, 0.5, 30);
        fillLight.position.set(-12, 10, -10);
        this.scene.add(fillLight);

        // Materials cache
        this.materials = {
            lightSquare: new THREE.MeshStandardMaterial({ color: 0xedd6b1, roughness: 0.35, metalness: 0.05 }),
            darkSquare: new THREE.MeshStandardMaterial({ color: 0x8a542b, roughness: 0.4, metalness: 0.05 }),
            frame: new THREE.MeshStandardMaterial({ color: 0x2e190e, roughness: 0.3, metalness: 0.15 }),
            whitePiece: new THREE.MeshStandardMaterial({ color: 0xf6f5f0, roughness: 0.22, metalness: 0.08 }),
            blackPiece: new THREE.MeshStandardMaterial({ color: 0x1f1d1b, roughness: 0.22, metalness: 0.08 }),
            goldTrim: new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.2, metalness: 0.75 }),
            selectedRing: new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.65 }),
            moveDot: new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.75 }),
            captureRing: new THREE.MeshBasicMaterial({ color: 0xe74c3c, transparent: true, opacity: 0.85 }),
            checkLight: new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.7 })
        };
    }

    updateCameraOrientation() {
        if (this.orientation === 'w') {
            this.camera.position.set(0, 14.5, 14.5);
        } else {
            this.camera.position.set(0, 14.5, -14.5);
        }
        this.camera.lookAt(0, 0, 0);
    }

    createBoard() {
        this.boardGroup = new THREE.Group();
        this.squareMeshes = []; // 8x8

        // Outer wooden frame
        const frameGeo = new THREE.BoxGeometry(10.2, 0.6, 10.2);
        const frameMesh = new THREE.Mesh(frameGeo, this.materials.frame);
        frameMesh.position.y = -0.31;
        frameMesh.receiveShadow = true;
        this.boardGroup.add(frameMesh);

        // 64 Individual squares
        const sqGeo = new THREE.BoxGeometry(1.15, 0.1, 1.15);
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const isLight = (r + c) % 2 === 0;
                const mat = isLight ? this.materials.lightSquare : this.materials.darkSquare;
                const mesh = new THREE.Mesh(sqGeo, mat);
                mesh.receiveShadow = true;
                const pos = this.coordsToWorld(r, c);
                mesh.position.set(pos.x, 0, pos.z);
                mesh.userData = { row: r, col: c, isSquare: true };
                this.boardGroup.add(mesh);
                this.squareMeshes.push(mesh);
            }
        }

        this.scene.add(this.boardGroup);
    }

    coordsToWorld(row, col) {
        // row 0 is rank 8 (Z = -4.025 to 4.025)
        // col 0 is file a (X = -4.025 to 4.025)
        const spacing = 1.18;
        return {
            x: (col - 3.5) * spacing,
            z: (row - 3.5) * spacing
        };
    }

    attachEngine(engine) {
        this.engine = engine;
        this.selectedSquare = null;
        this.clearHighlights();
        this.syncPieces();
    }

    setOrientation(color) {
        this.orientation = color === 'b' ? 'b' : 'w';
        this.updateCameraOrientation();
    }

    syncPieces() {
        if (!this.engine) return;

        // Clear existing piece meshes
        for (const [key, group] of this.pieceMeshes.entries()) {
            this.scene.remove(group);
        }
        this.pieceMeshes.clear();

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.engine.board[r][c];
                if (piece) {
                    const pieceGroup = this.createPieceMesh(piece.type, piece.color);
                    const pos = this.coordsToWorld(r, c);
                    pieceGroup.position.set(pos.x, 0.05, pos.z);
                    pieceGroup.userData = { row: r, col: c, piece };
                    this.scene.add(pieceGroup);
                    this.pieceMeshes.set(`${r},${c}`, pieceGroup);
                }
            }
        }
    }

    createPieceMesh(type, color) {
        const group = new THREE.Group();
        const mat = color === 'w' ? this.materials.whitePiece : this.materials.blackPiece;
        const gold = this.materials.goldTrim;

        // Common Staunton Base
        const baseGeo = new THREE.CylinderGeometry(0.38, 0.44, 0.18, 20);
        const baseMesh = new THREE.Mesh(baseGeo, mat);
        baseMesh.position.y = 0.09;
        baseMesh.castShadow = true;
        baseMesh.receiveShadow = true;
        group.add(baseMesh);

        const collarGeo = new THREE.TorusGeometry(0.34, 0.045, 12, 24);
        collarGeo.rotateX(Math.PI / 2);
        const collarMesh = new THREE.Mesh(collarGeo, mat);
        collarMesh.position.y = 0.18;
        collarMesh.castShadow = true;
        group.add(collarMesh);

        switch (type) {
            case 'p': { // Pawn
                const stemGeo = new THREE.CylinderGeometry(0.18, 0.32, 0.55, 16);
                const stem = new THREE.Mesh(stemGeo, mat);
                stem.position.y = 0.45;
                stem.castShadow = true;
                group.add(stem);

                const headGeo = new THREE.SphereGeometry(0.24, 16, 16);
                const head = new THREE.Mesh(headGeo, mat);
                head.position.y = 0.82;
                head.castShadow = true;
                group.add(head);
                break;
            }

            case 'r': { // Rook
                const bodyGeo = new THREE.CylinderGeometry(0.28, 0.34, 0.75, 16);
                const body = new THREE.Mesh(bodyGeo, mat);
                body.position.y = 0.55;
                body.castShadow = true;
                group.add(body);

                const topGeo = new THREE.CylinderGeometry(0.36, 0.32, 0.3, 16);
                const top = new THREE.Mesh(topGeo, mat);
                top.position.y = 1.0;
                top.castShadow = true;
                group.add(top);

                // Crenellations
                for (let i = 0; i < 4; i++) {
                    const angle = (i * Math.PI) / 2;
                    const merlonGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
                    const merlon = new THREE.Mesh(merlonGeo, mat);
                    merlon.position.set(Math.cos(angle) * 0.26, 1.2, Math.sin(angle) * 0.26);
                    merlon.castShadow = true;
                    group.add(merlon);
                }
                break;
            }

            case 'n': { // Knight
                const stemGeo = new THREE.CylinderGeometry(0.26, 0.34, 0.45, 16);
                const stem = new THREE.Mesh(stemGeo, mat);
                stem.position.y = 0.4;
                stem.castShadow = true;
                group.add(stem);

                // Horse head
                const headGeo = new THREE.BoxGeometry(0.26, 0.48, 0.44);
                const head = new THREE.Mesh(headGeo, mat);
                head.position.set(0, 0.78, color === 'w' ? -0.06 : 0.06);
                head.rotation.x = color === 'w' ? -0.22 : 0.22;
                head.castShadow = true;
                group.add(head);

                // Snout
                const snoutGeo = new THREE.BoxGeometry(0.22, 0.25, 0.25);
                const snout = new THREE.Mesh(snoutGeo, mat);
                snout.position.set(0, 0.68, color === 'w' ? -0.24 : 0.24);
                snout.castShadow = true;
                group.add(snout);

                // Ears
                for (const side of [-0.09, 0.09]) {
                    const earGeo = new THREE.ConeGeometry(0.06, 0.18, 8);
                    const ear = new THREE.Mesh(earGeo, mat);
                    ear.position.set(side, 1.06, color === 'w' ? 0.02 : -0.02);
                    ear.castShadow = true;
                    group.add(ear);
                }
                break;
            }

            case 'b': { // Bishop
                const bodyGeo = new THREE.CylinderGeometry(0.22, 0.33, 0.8, 16);
                const body = new THREE.Mesh(bodyGeo, mat);
                body.position.y = 0.58;
                body.castShadow = true;
                group.add(body);

                // Mitre
                const mitreGeo = new THREE.SphereGeometry(0.28, 16, 16);
                mitreGeo.scale(0.85, 1.35, 0.85);
                const mitre = new THREE.Mesh(mitreGeo, mat);
                mitre.position.y = 1.15;
                mitre.castShadow = true;
                group.add(mitre);

                // Cross finial
                const tipGeo = new THREE.SphereGeometry(0.07, 12, 12);
                const tip = new THREE.Mesh(tipGeo, gold);
                tip.position.y = 1.58;
                tip.castShadow = true;
                group.add(tip);
                break;
            }

            case 'q': { // Queen
                const bodyGeo = new THREE.CylinderGeometry(0.25, 0.36, 1.0, 16);
                const body = new THREE.Mesh(bodyGeo, mat);
                body.position.y = 0.68;
                body.castShadow = true;
                group.add(body);

                // Coronet
                const coronetGeo = new THREE.CylinderGeometry(0.38, 0.24, 0.35, 16);
                const coronet = new THREE.Mesh(coronetGeo, mat);
                coronet.position.y = 1.3;
                coronet.castShadow = true;
                group.add(coronet);

                // Crown ball
                const crownBall = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), gold);
                crownBall.position.y = 1.54;
                crownBall.castShadow = true;
                group.add(crownBall);
                break;
            }

            case 'k': { // King
                const bodyGeo = new THREE.CylinderGeometry(0.28, 0.38, 1.1, 16);
                const body = new THREE.Mesh(bodyGeo, mat);
                body.position.y = 0.72;
                body.castShadow = true;
                group.add(body);

                // Regal head
                const headGeo = new THREE.CylinderGeometry(0.38, 0.26, 0.35, 16);
                const head = new THREE.Mesh(headGeo, mat);
                head.position.y = 1.4;
                head.castShadow = true;
                group.add(head);

                // Regal Cross Finial
                const crossVGeo = new THREE.BoxGeometry(0.07, 0.28, 0.07);
                const crossV = new THREE.Mesh(crossVGeo, gold);
                crossV.position.y = 1.72;
                crossV.castShadow = true;
                group.add(crossV);

                const crossHGeo = new THREE.BoxGeometry(0.22, 0.07, 0.07);
                const crossH = new THREE.Mesh(crossHGeo, gold);
                crossH.position.y = 1.76;
                crossH.castShadow = true;
                group.add(crossH);
                break;
            }
        }

        return group;
    }

    setupInteraction() {
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        const handleClick = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.scene.children, true);

            for (const hit of intersects) {
                // Find root group or square
                let obj = hit.object;
                let targetCoords = null;

                while (obj && obj !== this.scene) {
                    if (obj.userData && obj.userData.row !== undefined) {
                        targetCoords = { row: obj.userData.row, col: obj.userData.col };
                        break;
                    }
                    obj = obj.parent;
                }

                if (targetCoords) {
                    this.onSquareClicked(targetCoords);
                    break;
                }
            }
        };

        this.canvas.addEventListener('click', handleClick);
    }

    onSquareClicked(coords) {
        if (!this.engine) return;

        // If clicked on legal destination
        if (this.selectedSquare) {
            const destMove = this.legalDestinations.find(
                d => d.row === coords.row && d.col === coords.col
            );
            if (destMove) {
                this.executeMove(this.selectedSquare, coords, destMove.move);
                this.selectedSquare = null;
                this.clearHighlights();
                return;
            }
        }

        // Friendly piece clicked
        const piece = this.engine.board[coords.row][coords.col];
        if (piece && piece.color === this.engine.turn) {
            this.selectedSquare = coords;
            this.computeLegalDestinations(coords);
            this.renderHighlights();
        } else {
            this.selectedSquare = null;
            this.clearHighlights();
        }
    }

    computeLegalDestinations(coords) {
        this.legalDestinations = [];
        if (!this.engine) return;

        const legalMoves = this.engine.generateLegalMoves(this.engine.turn);
        for (const move of legalMoves) {
            if (move.from.row === coords.row && move.from.col === coords.col) {
                this.legalDestinations.push({
                    row: move.to.row,
                    col: move.to.col,
                    move
                });
            }
        }
    }

    clearHighlights() {
        for (const mesh of this.highlightMeshes) {
            this.scene.remove(mesh);
        }
        this.highlightMeshes = [];
    }

    renderHighlights() {
        this.clearHighlights();

        // Selected square disc
        if (this.selectedSquare) {
            const pos = this.coordsToWorld(this.selectedSquare.row, this.selectedSquare.col);
            const ringGeo = new THREE.RingGeometry(0.2, 0.52, 32);
            ringGeo.rotateX(-Math.PI / 2);
            const ring = new THREE.Mesh(ringGeo, this.materials.selectedRing);
            ring.position.set(pos.x, 0.06, pos.z);
            this.scene.add(ring);
            this.highlightMeshes.push(ring);
        }

        // Legal destination markers
        for (const dest of this.legalDestinations) {
            const pos = this.coordsToWorld(dest.row, dest.col);
            const targetPiece = this.engine.board[dest.row][dest.col];

            if (targetPiece || dest.move.isEnPassant) {
                // Capture ring
                const capGeo = new THREE.RingGeometry(0.38, 0.52, 32);
                capGeo.rotateX(-Math.PI / 2);
                const cap = new THREE.Mesh(capGeo, this.materials.captureRing);
                cap.position.set(pos.x, 0.06, pos.z);
                this.scene.add(cap);
                this.highlightMeshes.push(cap);
            } else {
                // Quiet move dot
                const dotGeo = new THREE.CircleGeometry(0.18, 24);
                dotGeo.rotateX(-Math.PI / 2);
                const dot = new THREE.Mesh(dotGeo, this.materials.moveDot);
                dot.position.set(pos.x, 0.06, pos.z);
                this.scene.add(dot);
                this.highlightMeshes.push(dot);
            }
        }
    }

    executeMove(from, to, move) {
        const fromSq = ChessEngine.coordsToSquare(from.row, from.col);
        const toSq = ChessEngine.coordsToSquare(to.row, to.col);

        const movingPiece = this.engine.board[from.row][from.col];
        if (movingPiece && movingPiece.type === 'p') {
            if ((movingPiece.color === 'w' && to.row === 0) || (movingPiece.color === 'b' && to.row === 7)) {
                if (this.onPromotionNeeded) {
                    this.onPromotionNeeded(fromSq, toSq, (promoPiece) => {
                        this.animateAndApply(from, to, fromSq, toSq, promoPiece);
                    });
                    return;
                }
            }
        }

        this.animateAndApply(from, to, fromSq, toSq, 'q');
    }

    animateAndApply(fromCoords, toCoords, fromSq, toSq, promotion = 'q') {
        const pieceMesh = this.pieceMeshes.get(`${fromCoords.row},${fromCoords.col}`);
        const targetWorld = this.coordsToWorld(toCoords.row, toCoords.col);
        const startWorld = this.coordsToWorld(fromCoords.row, fromCoords.col);

        if (pieceMesh) {
            // Parabolic arc animation
            const startTime = performance.now();
            const duration = 220; // ms

            this.animatingPieces.push({
                mesh: pieceMesh,
                startX: startWorld.x,
                startZ: startWorld.z,
                targetX: targetWorld.x,
                targetZ: targetWorld.z,
                startTime,
                duration,
                onComplete: () => {
                    const executed = this.engine.makeMove(fromSq, toSq, promotion);
                    this.syncPieces();
                    this.onMoveAttempt(fromSq, toSq, promotion, executed);
                }
            });
        } else {
            const executed = this.engine.makeMove(fromSq, toSq, promotion);
            this.syncPieces();
            this.onMoveAttempt(fromSq, toSq, promotion, executed);
        }
    }

    setupOrbitControls() {
        this.isPointerDown = false;
        this.prevPointer = { x: 0, y: 0 };
        this.cameraAngle = { theta: 0, phi: 0.85, radius: 20 };

        this.canvas.addEventListener('pointerdown', (e) => {
            if (e.button === 2 || e.shiftKey) { // Right click or Shift+drag orbits
                this.isPointerDown = true;
                this.prevPointer.x = e.clientX;
                this.prevPointer.y = e.clientY;
            }
        });

        window.addEventListener('pointermove', (e) => {
            if (!this.isPointerDown) return;
            const dx = e.clientX - this.prevPointer.x;
            const dy = e.clientY - this.prevPointer.y;
            this.prevPointer.x = e.clientX;
            this.prevPointer.y = e.clientY;

            this.cameraAngle.theta -= dx * 0.01;
            this.cameraAngle.phi = Math.max(0.2, Math.min(Math.PI / 2 - 0.1, this.cameraAngle.phi - dy * 0.01));

            const r = this.cameraAngle.radius;
            this.camera.position.x = r * Math.sin(this.cameraAngle.phi) * Math.sin(this.cameraAngle.theta);
            this.camera.position.y = r * Math.cos(this.cameraAngle.phi);
            this.camera.position.z = r * Math.sin(this.cameraAngle.phi) * Math.cos(this.cameraAngle.theta);
            this.camera.lookAt(0, 0, 0);
        });

        window.addEventListener('pointerup', () => {
            this.isPointerDown = false;
        });

        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    resize() {
        const width = this.canvas.clientWidth || 560;
        const height = this.canvas.clientHeight || 560;
        if (width === 0 || height === 0) return;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
    }

    animate() {
        this.animationFrameId = requestAnimationFrame(this.animate);

        // Update piece animations
        const now = performance.now();
        for (let i = this.animatingPieces.length - 1; i >= 0; i--) {
            const anim = this.animatingPieces[i];
            const elapsed = now - anim.startTime;
            const progress = Math.min(1, elapsed / anim.duration);

            const curX = anim.startX + (anim.targetX - anim.startX) * progress;
            const curZ = anim.startZ + (anim.targetZ - anim.startZ) * progress;
            const curY = 0.05 + Math.sin(progress * Math.PI) * 1.5; // Parabolic jump

            anim.mesh.position.set(curX, curY, curZ);

            if (progress >= 1) {
                anim.mesh.position.set(anim.targetX, 0.05, anim.targetZ);
                this.animatingPieces.splice(i, 1);
                anim.onComplete();
            }
        }

        this.renderer.render(this.scene, this.camera);
    }

    destroy() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        this.renderer.dispose();
    }
}

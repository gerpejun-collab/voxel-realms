/**
 * Grandmaster Chess - High-DPI 2D Vector Board & Audio Synthesizer
 * Features:
 * - Crisp High-DPI Canvas Rendering
 * - Staunton Vector Piece Glyphs with PBR drop-shadows and metallic highlights
 * - Drag-and-drop & Click-to-move input
 * - Legal move dot markers & capture rings
 * - King-in-check red glow
 * - Last move highlights & Premove queue
 * - Web Audio API procedural sound synthesizer (move, capture, check, victory, defeat)
 */

import { ChessEngine } from './chess_engine.js';

// Procedural Web Audio Sound Synthesizer for Chess
class ChessAudio {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (!this.ctx && typeof window !== 'undefined') {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
    }

    playMove() {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.08);

        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.09);
    }

    playCapture() {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // Snappy click
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(560, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.12);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        // Noise buffer for impact snap
        const bufferSize = this.ctx.sampleRate * 0.05;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.015));
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.3, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        noise.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start(now);
        osc.start(now);
        osc.stop(now + 0.13);
    }

    playCheck() {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(660, now + 0.25);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.26);
    }

    playGameEnd(isWin) {
        this.init();
        if (!this.ctx) return;
        const notes = isWin ? [440, 554, 659, 880] : [330, 293, 261, 220];
        notes.forEach((freq, idx) => {
            const start = this.ctx.currentTime + idx * 0.12;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = isWin ? 'triangle' : 'sawtooth';
            osc.frequency.setValueAtTime(freq, start);
            gain.gain.setValueAtTime(0.25, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(start);
            osc.stop(start + 0.23);
        });
    }

    playLowTime() {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(950, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.07);
    }
}

// Unicode vector symbols with styled outline fonts
const UNICODE_PIECES = {
    w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
    b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
};

export class ChessView2D {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {Object} options
     */
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.audio = new ChessAudio();

        this.orientation = options.orientation || 'w'; // 'w' or 'b'
        this.theme = {
            lightSquare: '#ebd8b7',
            darkSquare: '#b88b4a',
            border: '#4a3319',
            selected: 'rgba(255, 235, 59, 0.55)',
            lastMove: 'rgba(173, 216, 230, 0.45)',
            legalDot: 'rgba(20, 130, 20, 0.65)',
            captureRing: 'rgba(220, 30, 30, 0.65)',
            checkGlow: 'rgba(231, 76, 60, 0.8)',
            premove: 'rgba(52, 152, 219, 0.5)'
        };

        // State
        this.engine = null;
        this.selectedSquare = null; // { row, col }
        this.legalDestinations = []; // array of { row, col, move }
        this.lastMove = null; // { from: {row,col}, to: {row,col} }
        this.premove = null; // { from, to, promotion }
        this.draggingPiece = null; // { piece, row, col, x, y, startX, startY }

        // Callbacks
        this.onMoveAttempt = options.onMoveAttempt || (() => {});
        this.onPromotionNeeded = options.onPromotionNeeded || null;

        this.setupEventListeners();
        this.resize();
    }

    attachEngine(engine) {
        this.engine = engine;
        this.selectedSquare = null;
        this.legalDestinations = [];
        this.render();
    }

    setOrientation(color) {
        this.orientation = color === 'b' ? 'b' : 'w';
        this.render();
    }

    setLastMove(fromSq, toSq) {
        if (!fromSq || !toSq) {
            this.lastMove = null;
        } else {
            const f = typeof fromSq === 'string' ? ChessEngine.squareToCoords(fromSq) : fromSq;
            const t = typeof toSq === 'string' ? ChessEngine.squareToCoords(toSq) : toSq;
            this.lastMove = { from: f, to: t };
        }
        this.render();
    }

    resize() {
        const rect = this.canvas.parentElement ? this.canvas.parentElement.getBoundingClientRect() : this.canvas.getBoundingClientRect();
        const side = Math.min(rect.width || 560, rect.height || 560, 680);
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = side * dpr;
        this.canvas.height = side * dpr;
        this.canvas.style.width = `${side}px`;
        this.canvas.style.height = `${side}px`;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.size = side;
        this.squareSize = side / 8;
        this.render();
    }

    // Convert coords to screen position according to board orientation
    coordsToScreen(row, col) {
        if (this.orientation === 'w') {
            return {
                x: col * this.squareSize,
                y: row * this.squareSize
            };
        } else {
            return {
                x: (7 - col) * this.squareSize,
                y: (7 - row) * this.squareSize
            };
        }
    }

    screenToCoords(pixelX, pixelY) {
        let col = Math.floor(pixelX / this.squareSize);
        let row = Math.floor(pixelY / this.squareSize);
        if (this.orientation === 'b') {
            col = 7 - col;
            row = 7 - row;
        }
        if (row < 0 || row > 7 || col < 0 || col > 7) return null;
        return { row, col };
    }

    setupEventListeners() {
        const getCanvasCoords = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        };

        const handlePointerDown = (e) => {
            e.preventDefault();
            this.audio.init();
            const { x, y } = getCanvasCoords(e);
            const coords = this.screenToCoords(x, y);
            if (!coords || !this.engine) return;

            const piece = this.engine.board[coords.row][coords.col];

            // If a piece was already selected and clicked on one of its legal destinations
            if (this.selectedSquare) {
                const destMove = this.legalDestinations.find(
                    d => d.row === coords.row && d.col === coords.col
                );
                if (destMove) {
                    this.executeMove(this.selectedSquare, coords, destMove.move);
                    this.selectedSquare = null;
                    this.legalDestinations = [];
                    this.render();
                    return;
                }
            }

            // Clicked on friendly piece: select it and prepare drag
            if (piece) {
                this.selectedSquare = coords;
                this.computeLegalDestinations(coords);
                this.draggingPiece = {
                    piece,
                    row: coords.row,
                    col: coords.col,
                    x,
                    y,
                    startX: x,
                    startY: y
                };
                this.render();
            } else {
                // Clicked on empty space: deselect
                this.selectedSquare = null;
                this.legalDestinations = [];
                this.render();
            }
        };

        const handlePointerMove = (e) => {
            if (!this.draggingPiece) return;
            e.preventDefault();
            const { x, y } = getCanvasCoords(e);
            this.draggingPiece.x = x;
            this.draggingPiece.y = y;
            this.render();
        };

        const handlePointerUp = (e) => {
            if (!this.draggingPiece) return;
            e.preventDefault();
            const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
            const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
            const rect = this.canvas.getBoundingClientRect();
            const x = clientX - rect.left;
            const y = clientY - rect.top;

            const destCoords = this.screenToCoords(x, y);
            const startCoords = { row: this.draggingPiece.row, col: this.draggingPiece.col };

            // Did the user drag a noticeable distance?
            const dist = Math.hypot(x - this.draggingPiece.startX, y - this.draggingPiece.startY);

            if (dist > 12 && destCoords) {
                const destMove = this.legalDestinations.find(
                    d => d.row === destCoords.row && d.col === destCoords.col
                );
                if (destMove) {
                    this.executeMove(startCoords, destCoords, destMove.move);
                    this.selectedSquare = null;
                    this.legalDestinations = [];
                }
            }

            this.draggingPiece = null;
            this.render();
        };

        this.canvas.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('mousemove', handlePointerMove);
        window.addEventListener('mouseup', handlePointerUp);

        this.canvas.addEventListener('touchstart', handlePointerDown, { passive: false });
        window.addEventListener('touchmove', handlePointerMove, { passive: false });
        window.addEventListener('touchend', handlePointerUp, { passive: false });
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

    executeMove(from, to, move) {
        const fromSq = ChessEngine.coordsToSquare(from.row, from.col);
        const toSq = ChessEngine.coordsToSquare(to.row, to.col);

        // Check if pawn promotion
        const movingPiece = this.engine.board[from.row][from.col];
        if (movingPiece && movingPiece.type === 'p') {
            if ((movingPiece.color === 'w' && to.row === 0) || (movingPiece.color === 'b' && to.row === 7)) {
                if (this.onPromotionNeeded) {
                    this.onPromotionNeeded(fromSq, toSq, (promoPiece) => {
                        this.finishMove(fromSq, toSq, promoPiece, move);
                    });
                    return;
                }
            }
        }

        this.finishMove(fromSq, toSq, 'q', move);
    }

    finishMove(fromSq, toSq, promotion = 'q', moveHint = null) {
        const executed = this.engine.makeMove(fromSq, toSq, promotion);
        if (executed) {
            // Sound effects
            if (executed.isCheckmate || executed.isDraw) {
                this.audio.playGameEnd(executed.isCheckmate);
            } else if (executed.isCheck) {
                this.audio.playCheck();
            } else if (executed.captured) {
                this.audio.playCapture();
            } else {
                this.audio.playMove();
            }

            this.setLastMove(fromSq, toSq);
            this.onMoveAttempt(fromSq, toSq, promotion, executed);
        }
        this.render();
    }

    render() {
        if (!this.ctx || !this.engine) return;
        const ctx = this.ctx;
        const sq = this.squareSize;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. Draw 64 Board Squares
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const screen = this.coordsToScreen(r, c);
                const isLight = (r + c) % 2 === 0;
                ctx.fillStyle = isLight ? this.theme.lightSquare : this.theme.darkSquare;
                ctx.fillRect(screen.x, screen.y, sq, sq);

                // Coordinate labels on margins
                ctx.font = `bold ${Math.max(10, Math.floor(sq * 0.16))}px 'Segoe UI', sans-serif`;
                if ((this.orientation === 'w' && r === 7) || (this.orientation === 'b' && r === 0)) {
                    ctx.fillStyle = isLight ? this.theme.darkSquare : this.theme.lightSquare;
                    const fileLetter = String.fromCharCode(97 + c);
                    ctx.fillText(fileLetter, screen.x + sq - 12, screen.y + sq - 4);
                }
                if ((this.orientation === 'w' && c === 0) || (this.orientation === 'b' && c === 7)) {
                    ctx.fillStyle = isLight ? this.theme.darkSquare : this.theme.lightSquare;
                    const rankNumber = 8 - r;
                    ctx.fillText(String(rankNumber), screen.x + 4, screen.y + 14);
                }
            }
        }

        // 2. Last Move Highlights
        if (this.lastMove) {
            ctx.fillStyle = this.theme.lastMove;
            const fromScr = this.coordsToScreen(this.lastMove.from.row, this.lastMove.from.col);
            const toScr = this.coordsToScreen(this.lastMove.to.row, this.lastMove.to.col);
            ctx.fillRect(fromScr.x, fromScr.y, sq, sq);
            ctx.fillRect(toScr.x, toScr.y, sq, sq);
        }

        // 3. King in Check Glow
        if (this.engine.isInCheck(this.engine.turn)) {
            // Find current king
            let kingRow = -1, kingCol = -1;
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const p = this.engine.board[r][c];
                    if (p && p.type === 'k' && p.color === this.engine.turn) {
                        kingRow = r;
                        kingCol = c;
                        break;
                    }
                }
            }
            if (kingRow !== -1) {
                const kScr = this.coordsToScreen(kingRow, kingCol);
                const radial = ctx.createRadialGradient(
                    kScr.x + sq / 2, kScr.y + sq / 2, sq * 0.15,
                    kScr.x + sq / 2, kScr.y + sq / 2, sq * 0.65
                );
                radial.addColorStop(0, 'rgba(255, 0, 0, 0.85)');
                radial.addColorStop(0.7, 'rgba(231, 76, 60, 0.45)');
                radial.addColorStop(1, 'rgba(231, 76, 60, 0)');
                ctx.fillStyle = radial;
                ctx.fillRect(kScr.x, kScr.y, sq, sq);
            }
        }

        // 4. Selected Square Highlight
        if (this.selectedSquare) {
            const selScr = this.coordsToScreen(this.selectedSquare.row, this.selectedSquare.col);
            ctx.fillStyle = this.theme.selected;
            ctx.fillRect(selScr.x, selScr.y, sq, sq);
        }

        // 5. Draw Pieces (except the one being dragged)
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (this.draggingPiece && this.draggingPiece.row === r && this.draggingPiece.col === c) {
                    continue; // Will be drawn floating at cursor
                }
                const piece = this.engine.board[r][c];
                if (piece) {
                    const screen = this.coordsToScreen(r, c);
                    this.drawPiece(ctx, piece, screen.x + sq / 2, screen.y + sq / 2, sq);
                }
            }
        }

        // 6. Legal Move Indicators
        for (const dest of this.legalDestinations) {
            const dScr = this.coordsToScreen(dest.row, dest.col);
            const targetPiece = this.engine.board[dest.row][dest.col];

            if (targetPiece || dest.move.isEnPassant) {
                // Capture: thick hollow ring
                ctx.lineWidth = Math.max(4, sq * 0.08);
                ctx.strokeStyle = this.theme.captureRing;
                ctx.beginPath();
                ctx.arc(dScr.x + sq / 2, dScr.y + sq / 2, sq * 0.42, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                // Quiet move: solid centered dot
                ctx.fillStyle = this.theme.legalDot;
                ctx.beginPath();
                ctx.arc(dScr.x + sq / 2, dScr.y + sq / 2, sq * 0.16, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 7. Floating Dragged Piece
        if (this.draggingPiece) {
            this.drawPiece(ctx, this.draggingPiece.piece, this.draggingPiece.x, this.draggingPiece.y, sq * 1.15, true);
        }
    }

    drawPiece(ctx, piece, cx, cy, sq, isDragging = false) {
        const symbol = UNICODE_PIECES[piece.color][piece.type];
        const fontSize = Math.floor(sq * 0.82);

        ctx.save();
        ctx.font = `${fontSize}px 'Segoe UI Symbol', 'DejaVu Sans', Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Drop shadow for pieces
        if (isDragging) {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
            ctx.shadowBlur = 14;
            ctx.shadowOffsetY = 8;
        } else {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetY = 2;
        }

        if (piece.color === 'w') {
            // White pieces: crisp cream with golden-dark stroke
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#2b2318';
            ctx.lineWidth = Math.max(1.8, sq * 0.035);
            ctx.strokeText(symbol, cx, cy);
            ctx.fillText(symbol, cx, cy);
        } else {
            // Black pieces: sleek obsidian with subtle silver stroke
            ctx.fillStyle = '#222222';
            ctx.strokeStyle = '#e0e0e0';
            ctx.lineWidth = Math.max(1.2, sq * 0.025);
            ctx.strokeText(symbol, cx, cy);
            ctx.fillText(symbol, cx, cy);
        }

        ctx.restore();
    }
}

/**
 * Grandmaster Chess - UI Controller and Game Orchestrator
 * Architecture:
 * - 100dvh CSS Grid responsive mobile portrait layout with safe-area padding
 * - Compact 48px Material 3 Android App Bar
 * - Symmetric 44px Player & Opponent cards with captured trays, advantage diff (+3), and Fischer clocks
 * - Real-time 6px vertical Evaluation Bar with smooth sigmoid centipawn scaling
 * - 1-line horizontal SAN move ticker with traversal buttons (⏮, ◀, ▶, ⏭) and single-player undo (↩)
 * - Docked 56px 4-tab Material 3 Bottom Navigation Bar
 * - 4 Modal Slide-Up Bottom Sheets (Play, Options, Analysis, Rooms & Chat) with touch backdrop & swipe-down gestures
 * - Inline 52x52px circular touch promotion sheet
 * - Tactile haptic touch feedback (navigator.vibrate)
 * - Standardized WebSocket transmissions { type, data: { ... } }
 * - Decoupled remote move processing preventing move reflection loops
 */

import { ChessEngine, PIECE_VALUES } from './chess_engine.js';
import { ChessView2D } from './chess_view_2d.js';
import { ChessView3D } from './chess_view_3d.js';
import { ChessAI } from './chess_ai.js';

export const M3_ICONS = {
    cube3D: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M21 16.5l-9 5.2-9-5.2V7.5l9-5.2 9 5.2v9zM12 4.1L5 8.1l7 4 7-4-7-4zm-8 5.2v6.2l7 4V13.3L4 9.3zm16 0l-7 4v6.2l7-4V9.3z"/></svg>`,
    grid2D: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 20H4v-4h4v4zm0-6H4v-4h4v4zm0-6H4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4z"/></svg>`,
    smartToy: `<svg class="m3-avatar-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.38-1 1.72V7h4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3h4V5.72c-.6-.34-1-.98-1-1.72a2 2 0 0 1 2-2M7.5 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3m9 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3m-7.5 4h6a1 1 0 0 0 0-2h-6a1 1 0 0 0 0 2"/></svg>`,
    person: `<svg class="m3-avatar-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`,
    kingWhite: `<svg class="m3-avatar-svg" viewBox="0 0 24 24"><path fill="#ffffff" stroke="#94a3b8" stroke-width="1.2" d="M12 2v2m-2-1h4m-3 3c-1.5 0-3 1-3 2.5 0 1.2.8 2 1.8 2.3L9 14h6l-.8-3.2c1-.3 1.8-1.1 1.8-2.3C16 7 14.5 6 13 6h-2zM8 15h8v2H8zm-1 3h10v2H7z"/></svg>`,
    kingBlack: `<svg class="m3-avatar-svg" viewBox="0 0 24 24"><path fill="#94a3b8" stroke="#475569" stroke-width="1.2" d="M12 2v2m-2-1h4m-3 3c-1.5 0-3 1-3 2.5 0 1.2.8 2 1.8 2.3L9 14h6l-.8-3.2c1-.3 1.8-1.1 1.8-2.3C16 7 14.5 6 13 6h-2zM8 15h8v2H8zm-1 3h10v2H7z"/></svg>`,
    skipFirst: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>`,
    chevronPrev: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>`,
    chevronNext: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`,
    skipLatest: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>`,
    undo: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>`,
    navGame: `<svg class="m3-nav-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8 14H5v-4h6v4zm0-6H5V7h6v4zm8 6h-6v-4h6v4zm0-6h-6V7h6v4z"/></svg>`,
    navPlay: `<svg class="m3-nav-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>`,
    navAnalysis: `<svg class="m3-nav-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>`,
    navRooms: `<svg class="m3-nav-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/></svg>`,
    search: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`,
    lock: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>`,
    bolt: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66s.19-.34.22-.38L14 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15L11 21z"/></svg>`,
    settings: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.44.17-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`,
    drawHandshake: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M18 11.2h-2.4l-2.1-2.1c-.4-.4-1-.4-1.4 0L8.7 12.5c-.4.4-.4 1 0 1.4l3.5 3.5c.4.4 1 .4 1.4 0l4.4-4.4c.4-.4.4-1 0-1.4l-.0-.4zM12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"/></svg>`,
    flagResign: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>`,
    replay: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>`,
    palette: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19.4c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.9-1.9C9.25 19.57 10.58 20 12 20c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`,
    videocam: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`,
    volumeUp: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`,
    volumeOff: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`,
    copy: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`,
    visibility: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`,
    description: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`,
    send: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`,
    close: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
    play: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>`,
    pause: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
    speed: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.27-10.44zm-9.79 6.84a2 2 0 0 0 2.83 0l5.66-8.49-8.49 5.66a2 2 0 0 0 0 2.83z"/></svg>`,
    infinity: `<svg class="chess-m3-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M18.6 6.62c-1.44 0-2.8.56-3.77 1.53L12 10.66 10.48 12h.01L7.8 14.39c-.64.64-1.49.99-2.4.99-1.87 0-3.39-1.51-3.39-3.38S3.53 8.62 5.4 8.62c.91 0 1.76.35 2.44 1.03l1.13 1 1.51-1.34L9.22 8.2A5.37 5.37 0 0 0 5.4 6.62C2.42 6.62 0 9.04 0 12s2.42 5.38 5.4 5.38c1.44 0 2.8-.56 3.77-1.53l2.83-2.5.01.01L13.52 12h-.01l2.69-2.39c.64-.64 1.49-.99 2.4-.99 1.87 0 3.39 1.51 3.39 3.38s-1.52 3.38-3.39 3.38c-.9 0-1.76-.35-2.44-1.03l-1.14-1.01-1.51 1.34 1.27 1.12a5.386 5.386 0 0 0 3.82 1.57c2.98 0 5.4-2.41 5.4-5.38s-2.42-5.37-5.4-5.37z"/></svg>`,
    // Vector Chess Pieces for Promotion Modal
    promoQueen: `<svg class="chess-promo-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M18 3l-3 4-3-4-3 4-3-4-1 9h16l-1-9zm-6 12c-2.76 0-5 2.24-5 5h10c0-2.76-2.24-5-5-5z"/></svg>`,
    promoKnight: `<svg class="chess-promo-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M19 22H5v-2h14v2M17 19H7v-2h10v2M16.5 10.5c0-.29-.12-.56-.32-.75.52-.63.82-1.4.82-2.25 0-1.93-1.57-3.5-3.5-3.5-.44 0-.85.08-1.23.23L12 2h-2l-.27 2.23C9.35 4.08 8.94 4 8.5 4 6.57 4 5 5.57 5 7.5c0 .85.3 1.62.82 2.25-.2.19-.32.46-.32.75 0 .55.45 1 1 1h.63L8 16h6l.87-4.5h.63c.55 0 1-.45 1-1z"/></svg>`,
    promoRook: `<svg class="chess-promo-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M19 22H5v-2h14v2M17 19H7v-2h10v2M17 8V4h-2v2h-2V4h-2v2H9V4H7v4h1v7h8V8h1z"/></svg>`,
    promoBishop: `<svg class="chess-promo-svg" viewBox="0 0 24 24"><path fill="currentColor" d="M19 22H5v-2h14v2M17 19H7v-2h10v2m-5-17c-.55 0-1 .45-1 1 0 .28.11.53.29.71L10 6c-2 2-2 5 0 7l-1 2h6l-1-2c2-2 2-5 0-7l-1.29-1.29c.18-.18.29-.43.29-.71 0-.55-.45-1-1-1z"/></svg>`
};

export class ChessUI {
    /**
     * @param {HTMLElement} container
     * @param {WebSocket} socket
     * @param {string} localPlayerName
     */
    constructor(container, socket, localPlayerName = 'Jugador') {
        this.container = container;
        this.socket = socket;
        this.localPlayerName = localPlayerName || 'GranMaestro';

        this.engine = new ChessEngine();
        this.ai = new ChessAI();

        // Game mode state
        this.gameMode = 'ai'; // 'ai', 'ai_vs_ai', 'online', 'pass_and_play', 'spectate'
        this.aiLevel = 3;
        this.aiWhiteLevel = 5;
        this.aiBlackLevel = 5;
        this.aiSpeedMode = 'natural'; // 'normal' | 'natural'
        this.aiPaused = false;
        this.aiMatchToken = 0;
        this.aiMoveTimer = null;
        this.playerColor = 'w'; // 'w', 'b', or 'both'
        this.currentViewMode = '2d'; // '2d' or '3d'
        this.currentRoomId = null;
        this.isSpectator = false;
        this.soundEnabled = true;

        // UI state
        this.activeSheet = null;
        this.activePly = 0;
        this.unreadChatCount = 0;
        this.opponentName = 'Motor IA (Nivel 3)';
        this.opponentRating = '1600';
        this.localRating = '1500';

        // Clocks
        this.localTimeMode = 'unlimited'; // 'unlimited' | 'rapid_10_0' | 'blitz_5_3'
        this.unlimitedTime = false;
        this.whiteTimeMs = 300000;
        this.blackTimeMs = 300000;
        this.incrementMs = 0;
        this.clockInterval = null;
        this.lastClockTick = null;
        this.lastCountdownBeepSec = null;

        // Reflection loop prevention flag
        this.isProcessingRemoteMove = false;

        this.initDOM();
        this.initViews();
        this.bindEvents();
        this.setupSocketHandlers();
        this.updatePlayerLabels();
        this.updateStatusBanner();
        this.updateCapturedTray();
        this.updateEvaluationBar();
        this.updateMoveTicker();
    }

    initDOM() {
        this.container.innerHTML = `
            <div class="chess-app-layout">
                <!-- Row 1: Compact Material 3 Android App Bar (48px) -->
                <header class="chess-mobile-appbar">
                    <button id="chess-nav-back" class="chess-nav-back-btn" aria-label="Volver al Portal" title="Volver al Portal">
                        <svg class="chess-svg-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
                    </button>
                    <div class="chess-appbar-title-group">
                        <span class="chess-appbar-title">Grandmaster Chess</span>
                        <span class="chess-appbar-subtitle" id="chess-game-mode-subtitle">vs Motor IA (Nivel 3)</span>
                    </div>
                    <div class="chess-appbar-actions">
                        <button id="chess-btn-toggle-view" class="chess-pill-btn" aria-label="Cambiar vista 2D/3D" title="Alternar Vista 2D / 3D">
                            <span id="chess-view-label">${M3_ICONS.cube3D} 3D</span>
                        </button>
                        <button id="chess-btn-flip" class="chess-icon-btn" aria-label="Girar tablero" title="Girar tablero">
                            <svg class="chess-svg-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
                        </button>
                        <button id="chess-btn-options" class="chess-icon-btn" aria-label="Opciones de partida" title="Opciones de partida">
                            ${M3_ICONS.settings}
                        </button>
                    </div>
                </header>

                <!-- Row 2: Top Opponent Card (44px) -->
                <div class="chess-player-card top" id="chess-player-top">
                    <div class="chess-player-left">
                        <div class="chess-avatar-box">
                            <span id="chess-top-avatar-icon">${M3_ICONS.smartToy}</span>
                            <span class="chess-status-dot bot" id="chess-top-status-dot"></span>
                        </div>
                        <div class="chess-player-meta">
                            <div class="chess-player-header-line">
                                <span class="chess-player-name" id="chess-top-name">Motor IA</span>
                                <span class="chess-rating-badge" id="chess-top-rating">1600</span>
                            </div>
                            <div class="chess-captured-line">
                                <span class="chess-captured-tray" id="chess-top-captured"></span>
                                <span class="chess-material-diff hidden" id="chess-top-diff"></span>
                            </div>
                        </div>
                    </div>
                    <div class="chess-clock-pill" id="chess-top-clock">05:00</div>
                </div>

                <!-- Row 3: Board Arena & Real-time Vertical Evaluation Bar (1fr) -->
                <div class="chess-arena-wrapper">
                    <!-- Real-time 6px vertical Evaluation Bar -->
                    <div id="chess-eval-bar" title="Evaluación en tiempo real">
                        <div id="chess-eval-fill"></div>
                        <div id="chess-eval-badge">0.0</div>
                    </div>

                    <!-- 1:1 Responsive Board Arena -->
                    <div class="chess-canvas-container" id="chess-canvas-box">
                        <canvas id="chess-canvas-2d"></canvas>
                        <canvas id="chess-canvas-3d" style="display: none;"></canvas>

                        <!-- Promotion Modal Sheet -->
                        <div id="chess-promotion-modal" class="chess-modal-overlay" style="display: none;">
                            <div class="chess-promotion-box">
                                <div class="chess-promo-title">Coronación de Peón</div>
                                <div class="chess-promo-options">
                                    <button class="chess-promo-btn" data-piece="q" title="Dama">${M3_ICONS.promoQueen}</button>
                                    <button class="chess-promo-btn" data-piece="n" title="Caballo">${M3_ICONS.promoKnight}</button>
                                    <button class="chess-promo-btn" data-piece="r" title="Torre">${M3_ICONS.promoRook}</button>
                                    <button class="chess-promo-btn" data-piece="b" title="Alfil">${M3_ICONS.promoBishop}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Row 4: Bottom Player Card (44px) -->
                <div class="chess-player-card bottom" id="chess-player-bottom">
                    <div class="chess-player-left">
                        <div class="chess-avatar-box">
                            <span id="chess-bottom-avatar-icon">${M3_ICONS.person}</span>
                            <span class="chess-status-dot online" id="chess-bottom-status-dot"></span>
                        </div>
                        <div class="chess-player-meta">
                            <div class="chess-player-header-line">
                                <span class="chess-player-name" id="chess-bottom-name">${this.localPlayerName}</span>
                                <span class="chess-rating-badge" id="chess-bottom-rating">1500</span>
                            </div>
                            <div class="chess-captured-line">
                                <span class="chess-captured-tray" id="chess-bottom-captured"></span>
                                <span class="chess-material-diff hidden" id="chess-bottom-diff"></span>
                            </div>
                        </div>
                    </div>
                    <div class="chess-clock-pill" id="chess-bottom-clock">05:00</div>
                </div>

                <!-- Row 5: 1-Line SAN Move Ticker & Traversal Controls (38px) -->
                <div class="chess-move-ticker" id="chess-move-ticker">
                    <button id="chess-ticker-first" class="chess-ticker-btn" title="Primera jugada" aria-label="Primera jugada">${M3_ICONS.skipFirst}</button>
                    <button id="chess-ticker-prev" class="chess-ticker-btn" title="Jugada anterior" aria-label="Jugada anterior">${M3_ICONS.chevronPrev}</button>
                    <div class="chess-ticker-moves" id="chess-ticker-feed"></div>
                    <button id="chess-ticker-next" class="chess-ticker-btn" title="Jugada siguiente" aria-label="Jugada siguiente">${M3_ICONS.chevronNext}</button>
                    <button id="chess-ticker-latest" class="chess-ticker-btn" title="Última jugada" aria-label="Última jugada">${M3_ICONS.skipLatest}</button>
                    <button id="chess-ticker-undo" class="chess-ticker-undo" title="Deshacer última jugada">${M3_ICONS.undo} Deshacer</button>
                    <div id="chess-aivsai-controls" class="chess-aivsai-controls hidden">
                        <button id="chess-aivsai-pause" class="chess-aivsai-pill" title="Pausar / Reanudar">${M3_ICONS.pause}<span>Pausar</span></button>
                        <button id="chess-aivsai-speed" class="chess-aivsai-pill tonal" title="Cambiar velocidad">${M3_ICONS.speed}<span>Natural</span></button>
                    </div>
                </div>

                <!-- Row 6: Docked Material 3 Bottom Navigation Bar (56px) -->
                <nav class="chess-bottom-nav" id="chess-bottom-nav" role="navigation" aria-label="Navegación de ajedrez">
                    <button class="chess-nav-item active" data-sheet="none" data-tab="game">
                        <div class="chess-nav-indicator"></div>
                        <span class="chess-nav-icon">${M3_ICONS.navGame}</span>
                        <span class="chess-nav-label">Partida</span>
                    </button>
                    <button class="chess-nav-item" data-sheet="sheet-play" data-tab="play">
                        <div class="chess-nav-indicator"></div>
                        <span class="chess-nav-icon">${M3_ICONS.navPlay}</span>
                        <span class="chess-nav-label">Jugar</span>
                    </button>
                    <button class="chess-nav-item" data-sheet="sheet-analysis" data-tab="analysis">
                        <div class="chess-nav-indicator"></div>
                        <span class="chess-nav-icon">${M3_ICONS.navAnalysis}</span>
                        <span class="chess-nav-label">Movimientos</span>
                    </button>
                    <button class="chess-nav-item" data-sheet="sheet-rooms" data-tab="rooms">
                        <div class="chess-nav-indicator"></div>
                        <span class="chess-nav-icon">${M3_ICONS.navRooms}</span>
                        <span class="chess-nav-label">Salas & Chat</span>
                        <span class="chess-nav-badge" id="chess-chat-unread-badge">0</span>
                    </button>
                </nav>
            </div>

            <!-- Slide-Up Modal Bottom Sheets Container -->
            <div id="chess-bottom-sheet-container">
                <!-- Sheet 1: Play & Matchmaking -->
                <div class="chess-bottom-sheet" id="sheet-play">
                    <div class="chess-sheet-drag-handle"></div>
                    <div class="chess-sheet-header">
                        <div class="chess-sheet-title">${M3_ICONS.bolt} Emparejamiento & Juego</div>
                        <button class="chess-sheet-close" data-close="sheet-play">${M3_ICONS.close}</button>
                    </div>
                    <div class="chess-sheet-body">
                        <div class="chess-m3-card">
                            <div class="chess-section-title">${M3_ICONS.infinity} Control de Tiempo (Local / IA)</div>
                            <div class="chess-segmented-group" id="chess-local-tc-group">
                                <button class="chess-seg-btn chess-local-tc-btn selected" data-local-tc="unlimited">∞ Sin límite</button>
                                <button class="chess-seg-btn chess-local-tc-btn" data-local-tc="rapid_10_0">10+0 Rápida</button>
                                <button class="chess-seg-btn chess-local-tc-btn" data-local-tc="blitz_5_3">5+3 Blitz</button>
                            </div>
                        </div>

                        <div class="chess-m3-card">
                            <div class="chess-section-title">${M3_ICONS.smartToy} Jugar vs Motor IA</div>
                            <div class="chess-ai-row">
                                <label for="chess-ai-select" class="chess-field-label">Dificultad</label>
                                <div class="chess-select-wrap">
                                    <select id="chess-ai-select" class="chess-select">
                                        <option value="1">Nivel 1: Principiante (ELO 800)</option>
                                        <option value="2">Nivel 2: Casual (ELO 1200)</option>
                                        <option value="3" selected>Nivel 3: Intermedio (ELO 1600)</option>
                                        <option value="4">Nivel 4: Avanzado (ELO 2000)</option>
                                        <option value="5">Nivel 5: Gran Maestro (ELO 2400)</option>
                                    </select>
                                </div>
                            </div>
                            <div class="chess-ai-color-row">
                                <button class="chess-btn chess-btn-outline" id="chess-btn-ai-white">${M3_ICONS.kingWhite} Jugar Blancas</button>
                                <button class="chess-btn chess-btn-outline" id="chess-btn-ai-black">${M3_ICONS.kingBlack} Jugar Negras</button>
                            </div>
                        </div>

                        <div class="chess-m3-card chess-m3-card-accent">
                            <div class="chess-section-title">${M3_ICONS.visibility} Modo Visualización: IA vs IA</div>
                            <div class="chess-ai-vs-ai-grid">
                                <div class="chess-ai-field">
                                    <label for="chess-ai-white-select" class="chess-field-label">${M3_ICONS.kingWhite} IA Blancas</label>
                                    <div class="chess-select-wrap">
                                        <select id="chess-ai-white-select" class="chess-select">
                                            <option value="1">Nv.1 Principiante (800)</option>
                                            <option value="2">Nv.2 Casual (1200)</option>
                                            <option value="3">Nv.3 Intermedio (1600)</option>
                                            <option value="4">Nv.4 Avanzado (2000)</option>
                                            <option value="5" selected>Nv.5 Gran Maestro (2400)</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="chess-ai-field">
                                    <label for="chess-ai-black-select" class="chess-field-label">${M3_ICONS.kingBlack} IA Negras</label>
                                    <div class="chess-select-wrap">
                                        <select id="chess-ai-black-select" class="chess-select">
                                            <option value="1">Nv.1 Principiante (800)</option>
                                            <option value="2">Nv.2 Casual (1200)</option>
                                            <option value="3">Nv.3 Intermedio (1600)</option>
                                            <option value="4">Nv.4 Avanzado (2000)</option>
                                            <option value="5" selected>Nv.5 Gran Maestro (2400)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div class="chess-ai-row" style="margin-top: 10px;">
                                <span class="chess-field-label">${M3_ICONS.speed} Velocidad</span>
                                <div class="chess-segmented-group" id="chess-speed-group" style="flex:1;">
                                    <button class="chess-seg-btn chess-speed-btn" data-speed="normal">Normal</button>
                                    <button class="chess-seg-btn chess-speed-btn selected" data-speed="natural">Natural (3–6s)</button>
                                </div>
                            </div>
                            <button id="chess-btn-ai-vs-ai" class="chess-btn chess-btn-primary chess-full-width" style="margin-top: 6px;">
                                ${M3_ICONS.play} Ver Partida IA vs IA
                            </button>
                        </div>

                        <div class="chess-m3-card">
                            <div class="chess-section-title">${M3_ICONS.bolt} Partida Rápida Online</div>
                            <div class="chess-time-presets">
                                <button class="chess-preset-btn" data-tc="bullet_1_0">1+0 Bullet</button>
                                <button class="chess-preset-btn" data-tc="blitz_3_0">3+0 Blitz</button>
                                <button class="chess-preset-btn selected" data-tc="blitz_5_3">5+3 Blitz</button>
                                <button class="chess-preset-btn" data-tc="rapid_10_0">10+0 Rápida</button>
                            </div>
                            <button id="chess-btn-queue-join" class="chess-btn chess-btn-success chess-full-width">
                                ${M3_ICONS.search} Buscar Partida
                            </button>
                        </div>

                        <div class="chess-m3-card">
                            <div class="chess-section-title">${M3_ICONS.lock} Sala Privada con PIN</div>
                            <div class="chess-private-row">
                                <button id="chess-btn-create-private" class="chess-btn chess-btn-primary">
                                    Crear Sala
                                </button>
                                <input type="text" id="chess-input-pin" maxlength="4" placeholder="PIN 4 dígitos" class="chess-pin-input">
                                <button id="chess-btn-join-pin" class="chess-btn chess-btn-outline">
                                    Unirse
                                </button>
                            </div>
                            <div id="chess-private-info" class="chess-help-text"></div>
                        </div>
                    </div>
                </div>

                <!-- Sheet 2: Options & Settings -->
                <div class="chess-bottom-sheet" id="sheet-options">
                    <div class="chess-sheet-drag-handle"></div>
                    <div class="chess-sheet-header">
                        <div class="chess-sheet-title">${M3_ICONS.settings} Opciones de Partida</div>
                        <button class="chess-sheet-close" data-close="sheet-options">${M3_ICONS.close}</button>
                    </div>
                    <div class="chess-sheet-body">
                        <div class="chess-section-title">Acciones de Partida</div>
                        <div class="chess-options-grid">
                            <button id="chess-btn-draw" class="chess-btn chess-btn-outline">${M3_ICONS.drawHandshake} Ofrecer Tablas</button>
                            <button id="chess-btn-resign" class="chess-btn chess-btn-danger">${M3_ICONS.flagResign} Rendirse</button>
                            <button id="chess-btn-rematch" class="chess-btn chess-btn-primary" style="display:none;">${M3_ICONS.replay} Revancha</button>
                        </div>

                        <div class="chess-divider"></div>

                        <div class="chess-section-title">${M3_ICONS.palette} Tema del Tablero</div>
                        <div class="chess-ai-row">
                            <div class="chess-select-wrap">
                                <select id="chess-select-theme" class="chess-select">
                                    <option value="walnut_maple" selected>Nogal Oscuro y Arce Clásico (Madera de Lujo)</option>
                                    <option value="carrara_marquina">Mármol Carrara & Marquina Negro (Mármol Pulido)</option>
                                    <option value="midnight_obsidian">Obsidiana & Amatista Medianoche</option>
                                </select>
                            </div>
                        </div>

                        <div class="chess-divider"></div>

                        <div class="chess-section-title">${M3_ICONS.videocam} Ajuste de Cámara 3D</div>
                        <div class="chess-options-grid">
                            <button id="chess-cam-angled" class="chess-btn chess-btn-outline">Vista 3D Dinámica (56°)</button>
                            <button id="chess-cam-topdown" class="chess-btn chess-btn-outline">Vista Cenital Torneo (84°)</button>
                            <button id="chess-cam-cinematic" class="chess-btn chess-btn-outline">Vista Cinemática (32°)</button>
                        </div>

                        <div class="chess-divider"></div>

                        <div class="chess-section-title">${M3_ICONS.volumeUp} Efectos de Audio</div>
                        <button id="chess-btn-toggle-sound" class="chess-btn chess-btn-outline chess-full-width">
                            ${M3_ICONS.volumeUp} Sonido Activado
                        </button>
                    </div>
                </div>

                <!-- Sheet 3: Score-sheet, Analysis & Export -->
                <div class="chess-bottom-sheet" id="sheet-analysis">
                    <div class="chess-sheet-drag-handle"></div>
                    <div class="chess-sheet-header">
                        <div class="chess-sheet-title">${M3_ICONS.description} Notación & Exportación</div>
                        <button class="chess-sheet-close" data-close="sheet-analysis">${M3_ICONS.close}</button>
                    </div>
                    <div class="chess-sheet-body">
                        <div class="chess-section-title">Tabla de Movimientos (SAN)</div>
                        <div class="chess-moves-container" id="chess-moves-feed">
                            <table class="chess-moves-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Blancas</th>
                                        <th>Negras</th>
                                    </tr>
                                </thead>
                                <tbody id="chess-moves-body"></tbody>
                            </table>
                        </div>

                        <div class="chess-section-title">Cadena FEN Actual</div>
                        <div class="chess-code-box" id="chess-fen-box">rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1</div>
                        <div class="chess-copy-row">
                            <button id="chess-btn-copy-fen" class="chess-btn chess-btn-outline">${M3_ICONS.copy} Copiar FEN</button>
                        </div>

                        <div class="chess-section-title">Notación PGN Completa</div>
                        <div class="chess-code-box" id="chess-pgn-box">[Event "Grandmaster Chess"]</div>
                        <div class="chess-copy-row">
                            <button id="chess-btn-copy-pgn" class="chess-btn chess-btn-outline">${M3_ICONS.copy} Copiar PGN</button>
                        </div>
                    </div>
                </div>

                <!-- Sheet 4: Rooms, Spectators & Live Chat -->
                <div class="chess-bottom-sheet" id="sheet-rooms">
                    <div class="chess-sheet-drag-handle"></div>
                    <div class="chess-sheet-header">
                        <div class="chess-sheet-title">${M3_ICONS.navRooms} Salas & Retransmisiones</div>
                        <button class="chess-sheet-close" data-close="sheet-rooms">${M3_ICONS.close}</button>
                    </div>
                    <div class="chess-sheet-body">
                        <div class="chess-section-title">Chat de la Partida</div>
                        <div class="chess-chat-feed" id="chess-chat-messages">
                            <div class="chess-chat-msg system">¡Bienvenido a Grandmaster Chess!</div>
                        </div>
                        <div class="chess-chat-bar">
                            <input type="text" id="chess-chat-input" placeholder="Escribe un mensaje..." maxlength="120">
                            <button id="chess-btn-chat-send" class="chess-btn chess-btn-primary">${M3_ICONS.send}</button>
                        </div>

                        <div class="chess-divider"></div>

                        <div class="chess-section-title">${M3_ICONS.visibility} Retransmisiones en Directo</div>
                        <div class="chess-spectator-list" id="chess-spectator-games">
                            <span class="chess-empty-text">Buscando partidas públicas...</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Toast feedback element -->
            <div id="chess-toast" class="chess-toast"></div>
        `;
    }

    initViews() {
        const c2d = this.container.querySelector('#chess-canvas-2d');
        const c3d = this.container.querySelector('#chess-canvas-3d');

        const canInteract = () => {
            if (this.isSpectator || this.gameMode === 'ai_vs_ai') return false;
            if (this.gameMode === 'ai' && this.engine.turn !== this.playerColor) return false;
            return true;
        };

        this.view2D = new ChessView2D(c2d, {
            orientation: this.playerColor === 'b' ? 'b' : 'w',
            canInteract,
            onMoveAttempt: (from, to, promo, res) => {
                if (this.isProcessingRemoteMove) return;
                this.handleLocalMove(from, to, promo, res);
            },
            onPromotionNeeded: (from, to, callback) => this.promptPromotion(callback)
        });

        this.view3D = new ChessView3D(c3d, {
            orientation: this.playerColor === 'b' ? 'b' : 'w',
            canInteract,
            onMoveAttempt: (from, to, promo, res) => {
                if (this.isProcessingRemoteMove) return;
                this.handleLocalMove(from, to, promo, res);
            },
            onPromotionNeeded: (from, to, callback) => this.promptPromotion(callback)
        });

        this.audio = this.view2D.audio;
        this.view2D.attachEngine(this.engine);
        this.view3D.attachEngine(this.engine);
    }

    bindEvents() {
        // Back navigation to main portal
        const backBtn = this.container.querySelector('#chess-nav-back');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                const modal = document.getElementById('chess-app-modal');
                if (modal) modal.classList.add('hidden');
                const portal = document.getElementById('portal-hub-modal');
                if (portal) portal.classList.remove('hidden');
                if (window.VoxelAndroid && typeof window.VoxelAndroid.setOrientation === 'function') {
                    window.VoxelAndroid.setOrientation('auto');
                }
                if (screen.orientation && typeof screen.orientation.unlock === 'function') {
                    try { screen.orientation.unlock(); } catch (_) {}
                }
            });
        }

        // Toggle 2D / 3D
        const toggleBtn = this.container.querySelector('#chess-btn-toggle-view');
        const viewLabel = this.container.querySelector('#chess-view-label');
        const c2d = this.container.querySelector('#chess-canvas-2d');
        const c3d = this.container.querySelector('#chess-canvas-3d');

        toggleBtn.addEventListener('click', () => {
            if (this.currentViewMode === '2d') {
                this.currentViewMode = '3d';
                c2d.style.display = 'none';
                c3d.style.display = 'block';
                viewLabel.innerHTML = `${M3_ICONS.grid2D} 2D`;
                this.view3D.resize();
                this.view3D.syncPieces();
                this.showToast('Vista 3D activada');
            } else {
                this.currentViewMode = '2d';
                c3d.style.display = 'none';
                c2d.style.display = 'block';
                viewLabel.innerHTML = `${M3_ICONS.cube3D} 3D`;
                this.view2D.resize();
                this.view2D.render();
                this.showToast('Vista 2D activada');
            }
        });

        // Flip board
        this.container.querySelector('#chess-btn-flip').addEventListener('click', () => {
            const next = this.view2D.orientation === 'w' ? 'b' : 'w';
            this.view2D.setOrientation(next);
            this.view3D.setOrientation(next);
            this.updatePlayerLabels();
            this.triggerHaptic('move');
        });

        // Options button in App Bar opens sheet-options
        this.container.querySelector('#chess-btn-options').addEventListener('click', () => {
            this.openSheet('sheet-options');
        });

        // Bottom Navigation Bar tabs
        const navItems = this.container.querySelectorAll('.chess-nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const sheet = item.dataset.sheet;
                if (sheet === 'none') {
                    this.closeSheets();
                } else if (sheet) {
                    if (this.activeSheet === sheet) {
                        this.closeSheets();
                    } else {
                        this.openSheet(sheet);
                    }
                }
            });
        });

        // Bottom Sheet Close Buttons
        this.container.querySelectorAll('.chess-sheet-close').forEach(btn => {
            btn.addEventListener('click', () => this.closeSheets());
        });

        // Backdrop click dismisses bottom sheet
        const sheetContainer = this.container.querySelector('#chess-bottom-sheet-container');
        sheetContainer.addEventListener('click', (e) => {
            if (e.target === sheetContainer) {
                this.closeSheets();
            }
        });

        // Swipe-down gesture on Bottom Sheets
        this.setupSheetGestures();

        // Time presets in matchmaking
        const presets = this.container.querySelectorAll('.chess-preset-btn');
        presets.forEach(btn => {
            btn.addEventListener('click', () => {
                presets.forEach(p => p.classList.remove('selected'));
                btn.classList.add('selected');
            });
        });

        // Matchmaking search
        const queueBtn = this.container.querySelector('#chess-btn-queue-join');
        queueBtn.addEventListener('click', () => {
            const sel = this.container.querySelector('.chess-preset-btn.selected');
            const tc = sel ? sel.dataset.tc : 'blitz_5_3';

            if (queueBtn.classList.contains('in-queue')) {
                this.sendPacket('chess_leave_queue', {});
                queueBtn.classList.remove('in-queue');
                queueBtn.innerHTML = `${M3_ICONS.search} Buscar Partida`;
                this.showToast('Búsqueda cancelada');
            } else {
                this.sendPacket('chess_join_queue', { timeControl: tc, name: this.localPlayerName });
                queueBtn.classList.add('in-queue');
                queueBtn.innerHTML = `${M3_ICONS.bolt} Cancelar Búsqueda...`;
                this.showToast('Buscando oponente online...');
            }
        });

        // Create Private Room
        this.container.querySelector('#chess-btn-create-private').addEventListener('click', () => {
            const sel = this.container.querySelector('.chess-preset-btn.selected');
            const tc = sel ? sel.dataset.tc : 'blitz_5_3';
            this.sendPacket('chess_create_room', { timeControl: tc, name: this.localPlayerName });
            this.showToast('Creando sala privada...');
        });

        // Join PIN Room
        this.container.querySelector('#chess-btn-join-pin').addEventListener('click', () => {
            const pin = this.container.querySelector('#chess-input-pin').value.trim();
            if (pin.length >= 4) {
                this.sendPacket('chess_join_room', { roomId: pin, pin, name: this.localPlayerName });
                this.showToast(`Uniéndose a sala con PIN ${pin}...`);
            } else {
                this.showToast('Introduce un PIN de 4 dígitos');
            }
        });

        // Local Time Control selector (Sin límite / 10+0 / 5+3)
        const localTcBtns = this.container.querySelectorAll('.chess-local-tc-btn');
        localTcBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                localTcBtns.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.localTimeMode = btn.dataset.localTc || 'unlimited';
            });
        });

        // AI vs AI Speed selector (Normal / Natural 3-6s)
        const speedBtns = this.container.querySelectorAll('.chess-speed-btn');
        speedBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.setAISpeedMode(btn.dataset.speed || 'natural');
            });
        });

        // AI Game buttons
        this.container.querySelector('#chess-btn-ai-white').addEventListener('click', () => {
            this.startAIGame('w');
            this.closeSheets();
        });
        this.container.querySelector('#chess-btn-ai-black').addEventListener('click', () => {
            this.startAIGame('b');
            this.closeSheets();
        });

        // AI vs AI Spectator Mode button
        this.container.querySelector('#chess-btn-ai-vs-ai').addEventListener('click', () => {
            this.startAIVsAIGame();
            this.closeSheets();
        });

        // Live AI vs AI Pause/Resume & Speed toggle
        const aiPauseBtn = this.container.querySelector('#chess-aivsai-pause');
        if (aiPauseBtn) {
            aiPauseBtn.addEventListener('click', () => this.toggleAIVsAIPause());
        }
        const aiSpeedBtn = this.container.querySelector('#chess-aivsai-speed');
        if (aiSpeedBtn) {
            aiSpeedBtn.addEventListener('click', () => {
                this.setAISpeedMode(this.aiSpeedMode === 'natural' ? 'normal' : 'natural');
            });
        }

        // Draw & Resign & Rematch
        this.container.querySelector('#chess-btn-draw').addEventListener('click', () => {
            if (this.gameMode === 'online') {
                this.sendPacket('chess_offer_draw', {});
                this.addChatMessage('Has ofrecido tablas al oponente.', 'system');
                this.showToast('Oferta de tablas enviada');
                this.closeSheets();
            } else {
                this.showToast('Solo disponible en partidas online');
            }
        });

        this.container.querySelector('#chess-btn-resign').addEventListener('click', () => {
            if (this.gameMode === 'ai_vs_ai') {
                this.clearAITimers();
                this.stopClock();
                this.aiPaused = true;
                this.updateStatusBanner('IA vs IA detenida');
                this.showToast('Partida IA vs IA detenida');
                this.closeSheets();
                return;
            }
            if (confirm('¿Estás seguro de que deseas rendirte?')) {
                if (this.gameMode === 'online') {
                    this.sendPacket('chess_resign', {});
                } else if (this.gameMode === 'ai') {
                    this.endGame('Rendición', this.playerColor === 'w' ? 'b' : 'w');
                }
                this.closeSheets();
            }
        });

        const rematchBtn = this.container.querySelector('#chess-btn-rematch');
        rematchBtn.addEventListener('click', () => {
            if (this.gameMode === 'online') {
                this.sendPacket('chess_rematch', {});
                this.showToast('Solicitud de revancha enviada');
                rematchBtn.style.display = 'none';
            } else if (this.gameMode === 'ai') {
                this.startAIGame(this.playerColor === 'w' ? 'b' : 'w');
            } else if (this.gameMode === 'ai_vs_ai') {
                this.startAIVsAIGame();
            }
            this.closeSheets();
        });

        // Theme selector
        const themeSelect = this.container.querySelector('#chess-select-theme');
        if (themeSelect) {
            themeSelect.addEventListener('change', () => {
                const val = themeSelect.value;
                if (typeof this.view3D.setTheme === 'function') {
                    this.view3D.setTheme(val);
                }
                this.showToast(`Tema cambiado: ${themeSelect.options[themeSelect.selectedIndex].text}`);
            });
        }

        // Camera Presets
        const camAngled = this.container.querySelector('#chess-cam-angled');
        const camTopdown = this.container.querySelector('#chess-cam-topdown');
        const camCinematic = this.container.querySelector('#chess-cam-cinematic');

        if (camAngled) {
            camAngled.addEventListener('click', () => {
                if (typeof this.view3D.setCameraPreset === 'function') this.view3D.setCameraPreset('angled');
                this.showToast('Cámara: 3D Dinámica (56°)');
            });
        }
        if (camTopdown) {
            camTopdown.addEventListener('click', () => {
                if (typeof this.view3D.setCameraPreset === 'function') this.view3D.setCameraPreset('topdown');
                this.showToast('Cámara: Cenital 2.5D (84°)');
            });
        }
        if (camCinematic) {
            camCinematic.addEventListener('click', () => {
                if (typeof this.view3D.setCameraPreset === 'function') this.view3D.setCameraPreset('cinematic');
                this.showToast('Cámara: Heroica Cinemática (32°)');
            });
        }

        // Sound Toggle
        const soundBtn = this.container.querySelector('#chess-btn-toggle-sound');
        soundBtn.addEventListener('click', () => {
            this.soundEnabled = !this.soundEnabled;
            soundBtn.innerHTML = this.soundEnabled ? `${M3_ICONS.volumeUp} Sonido Activado` : `${M3_ICONS.volumeOff} Sonido Desactivado`;
            this.showToast(this.soundEnabled ? 'Sonido activado' : 'Sonido silenciado');
        });

        // Copy FEN & Copy PGN
        this.container.querySelector('#chess-btn-copy-fen').addEventListener('click', () => {
            const fen = this.engine.getFen();
            navigator.clipboard.writeText(fen).then(() => {
                this.showToast('FEN copiado al portapapeles');
            }).catch(() => {
                this.showToast('FEN: ' + fen);
            });
        });

        this.container.querySelector('#chess-btn-copy-pgn').addEventListener('click', () => {
            const pgn = this.engine.exportPgn({
                White: this.playerColor === 'w' ? this.localPlayerName : this.opponentName,
                Black: this.playerColor === 'b' ? this.localPlayerName : this.opponentName
            });
            navigator.clipboard.writeText(pgn).then(() => {
                this.showToast('PGN copiado al portapapeles');
            }).catch(() => {
                this.showToast('PGN listo');
            });
        });

        // Move Ticker Traversal buttons
        this.container.querySelector('#chess-ticker-first').addEventListener('click', () => {
            this.goToPly(0);
        });
        this.container.querySelector('#chess-ticker-prev').addEventListener('click', () => {
            this.goToPly(Math.max(0, this.activePly - 1));
        });
        this.container.querySelector('#chess-ticker-next').addEventListener('click', () => {
            this.goToPly(Math.min(this.engine.history.length, this.activePly + 1));
        });
        this.container.querySelector('#chess-ticker-latest').addEventListener('click', () => {
            this.goToPly(this.engine.history.length);
        });

        // Single-player Undo button
        this.container.querySelector('#chess-ticker-undo').addEventListener('click', () => {
            this.handleUndo();
        });

        // Chat send
        const chatInput = this.container.querySelector('#chess-chat-input');
        const sendChat = () => {
            const text = chatInput.value.trim();
            if (text && this.gameMode === 'online') {
                this.sendPacket('chess_chat', { text });
                chatInput.value = '';
            }
        };
        this.container.querySelector('#chess-btn-chat-send').addEventListener('click', sendChat);
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendChat();
        });

        // Window & container resize
        window.addEventListener('resize', () => {
            this.view2D.resize();
            this.view3D.resize();
        });
        const canvasBox = this.container.querySelector('#chess-canvas-box');
        if (canvasBox && typeof ResizeObserver !== 'undefined') {
            this._resizeObserver = new ResizeObserver(() => {
                if (this.currentViewMode === '2d') {
                    this.view2D.resize();
                } else {
                    this.view3D.resize();
                }
            });
            this._resizeObserver.observe(canvasBox);
        }
    }

    setupSheetGestures() {
        const sheets = this.container.querySelectorAll('.chess-bottom-sheet');
        sheets.forEach(sheet => {
            let startY = 0;
            let currentY = 0;
            let isDragging = false;

            const handle = sheet.querySelector('.chess-sheet-drag-handle') || sheet.querySelector('.chess-sheet-header');
            if (!handle) return;

            handle.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    startY = e.touches[0].clientY;
                    currentY = startY;
                    isDragging = true;
                }
            }, { passive: true });

            handle.addEventListener('touchmove', (e) => {
                if (!isDragging || e.touches.length !== 1) return;
                currentY = e.touches[0].clientY;
                const deltaY = currentY - startY;
                if (deltaY > 0) {
                    sheet.style.transform = `translateY(${deltaY}px)`;
                }
            }, { passive: true });

            const endDrag = () => {
                if (!isDragging) return;
                isDragging = false;
                const deltaY = currentY - startY;
                sheet.style.transform = '';
                if (deltaY > 80) {
                    this.closeSheets();
                }
            };

            handle.addEventListener('touchend', endDrag);
            handle.addEventListener('touchcancel', endDrag);
        });
    }

    openSheet(sheetId) {
        this.activeSheet = sheetId;
        const container = this.container.querySelector('#chess-bottom-sheet-container');
        container.classList.add('active');

        this.container.querySelectorAll('.chess-bottom-sheet').forEach(s => {
            if (s.id === sheetId) s.classList.add('open');
            else s.classList.remove('open');
        });

        // Update nav item highlighting
        this.container.querySelectorAll('.chess-nav-item').forEach(item => {
            if (item.dataset.sheet === sheetId) item.classList.add('active');
            else item.classList.remove('active');
        });

        // If opening analysis sheet, refresh FEN/PGN preview
        if (sheetId === 'sheet-analysis') {
            const fenBox = this.container.querySelector('#chess-fen-box');
            if (fenBox) fenBox.textContent = this.engine.getFen();
            const pgnBox = this.container.querySelector('#chess-pgn-box');
            if (pgnBox) {
                pgnBox.textContent = this.engine.exportPgn({
                    White: this.playerColor === 'w' ? this.localPlayerName : this.opponentName,
                    Black: this.playerColor === 'b' ? this.localPlayerName : this.opponentName
                });
            }
        }

        // If opening rooms/chat sheet, clear unread badge and poll public games
        if (sheetId === 'sheet-rooms') {
            this.unreadChatCount = 0;
            const badge = this.container.querySelector('#chess-chat-unread-badge');
            if (badge) {
                badge.textContent = '0';
                badge.classList.remove('active');
            }
            this.sendPacket('chess_list_public_games', {});
        }
    }

    closeSheets() {
        this.activeSheet = null;
        const container = this.container.querySelector('#chess-bottom-sheet-container');
        container.classList.remove('active');

        this.container.querySelectorAll('.chess-bottom-sheet').forEach(s => {
            s.classList.remove('open');
        });

        // Reset nav highlighting to game tab
        this.container.querySelectorAll('.chess-nav-item').forEach(item => {
            if (item.dataset.tab === 'game') item.classList.add('active');
            else item.classList.remove('active');
        });
    }

    showToast(message) {
        const toast = this.container.querySelector('#chess-toast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 2200);
    }

    triggerHaptic(type) {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            try {
                switch (type) {
                    case 'move': navigator.vibrate(15); break;
                    case 'capture': navigator.vibrate(25); break;
                    case 'check': navigator.vibrate([40, 30, 40]); break;
                    case 'gameover': navigator.vibrate([60, 40, 100]); break;
                }
            } catch (_) {}
        }
    }

    setupSocketHandlers() {
        if (!this.socket) return;

        this.socket.addEventListener('message', (event) => {
            try {
                const packet = JSON.parse(event.data);
                if (!packet || typeof packet.type !== 'string' || !packet.type.startsWith('chess_')) return;
                this.handleServerPacket(packet);
            } catch (_) {}
        });

        // Periodically poll active public spectator games
        setInterval(() => {
            if (this.activeSheet === 'sheet-rooms') {
                this.sendPacket('chess_list_public_games', {});
            }
        }, 8000);
    }

    /**
     * Standardized WebSocket transmission helper: always wraps in { type, data }
     */
    sendPacket(type, data = {}) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            try {
                this.socket.send(JSON.stringify({ type, data, timestamp: Date.now() }));
            } catch (_) {}
        }
    }

    handleServerPacket(packet) {
        const d = packet.data || packet;

        switch (packet.type) {
            case 'chess_queue_status':
            case 'chess_room_created': {
                if (d.status === 'room_created' || d.pin) {
                    const pin = d.pin || packet.pin;
                    const info = this.container.querySelector('#chess-private-info');
                    if (info) {
                        info.innerHTML = `⭐ <b>Sala Creada</b>. PIN: <span class="chess-badge-pin">${pin}</span><br>Comparte este PIN de 4 dígitos con tu oponente para jugar.`;
                    }
                    this.currentRoomId = d.roomId || packet.roomId;
                    this.showToast(`Sala creada. PIN: ${pin}`);
                }
                break;
            }

            case 'chess_game_start': {
                this.currentRoomId = d.roomId;
                this.gameMode = 'online';
                this.isSpectator = false;
                this.playerColor = d.yourColor || d.color || 'w';

                // Reset queue button
                const qBtn = this.container.querySelector('#chess-btn-queue-join');
                if (qBtn) {
                    qBtn.classList.remove('in-queue');
                    qBtn.innerHTML = `${M3_ICONS.search} Buscar Partida`;
                }

                // Close any open bottom sheet and return to board
                this.closeSheets();

                // Setup orientation
                this.view2D.setOrientation(this.playerColor);
                this.view3D.setOrientation(this.playerColor);

                // Setup Clocks
                this.clearAITimers();
                this.unlimitedTime = false;
                this.updateTickerModeUI();
                const wSec = d.whiteTime !== undefined ? d.whiteTime : 300;
                const bSec = d.blackTime !== undefined ? d.blackTime : 300;
                this.whiteTimeMs = wSec * 1000;
                this.blackTimeMs = bSec * 1000;
                this.incrementMs = (d.increment || 0) * 1000;
                this.startClock();

                // Reset Engine
                if (d.fen) this.engine.loadFen(d.fen);
                else this.engine.reset();

                this.view2D.attachEngine(this.engine);
                this.view3D.attachEngine(this.engine);
                this.view2D.render();
                this.view3D.syncPieces();

                // Player labels
                const oppName = this.playerColor === 'w' ? (d.black?.name || 'Negras') : (d.white?.name || 'Blancas');
                this.opponentName = oppName;
                this.updatePlayerLabels(
                    this.playerColor === 'w' ? this.localPlayerName : oppName,
                    this.playerColor === 'b' ? this.localPlayerName : oppName
                );

                this.updateStatusBanner();
                this.clearMovesTable();
                this.updateMoveTicker();
                this.updateCapturedTray();
                this.updateEvaluationBar();
                this.addChatMessage(`¡Partida iniciada contra ${oppName}!`, 'system');
                this.showToast(`¡Partida iniciada vs ${oppName}!`);
                this.triggerHaptic('move');
                break;
            }

            case 'chess_move_broadcast': {
                const moveData = d.move || {};
                const from = d.from || moveData.from;
                const to = d.to || moveData.to;
                const promotion = d.promotion || moveData.promotion || 'q';

                // Check if move was already applied locally (e.g. from local turn move)
                if (d.fen && this.engine.getFen() === d.fen) {
                    if (d.whiteTime !== undefined) this.whiteTimeMs = d.whiteTime * 1000;
                    if (d.blackTime !== undefined) this.blackTimeMs = d.blackTime * 1000;
                    this.updateClockDisplays();
                    return;
                }

                // Decouple remote move: prevent handleLocalMove trigger loop
                this.isProcessingRemoteMove = true;
                try {
                    const executed = this.engine.makeMove(from, to, promotion);
                    if (executed || d.fen) {
                        if (!executed && d.fen) {
                            this.engine.loadFen(d.fen);
                        }
                        const effMove = executed || moveData;
                        this.view2D.setLastMove(from, to);
                        if (typeof this.view3D.animateRemoteMove === 'function') {
                            this.view3D.animateRemoteMove(
                                ChessEngine.squareToCoords(from),
                                ChessEngine.squareToCoords(to),
                                from,
                                to,
                                promotion
                            );
                        } else {
                            this.view3D.syncPieces();
                        }
                        this.view2D.render();
                        this.addMoveToTable(effMove);
                        this.updateMoveTicker();
                        this.updateCapturedTray();
                        this.updateEvaluationBar();

                        // Sound & Haptics
                        if (effMove.isCheckmate) {
                            this.triggerHaptic('gameover');
                            if (this.soundEnabled) this.audio.playGameEnd(true);
                        } else if (effMove.isCheck) {
                            this.triggerHaptic('check');
                            if (this.soundEnabled) this.audio.playCheck();
                        } else if (effMove.captured) {
                            this.triggerHaptic('capture');
                            if (this.soundEnabled) this.audio.playCapture();
                        } else {
                            this.triggerHaptic('move');
                            if (this.soundEnabled) this.audio.playMove();
                        }
                    }
                } finally {
                    this.isProcessingRemoteMove = false;
                }

                // Sync authoritative Clocks from broadcast
                if (d.whiteTime !== undefined) this.whiteTimeMs = d.whiteTime * 1000;
                if (d.blackTime !== undefined) this.blackTimeMs = d.blackTime * 1000;
                this.updateClockDisplays();
                this.updateStatusBanner();
                break;
            }

            case 'chess_clock_sync': {
                if (d.whiteTime !== undefined) this.whiteTimeMs = d.whiteTime * 1000;
                if (d.blackTime !== undefined) this.blackTimeMs = d.blackTime * 1000;
                this.updateClockDisplays();
                break;
            }

            case 'chess_game_over': {
                this.stopClock();
                let msg = '';
                if (d.winner === 'draw') {
                    msg = `Tablas: ${d.reason || 'Empate'}`;
                } else {
                    const winnerName = d.winner === 'w' ? 'Blancas' : 'Negras';
                    msg = `¡Victoria para ${winnerName}! ${d.reason || ''}`;
                }
                this.addChatMessage(msg, 'system');
                this.updateStatusBanner(msg);
                this.showToast(msg);
                this.triggerHaptic('gameover');

                const rematchBtn = this.container.querySelector('#chess-btn-rematch');
                if (rematchBtn) rematchBtn.style.display = 'inline-flex';
                break;
            }

            case 'chess_draw_offered': {
                this.showToast('El oponente ofrece tablas');
                if (confirm('Tu oponente te ofrece tablas. ¿Aceptas?')) {
                    this.sendPacket('chess_respond_draw', { accept: true });
                } else {
                    this.sendPacket('chess_respond_draw', { accept: false });
                }
                break;
            }

            case 'chess_draw_declined': {
                this.showToast('Oferta de tablas rechazada');
                this.addChatMessage('El oponente rechazó la oferta de tablas.', 'system');
                break;
            }

            case 'chess_chat_broadcast': {
                this.addChatMessage(`${d.sender}: ${d.text}`, d.isSpectator ? 'spectator' : 'player');
                if (this.activeSheet !== 'sheet-rooms') {
                    this.unreadChatCount++;
                    const badge = this.container.querySelector('#chess-chat-unread-badge');
                    if (badge) {
                        badge.textContent = String(this.unreadChatCount);
                        badge.classList.add('active');
                    }
                }
                break;
            }

            case 'chess_public_games_list':
            case 'chess_games_list': {
                this.renderSpectatorGames(d.games || []);
                break;
            }

            case 'chess_spectate_state':
            case 'chess_spectate_start': {
                this.gameMode = 'spectate';
                this.isSpectator = true;
                this.currentRoomId = d.roomId;
                if (d.fen) this.engine.loadFen(d.fen);
                this.view2D.attachEngine(this.engine);
                this.view3D.attachEngine(this.engine);
                this.view2D.render();
                this.view3D.syncPieces();

                const wName = d.white?.name || d.whitePlayer?.name || 'Blancas';
                const bName = d.black?.name || d.blackPlayer?.name || 'Negras';
                this.updatePlayerLabels(wName, bName);
                this.closeSheets();
                this.addChatMessage(`Observando partida en directo: ${wName} vs ${bName}`, 'system');
                this.showToast(`Modo Espectador: ${wName} vs ${bName}`);
                break;
            }

            case 'chess_error': {
                if (d.message) this.showToast(`Error: ${d.message}`);
                break;
            }
        }
    }

    clearAITimers() {
        this.aiMatchToken++;
        if (this.aiMoveTimer) {
            clearTimeout(this.aiMoveTimer);
            this.aiMoveTimer = null;
        }
    }

    getLocalTimeSettings() {
        if (this.localTimeMode === 'rapid_10_0') {
            return { unlimited: false, timeMs: 600000, incrementMs: 0 };
        }
        if (this.localTimeMode === 'blitz_5_3') {
            return { unlimited: false, timeMs: 300000, incrementMs: 3000 };
        }
        return { unlimited: true, timeMs: Infinity, incrementMs: 0 };
    }

    setAISpeedMode(mode) {
        this.aiSpeedMode = mode === 'normal' ? 'normal' : 'natural';
        const speedBtns = this.container.querySelectorAll('.chess-speed-btn');
        speedBtns.forEach(b => {
            b.classList.toggle('selected', b.dataset.speed === this.aiSpeedMode);
        });
        const liveSpeedBtn = this.container.querySelector('#chess-aivsai-speed');
        if (liveSpeedBtn) {
            const label = this.aiSpeedMode === 'natural' ? 'Natural 3-6s' : 'Normal';
            liveSpeedBtn.innerHTML = `${M3_ICONS.speed}<span>${label}</span>`;
        }
    }

    toggleAIVsAIPause() {
        if (this.gameMode !== 'ai_vs_ai' || this.engine.isGameOver) return;
        this.aiPaused = !this.aiPaused;
        const pauseBtn = this.container.querySelector('#chess-aivsai-pause');
        if (pauseBtn) {
            pauseBtn.innerHTML = this.aiPaused
                ? `${M3_ICONS.play}<span>Reanudar</span>`
                : `${M3_ICONS.pause}<span>Pausar</span>`;
        }
        if (this.aiPaused) {
            this.clearAITimers();
            this.stopClock();
            this.updateStatusBanner('IA vs IA • Pausado');
        } else {
            this.startClock();
            const token = this.aiMatchToken;
            this.scheduleNextAIVsAIMove(token);
        }
    }

    updateTickerModeUI() {
        const undoBtn = this.container.querySelector('#chess-ticker-undo');
        const aiControls = this.container.querySelector('#chess-aivsai-controls');
        if (this.gameMode === 'ai_vs_ai') {
            if (undoBtn) undoBtn.classList.add('hidden');
            if (aiControls) aiControls.classList.remove('hidden');
            const pauseBtn = this.container.querySelector('#chess-aivsai-pause');
            if (pauseBtn) {
                pauseBtn.innerHTML = this.aiPaused
                    ? `${M3_ICONS.play}<span>Reanudar</span>`
                    : `${M3_ICONS.pause}<span>Pausar</span>`;
            }
            this.setAISpeedMode(this.aiSpeedMode);
        } else {
            if (undoBtn) undoBtn.classList.remove('hidden');
            if (aiControls) aiControls.classList.add('hidden');
        }
    }

    startAIGame(color = 'w') {
        this.clearAITimers();
        this.gameMode = 'ai';
        this.playerColor = color;
        this.isSpectator = false;
        this.aiPaused = false;
        this.aiLevel = parseInt(this.container.querySelector('#chess-ai-select').value, 10) || 3;

        const aiNames = {
            1: { name: 'Motor IA (Nivel 1)', rating: '800' },
            2: { name: 'Motor IA (Nivel 2)', rating: '1200' },
            3: { name: 'Motor IA (Nivel 3)', rating: '1600' },
            4: { name: 'Motor IA (Nivel 4)', rating: '2000' },
            5: { name: 'Motor IA (Nivel 5)', rating: '2400' }
        };
        const aiInfo = aiNames[this.aiLevel] || aiNames[3];
        this.opponentName = aiInfo.name;
        this.opponentRating = aiInfo.rating;

        // Reset Engine
        this.engine.reset();
        this.view2D.setOrientation(color);
        this.view3D.setOrientation(color);
        this.view2D.attachEngine(this.engine);
        this.view3D.attachEngine(this.engine);
        this.view2D.render();
        this.view3D.syncPieces();

        // Apply selected local time control (Sin límite / 10+0 / 5+3)
        const tc = this.getLocalTimeSettings();
        this.unlimitedTime = tc.unlimited;
        this.whiteTimeMs = tc.timeMs;
        this.blackTimeMs = tc.timeMs;
        this.incrementMs = tc.incrementMs;
        this.startClock();

        this.updatePlayerLabels(
            color === 'w' ? this.localPlayerName : this.opponentName,
            color === 'b' ? this.localPlayerName : this.opponentName
        );

        this.updateTickerModeUI();
        this.clearMovesTable();
        this.updateMoveTicker();
        this.updateCapturedTray();
        this.updateEvaluationBar();
        this.updateStatusBanner();
        this.showToast(`Partida iniciada vs ${this.opponentName}${tc.unlimited ? ' (Sin límite)' : ''}`);

        // If AI plays White, trigger opening move
        if (color === 'b') {
            this.triggerAIMove();
        }
    }

    startAIVsAIGame() {
        this.clearAITimers();
        this.gameMode = 'ai_vs_ai';
        this.playerColor = 'w';
        this.isSpectator = false;
        this.aiPaused = false;

        this.aiWhiteLevel = parseInt(this.container.querySelector('#chess-ai-white-select')?.value, 10) || 5;
        this.aiBlackLevel = parseInt(this.container.querySelector('#chess-ai-black-select')?.value, 10) || 5;

        const ratings = { 1: '800', 2: '1200', 3: '1600', 4: '2000', 5: '2400' };
        const wName = `IA Blancas (Nv.${this.aiWhiteLevel})`;
        const bName = `IA Negras (Nv.${this.aiBlackLevel})`;
        this.localRating = ratings[this.aiWhiteLevel] || '2400';
        this.opponentRating = ratings[this.aiBlackLevel] || '2400';

        // Reset Engine & Views
        this.engine.reset();
        this.view2D.setOrientation('w');
        this.view3D.setOrientation('w');
        this.view2D.attachEngine(this.engine);
        this.view3D.attachEngine(this.engine);
        this.view2D.render();
        this.view3D.syncPieces();

        // Apply selected local time control
        const tc = this.getLocalTimeSettings();
        this.unlimitedTime = tc.unlimited;
        this.whiteTimeMs = tc.timeMs;
        this.blackTimeMs = tc.timeMs;
        this.incrementMs = tc.incrementMs;
        this.startClock();

        this.updatePlayerLabels(wName, bName);
        this.updateTickerModeUI();
        this.clearMovesTable();
        this.updateMoveTicker();
        this.updateCapturedTray();
        this.updateEvaluationBar();
        this.updateStatusBanner();

        const speedText = this.aiSpeedMode === 'natural' ? 'Natural (3–6s)' : 'Normal';
        this.showToast(`IA Nv.${this.aiWhiteLevel} vs IA Nv.${this.aiBlackLevel} • ${speedText}`);

        const token = this.aiMatchToken;
        this.scheduleNextAIVsAIMove(token);
    }

    scheduleNextAIVsAIMove(token) {
        if (token !== this.aiMatchToken || this.gameMode !== 'ai_vs_ai' || this.aiPaused || this.engine.isGameOver) {
            return;
        }
        const delayMs = this.aiSpeedMode === 'natural'
            ? Math.round(3000 + Math.random() * 3000)
            : 450;

        const turnLabel = this.engine.turn === 'w'
            ? `IA Blancas (Nv.${this.aiWhiteLevel})`
            : `IA Negras (Nv.${this.aiBlackLevel})`;
        this.updateStatusBanner(`${turnLabel} pensando...`);

        this.aiMoveTimer = setTimeout(() => {
            this.aiMoveTimer = null;
            this.triggerAIVsAIMove(token);
        }, delayMs);
    }

    async triggerAIVsAIMove(token) {
        if (token !== this.aiMatchToken || this.gameMode !== 'ai_vs_ai' || this.aiPaused || this.engine.isGameOver) {
            return;
        }

        const movingColor = this.engine.turn;
        const level = movingColor === 'w' ? this.aiWhiteLevel : this.aiBlackLevel;
        const bestMove = await this.ai.findBestMove(this.engine, level);

        if (token !== this.aiMatchToken || this.gameMode !== 'ai_vs_ai' || this.engine.isGameOver) {
            return;
        }

        if (bestMove) {
            this.isProcessingRemoteMove = true;
            try {
                const executed = this.engine.makeMove(bestMove.from, bestMove.to, bestMove.promotion);
                if (executed) {
                    if (!this.unlimitedTime && this.incrementMs > 0) {
                        if (movingColor === 'w') this.whiteTimeMs += this.incrementMs;
                        else this.blackTimeMs += this.incrementMs;
                    }
                    this.view2D.setLastMove(bestMove.from, bestMove.to);
                    if (typeof this.view3D.animateRemoteMove === 'function') {
                        this.view3D.animateRemoteMove(
                            ChessEngine.squareToCoords(bestMove.from),
                            ChessEngine.squareToCoords(bestMove.to),
                            bestMove.from,
                            bestMove.to,
                            bestMove.promotion
                        );
                    } else {
                        this.view3D.syncPieces();
                    }
                    this.view2D.render();
                    this.addMoveToTable(executed);
                    this.updateMoveTicker();
                    this.updateCapturedTray();
                    this.updateEvaluationBar();
                    this.updateClockDisplays();
                    this.updateStatusBanner();

                    if (executed.isCheckmate) {
                        this.triggerHaptic('gameover');
                        if (this.soundEnabled) this.audio.playGameEnd(true);
                    } else if (executed.isCheck) {
                        this.triggerHaptic('check');
                        if (this.soundEnabled) this.audio.playCheck();
                    } else if (executed.captured) {
                        this.triggerHaptic('capture');
                        if (this.soundEnabled) this.audio.playCapture();
                    } else {
                        this.triggerHaptic('move');
                        if (this.soundEnabled) this.audio.playMove();
                    }

                    if (!this.checkLocalGameOver() && !this.aiPaused) {
                        this.scheduleNextAIVsAIMove(token);
                    }
                }
            } finally {
                this.isProcessingRemoteMove = false;
            }
        }
    }

    async triggerAIMove() {
        if (this.gameMode !== 'ai' || this.engine.isGameOver) return;
        this.updateStatusBanner('Motor IA pensando...');

        const bestMove = await this.ai.findBestMove(this.engine, this.aiLevel);
        if (bestMove) {
            this.isProcessingRemoteMove = true;
            try {
                const executed = this.engine.makeMove(bestMove.from, bestMove.to, bestMove.promotion);
                if (executed) {
                    this.view2D.setLastMove(bestMove.from, bestMove.to);
                    if (typeof this.view3D.animateRemoteMove === 'function') {
                        this.view3D.animateRemoteMove(
                            ChessEngine.squareToCoords(bestMove.from),
                            ChessEngine.squareToCoords(bestMove.to),
                            bestMove.from,
                            bestMove.to,
                            bestMove.promotion
                        );
                    } else {
                        this.view3D.syncPieces();
                    }
                    this.view2D.render();
                    this.addMoveToTable(executed);
                    this.updateMoveTicker();
                    this.updateCapturedTray();
                    this.updateEvaluationBar();
                    this.updateStatusBanner();

                    if (executed.isCheckmate) {
                        this.triggerHaptic('gameover');
                        if (this.soundEnabled) this.audio.playGameEnd(false);
                    } else if (executed.isCheck) {
                        this.triggerHaptic('check');
                        if (this.soundEnabled) this.audio.playCheck();
                    } else if (executed.captured) {
                        this.triggerHaptic('capture');
                        if (this.soundEnabled) this.audio.playCapture();
                    } else {
                        this.triggerHaptic('move');
                        if (this.soundEnabled) this.audio.playMove();
                    }

                    this.checkLocalGameOver();
                }
            } finally {
                this.isProcessingRemoteMove = false;
            }
        }
    }

    handleLocalMove(fromSq, toSq, promotion, executed) {
        if (this.isProcessingRemoteMove) return;
        if (!executed) return;

        this.addMoveToTable(executed);
        this.updateMoveTicker();
        this.updateCapturedTray();
        this.updateEvaluationBar();
        this.updateStatusBanner();

        // Sound & Haptics
        if (executed.isCheckmate) {
            this.triggerHaptic('gameover');
            if (this.soundEnabled) this.audio.playGameEnd(true);
        } else if (executed.isCheck) {
            this.triggerHaptic('check');
            if (this.soundEnabled) this.audio.playCheck();
        } else if (executed.captured) {
            this.triggerHaptic('capture');
            if (this.soundEnabled) this.audio.playCapture();
        } else {
            this.triggerHaptic('move');
            if (this.soundEnabled) this.audio.playMove();
        }

        if (this.gameMode === 'online') {
            this.sendPacket('chess_move', {
                from: fromSq,
                to: toSq,
                promotion: promotion || 'q'
            });
        } else if (this.gameMode === 'ai') {
            if (!this.checkLocalGameOver()) {
                setTimeout(() => this.triggerAIMove(), 250);
            }
        }
    }

    handleUndo() {
        if (this.gameMode !== 'ai' && this.gameMode !== 'pass_and_play') {
            this.showToast('El botón Deshacer solo funciona vs IA');
            return;
        }
        if (this.engine.history.length === 0) return;

        // Undo AI move and player move
        this.engine.undo();
        if (this.gameMode === 'ai' && this.engine.history.length > 0 && this.engine.turn !== this.playerColor) {
            this.engine.undo();
        }

        this.view2D.render();
        this.view3D.syncPieces();
        this.rebuildMovesTableFromHistory();
        this.updateMoveTicker();
        this.updateCapturedTray();
        this.updateEvaluationBar();
        this.updateStatusBanner();
        this.showToast('Jugada deshecha');
        this.triggerHaptic('move');
    }

    goToPly(targetPly) {
        if (targetPly < 0 || targetPly > this.engine.history.length) return;
        this.activePly = targetPly;

        // Replay moves up to targetPly in clone
        const clone = new ChessEngine();
        for (let i = 0; i < targetPly; i++) {
            const h = this.engine.history[i];
            clone.makeMove(h.from, h.to, h.promotion || 'q');
        }

        // Attach clone to views for historic inspection
        this.view2D.attachEngine(clone);
        this.view3D.attachEngine(clone);
        this.view2D.render();
        this.view3D.syncPieces();

        // Highlight active ply in ticker
        this.container.querySelectorAll('.chess-ply-btn').forEach(btn => {
            const ply = parseInt(btn.dataset.ply, 10);
            if (ply === targetPly) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        // Center active ply
        const activeBtn = this.container.querySelector(`.chess-ply-btn[data-ply="${targetPly}"]`);
        const feed = this.container.querySelector('#chess-ticker-feed');
        if (activeBtn && feed) {
            feed.scrollLeft = activeBtn.offsetLeft - feed.clientWidth / 2 + activeBtn.clientWidth / 2;
        }

        // If returned to latest, restore primary engine
        if (targetPly === this.engine.history.length) {
            this.view2D.attachEngine(this.engine);
            this.view3D.attachEngine(this.engine);
            this.view2D.render();
            this.view3D.syncPieces();
        }
    }

    checkLocalGameOver() {
        const status = this.engine.getGameStatus();
        if (status.isGameOver) {
            this.stopClock();
            let msg = '';
            if (status.winner === 'draw') {
                msg = `Tablas: ${status.reason}`;
            } else {
                const winColor = status.winner === 'w' ? 'Blancas' : 'Negras';
                msg = `¡Victoria para ${winColor}! Motivo: ${status.reason}`;
            }
            this.updateStatusBanner(msg);
            this.showToast(msg);
            this.triggerHaptic('gameover');
            return true;
        }
        return false;
    }

    promptPromotion(callback) {
        const modal = this.container.querySelector('#chess-promotion-modal');
        modal.style.display = 'flex';

        const buttons = modal.querySelectorAll('.chess-promo-btn');
        const clickHandler = (e) => {
            const piece = e.currentTarget.dataset.piece;
            modal.style.display = 'none';
            buttons.forEach(b => b.removeEventListener('click', clickHandler));
            callback(piece);
        };

        buttons.forEach(b => b.addEventListener('click', clickHandler));
    }

    startClock() {
        this.stopClock();
        if (this.unlimitedTime) {
            this.updateClockDisplays();
            return;
        }
        this.lastClockTick = performance.now();
        this.lastCountdownBeepSec = null;

        this.clockInterval = setInterval(() => {
            if (this.unlimitedTime) return;
            const now = performance.now();
            const delta = now - this.lastClockTick;
            this.lastClockTick = now;

            if (this.engine.turn === 'w') {
                this.whiteTimeMs = Math.max(0, this.whiteTimeMs - delta);
            } else {
                this.blackTimeMs = Math.max(0, this.blackTimeMs - delta);
            }

            this.updateClockDisplays();

            // Check low time countdown beeps (<10s)
            const activeTimeMs = this.engine.turn === 'w' ? this.whiteTimeMs : this.blackTimeMs;
            const activeSec = Math.floor(activeTimeMs / 1000);
            if (activeSec < 10 && activeSec > 0 && activeSec !== this.lastCountdownBeepSec) {
                this.lastCountdownBeepSec = activeSec;
                if (this.soundEnabled && typeof this.audio.playLowTime === 'function') {
                    this.audio.playLowTime();
                }
                this.triggerHaptic('move');
            }

            if (this.whiteTimeMs === 0 || this.blackTimeMs === 0) {
                this.stopClock();
                if (this.gameMode === 'ai' || this.gameMode === 'ai_vs_ai') {
                    this.endGame('Tiempo agotado', this.whiteTimeMs === 0 ? 'b' : 'w');
                }
            }
        }, 100);
    }

    stopClock() {
        if (this.clockInterval) {
            clearInterval(this.clockInterval);
            this.clockInterval = null;
        }
    }

    updateClockDisplays() {
        const topEl = this.container.querySelector('#chess-top-clock');
        const bottomEl = this.container.querySelector('#chess-bottom-clock');
        if (!topEl || !bottomEl) return;

        const formatTime = (ms) => {
            if (this.unlimitedTime || !Number.isFinite(ms)) {
                return '∞';
            }
            if (ms < 20000) {
                // Tenths of a second format when < 20s
                const sec = (ms / 1000).toFixed(1);
                return sec.padStart(4, '0');
            }
            const totalSec = Math.floor(ms / 1000);
            const m = Math.floor(totalSec / 60);
            const s = totalSec % 60;
            return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        };

        const isWhiteBottom = this.view2D.orientation === 'w';
        const topMs = isWhiteBottom ? this.blackTimeMs : this.whiteTimeMs;
        const bottomMs = isWhiteBottom ? this.whiteTimeMs : this.blackTimeMs;
        const isTopTurn = isWhiteBottom ? this.engine.turn === 'b' : this.engine.turn === 'w';

        topEl.textContent = formatTime(topMs);
        bottomEl.textContent = formatTime(bottomMs);

        // Active turn glow
        if (isTopTurn) {
            topEl.classList.add('active');
            bottomEl.classList.remove('active');
        } else {
            bottomEl.classList.add('active');
            topEl.classList.remove('active');
        }

        // Low time pulsing alert (<30s), disabled in unlimited mode
        if (!this.unlimitedTime && topMs < 30000 && isTopTurn) topEl.classList.add('low-time');
        else topEl.classList.remove('low-time');

        if (!this.unlimitedTime && bottomMs < 30000 && !isTopTurn) bottomEl.classList.add('low-time');
        else bottomEl.classList.remove('low-time');
    }

    updatePlayerLabels(whiteName = 'Blancas', blackName = 'Negras') {
        const topName = this.container.querySelector('#chess-top-name');
        const bottomName = this.container.querySelector('#chess-bottom-name');
        const topRating = this.container.querySelector('#chess-top-rating');
        const bottomRating = this.container.querySelector('#chess-bottom-rating');
        const topAvatar = this.container.querySelector('#chess-top-avatar-icon');
        const bottomAvatar = this.container.querySelector('#chess-bottom-avatar-icon');
        const topDot = this.container.querySelector('#chess-top-status-dot');
        const bottomDot = this.container.querySelector('#chess-bottom-status-dot');

        const isWhiteBottom = this.view2D.orientation === 'w';
        const isAIvsAI = this.gameMode === 'ai_vs_ai';

        if (isWhiteBottom) {
            if (topName) topName.textContent = blackName;
            if (bottomName) bottomName.textContent = whiteName;
            if (topAvatar) topAvatar.innerHTML = (this.gameMode === 'ai' || isAIvsAI) ? M3_ICONS.smartToy : M3_ICONS.kingBlack;
            if (bottomAvatar) bottomAvatar.innerHTML = isAIvsAI ? M3_ICONS.smartToy : M3_ICONS.kingWhite;
            if (topRating) topRating.textContent = this.opponentRating;
            if (bottomRating) bottomRating.textContent = this.localRating;
        } else {
            if (topName) topName.textContent = whiteName;
            if (bottomName) bottomName.textContent = blackName;
            if (topAvatar) topAvatar.innerHTML = isAIvsAI ? M3_ICONS.smartToy : M3_ICONS.kingWhite;
            if (bottomAvatar) bottomAvatar.innerHTML = (this.gameMode === 'ai' || isAIvsAI) ? M3_ICONS.smartToy : M3_ICONS.kingBlack;
            if (topRating) topRating.textContent = this.localRating;
            if (bottomRating) bottomRating.textContent = this.opponentRating;
        }

        if (topDot) {
            topDot.className = 'chess-status-dot ' + ((this.gameMode === 'ai' || isAIvsAI) ? 'bot' : 'online');
        }
        if (bottomDot) {
            bottomDot.className = 'chess-status-dot ' + (isAIvsAI ? 'bot' : 'online');
        }
    }

    updateStatusBanner(customText = null) {
        const sub = this.container.querySelector('#chess-game-mode-subtitle');
        if (!sub) return;

        if (customText) {
            sub.textContent = customText;
            return;
        }

        const turn = this.engine.turn === 'w' ? 'Blancas' : 'Negras';
        const inCheck = this.engine.isInCheck(this.engine.turn);

        if (inCheck) {
            sub.textContent = `¡Jaque a ${turn}!`;
            sub.style.color = '#ef4444';
        } else {
            if (this.gameMode === 'ai_vs_ai') {
                sub.textContent = `IA Nv.${this.aiWhiteLevel} vs Nv.${this.aiBlackLevel} • ${turn}`;
            } else if (this.gameMode === 'ai') {
                sub.textContent = `IA Nv.${this.aiLevel} • ${turn}`;
            } else if (this.gameMode === 'online') {
                sub.textContent = `Online • ${turn}`;
            } else if (this.gameMode === 'spectate') {
                sub.textContent = `En Directo • ${turn}`;
            } else {
                sub.textContent = `Mueven ${turn}`;
            }
            sub.style.color = '#8ab4f8';
        }
    }

    updateEvaluationBar(customScore = null) {
        const evalFill = this.container.querySelector('#chess-eval-fill');
        const evalBadge = this.container.querySelector('#chess-eval-badge');
        if (!evalFill) return;

        let cp = customScore !== null ? customScore : this.ai.evaluatePosition(this.engine);
        let pct = 50;
        let badgeText = '0.0';

        if (this.engine.isCheckmate() || cp >= 15000 || cp <= -15000) {
            if (cp > 0 || (this.engine.isCheckmate() && this.engine.turn === 'b')) {
                pct = 100;
                badgeText = '#M';
            } else {
                pct = 0;
                badgeText = '-#M';
            }
        } else {
            // Sigmoid: W% = 50 + 50 * (2 / (1 + exp(-0.004 * ev)) - 1)
            const logistic = 2 / (1 + Math.exp(-0.004 * cp)) - 1;
            pct = 50 + 50 * logistic;
            pct = Math.max(3, Math.min(97, pct));
            const formatted = (cp >= 0 ? '+' : '') + (cp / 100).toFixed(1);
            badgeText = formatted;
        }

        evalFill.style.height = `${pct}%`;
        if (evalBadge) {
            evalBadge.textContent = badgeText;
            evalBadge.style.display = 'block';
        }
    }

    updateMoveTicker() {
        const feed = this.container.querySelector('#chess-ticker-feed');
        if (!feed) return;

        const history = this.engine.history;
        this.activePly = history.length;

        feed.innerHTML = history.map((move, idx) => {
            const ply = idx + 1;
            const moveNum = Math.ceil(ply / 2);
            const isWhite = ply % 2 === 1;
            const label = isWhite ? `${moveNum}. ${move.san}` : `${move.san}`;
            const isActive = ply === this.activePly;

            return `<button class="chess-ply-btn ${isActive ? 'active' : ''}" data-ply="${ply}">${label}</button>`;
        }).join('');

        // Add event listeners on plies
        feed.querySelectorAll('.chess-ply-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const ply = parseInt(e.currentTarget.dataset.ply, 10);
                this.goToPly(ply);
            });
        });

        // Auto-scroll to end
        feed.scrollLeft = feed.scrollHeight;

        // Undo button visibility
        const undoBtn = this.container.querySelector('#chess-ticker-undo');
        if (undoBtn) {
            if (this.gameMode === 'ai' || this.gameMode === 'pass_and_play') {
                undoBtn.classList.remove('hidden');
            } else {
                undoBtn.classList.add('hidden');
            }
        }
    }

    clearMovesTable() {
        const tbody = this.container.querySelector('#chess-moves-body');
        if (tbody) tbody.innerHTML = '';
    }

    rebuildMovesTableFromHistory() {
        this.clearMovesTable();
        for (const move of this.engine.history) {
            this.addMoveToTable(move);
        }
    }

    addMoveToTable(executedMove) {
        const tbody = this.container.querySelector('#chess-moves-body');
        if (!tbody) return;

        const moveNumber = Math.ceil(this.engine.history.length / 2);
        const isWhite = executedMove.piece ? executedMove.piece.color === 'w' : (this.engine.history.length % 2 === 1);

        if (isWhite) {
            const tr = document.createElement('tr');
            tr.id = `chess-row-${moveNumber}`;
            tr.innerHTML = `
                <td class="chess-move-num">${moveNumber}.</td>
                <td class="chess-move-w" style="font-family:monospace; font-weight:600;">${executedMove.san}</td>
                <td class="chess-move-b" style="font-family:monospace; font-weight:600;"></td>
            `;
            tbody.appendChild(tr);
        } else {
            let tr = tbody.querySelector(`#chess-row-${moveNumber}`);
            if (!tr) {
                tr = document.createElement('tr');
                tr.id = `chess-row-${moveNumber}`;
                tr.innerHTML = `
                    <td class="chess-move-num">${moveNumber}.</td>
                    <td class="chess-move-w" style="font-family:monospace; font-weight:600;">...</td>
                    <td class="chess-move-b" style="font-family:monospace; font-weight:600;">${executedMove.san}</td>
                `;
                tbody.appendChild(tr);
            } else {
                const bCell = tr.querySelector('.chess-move-b');
                if (bCell) bCell.textContent = executedMove.san;
            }
        }

        const feed = this.container.querySelector('#chess-moves-feed');
        if (feed) feed.scrollTop = feed.scrollHeight;
    }

    updateCapturedTray() {
        let wPieces = { p: 0, n: 0, b: 0, r: 0, q: 0 };
        let bPieces = { p: 0, n: 0, b: 0, r: 0, q: 0 };
        let wScore = 0;
        let bScore = 0;

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = this.engine.board[r][c];
                if (p && p.type !== 'k') {
                    if (p.color === 'w') {
                        wPieces[p.type]++;
                        wScore += PIECE_VALUES[p.type] || 0;
                    } else {
                        bPieces[p.type]++;
                        bScore += PIECE_VALUES[p.type] || 0;
                    }
                }
            }
        }

        const standard = { q: 1, r: 2, b: 2, n: 2, p: 8 };
        const glyphs = {
            w: { q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
            b: { q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
        };

        let capturedWhite = '';
        let capturedBlack = '';

        for (const [type, count] of Object.entries(standard)) {
            const capW = Math.max(0, count - wPieces[type]);
            const capB = Math.max(0, count - bPieces[type]);
            capturedWhite += glyphs.w[type].repeat(capW);
            capturedBlack += glyphs.b[type].repeat(capB);
        }

        const topTray = this.container.querySelector('#chess-top-captured');
        const bottomTray = this.container.querySelector('#chess-bottom-captured');
        const topDiff = this.container.querySelector('#chess-top-diff');
        const bottomDiff = this.container.querySelector('#chess-bottom-diff');

        const isWhiteBottom = this.view2D.orientation === 'w';
        const diffWhite = wScore - bScore;

        if (isWhiteBottom) {
            if (topTray) topTray.textContent = capturedWhite;
            if (bottomTray) bottomTray.textContent = capturedBlack;

            if (diffWhite > 0) {
                if (bottomDiff) { bottomDiff.textContent = `+${diffWhite}`; bottomDiff.classList.remove('hidden'); }
                if (topDiff) topDiff.classList.add('hidden');
            } else if (diffWhite < 0) {
                if (topDiff) { topDiff.textContent = `+${-diffWhite}`; topDiff.classList.remove('hidden'); }
                if (bottomDiff) bottomDiff.classList.add('hidden');
            } else {
                if (topDiff) topDiff.classList.add('hidden');
                if (bottomDiff) bottomDiff.classList.add('hidden');
            }
        } else {
            if (topTray) topTray.textContent = capturedBlack;
            if (bottomTray) bottomTray.textContent = capturedWhite;

            if (diffWhite < 0) {
                if (bottomDiff) { bottomDiff.textContent = `+${-diffWhite}`; bottomDiff.classList.remove('hidden'); }
                if (topDiff) topDiff.classList.add('hidden');
            } else if (diffWhite > 0) {
                if (topDiff) { topDiff.textContent = `+${diffWhite}`; topDiff.classList.remove('hidden'); }
                if (bottomDiff) bottomDiff.classList.add('hidden');
            } else {
                if (topDiff) topDiff.classList.add('hidden');
                if (bottomDiff) bottomDiff.classList.add('hidden');
            }
        }
    }

    addChatMessage(text, type = 'player') {
        const feed = this.container.querySelector('#chess-chat-messages');
        if (!feed) return;
        const div = document.createElement('div');
        div.className = `chess-chat-msg ${type}`;
        div.textContent = text;
        feed.appendChild(div);
        feed.scrollTop = feed.scrollHeight;
    }

    renderSpectatorGames(games) {
        const list = this.container.querySelector('#chess-spectator-games');
        if (!list) return;

        if (!games || games.length === 0) {
            list.innerHTML = '<span class="chess-empty-text">No hay partidas públicas en directo ahora mismo.</span>';
            return;
        }

        list.innerHTML = games.map(g => `
            <div class="chess-live-item">
                <div class="chess-live-info">
                    <span class="chess-live-players">${g.whiteName || g.whitePlayer} vs ${g.blackName || g.blackPlayer}</span>
                    <span class="chess-live-meta">${g.timeControlName || g.timeControl} • ${g.spectators} espectador(es)</span>
                </div>
                <button class="chess-btn chess-btn-outline" style="padding:6px 12px; font-size:11px;" onclick="window.chessJoinSpectate('${g.roomId}')">
                    ${M3_ICONS.visibility} Ver
                </button>
            </div>
        `).join('');

        window.chessJoinSpectate = (roomId) => {
            this.sendPacket('chess_spectate_room', { roomId });
        };
    }

    endGame(reason, winner) {
        this.stopClock();
        const winnerName = winner === 'w' ? 'Blancas' : 'Negras';
        const msg = `Fin de Partida: ${reason}. Victoria para ${winnerName}.`;
        this.updateStatusBanner(msg);
        this.showToast(msg);
        this.triggerHaptic('gameover');
        if (this.soundEnabled) this.audio.playGameEnd(winner === this.playerColor);
    }
}

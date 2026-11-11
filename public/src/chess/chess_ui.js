/**
 * Grandmaster Chess - UI Controller and Game Orchestrator
 * Integrates:
 * - 2D Canvas & 3D Three.js Staunton views (1-click toggle)
 * - Fischer digital clocks with low-time warning
 * - Move history table with SAN notation
 * - Promotion Modal dialog
 * - Local AI with 5 difficulty levels
 * - WebSocket Multiplayer (Matchmaking queues, Private PIN rooms, Live Spectator mode)
 * - Material balance calculation & captured pieces
 */

import { ChessEngine, PIECE_VALUES } from './chess_engine.js';
import { ChessView2D } from './chess_view_2d.js';
import { ChessView3D } from './chess_view_3d.js';
import { ChessAI } from './chess_ai.js';

export class ChessUI {
    /**
     * @param {HTMLElement} container
     * @param {WebSocket} socket
     * @param {string} localPlayerName
     */
    constructor(container, socket, localPlayerName = 'Jugador') {
        this.container = container;
        this.socket = socket;
        this.localPlayerName = localPlayerName;

        this.engine = new ChessEngine();
        this.ai = new ChessAI();

        // Game mode state
        this.gameMode = 'none'; // 'ai', 'online', 'pass_and_play', 'spectate'
        this.aiLevel = 3;
        this.playerColor = 'w'; // 'w', 'b', or 'both'
        this.currentViewMode = '2d'; // '2d' or '3d'
        this.currentRoomId = null;
        this.isSpectator = false;

        // Clock state
        this.whiteTimeMs = 300000;
        this.blackTimeMs = 300000;
        this.incrementMs = 0;
        this.clockInterval = null;
        this.lastClockTick = null;

        this.initDOM();
        this.initViews();
        this.bindEvents();
        this.setupSocketHandlers();
        this.updateStatusBanner();
    }

    initDOM() {
        this.container.innerHTML = `
            <div class="chess-app-layout">
                <!-- Top Navigation & Status Bar -->
                <div class="chess-top-bar">
                    <div class="chess-brand">
                        <span class="chess-brand-icon">♞</span>
                        <span class="chess-brand-title">GRANDMASTER CHESS</span>
                    </div>
                    <div class="chess-nav-controls">
                        <button id="chess-btn-toggle-view" class="chess-btn chess-btn-secondary" title="Cambiar entre 2D y 3D">
                            <span id="chess-view-label">Vista 3D 🎲</span>
                        </button>
                        <button id="chess-btn-flip" class="chess-btn chess-btn-secondary" title="Girar tablero">
                            🔄 Girar
                        </button>
                        <button id="chess-btn-menu" class="chess-btn chess-btn-warning" title="Volver al Portal">
                            🚪 Volver al Portal
                        </button>
                    </div>
                </div>

                <div class="chess-main-area">
                    <!-- Left: Chessboard Canvas & Players Information -->
                    <div class="chess-board-wrapper">
                        <!-- Opponent Info Bar -->
                        <div class="chess-player-strip" id="chess-player-top">
                            <div class="chess-player-avatar" id="chess-top-avatar">♟</div>
                            <div class="chess-player-meta">
                                <span class="chess-player-name" id="chess-top-name">Oponente</span>
                                <span class="chess-captured-tray" id="chess-top-captured"></span>
                            </div>
                            <div class="chess-clock" id="chess-top-clock">05:00</div>
                        </div>

                        <!-- Board viewport container -->
                        <div class="chess-canvas-container" id="chess-canvas-box">
                            <canvas id="chess-canvas-2d"></canvas>
                            <canvas id="chess-canvas-3d" style="display: none;"></canvas>

                            <!-- Promotion modal overlay -->
                            <div id="chess-promotion-modal" class="chess-modal-overlay" style="display: none;">
                                <div class="chess-promotion-box">
                                    <div class="chess-promo-title">Coronación de Peón</div>
                                    <div class="chess-promo-options">
                                        <button class="chess-promo-btn" data-piece="q" title="Dama">♛</button>
                                        <button class="chess-promo-btn" data-piece="r" title="Torre">♜</button>
                                        <button class="chess-promo-btn" data-piece="b" title="Alfil">♝</button>
                                        <button class="chess-promo-btn" data-piece="n" title="Caballo">♞</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Friendly Player Info Bar -->
                        <div class="chess-player-strip" id="chess-player-bottom">
                            <div class="chess-player-avatar" id="chess-bottom-avatar">♙</div>
                            <div class="chess-player-meta">
                                <span class="chess-player-name" id="chess-bottom-name">${this.localPlayerName}</span>
                                <span class="chess-captured-tray" id="chess-bottom-captured"></span>
                            </div>
                            <div class="chess-clock" id="chess-bottom-clock">05:00</div>
                        </div>
                    </div>

                    <!-- Right: Game Controls, Move Notation, Matchmaking & Chat -->
                    <div class="chess-sidebar">
                        <!-- Turn & Status Pill -->
                        <div class="chess-status-pill" id="chess-status-pill">
                            Blancas mueven
                        </div>

                        <!-- Tab controls: Partida, Emparejamiento, Chat -->
                        <div class="chess-tabs">
                            <button class="chess-tab-btn active" data-tab="game">Partida</button>
                            <button class="chess-tab-btn" data-tab="matchmaking">Salas & Online</button>
                            <button class="chess-tab-btn" data-tab="chat">Chat</button>
                        </div>

                        <!-- Tab 1: Game Moves & Action Buttons -->
                        <div class="chess-tab-content active" id="chess-tab-game">
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

                            <div class="chess-actions-bar">
                                <button id="chess-btn-draw" class="chess-btn chess-btn-outline" title="Ofrecer tablas">
                                    🤝 Tablas
                                </button>
                                <button id="chess-btn-resign" class="chess-btn chess-btn-danger" title="Rendirse">
                                    🏳️ Rendirse
                                </button>
                                <button id="chess-btn-rematch" class="chess-btn chess-btn-primary" style="display:none;">
                                    🔄 Revancha
                                </button>
                            </div>
                        </div>

                        <!-- Tab 2: Matchmaking, AI & Spectators -->
                        <div class="chess-tab-content" id="chess-tab-matchmaking">
                            <div class="chess-section-title">⚡ Partida Rápida Online</div>
                            <div class="chess-time-presets">
                                <button class="chess-preset-btn" data-tc="bullet_1_0">1+0 Bullet</button>
                                <button class="chess-preset-btn" data-tc="blitz_3_0">3+0 Blitz</button>
                                <button class="chess-preset-btn selected" data-tc="blitz_5_3">5+3 Blitz</button>
                                <button class="chess-preset-btn" data-tc="rapid_10_0">10+0 Rápida</button>
                            </div>
                            <button id="chess-btn-queue-join" class="chess-btn chess-btn-success chess-full-width">
                                🔍 Buscar Partida
                            </button>

                            <div class="chess-divider"></div>

                            <div class="chess-section-title">🔒 Sala Privada con PIN</div>
                            <div class="chess-private-row">
                                <button id="chess-btn-create-private" class="chess-btn chess-btn-secondary">
                                    Crear Sala
                                </button>
                                <input type="text" id="chess-input-pin" maxlength="4" placeholder="PIN 4 dígitos" class="chess-pin-input">
                                <button id="chess-btn-join-pin" class="chess-btn chess-btn-outline">
                                    Unirse
                                </button>
                            </div>
                            <div id="chess-private-info" class="chess-help-text"></div>

                            <div class="chess-divider"></div>

                            <div class="chess-section-title">🤖 Jugar vs Motor IA</div>
                            <div class="chess-ai-row">
                                <label for="chess-ai-select">Dificultad:</label>
                                <select id="chess-ai-select" class="chess-select">
                                    <option value="1">Nivel 1: Principiante (800)</option>
                                    <option value="2">Nivel 2: Casual (1200)</option>
                                    <option value="3" selected>Nivel 3: Intermedio (1600)</option>
                                    <option value="4">Nivel 4: Avanzado (2000)</option>
                                    <option value="5">Nivel 5: Maestro (2400)</option>
                                </select>
                            </div>
                            <div class="chess-ai-color-row">
                                <button class="chess-btn chess-btn-outline" id="chess-btn-ai-white">Jugar Blancas ♔</button>
                                <button class="chess-btn chess-btn-outline" id="chess-btn-ai-black">Jugar Negras ♚</button>
                            </div>

                            <div class="chess-divider"></div>

                            <div class="chess-section-title">👁️ Retransmisiones en Directo</div>
                            <div class="chess-spectator-list" id="chess-spectator-games">
                                <span class="chess-empty-text">Buscando partidas activas...</span>
                            </div>
                        </div>

                        <!-- Tab 3: Chat -->
                        <div class="chess-tab-content" id="chess-tab-chat">
                            <div class="chess-chat-feed" id="chess-chat-messages">
                                <div class="chess-chat-msg system">¡Bienvenido a Grandmaster Chess!</div>
                            </div>
                            <div class="chess-chat-bar">
                                <input type="text" id="chess-chat-input" placeholder="Mensaje para oponente y espectadores..." maxlength="120">
                                <button id="chess-btn-chat-send" class="chess-btn chess-btn-primary">Enviar</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    initViews() {
        const c2d = this.container.querySelector('#chess-canvas-2d');
        const c3d = this.container.querySelector('#chess-canvas-3d');

        this.view2D = new ChessView2D(c2d, {
            orientation: this.playerColor === 'b' ? 'b' : 'w',
            onMoveAttempt: (from, to, promo, res) => this.handleLocalMove(from, to, promo, res),
            onPromotionNeeded: (from, to, callback) => this.promptPromotion(callback)
        });

        this.view3D = new ChessView3D(c3d, {
            orientation: this.playerColor === 'b' ? 'b' : 'w',
            onMoveAttempt: (from, to, promo, res) => this.handleLocalMove(from, to, promo, res),
            onPromotionNeeded: (from, to, callback) => this.promptPromotion(callback)
        });

        this.view2D.attachEngine(this.engine);
        this.view3D.attachEngine(this.engine);
    }

    bindEvents() {
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
                viewLabel.textContent = 'Vista 2D ♟';
                this.view3D.resize();
                this.view3D.syncPieces();
            } else {
                this.currentViewMode = '2d';
                c3d.style.display = 'none';
                c2d.style.display = 'block';
                viewLabel.textContent = 'Vista 3D 🎲';
                this.view2D.resize();
                this.view2D.render();
            }
        });

        // Flip board
        this.container.querySelector('#chess-btn-flip').addEventListener('click', () => {
            const next = this.view2D.orientation === 'w' ? 'b' : 'w';
            this.view2D.setOrientation(next);
            this.view3D.setOrientation(next);
            this.updatePlayerLabels();
        });

        // Tabs
        const tabBtns = this.container.querySelectorAll('.chess-tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                this.container.querySelectorAll('.chess-tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                const target = this.container.querySelector(`#chess-tab-${btn.dataset.tab}`);
                if (target) target.classList.add('active');
            });
        });

        // Time presets
        const presets = this.container.querySelectorAll('.chess-preset-btn');
        presets.forEach(btn => {
            btn.addEventListener('click', () => {
                presets.forEach(p => p.classList.remove('selected'));
                btn.classList.add('selected');
            });
        });

        // Online Matchmaking queue
        const queueBtn = this.container.querySelector('#chess-btn-queue-join');
        queueBtn.addEventListener('click', () => {
            const sel = this.container.querySelector('.chess-preset-btn.selected');
            const tc = sel ? sel.dataset.tc : 'blitz_5_3';

            if (queueBtn.classList.contains('in-queue')) {
                this.sendPacket({ type: 'chess_leave_queue' });
                queueBtn.classList.remove('in-queue');
                queueBtn.textContent = '🔍 Buscar Partida';
            } else {
                this.sendPacket({ type: 'chess_join_queue', timeControl: tc, playerName: this.localPlayerName });
                queueBtn.classList.add('in-queue');
                queueBtn.textContent = '⏳ Cancelar Búsqueda...';
            }
        });

        // Create private room
        this.container.querySelector('#chess-btn-create-private').addEventListener('click', () => {
            const sel = this.container.querySelector('.chess-preset-btn.selected');
            const tc = sel ? sel.dataset.tc : 'blitz_5_3';
            this.sendPacket({ type: 'chess_create_room', timeControl: tc, playerName: this.localPlayerName });
        });

        // Join PIN room
        this.container.querySelector('#chess-btn-join-pin').addEventListener('click', () => {
            const pin = this.container.querySelector('#chess-input-pin').value.trim();
            if (pin.length === 4) {
                this.sendPacket({ type: 'chess_join_room', pin, playerName: this.localPlayerName });
            }
        });

        // AI Game buttons
        this.container.querySelector('#chess-btn-ai-white').addEventListener('click', () => {
            this.startAIGame('w');
        });
        this.container.querySelector('#chess-btn-ai-black').addEventListener('click', () => {
            this.startAIGame('b');
        });

        // Draw & Resign
        this.container.querySelector('#chess-btn-draw').addEventListener('click', () => {
            if (this.gameMode === 'online') {
                this.sendPacket({ type: 'chess_draw_offer' });
                this.addChatMessage('Has ofrecido tablas al oponente.', 'system');
            }
        });

        this.container.querySelector('#chess-btn-resign').addEventListener('click', () => {
            if (this.gameMode === 'online') {
                if (confirm('¿Estás seguro de que deseas rendirte?')) {
                    this.sendPacket({ type: 'chess_resign' });
                }
            } else if (this.gameMode === 'ai') {
                this.endGame('Rendición', this.playerColor === 'w' ? 'b' : 'w');
            }
        });

        // Chat send
        const chatInput = this.container.querySelector('#chess-chat-input');
        const sendChat = () => {
            const text = chatInput.value.trim();
            if (text && this.gameMode === 'online') {
                this.sendPacket({ type: 'chess_chat', text });
                chatInput.value = '';
            }
        };
        this.container.querySelector('#chess-btn-chat-send').addEventListener('click', sendChat);
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendChat();
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            this.view2D.resize();
            this.view3D.resize();
        });
    }

    setupSocketHandlers() {
        if (!this.socket) return;

        // Custom listener for chess packets
        this.socket.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data);
                if (!data || !data.type || !data.type.startsWith('chess_')) return;
                this.handleServerPacket(data);
            } catch (err) {
                // Non-JSON or standard voxel packet
            }
        });

        // Poll spectator games every 8 seconds when matchmaking tab is visible
        setInterval(() => {
            if (this.container.querySelector('#chess-tab-matchmaking').classList.contains('active')) {
                this.sendPacket({ type: 'chess_list_games' });
            }
        }, 8000);
    }

    sendPacket(packet) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(packet));
        }
    }

    handleServerPacket(packet) {
        switch (packet.type) {
            case 'chess_room_created': {
                const info = this.container.querySelector('#chess-private-info');
                info.innerHTML = `⭐ <b>Sala Creada</b>. PIN: <span class="chess-badge-pin">${packet.pin}</span><br>Pásale este PIN a tu amigo para jugar.`;
                this.currentRoomId = packet.roomId;
                break;
            }

            case 'chess_game_start': {
                this.currentRoomId = packet.roomId;
                this.gameMode = 'online';
                this.isSpectator = false;
                this.playerColor = packet.color; // 'w' or 'b'

                // Reset queue button
                const qBtn = this.container.querySelector('#chess-btn-queue-join');
                qBtn.classList.remove('in-queue');
                qBtn.textContent = '🔍 Buscar Partida';

                // Switch to game tab
                this.container.querySelector('.chess-tab-btn[data-tab="game"]').click();

                // Setup orientation
                this.view2D.setOrientation(this.playerColor);
                this.view3D.setOrientation(this.playerColor);

                // Setup Clocks
                this.whiteTimeMs = packet.clocks.w;
                this.blackTimeMs = packet.clocks.b;
                this.incrementMs = packet.clocks.increment;
                this.startClock();

                // Reset Engine
                this.engine.reset();
                this.view2D.attachEngine(this.engine);
                this.view3D.attachEngine(this.engine);

                // Player labels
                this.updatePlayerLabels(packet.whitePlayer.name, packet.blackPlayer.name);
                this.updateStatusBanner();
                this.clearMovesTable();
                this.addChatMessage(`¡Partida iniciada contra ${packet.opponent.name}!`, 'system');
                break;
            }

            case 'chess_move_broadcast': {
                // Apply move if it wasn't our local move
                const executed = this.engine.makeMove(packet.from, packet.to, packet.promotion);
                if (executed) {
                    this.view2D.setLastMove(packet.from, packet.to);
                    this.view3D.animateAndApply(
                        ChessEngine.squareToCoords(packet.from),
                        ChessEngine.squareToCoords(packet.to),
                        packet.from,
                        packet.to,
                        packet.promotion
                    );
                    this.view2D.render();
                    this.addMoveToTable(executed);
                    this.updateCapturedTray();
                }

                // Sync Clocks
                if (packet.clocks) {
                    this.whiteTimeMs = packet.clocks.w;
                    this.blackTimeMs = packet.clocks.b;
                }
                this.updateStatusBanner();
                break;
            }

            case 'chess_game_over': {
                this.stopClock();
                let msg = '';
                if (packet.winner === 'draw') {
                    msg = `Tablas: ${packet.reason}`;
                } else {
                    const winnerName = packet.winner === 'w' ? 'Blancas' : 'Negras';
                    msg = `¡Victoria para ${winnerName}! Motivo: ${packet.reason}`;
                }
                this.addChatMessage(msg, 'system');
                alert(msg);
                this.updateStatusBanner(msg);
                break;
            }

            case 'chess_draw_offered': {
                if (confirm('Tu oponente te ofrece tablas. ¿Aceptas?')) {
                    this.sendPacket({ type: 'chess_draw_accept' });
                } else {
                    this.sendPacket({ type: 'chess_draw_decline' });
                }
                break;
            }

            case 'chess_chat_broadcast': {
                this.addChatMessage(`${packet.sender}: ${packet.text}`, packet.isSpectator ? 'spectator' : 'player');
                break;
            }

            case 'chess_games_list': {
                this.renderSpectatorGames(packet.games);
                break;
            }

            case 'chess_spectate_start': {
                this.gameMode = 'spectate';
                this.isSpectator = true;
                this.currentRoomId = packet.roomId;
                this.engine.loadFen(packet.fen);
                this.view2D.attachEngine(this.engine);
                this.view3D.attachEngine(this.engine);
                this.updatePlayerLabels(packet.whitePlayer.name, packet.blackPlayer.name);
                this.container.querySelector('.chess-tab-btn[data-tab="game"]').click();
                this.addChatMessage(`Observando partida en directo...`, 'system');
                break;
            }
        }
    }

    startAIGame(color = 'w') {
        this.gameMode = 'ai';
        this.playerColor = color;
        this.isSpectator = false;
        this.aiLevel = parseInt(this.container.querySelector('#chess-ai-select').value, 10);

        // Reset Engine
        this.engine.reset();
        this.view2D.setOrientation(color);
        this.view3D.setOrientation(color);
        this.view2D.attachEngine(this.engine);
        this.view3D.attachEngine(this.engine);

        // Reset Clocks (10 minutes)
        this.whiteTimeMs = 600000;
        this.blackTimeMs = 600000;
        this.incrementMs = 0;
        this.startClock();

        this.updatePlayerLabels(
            color === 'w' ? this.localPlayerName : `Motor IA Nivel ${this.aiLevel}`,
            color === 'b' ? this.localPlayerName : `Motor IA Nivel ${this.aiLevel}`
        );

        this.clearMovesTable();
        this.container.querySelector('.chess-tab-btn[data-tab="game"]').click();
        this.updateStatusBanner();

        // If AI plays White, trigger AI move
        if (color === 'b') {
            this.triggerAIMove();
        }
    }

    async triggerAIMove() {
        if (this.gameMode !== 'ai' || this.engine.isGameOver) return;
        this.updateStatusBanner('Motor IA pensando...');

        const bestMove = await this.ai.findBestMove(this.engine, this.aiLevel);
        if (bestMove) {
            const executed = this.engine.makeMove(bestMove.from, bestMove.to, bestMove.promotion);
            if (executed) {
                this.view2D.setLastMove(bestMove.from, bestMove.to);
                this.view3D.animateAndApply(
                    ChessEngine.squareToCoords(bestMove.from),
                    ChessEngine.squareToCoords(bestMove.to),
                    bestMove.from,
                    bestMove.to,
                    bestMove.promotion
                );
                this.view2D.render();
                this.addMoveToTable(executed);
                this.updateCapturedTray();
                this.updateStatusBanner();
                this.checkLocalGameOver();
            }
        }
    }

    handleLocalMove(fromSq, toSq, promotion, executed) {
        if (!executed) return;

        this.addMoveToTable(executed);
        this.updateCapturedTray();
        this.updateStatusBanner();

        if (this.gameMode === 'online') {
            this.sendPacket({
                type: 'chess_move',
                from: fromSq,
                to: toSq,
                promotion
            });
        } else if (this.gameMode === 'ai') {
            if (!this.checkLocalGameOver()) {
                setTimeout(() => this.triggerAIMove(), 250);
            }
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
            alert(msg);
            this.updateStatusBanner(msg);
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
        this.lastClockTick = performance.now();
        this.clockInterval = setInterval(() => {
            const now = performance.now();
            const delta = now - this.lastClockTick;
            this.lastClockTick = now;

            if (this.engine.turn === 'w') {
                this.whiteTimeMs = Math.max(0, this.whiteTimeMs - delta);
            } else {
                this.blackTimeMs = Math.max(0, this.blackTimeMs - delta);
            }

            this.updateClockDisplays();

            if (this.whiteTimeMs === 0 || this.blackTimeMs === 0) {
                this.stopClock();
                if (this.gameMode === 'ai') {
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

        const formatTime = (ms) => {
            const totalSec = Math.floor(ms / 1000);
            const m = Math.floor(totalSec / 60);
            const s = totalSec % 60;
            return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        };

        if (this.playerColor === 'w') {
            topEl.textContent = formatTime(this.blackTimeMs);
            bottomEl.textContent = formatTime(this.whiteTimeMs);
        } else {
            topEl.textContent = formatTime(this.whiteTimeMs);
            bottomEl.textContent = formatTime(this.blackTimeMs);
        }
    }

    updatePlayerLabels(whiteName = 'Blancas', blackName = 'Negras') {
        const topName = this.container.querySelector('#chess-top-name');
        const bottomName = this.container.querySelector('#chess-bottom-name');

        if (this.playerColor === 'w') {
            topName.textContent = blackName;
            bottomName.textContent = whiteName;
        } else {
            topName.textContent = whiteName;
            bottomName.textContent = blackName;
        }
    }

    updateStatusBanner(customText = null) {
        const pill = this.container.querySelector('#chess-status-pill');
        if (customText) {
            pill.textContent = customText;
            return;
        }

        const turn = this.engine.turn === 'w' ? 'Blancas' : 'Negras';
        const inCheck = this.engine.isInCheck(this.engine.turn);

        if (inCheck) {
            pill.textContent = `⚠️ ¡Jaque a ${turn}!`;
            pill.style.background = '#e74c3c';
        } else {
            pill.textContent = `Mueven ${turn}`;
            pill.style.background = '#2c3e50';
        }
    }

    clearMovesTable() {
        this.container.querySelector('#chess-moves-body').innerHTML = '';
    }

    addMoveToTable(executedMove) {
        const tbody = this.container.querySelector('#chess-moves-body');
        const moveNumber = Math.ceil(this.engine.history.length / 2);

        if (executedMove.piece.color === 'w') {
            const tr = document.createElement('tr');
            tr.id = `chess-row-${moveNumber}`;
            tr.innerHTML = `
                <td class="chess-move-num">${moveNumber}.</td>
                <td class="chess-move-w">${executedMove.san}</td>
                <td class="chess-move-b"></td>
            `;
            tbody.appendChild(tr);
        } else {
            let tr = tbody.querySelector(`#chess-row-${moveNumber}`);
            if (!tr) {
                tr = document.createElement('tr');
                tr.id = `chess-row-${moveNumber}`;
                tr.innerHTML = `
                    <td class="chess-move-num">${moveNumber}.</td>
                    <td class="chess-move-w">...</td>
                    <td class="chess-move-b">${executedMove.san}</td>
                `;
                tbody.appendChild(tr);
            } else {
                tr.querySelector('.chess-move-b').textContent = executedMove.san;
            }
        }

        const feed = this.container.querySelector('#chess-moves-feed');
        feed.scrollTop = feed.scrollHeight;
    }

    updateCapturedTray() {
        // Material counts
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
                        wScore += PIECE_VALUES[p.type];
                    } else {
                        bPieces[p.type]++;
                        bScore += PIECE_VALUES[p.type];
                    }
                }
            }
        }

        // Standard piece starting counts
        const standard = { p: 8, n: 2, b: 2, r: 2, q: 1 };
        let capturedWhite = '';
        let capturedBlack = '';

        for (const [type, count] of Object.entries(standard)) {
            const capturedW = Math.max(0, count - wPieces[type]);
            const capturedB = Math.max(0, count - bPieces[type]);
            capturedWhite += type.toUpperCase().repeat(capturedW);
            capturedBlack += type.toLowerCase().repeat(capturedB);
        }

        const topTray = this.container.querySelector('#chess-top-captured');
        const bottomTray = this.container.querySelector('#chess-bottom-captured');

        if (this.playerColor === 'w') {
            topTray.textContent = capturedWhite;
            bottomTray.textContent = capturedBlack;
        } else {
            topTray.textContent = capturedBlack;
            bottomTray.textContent = capturedWhite;
        }
    }

    addChatMessage(text, type = 'chat') {
        const feed = this.container.querySelector('#chess-chat-messages');
        const div = document.createElement('div');
        div.className = `chess-chat-msg ${type}`;
        div.textContent = text;
        feed.appendChild(div);
        feed.scrollTop = feed.scrollHeight;
    }

    renderSpectatorGames(games) {
        const list = this.container.querySelector('#chess-spectator-games');
        if (!games || games.length === 0) {
            list.innerHTML = '<span class="chess-empty-text">No hay partidas públicas en directo ahora mismo.</span>';
            return;
        }

        list.innerHTML = games.map(g => `
            <div class="chess-live-item">
                <div class="chess-live-info">
                    <span class="chess-live-players">⚔️ ${g.whitePlayer} vs ${g.blackPlayer}</span>
                    <span class="chess-live-meta">${g.timeControl} • ${g.spectators} espectador(es)</span>
                </div>
                <button class="chess-btn chess-btn-sm chess-btn-outline" onclick="window.chessJoinSpectate('${g.roomId}')">
                    👁️ Ver
                </button>
            </div>
        `).join('');

        window.chessJoinSpectate = (roomId) => {
            this.sendPacket({ type: 'chess_spectate', roomId });
        };
    }
}

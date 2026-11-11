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
        this.gameMode = 'ai'; // 'ai', 'online', 'pass_and_play', 'spectate'
        this.aiLevel = 3;
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
                        <svg class="chess-svg-icon" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
                    </button>
                    <div class="chess-appbar-title-group">
                        <span class="chess-appbar-title">Grandmaster Chess</span>
                        <span class="chess-appbar-subtitle" id="chess-game-mode-subtitle">vs Motor IA (Nivel 3)</span>
                    </div>
                    <div class="chess-appbar-actions">
                        <button id="chess-btn-toggle-view" class="chess-pill-btn" aria-label="Cambiar vista 2D/3D" title="Alternar Vista 2D / 3D">
                            <span id="chess-view-label">🎲 3D</span>
                        </button>
                        <button id="chess-btn-flip" class="chess-icon-btn" aria-label="Girar tablero" title="Girar tablero">
                            <svg class="chess-svg-icon" viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
                        </button>
                        <button id="chess-btn-options" class="chess-icon-btn" aria-label="Opciones de partida" title="Opciones de partida">
                            <svg class="chess-svg-icon" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
                        </button>
                    </div>
                </header>

                <!-- Row 2: Top Opponent Card (44px) -->
                <div class="chess-player-card top" id="chess-player-top">
                    <div class="chess-player-left">
                        <div class="chess-avatar-box">
                            <span id="chess-top-avatar-icon">🤖</span>
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
                                    <button class="chess-promo-btn" data-piece="q" title="Dama">♛</button>
                                    <button class="chess-promo-btn" data-piece="n" title="Caballo">♞</button>
                                    <button class="chess-promo-btn" data-piece="r" title="Torre">♜</button>
                                    <button class="chess-promo-btn" data-piece="b" title="Alfil">♝</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Row 4: Bottom Player Card (44px) -->
                <div class="chess-player-card bottom" id="chess-player-bottom">
                    <div class="chess-player-left">
                        <div class="chess-avatar-box">
                            <span id="chess-bottom-avatar-icon">♟</span>
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
                    <button id="chess-ticker-first" class="chess-ticker-btn" title="Primera jugada" aria-label="Primera jugada">⏮</button>
                    <button id="chess-ticker-prev" class="chess-ticker-btn" title="Jugada anterior" aria-label="Jugada anterior">◀</button>
                    <div class="chess-ticker-moves" id="chess-ticker-feed"></div>
                    <button id="chess-ticker-next" class="chess-ticker-btn" title="Jugada siguiente" aria-label="Jugada siguiente">▶</button>
                    <button id="chess-ticker-latest" class="chess-ticker-btn" title="Última jugada" aria-label="Última jugada">⏭</button>
                    <button id="chess-ticker-undo" class="chess-ticker-undo" title="Deshacer última jugada">↩ Deshacer</button>
                </div>

                <!-- Row 6: Docked Material 3 Bottom Navigation Bar (56px) -->
                <nav class="chess-bottom-nav" id="chess-bottom-nav" role="navigation" aria-label="Navegación de ajedrez">
                    <button class="chess-nav-item active" data-sheet="none" data-tab="game">
                        <div class="chess-nav-indicator"></div>
                        <span class="chess-nav-icon">♟️</span>
                        <span class="chess-nav-label">Partida</span>
                    </button>
                    <button class="chess-nav-item" data-sheet="sheet-play" data-tab="play">
                        <div class="chess-nav-indicator"></div>
                        <span class="chess-nav-icon">⚡</span>
                        <span class="chess-nav-label">Jugar</span>
                    </button>
                    <button class="chess-nav-item" data-sheet="sheet-analysis" data-tab="analysis">
                        <div class="chess-nav-indicator"></div>
                        <span class="chess-nav-icon">📜</span>
                        <span class="chess-nav-label">Movimientos</span>
                    </button>
                    <button class="chess-nav-item" data-sheet="sheet-rooms" data-tab="rooms">
                        <div class="chess-nav-indicator"></div>
                        <span class="chess-nav-icon">💬</span>
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
                        <div class="chess-sheet-title">⚡ Emparejamiento & Juego</div>
                        <button class="chess-sheet-close" data-close="sheet-play">&times;</button>
                    </div>
                    <div class="chess-sheet-body">
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
                            <button id="chess-btn-create-private" class="chess-btn chess-btn-primary">
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
                            <label for="chess-ai-select" style="font-weight:600; color:#cbd5e1;">Dificultad:</label>
                            <select id="chess-ai-select" class="chess-select">
                                <option value="1">Nivel 1: Principiante (ELO 800)</option>
                                <option value="2">Nivel 2: Casual (ELO 1200)</option>
                                <option value="3" selected>Nivel 3: Intermedio (ELO 1600)</option>
                                <option value="4">Nivel 4: Avanzado (ELO 2000)</option>
                                <option value="5">Nivel 5: Gran Maestro (ELO 2400)</option>
                            </select>
                        </div>
                        <div class="chess-ai-color-row">
                            <button class="chess-btn chess-btn-outline" id="chess-btn-ai-white">♔ Jugar Blancas</button>
                            <button class="chess-btn chess-btn-outline" id="chess-btn-ai-black">♚ Jugar Negras</button>
                        </div>
                    </div>
                </div>

                <!-- Sheet 2: Options & Settings -->
                <div class="chess-bottom-sheet" id="sheet-options">
                    <div class="chess-sheet-drag-handle"></div>
                    <div class="chess-sheet-header">
                        <div class="chess-sheet-title">⚙️ Opciones de Partida</div>
                        <button class="chess-sheet-close" data-close="sheet-options">&times;</button>
                    </div>
                    <div class="chess-sheet-body">
                        <div class="chess-section-title">Acciones de Partida</div>
                        <div class="chess-options-grid">
                            <button id="chess-btn-draw" class="chess-btn chess-btn-outline">🤝 Ofrecer Tablas</button>
                            <button id="chess-btn-resign" class="chess-btn chess-btn-danger">🏳️ Rendirse</button>
                            <button id="chess-btn-rematch" class="chess-btn chess-btn-primary" style="display:none;">🔄 Solicitar Revancha</button>
                        </div>

                        <div class="chess-divider"></div>

                        <div class="chess-section-title">🎨 Tema del Tablero</div>
                        <div class="chess-ai-row">
                            <select id="chess-select-theme" class="chess-select">
                                <option value="walnut_maple" selected>Nogal Oscuro y Arce Clásico (Madera de Lujo)</option>
                                <option value="carrara_marquina">Mármol Carrara & Marquina Negro (Mármol Pulido)</option>
                                <option value="midnight_obsidian">Obsidiana & Amatista Medianoche</option>
                            </select>
                        </div>

                        <div class="chess-divider"></div>

                        <div class="chess-section-title">🎥 Ajuste de Cámara 3D</div>
                        <div class="chess-options-grid">
                            <button id="chess-cam-angled" class="chess-btn chess-btn-outline">🎲 Vista 3D Dinámica (56°)</button>
                            <button id="chess-cam-topdown" class="chess-btn chess-btn-outline">📐 Vista Cenital Torneo 2.5D (84°)</button>
                            <button id="chess-cam-cinematic" class="chess-btn chess-btn-outline">🎬 Vista Heroica Cinemática (32°)</button>
                        </div>

                        <div class="chess-divider"></div>

                        <div class="chess-section-title">🔊 Efectos de Audio</div>
                        <button id="chess-btn-toggle-sound" class="chess-btn chess-btn-outline chess-full-width">
                            🔊 Sonido Activado
                        </button>
                    </div>
                </div>

                <!-- Sheet 3: Score-sheet, Analysis & Export -->
                <div class="chess-bottom-sheet" id="sheet-analysis">
                    <div class="chess-sheet-drag-handle"></div>
                    <div class="chess-sheet-header">
                        <div class="chess-sheet-title">📜 Notación de Jugadas & Exportación</div>
                        <button class="chess-sheet-close" data-close="sheet-analysis">&times;</button>
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
                            <button id="chess-btn-copy-fen" class="chess-btn chess-btn-outline">📋 Copiar FEN</button>
                        </div>

                        <div class="chess-section-title">Notación PGN Completa</div>
                        <div class="chess-code-box" id="chess-pgn-box">[Event "Grandmaster Chess"]</div>
                        <div class="chess-copy-row">
                            <button id="chess-btn-copy-pgn" class="chess-btn chess-btn-outline">📋 Copiar PGN</button>
                        </div>
                    </div>
                </div>

                <!-- Sheet 4: Rooms, Spectators & Live Chat -->
                <div class="chess-bottom-sheet" id="sheet-rooms">
                    <div class="chess-sheet-drag-handle"></div>
                    <div class="chess-sheet-header">
                        <div class="chess-sheet-title">💬 Salas & Retransmisiones</div>
                        <button class="chess-sheet-close" data-close="sheet-rooms">&times;</button>
                    </div>
                    <div class="chess-sheet-body">
                        <div class="chess-section-title">Chat de la Partida</div>
                        <div class="chess-chat-feed" id="chess-chat-messages">
                            <div class="chess-chat-msg system">¡Bienvenido a Grandmaster Chess!</div>
                        </div>
                        <div class="chess-chat-bar">
                            <input type="text" id="chess-chat-input" placeholder="Escribe un mensaje..." maxlength="120">
                            <button id="chess-btn-chat-send" class="chess-btn chess-btn-primary">Enviar</button>
                        </div>

                        <div class="chess-divider"></div>

                        <div class="chess-section-title">👁️ Retransmisiones en Directo</div>
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

        this.view2D = new ChessView2D(c2d, {
            orientation: this.playerColor === 'b' ? 'b' : 'w',
            onMoveAttempt: (from, to, promo, res) => {
                if (this.isProcessingRemoteMove) return;
                this.handleLocalMove(from, to, promo, res);
            },
            onPromotionNeeded: (from, to, callback) => this.promptPromotion(callback)
        });

        this.view3D = new ChessView3D(c3d, {
            orientation: this.playerColor === 'b' ? 'b' : 'w',
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
                viewLabel.textContent = '♟️ 2D';
                this.view3D.resize();
                this.view3D.syncPieces();
                this.showToast('Vista 3D activada');
            } else {
                this.currentViewMode = '2d';
                c3d.style.display = 'none';
                c2d.style.display = 'block';
                viewLabel.textContent = '🎲 3D';
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
                queueBtn.textContent = '🔍 Buscar Partida';
                this.showToast('Búsqueda cancelada');
            } else {
                this.sendPacket('chess_join_queue', { timeControl: tc, name: this.localPlayerName });
                queueBtn.classList.add('in-queue');
                queueBtn.textContent = '⏳ Cancelar Búsqueda...';
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

        // AI Game buttons
        this.container.querySelector('#chess-btn-ai-white').addEventListener('click', () => {
            this.startAIGame('w');
            this.closeSheets();
        });
        this.container.querySelector('#chess-btn-ai-black').addEventListener('click', () => {
            this.startAIGame('b');
            this.closeSheets();
        });

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
            soundBtn.textContent = this.soundEnabled ? '🔊 Sonido Activado' : '🔇 Sonido Desactivado';
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

        // Window resize
        window.addEventListener('resize', () => {
            this.view2D.resize();
            this.view3D.resize();
        });
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
                    qBtn.textContent = '🔍 Buscar Partida';
                }

                // Close any open bottom sheet and return to board
                this.closeSheets();

                // Setup orientation
                this.view2D.setOrientation(this.playerColor);
                this.view3D.setOrientation(this.playerColor);

                // Setup Clocks
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

    startAIGame(color = 'w') {
        this.gameMode = 'ai';
        this.playerColor = color;
        this.isSpectator = false;
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

        // 10-minute clocks for local play
        this.whiteTimeMs = 600000;
        this.blackTimeMs = 600000;
        this.incrementMs = 0;
        this.startClock();

        this.updatePlayerLabels(
            color === 'w' ? this.localPlayerName : this.opponentName,
            color === 'b' ? this.localPlayerName : this.opponentName
        );

        this.clearMovesTable();
        this.updateMoveTicker();
        this.updateCapturedTray();
        this.updateEvaluationBar();
        this.updateStatusBanner();
        this.showToast(`Partida iniciada vs ${this.opponentName}`);

        // If AI plays White, trigger opening move
        if (color === 'b') {
            this.triggerAIMove();
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
        this.lastClockTick = performance.now();
        this.lastCountdownBeepSec = null;

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
        if (!topEl || !bottomEl) return;

        const formatTime = (ms) => {
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

        // Low time pulsing alert (<30s)
        if (topMs < 30000 && isTopTurn) topEl.classList.add('low-time');
        else topEl.classList.remove('low-time');

        if (bottomMs < 30000 && !isTopTurn) bottomEl.classList.add('low-time');
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

        if (isWhiteBottom) {
            if (topName) topName.textContent = blackName;
            if (bottomName) bottomName.textContent = whiteName;
            if (topAvatar) topAvatar.textContent = this.gameMode === 'ai' ? '🤖' : '♚';
            if (bottomAvatar) bottomAvatar.textContent = '♔';
            if (topRating) topRating.textContent = this.opponentRating;
            if (bottomRating) bottomRating.textContent = this.localRating;
        } else {
            if (topName) topName.textContent = whiteName;
            if (bottomName) bottomName.textContent = blackName;
            if (topAvatar) topAvatar.textContent = '♔';
            if (bottomAvatar) bottomAvatar.textContent = this.gameMode === 'ai' ? '🤖' : '♚';
            if (topRating) topRating.textContent = this.localRating;
            if (bottomRating) bottomRating.textContent = this.opponentRating;
        }

        if (topDot) {
            topDot.className = 'chess-status-dot ' + (this.gameMode === 'ai' ? 'bot' : 'online');
        }
        if (bottomDot) {
            bottomDot.className = 'chess-status-dot online';
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
            sub.textContent = `⚠️ ¡Jaque a ${turn}!`;
            sub.style.color = '#ef4444';
        } else {
            if (this.gameMode === 'ai') {
                sub.textContent = `vs ${this.opponentName} • Mueven ${turn}`;
            } else if (this.gameMode === 'online') {
                sub.textContent = `Partida Online • Mueven ${turn}`;
            } else if (this.gameMode === 'spectate') {
                sub.textContent = `Retransmisión en Directo • Mueven ${turn}`;
            } else {
                sub.textContent = `Mueven ${turn}`;
            }
            sub.style.color = '#38bdf8';
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
                    <span class="chess-live-players">⚔️ ${g.whiteName || g.whitePlayer} vs ${g.blackName || g.blackPlayer}</span>
                    <span class="chess-live-meta">${g.timeControlName || g.timeControl} • ${g.spectators} espectador(es)</span>
                </div>
                <button class="chess-btn chess-btn-outline" style="padding:4px 8px; font-size:11px;" onclick="window.chessJoinSpectate('${g.roomId}')">
                    👁️ Ver
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

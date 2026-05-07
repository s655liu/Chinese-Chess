class UI {
    constructor() {
        this.boardEl = document.getElementById('board-inner');
        this.intersectionsEl = document.querySelector('.interaction-layer');
        this.boardLinesEl = document.querySelector('.grid-layer');
        this.historyList = document.getElementById('history-body');
        
        this.selectedCell = null;
        this.isTimed = true;
        this.gameState = { board: [], turn: 'red', game_over: false, history: [], timers: { red: 900, black: 900 } };
        this.roomID = null;
        this.playerColor = 'red';
        this.socket = null;
        this.isGuest = false;
        this.isAuthenticated = false;
        this.aiLevel = 'hard';
        this.currentView = 'dashboard';
        this.previousView = 'dashboard';
        
        this.checkUrlParams();
        
        this.initBoardGraphics();
        this.initGrid();
        this.checkExistingAuth();
        this.initViewListeners();
        this.initAuthListeners();
        this.initModeListeners();
        this.initLobbyListeners();
        this.initAudio();
        this.startTimer();

        // Event delegation for action buttons
        document.body.addEventListener('click', (e) => {
            const id = e.target.id;
            if (id === 'btn-reset') document.getElementById('mode-selection-overlay').classList.add('active');
            if (id === 'btn-reset-timer') {
                this.gameState.timers = { red: 600, black: 600 };
                this.updateTimerDisplay();
            }
            if (id === 'btn-hint') this.showHint();
            if (id === 'btn-resign') this.handleResign();
            if (id === 'btn-coords') this.toggleCoords();
        });
    }

    initAudio() {
        // We create/resume the audio context on user interaction to comply with strict browser policies
        const startAudio = async () => {
            if (!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioCtx.state === 'suspended') {
                await this.audioCtx.resume();
            }
            // Once resumed, we can stop listening for the initial interaction
            if (this.audioCtx.state === 'running') {
                document.removeEventListener('click', startAudio);
                document.removeEventListener('keydown', startAudio);
            }
        };
        document.addEventListener('click', startAudio);
        document.addEventListener('keydown', startAudio);
    }

    async playMoveSound() {
        if (!this.audioCtx) return;
        
        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }
        
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        
        // 'triangle' sounds more like a wooden clack than 'sine'
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, this.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, this.audioCtx.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0.6, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.12);
        
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.12);
    }

    async checkExistingAuth() {
        try {
            const res = await fetch('/api/check_auth');
            const data = await res.json();
            if (data.authenticated) {
                this.isAuthenticated = true;
                this.updateAuthUI(data.username);
            } else {
                this.updateAuthUI(null);
            }
        } catch (e) {
            this.updateAuthUI(null);
        }
    }

    updateAuthUI(username) {
        const userInfo = document.getElementById('user-info');
        const guestControls = document.getElementById('guest-controls');
        const authPrompt = document.getElementById('dashboard-auth-prompt');
        const displayUsername = document.getElementById('display-username');

        if (this.isAuthenticated && username && username !== 'Guest Player') {
            if (userInfo) userInfo.style.display = 'flex';
            if (guestControls) guestControls.style.display = 'none';
            if (authPrompt) authPrompt.style.display = 'none';
            if (displayUsername) displayUsername.textContent = username;
        } else {
            if (userInfo) userInfo.style.display = 'none';
            if (guestControls) guestControls.style.display = 'flex';
            if (authPrompt) authPrompt.style.display = 'block';
        }
    }

    checkUrlParams() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('showAuth')) {
            document.getElementById('auth-overlay').classList.add('active');
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    initAuthListeners() {
        document.getElementById('btn-login').addEventListener('click', async () => {
            const username = document.getElementById('login-username').value;
            const password = document.getElementById('login-password').value;
            const remember = document.getElementById('login-remember').checked;
            
            const res = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, remember })
            });
            const data = await res.json();
            if (data.success) {
                this.isAuthenticated = true;
                this.handleLoginSuccess(data.username);
            } else {
                alert(data.error);
            }
        });

        document.getElementById('btn-guest-entry').addEventListener('click', () => {
            this.isGuest = true;
            this.isAuthenticated = false; 
            this.handleLoginSuccess('Guest Player');
        });

        document.querySelectorAll('.btn-show-auth').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('auth-overlay').classList.add('active');
            });
        });
    }

    initViewListeners() {
        const logo = document.getElementById('logo-home');
        if (logo) {
            logo.addEventListener('click', () => this.switchView('dashboard'));
        }

        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                const view = link.getAttribute('data-view');
                if (view === 'game') {
                    this.previousView = this.currentView;
                    document.getElementById('mode-selection-overlay').classList.add('active');
                }
                this.switchView(view);
            });
        });

        const triggerGame = document.querySelector('.btn-trigger-game');
        if (triggerGame) {
            triggerGame.addEventListener('click', () => {
                this.previousView = this.currentView;
                document.getElementById('mode-selection-overlay').classList.add('active');
                this.switchView('game');
            });
        }

        const triggerLearn = document.querySelector('.btn-trigger-learn');
        if (triggerLearn) {
            triggerLearn.addEventListener('click', () => this.switchView('learn'));
        }

        document.querySelectorAll('.btn-close-overlay').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const overlay = e.target.closest('.setup-overlay');
                overlay.classList.remove('active');
                
                // If closing mode selection and no game active, go back
                if (overlay.id === 'mode-selection-overlay' && (!this.gameState.board || this.gameState.board.length === 0)) {
                    this.switchView(this.previousView || 'dashboard');
                }
            });
        });
    }

    switchView(viewId) {
        this.currentView = viewId;
        document.querySelectorAll('.content-view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

        const targetView = document.getElementById(`view-${viewId}`);
        const targetLink = document.querySelector(`.nav-link[data-view="${viewId}"]`);

        if (targetView) targetView.classList.add('active');
        if (targetLink) targetLink.classList.add('active');

        // Always re-init graphics if switching to game to ensure correct container sizing
        if (viewId === 'game') {
            setTimeout(() => {
                this.initBoardGraphics();
                if (this.gameState.board && this.gameState.board.length > 0) {
                    this.renderBoard();
                }
            }, 50);
        }
    }

    async initLocalGame() {
        this.gameMode = 'local';
        this.isGuest = true;
        
        // Hide AI status bar
        const aiStatusBar = document.getElementById('ai-status-bar');
        if (aiStatusBar) aiStatusBar.style.display = 'none';
        
        // Multiplayer-like timer (15 min)
        this.isTimed = true;
        this.gameState.timers = { red: 900, black: 900 };
        this.updateTimerDisplay();
        document.querySelectorAll('.player-timer').forEach(t => t.style.opacity = '1');

        await this.initGuestGame();
        this.roomID = 'guest';
        this.switchView('game');
    }

    async initGuestGame() {
        try {
            // Reset server-side guest engine first
            await fetch('/api/guest/reset', { method: 'POST' });

            const res = await fetch('/api/guest/state');
            const data = await res.json();
            this.updateGameState(data);
            this.switchView('game');
        } catch (e) {
            console.error("Failed to init guest game", e);
        }
    }

    initModeListeners() {
        document.querySelectorAll('.btn-side').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-side').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        document.getElementById('btn-choose-ai').addEventListener('click', () => {
            document.getElementById('mode-selection-overlay').classList.remove('active');
            document.getElementById('ai-difficulty-overlay').classList.add('active');
        });

        document.querySelectorAll('.btn-ai-level').forEach(btn => {
            btn.addEventListener('click', () => {
                // Update selection UI
                document.querySelectorAll('.btn-ai-level').forEach(b => {
                    b.classList.remove('primary-btn');
                    b.classList.add('glass-btn');
                });
                btn.classList.remove('glass-btn');
                btn.classList.add('primary-btn');
                
                this.aiLevel = btn.getAttribute('data-level');
            });
        });

        const timeSlider = document.getElementById('input-match-time');
        const timeLabel = document.getElementById('label-match-time');
        const timeSettings = document.getElementById('ai-time-settings');
        const timerCheck = document.getElementById('check-timed-game');

        if (timeSlider && timeLabel) {
            timeSlider.addEventListener('input', (e) => {
                timeLabel.textContent = `${e.target.value} min`;
            });
        }

        if (timerCheck && timeSettings) {
            timerCheck.addEventListener('change', (e) => {
                timeSettings.style.opacity = e.target.checked ? '1' : '0.3';
                timeSettings.style.pointerEvents = e.target.checked ? 'auto' : 'none';
            });
        }

        document.getElementById('btn-start-game').addEventListener('click', () => {
            // Update player color
            const activeSide = document.querySelector('.btn-side.active');
            this.playerColor = activeSide ? activeSide.getAttribute('data-side') : 'red';

            // Update UI label
            const label = document.getElementById('ai-level-label');
            if (label) {
                label.textContent = this.aiLevel.charAt(0).toUpperCase() + this.aiLevel.slice(1);
            }

            // Update timer preference
            this.isTimed = timerCheck ? timerCheck.checked : true;
            
            // Set match time (convert min to sec)
            const minutes = timeSlider ? parseInt(timeSlider.value) : 15;
            const seconds = minutes * 60;
            this.gameState.timers = { red: seconds, black: seconds };
            
            this.updateTimerDisplay();
            document.querySelectorAll('.player-timer').forEach(t => t.style.opacity = this.isTimed ? '1' : '0.2');

            this.isGuest = true;
            this.gameMode = 'ai';
            
            // Show AI status bar if playing AI
            const aiStatusBar = document.getElementById('ai-status-bar');
            if (aiStatusBar) aiStatusBar.style.display = 'block';

            this.initGuestGame().then(() => {
                this.roomID = 'guest';
                // If player is Black, AI must move first (Red)
                if (this.playerColor === 'black' && this.gameState.turn === 'red') {
                    setTimeout(() => this.makeGuestAiMove(), 500);
                }
            });
            document.getElementById('ai-difficulty-overlay').classList.remove('active');
        });

        document.getElementById('btn-back-to-mode').addEventListener('click', () => {
            document.getElementById('ai-difficulty-overlay').classList.remove('active');
            document.getElementById('mode-selection-overlay').classList.add('active');
        });

        document.getElementById('btn-choose-multi').addEventListener('click', () => {
            if (!this.isAuthenticated) {
                document.getElementById('mode-selection-overlay').classList.remove('active');
                document.getElementById('auth-overlay').classList.add('active');
                return;
            }
            document.getElementById('mode-selection-overlay').classList.remove('active');
            document.getElementById('lobby-overlay').classList.add('active');
        });

        document.getElementById('btn-choose-local').addEventListener('click', () => {
            document.getElementById('mode-selection-overlay').classList.remove('active');
            this.initLocalGame();
        });

        document.querySelectorAll('.btn-back-to-home').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.setup-overlay').forEach(ov => ov.classList.remove('active'));
                document.getElementById('home-overlay').classList.add('active');
            });
        });
    }

    handleLoginSuccess(username) {
        document.getElementById('auth-overlay').classList.remove('active');
        this.switchView('dashboard');
        this.updateAuthUI(username);
    }

    initLobbyListeners() {
        document.getElementById('btn-create-room').addEventListener('click', async () => {
            const res = await fetch('/api/games/create', { method: 'POST' });
            const data = await res.json();
            this.enterGame(data.room_id);
        });

        document.getElementById('btn-join-room').addEventListener('click', async () => {
            const roomID = document.getElementById('join-room-id').value;
            const res = await fetch(`/api/games/join/${roomID}`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                this.enterGame(roomID, data.role);
            } else {
                alert(data.error);
            }
        });
    }

    enterGame(roomID, role = 'red') {
        this.roomID = roomID;
        this.playerColor = role;
        this.gameMode = 'multiplayer';
        
        // Always enable timer for multiplayer (matches not against AI)
        this.isTimed = true;
        this.gameState.timers = { red: 900, black: 900 }; // 15 minutes
        this.updateTimerDisplay();
        document.querySelectorAll('.player-timer').forEach(t => t.style.opacity = '1');
        
        // Hide AI status bar for multiplayer
        const aiStatusBar = document.getElementById('ai-status-bar');
        if (aiStatusBar) aiStatusBar.style.display = 'none';

        document.getElementById('lobby-overlay').classList.remove('active');
        this.switchView('game');
        this.initSocket();
    }

    initSocket() {
        this.socket = io();
        this.socket.emit('join', { room: this.roomID });

        this.socket.on('init_state', (data) => {
            this.updateGameState(data);
        });

        this.socket.on('move_update', (data) => {
            this.updateGameState(data);
            if (data.last_move) {
                this.playMoveSound();
            }
        });
    }

    startTimer() {
        setInterval(() => {
            if (this.gameState.game_over || !this.isTimed || this.currentView !== 'game') return;
            if (!this.gameState.board || this.gameState.board.length === 0) return;
            
            const turn = this.gameState.turn;
            if (this.gameState.timers[turn] > 0) {
                this.gameState.timers[turn]--;
                this.updateTimerDisplay();
            } else {
                this.handleTimeout(turn);
            }
        }, 1000);
    }

    formatTime(s) {
        return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
    }

    updateTimerDisplay() {
        const redTimer = document.getElementById('timer-red');
        const blackTimer = document.getElementById('timer-black');
        
        if (!this.gameState.timers || !redTimer || !blackTimer) return;
        
        redTimer.innerHTML = `<span class="player-label">RED</span><span class="timer-value">${this.formatTime(this.gameState.timers.red)}</span>`;
        blackTimer.innerHTML = `<span class="player-label">BLACK</span><span class="timer-value">${this.formatTime(this.gameState.timers.black)}</span>`;
        
        redTimer.className = `player-timer red ${this.gameState.turn === 'red' ? 'active' : ''}`;
        blackTimer.className = `player-timer black ${this.gameState.turn === 'black' ? 'active' : ''}`;
    }

    handleTimeout(loser) {
        this.gameState.game_over = true;
        this.gameState.winner = loser === 'red' ? 'black' : 'red';
        this.updateStatus();
    }

    handleResign() {
        if (confirm("Are you sure you want to resign?")) {
            this.gameState.game_over = true;
            this.gameState.winner = this.gameState.turn === 'red' ? 'black' : 'red';
            this.updateStatus();
        }
    }

    toggleCoords() {
        this.showCoordinates = !this.showCoordinates;
        document.getElementById('btn-coords').textContent = `Coordinates: ${this.showCoordinates ? 'ON' : 'OFF'}`;
        this.renderBoard();
    }

    async showHint() {
        const btn = document.getElementById('btn-hint');
        btn.textContent = 'Thinking...';
        btn.disabled = true;

        try {
            const endpoint = this.isGuest ? '/api/guest/ai_move' : '/api/guest/ai_move'; // For now, use guest endpoint
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ level: 'hard' })
            });
            const result = await res.json();
            
            const lastMove = (result.history && result.history.length > 0) 
                ? result.history[result.history.length - 1] 
                : 'No suggestion';
                
            const messageEl = document.getElementById('game-message');
            if (messageEl) {
                messageEl.innerHTML = `<div style="color: #60a5fa; font-size: 0.9rem; margin-top: 0.5rem;">💡 Hint: ${lastMove}</div>`;
                setTimeout(() => messageEl.innerHTML = '', 5000);
            }
        } catch (e) {
            console.error("Hint failed", e);
        } finally {
            btn.textContent = 'Get Hint';
            btn.disabled = false;
        }
    }

    async fetchState() {
        try {
            const res = await fetch('/api/state');
            const data = await res.json();
            this.updateGameState(data);
        } catch (e) {
            console.error("Failed to fetch state", e);
        }
    }

    initBoardGraphics() {
        let svg = '<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">';
        const xSpace = 100 / 8;
        const ySpace = 100 / 9;

        for (let i = 0; i <= 8; i++) {
            const x = i * xSpace;
            if (i === 0 || i === 8) {
                svg += `<line x1="${x}%" y1="0%" x2="${x}%" y2="100%" stroke="rgba(255,255,255,0.2)" stroke-width="2" />`;
            } else {
                svg += `<line x1="${x}%" y1="0%" x2="${x}%" y2="${ySpace * 4}%" stroke="rgba(255,255,255,0.2)" stroke-width="2" />`;
                svg += `<line x1="${x}%" y1="${ySpace * 5}%" x2="${x}%" y2="100%" stroke="rgba(255,255,255,0.2)" stroke-width="2" />`;
            }
        }
        for (let j = 0; j <= 9; j++) {
            const y = j * ySpace;
            svg += `<line x1="0%" y1="${y}%" x2="100%" y2="${y}%" stroke="rgba(255,255,255,0.2)" stroke-width="2" />`;
        }
        svg += `<line x1="${3 * xSpace}%" y1="0%" x2="${5 * xSpace}%" y2="${2 * ySpace}%" stroke="rgba(255,255,255,0.2)" stroke-width="2" />`;
        svg += `<line x1="${5 * xSpace}%" y1="0%" x2="${3 * xSpace}%" y2="${2 * ySpace}%" stroke="rgba(255,255,255,0.2)" stroke-width="2" />`;
        svg += `<line x1="${3 * xSpace}%" y1="${7 * ySpace}%" x2="${5 * xSpace}%" y2="${9 * ySpace}%" stroke="rgba(255,255,255,0.2)" stroke-width="2" />`;
        svg += `<line x1="${5 * xSpace}%" y1="${7 * ySpace}%" x2="${3 * xSpace}%" y2="${9 * ySpace}%" stroke="rgba(255,255,255,0.2)" stroke-width="2" />`;
        svg += `<text x="50%" y="${4.5 * ySpace}%" dominant-baseline="middle" text-anchor="middle" class="river-text-svg" transform="translate(0, 5)">楚 河 漢 界</text>`;
        svg += '</svg>';
        this.boardLinesEl.innerHTML = svg;

        // Ensure clicking board background deselects
        this.boardEl.addEventListener('click', (e) => {
            if (e.target === this.boardEl) {
                this.selectedCell = null;
                this.validMoves = [];
                this.renderBoard();
            }
        });
    }

    initGrid() {
        this.intersectionsEl.innerHTML = '';
        for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 9; c++) {
                const cell = document.createElement('div');
                cell.className = 'intersection';
                cell.style.left = `${c * 100 / 8}%`;
                cell.style.top = `${r * 100 / 9}%`;
                cell.addEventListener('click', () => this.handleCellClick(r, c));
                this.intersectionsEl.appendChild(cell);
            }
        }
    }

    getPieceName(piece) {
        const names = { 'K': '帥', 'k': '將', 'A': '仕', 'a': '士', 'B': '相', 'b': '象', 'N': '傌', 'n': '馬', 'R': '俥', 'r': '車', 'C': '炮', 'c': '砲', 'P': '兵', 'p': '卒' };
        return names[piece] || '';
    }

    renderBoard() {
        // Clear old pieces, labels, and move dots
        document.querySelectorAll('.piece').forEach(p => p.remove());
        document.querySelectorAll('.coord-label').forEach(c => c.remove());
        document.querySelectorAll('.valid-move, .valid-capture').forEach(d => d.remove());
        
        const board = this.gameState.board;
        if (!board || board.length === 0) return;

        // Render coordinates relative to the wrapper
        const wrapper = this.boardEl.parentElement;
        if (this.showCoordinates) {
            // Columns (1-9) - Top and Bottom
            for (let c = 0; c < 9; c++) {
                const topLabel = document.createElement('div');
                topLabel.className = 'coord-label coord-h';
                topLabel.style.left = `${(c * 100 / 8)}%`;
                topLabel.style.top = '-70px'; // Increased from -55px
                topLabel.textContent = c + 1;
                this.boardEl.appendChild(topLabel);
                
                const botLabel = document.createElement('div');
                botLabel.className = 'coord-label coord-h';
                botLabel.style.left = `${(c * 100 / 8)}%`;
                botLabel.style.bottom = '-70px'; // Increased from -55px
                botLabel.textContent = c + 1;
                this.boardEl.appendChild(botLabel);
            }
            
            // Rows (A-J) - Left and Right
            const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
            for (let r = 0; r < 10; r++) {
                const leftLabel = document.createElement('div');
                leftLabel.className = 'coord-label coord-v';
                leftLabel.style.top = `${(r * 100 / 9)}%`;
                leftLabel.style.left = '-75px'; // Increased from -60px
                leftLabel.textContent = rows[r];
                this.boardEl.appendChild(leftLabel);
                
                const rightLabel = document.createElement('div');
                rightLabel.className = 'coord-label coord-v';
                rightLabel.style.top = `${(r * 100 / 9)}%`;
                rightLabel.style.right = '-75px'; // Increased from -60px
                rightLabel.textContent = rows[r];
                this.boardEl.appendChild(rightLabel);
            }
        }

        // Render pieces
        for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 9; c++) {
                const piece = board[r][c];
                if (piece) {
                    const pieceEl = document.createElement('div');
                    pieceEl.className = `piece ${piece === piece.toUpperCase() ? 'red' : 'black'}`;
                    pieceEl.style.left = `${c * 100 / 8}%`;
                    pieceEl.style.top = `${r * 100 / 9}%`;
                    
                    if (this.selectedCell && this.selectedCell.r === r && this.selectedCell.c === c) pieceEl.classList.add('selected');
                    
                    // Only animate the piece that just moved to avoid shakiness
                    const lastMove = this.getLastMove();
                    if (lastMove && lastMove.r === r && lastMove.c === c) {
                        pieceEl.classList.add('just-moved');
                    }

                    pieceEl.textContent = this.getPieceName(piece);
                    
                    // Add click event directly to the piece for better selection
                    pieceEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.handleCellClick(r, c);
                    });
                    
                    this.boardEl.appendChild(pieceEl);
                }
            }
        }

        // Render valid move dots
        if (this.validMoves) {
            this.validMoves.forEach(m => {
                const dot = document.createElement('div');
                const hasEnemy = board[m.r][m.c] !== null;
                dot.className = hasEnemy ? 'valid-capture' : 'valid-move';
                dot.style.left = `${m.c * 100 / 8}%`;
                dot.style.top = `${m.r * 100 / 9}%`;
                
                // Add click listener to the dot as well
                dot.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.handleCellClick(m.r, m.c);
                });
                
                this.boardEl.appendChild(dot);
            });
        }
    }

    async handleCellClick(r, c) {
        if (this.gameMode === 'local') {
            this.playerColor = this.gameState.turn;
        }
        if (this.gameState.game_over || this.gameState.turn !== this.playerColor) return;

        const board = this.gameState.board;
        const piece = board[r][c];
        const isRed = piece && piece === piece.toUpperCase();
        const pieceColor = piece ? (isRed ? 'red' : 'black') : null;
        const isOwnPiece = pieceColor === this.playerColor;

        if (isOwnPiece) {
            // If already selected, deselect
            if (this.selectedCell && this.selectedCell.r === r && this.selectedCell.c === c) {
                this.selectedCell = null;
                this.validMoves = [];
                this.renderBoard();
                return;
            }

            this.selectedCell = { r, c };
            const res = await fetch('/api/valid_moves', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ r, c, room: this.isGuest ? 'guest' : this.roomID })
            });
            this.validMoves = await res.json();
            this.renderBoard();
        } else if (this.selectedCell) {
            const isMoveValid = this.validMoves.some(m => m.r === r && m.c === c);
            if (!isMoveValid) {
                this.selectedCell = null;
                this.validMoves = [];
                this.renderBoard();
                return;
            }

            if (this.isGuest) {
                const res = await fetch('/api/guest/move', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ r1: this.selectedCell.r, c1: this.selectedCell.c, r2: r, c2: c })
                });
                const result = await res.json();
                this.updateGameState(result);
                this.playMoveSound();

                if (!result.game_over && result.turn !== this.playerColor && this.gameMode === 'ai') {
                    setTimeout(() => this.makeGuestAiMove(), 500);
                }
            } else {
                // Send move via Socket.IO
                this.socket.emit('move', {
                    room: this.roomID,
                    color: this.playerColor,
                    r1: this.selectedCell.r,
                    c1: this.selectedCell.c,
                    r2: r,
                    c2: c
                });
            }
            this.selectedCell = null;
            this.validMoves = [];
        }
    }

    async makeGuestAiMove() {
        const indicator = document.getElementById('ai-thinking-indicator');
        if (indicator) indicator.style.display = 'block';

        try {
            const res = await fetch('/api/guest/ai_move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ level: this.aiLevel })
            });
            const result = await res.json();
            this.updateGameState(result);
            this.playMoveSound();
        } catch (e) {
            console.error("AI move failed", e);
        } finally {
            if (indicator) indicator.style.display = 'none';
        }
    }

    async makeAiMove() {
        const indicator = document.getElementById('ai-thinking-indicator');
        if (indicator) indicator.style.display = 'block';

        try {
            const res = await fetch('/api/guest/ai_move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ level: this.aiLevel })
            });
            const result = await res.json();
            this.updateGameState(result);
        } catch (e) {
            console.error("AI move failed", e);
        }

        if (indicator) indicator.style.display = 'none';
    }

    updateGameState(result) {
        this.gameState.board = result.board;
        this.gameState.turn = result.turn;
        this.gameState.game_over = result.game_over;
        this.gameState.winner = result.winner;
        this.gameState.history = result.history;
        if (result.timers) this.gameState.timers = result.timers;
        
        this.selectedCell = null;
        this.validMoves = [];
        this.renderBoard();
        this.updateStatus();
        this.updateTimerDisplay(); // Ensure timers sync after AI move
        this.playMoveSound();
    }

    updateStatus() {
        const redTimer = document.getElementById('timer-red');
        const blackTimer = document.getElementById('timer-black');
        const messageEl = document.getElementById('game-message');

        if (this.gameState.turn === 'red') {
            if (redTimer) redTimer.classList.add('active');
            if (blackTimer) blackTimer.classList.remove('active');
        } else {
            if (blackTimer) blackTimer.classList.add('active');
            if (redTimer) redTimer.classList.remove('active');
        }

        this.updateHistory();

        if (this.gameState.game_over) {
            const winner = this.gameState.winner === 'red' ? 'RED' : 'BLACK';
            messageEl.innerHTML = `<span style="font-size: 2rem; color: #fbbf24; animation: victoryPulse 1s infinite;">VICTORY FOR ${winner}!</span>`;
            document.body.classList.add('game-over-celebration');
            
            // Disable interactions
            this.intersectionsEl.style.pointerEvents = 'none';
        } else {
            messageEl.innerHTML = '';
            this.intersectionsEl.style.pointerEvents = 'auto';
        }
    }

    updateHistory() {
        if (!this.gameState.history) return;
        const body = document.getElementById('history-body');
        body.innerHTML = '';
        
        // Group history into rounds (Red, Black)
        for (let i = 0; i < this.gameState.history.length; i += 2) {
            const tr = document.createElement('tr');
            const roundNum = Math.floor(i / 2) + 1;
            const redMove = this.gameState.history[i] || '';
            const blackMove = this.gameState.history[i + 1] || '';
            
            tr.innerHTML = `
                <td class="history-move-num">${roundNum}</td>
                <td class="history-red-move">${redMove}</td>
                <td class="history-black-move">${blackMove}</td>
            `;
            body.appendChild(tr);
        }
        
        // Auto scroll to bottom
        const container = document.querySelector('.history-table-container');
        if (container) container.scrollTop = container.scrollHeight;
    }

    getLastMove() {
        if (!this.gameState.history || this.gameState.history.length === 0) return null;
        const last = this.gameState.history[this.gameState.history.length - 1];
        // Parse "帥 (9,4) -> (8,4) captured ..."
        const match = last.match(/\((\d+),(\d+)\) -> \((\d+),(\d+)\)/);
        if (match) {
            return { r: parseInt(match[3]), c: parseInt(match[4]) };
        }
        return null;
    }
}

export default UI;

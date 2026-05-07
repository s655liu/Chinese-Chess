from flask import Flask, request, jsonify, send_from_directory, render_template, redirect, url_for, flash, session
from flask_socketio import SocketIO, join_room, leave_room, emit
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from models import db, User, Game, bcrypt
from engine.xiangqi_engine import XiangqiEngine, RED, BLACK
import os
import json
import uuid

app = Flask(__name__)
app.config['SECRET_KEY'] = 'xiangqi_secret_key_123'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///xiangqi.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)
bcrypt.init_app(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')
login_manager = LoginManager(app)
login_manager.login_view = 'login'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

with app.app_context():
    db.create_all()

# Store active engine instances in memory for performance
# Keys are game room_ids
active_engines = {}
guest_engines = {} # Session-based engines for guests

def get_engine(game_id):
    if not game_id: return None
    if game_id == 'guest':
        if 'guest_id' not in session:
            session['guest_id'] = str(uuid.uuid4())
        gid = session['guest_id']
        if gid not in guest_engines:
            guest_engines[gid] = XiangqiEngine()
        return guest_engines[gid]
    
    if game_id not in active_engines:
        game = Game.query.filter_by(room_id=game_id).first()
        if not game: return None
        engine = XiangqiEngine()
        engine.board = game.get_board()
        engine.current_turn = game.current_turn
        engine.history = json.loads(game.history)
        active_engines[game_id] = engine
    return active_engines[game_id]

# --- Authentication Routes ---

def validate_password(password):
    if not password:
        return "Password is required."
    if len(password) < 8:
        return "Password must be at least 8 characters long."
    if not any(c.isupper() for c in password):
        return "Password must contain at least one uppercase letter."
    if not any(c.islower() for c in password):
        return "Password must contain at least one lowercase letter."
    if not any(c.isdigit() for c in password):
        return "Password must contain at least one number."
    if not any(c in "!@#$%^&*()-_+=[]{}|;:,.<>?" for c in password):
        return "Password must contain at least one special character."
    return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        try:
            username = request.form.get('username')
            email = request.form.get('email')
            password = request.form.get('password')
            
            # Check for duplicates
            if User.query.filter_by(username=username).first():
                return jsonify({'error': 'Username already exists'}), 400
            if User.query.filter_by(email=email).first():
                return jsonify({'error': 'Email address already in use'}), 400
                
            # Validate password complexity
            error = validate_password(password)
            if error:
                return jsonify({'error': error}), 400
                
            user = User(username=username, email=email)
            user.set_password(password)
            db.session.add(user)
            db.session.commit()
            return jsonify({'success': 'Registered successfully'})
        except Exception as e:
            print(f"Registration Error: {e}")
            return jsonify({'error': 'Internal server error during registration'}), 500
            
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        data = request.json
        user = User.query.filter_by(username=data['username']).first()
        if user and user.check_password(data['password']):
            login_user(user, remember=data.get('remember', False))
            return jsonify({'success': True, 'username': user.username})
        return jsonify({'success': False, 'error': 'Invalid credentials'}), 401
    return send_from_directory('.', 'index.html')

@app.route('/api/check_auth')
def check_auth():
    if current_user.is_authenticated:
        return jsonify({'authenticated': True, 'username': current_user.username})
    return jsonify({'authenticated': False})

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('index'))

# --- Multiplayer Game Routes ---

@app.route('/api/games/create', methods=['POST'])
@login_required
def create_game():
    room_id = str(uuid.uuid4())[:8]
    engine = XiangqiEngine()
    game = Game(
        room_id=room_id,
        red_player_id=current_user.id,
        board_state=json.dumps(engine.board),
        current_turn=engine.current_turn
    )
    db.session.add(game)
    db.session.commit()
    active_engines[room_id] = engine
    return jsonify({'room_id': room_id})

@app.route('/api/games/join/<room_id>', methods=['POST'])
@login_required
def join_game(room_id):
    game = Game.query.filter_by(room_id=room_id).first()
    if not game:
        return jsonify({'error': 'Game not found'}), 404
    if game.red_player_id != current_user.id and not game.black_player_id:
        game.black_player_id = current_user.id
        db.session.commit()
    return jsonify({'success': True, 'role': 'red' if game.red_player_id == current_user.id else 'black'})

@app.route('/api/valid_moves', methods=['POST'])
def get_valid_moves():
    data = request.json
    room_id = data.get('room')
    r, c = data['r'], data['c']
    engine = get_engine(room_id)
    if not engine: return jsonify([])
    
    piece = engine.board[r][c]
    if not piece or engine.get_piece_color(piece) != engine.current_turn:
        return jsonify([])
    
    valid_coords = []
    for tr in range(10):
        for tc in range(9):
            if engine.is_valid_move(r, c, tr, tc):
                temp_board = [row[:] for row in engine.board]
                temp_board[tr][tc] = piece
                temp_board[r][c] = None
                if not engine.is_king_in_check(engine.current_turn, temp_board):
                    if not engine.is_generals_facing(temp_board):
                        valid_coords.append({'r': tr, 'c': tc})
    return jsonify(valid_coords)

# --- Guest / AI Routes (No Login Required) ---

@app.route('/api/guest/state', methods=['GET'])
def guest_state():
    engine = get_engine('guest')
    return jsonify({
        'board': engine.board,
        'turn': engine.current_turn,
        'game_over': engine.game_over,
        'history': engine.history
    })

@app.route('/api/guest/move', methods=['POST'])
def guest_move():
    data = request.json
    engine = get_engine('guest')
    success = engine.make_move(data['r1'], data['c1'], data['r2'], data['c2'])
    return jsonify({
        'success': success,
        'board': engine.board,
        'turn': engine.current_turn,
        'game_over': engine.game_over,
        'history': engine.history
    })

@app.route('/api/guest/ai_move', methods=['POST'])
def guest_ai_move():
    level = request.json.get('level', 'medium')
    engine = get_engine('guest')
    success = engine.ai_move(level)
    return jsonify({
        'success': success,
        'board': engine.board,
        'turn': engine.current_turn,
        'game_over': engine.game_over,
        'history': engine.history
    })

@app.route('/api/guest/reset', methods=['POST'])
def guest_reset():
    if 'guest_id' in session:
        guest_engines[session['guest_id']] = XiangqiEngine()
    return jsonify({'success': True})

@socketio.on('join')
def on_join(data):
    room = data['room']
    join_room(room)
    engine = get_engine(room)
    if engine:
        emit('init_state', {
            'board': engine.board,
            'turn': engine.current_turn,
            'history': engine.history
        })

@socketio.on('move')
def on_move(data):
    room = data['room']
    r1, c1, r2, c2 = data['r1'], data['c1'], data['r2'], data['c2']
    engine = get_engine(room)
    if engine and engine.current_turn == data['color']:
        success = engine.make_move(r1, c1, r2, c2)
        if success:
            game = Game.query.filter_by(room_id=room).first()
            game.set_board(engine.board)
            game.current_turn = engine.current_turn
            game.history = json.dumps(engine.history)
            db.session.commit()
            emit('move_update', {
                'board': engine.board,
                'turn': engine.current_turn,
                'history': engine.history,
                'last_move': {'r1': r1, 'c1': c1, 'r2': r2, 'c2': c2}
            }, room=room)

if __name__ == '__main__':
    socketio.run(app, port=8080, debug=True)

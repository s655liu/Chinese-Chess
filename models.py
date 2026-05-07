from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from flask_bcrypt import Bcrypt
import json

db = SQLAlchemy()
bcrypt = Bcrypt()

class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(100), nullable=False)
    rating = db.Column(db.Integer, default=1200)
    wins = db.Column(db.Integer, default=0)
    losses = db.Column(db.Integer, default=0)

    def set_password(self, password):
        self.password_hash = bcrypt.generate_password_hash(password).decode('utf-8')

    def check_password(self, password):
        return bcrypt.check_password_hash(self.password_hash, password)

class Game(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.String(50), unique=True, nullable=False)
    red_player_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    black_player_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    board_state = db.Column(db.Text, nullable=False) # JSON string
    history = db.Column(db.Text, default='[]') # JSON string
    current_turn = db.Column(db.String(10), default='red')
    is_active = db.Column(db.Boolean, default=True)
    winner_id = db.Column(db.Integer, db.ForeignKey('user.id'))

    def get_board(self):
        return json.loads(self.board_state)

    def set_board(self, board):
        self.board_state = json.dumps(board)

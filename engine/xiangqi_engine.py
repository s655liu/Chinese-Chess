RED = 'red'
BLACK = 'black'

INITIAL_BOARD = [
    ['r', 'n', 'b', 'a', 'k', 'a', 'b', 'n', 'r'],
    [None] * 9,
    [None, 'c', None, None, None, None, None, 'c', None],
    ['p', None, 'p', None, 'p', None, 'p', None, 'p'],
    [None] * 9,
    [None] * 9,
    ['P', None, 'P', None, 'P', None, 'P', None, 'P'],
    [None, 'C', None, None, None, None, None, 'C', None],
    [None] * 9,
    ['R', 'N', 'B', 'A', 'K', 'A', 'B', 'N', 'R']
]

class XiangqiEngine:
    def __init__(self):
        self.board = [row[:] for row in INITIAL_BOARD]
        self.current_turn = RED
        self.history = []
        self.game_over = False
        self.winner = None
        self.timers = {RED: 600, BLACK: 600} # 10 mins each

    def get_piece_color(self, piece):
        if not piece: return None
        return RED if piece.isupper() else BLACK

    def get_piece_name(self, piece):
        names = { 'K': '帥', 'k': '將', 'A': '仕', 'a': '士', 'B': '相', 'b': '象', 'N': '傌', 'n': '馬', 'R': '俥', 'r': '車', 'C': '炮', 'c': '砲', 'P': '兵', 'p': '卒' }
        return names.get(piece, '')

    def is_valid_move(self, r1, c1, r2, c2, board=None):
        if board is None: board = self.board
        if not (0 <= r1 < 10 and 0 <= c1 < 9 and 0 <= r2 < 10 and 0 <= c2 < 9):
            return False
        
        piece = board[r1][c1]
        if not piece: return False
        
        target = board[r2][c2]
        if target and self.get_piece_color(piece) == self.get_piece_color(target):
            return False

        dr, dc = r2 - r1, c2 - c1
        adr, adc = abs(dr), abs(dc)
        ptype = piece.lower()
        is_red = piece.isupper()

        if ptype == 'k': # King
            if adr + adc != 1: return False
            if not (3 <= c2 <= 5): return False
            if is_red and r2 < 7: return False
            if not is_red and r2 > 2: return False
            return True
        
        elif ptype == 'a': # Advisor
            if adr != 1 or adc != 1: return False
            if not (3 <= c2 <= 5): return False
            if is_red and r2 < 7: return False
            if not is_red and r2 > 2: return False
            return True

        elif ptype == 'b': # Bishop (Elephant)
            if adr != 2 or adc != 2: return False
            if is_red and r2 < 5: return False
            if not is_red and r2 > 4: return False
            if board[r1 + dr//2][c1 + dc//2]: return False
            return True

        elif ptype == 'n': # Knight
            if not ((adr == 2 and adc == 1) or (adr == 1 and adc == 2)): return False
            if adr == 2 and board[r1 + dr//2][c1]: return False
            if adc == 2 and board[r1][c1 + dc//2]: return False
            return True

        elif ptype == 'r': # Rook
            if dr != 0 and dc != 0: return False
            step_r = 0 if dr == 0 else dr // adr
            step_c = 0 if dc == 0 else dc // adc
            curr_r, curr_c = r1 + step_r, c1 + step_c
            while curr_r != r2 or curr_c != c2:
                if board[curr_r][curr_c]: return False
                curr_r += step_r
                curr_c += step_c
            return True

        elif ptype == 'c': # Cannon
            if dr != 0 and dc != 0: return False
            step_r = 0 if dr == 0 else dr // adr
            step_c = 0 if dc == 0 else dc // adc
            curr_r, curr_c = r1 + step_r, c1 + step_c
            count = 0
            while curr_r != r2 or curr_c != c2:
                if board[curr_r][curr_c]: count += 1
                curr_r += step_r
                curr_c += step_c
            if target: return count == 1
            return count == 0

        elif ptype == 'p': # Pawn
            if is_red:
                if r2 > r1: return False
                if r1 > 4: return dr == -1 and dc == 0
                return (dr == -1 and dc == 0) or (dr == 0 and adc == 1)
            else:
                if r2 < r1: return False
                if r1 < 5: return dr == 1 and dc == 0
                return (dr == 1 and dc == 0) or (dr == 0 and adc == 1)
        
        return False

    def is_king_in_check(self, color, board):
        king_char = 'K' if color == RED else 'k'
        kr, kc = -1, -1
        for r in range(10):
            for c in range(9):
                if board[r][c] == king_char:
                    kr, kc = r, c
                    break
            if kr != -1: break
        
        for r in range(10):
            for c in range(9):
                p = board[r][c]
                if p and self.get_piece_color(p) != color:
                    if self.is_valid_move(r, c, kr, kc, board):
                        return True
        return False


    def is_generals_facing(self, board):
        rk, bk = None, None
        for r in range(10):
            for c in range(3, 6):
                if board[r][c] == 'K': rk = (r, c)
                if board[r][c] == 'k': bk = (r, c)
        
        if rk and bk and rk[1] == bk[1]:
            col = rk[1]
            for r in range(min(rk[0], bk[0])+1, max(rk[0], bk[0])):
                if board[r][col]:
                    return False
            return True # They are facing
        return False

    def make_move(self, r1, c1, r2, c2):
        if self.game_over: return False
        piece = self.board[r1][c1]
        if not piece or self.get_piece_color(piece) != self.current_turn: return False
        if not self.is_valid_move(r1, c1, r2, c2): return False

        new_board = [row[:] for row in self.board]
        new_board[r2][c2] = piece
        new_board[r1][c1] = None

        if self.is_king_in_check(self.current_turn, new_board): return False
        if self.is_generals_facing(new_board): return False

        target = self.board[r2][c2]
        piece_name = self.get_piece_name(piece)
        move_desc = f"{piece_name} ({r1},{c1}) -> ({r2},{c2})"
        if target: move_desc += f" captured {self.get_piece_name(target)}"
        self.history.append(move_desc)

        self.board = new_board
        self.current_turn = BLACK if self.current_turn == RED else RED

        if self.is_checkmate(self.current_turn):
            self.game_over = True
            self.winner = RED if self.current_turn == BLACK else BLACK

        return True

    def is_checkmate(self, color):
        for r1 in range(10):
            for c1 in range(9):
                p = self.board[r1][c1]
                if p and self.get_piece_color(p) == color:
                    for r2 in range(10):
                        for c2 in range(9):
                            if self.is_valid_move(r1, c1, r2, c2):
                                temp = [row[:] for row in self.board]
                                temp[r2][c2] = p
                                temp[r1][c1] = None
                                if not self.is_king_in_check(color, temp) and not self.is_generals_facing(temp):
                                    return False
        return True

    def get_all_valid_moves(self, color):
        moves = []
        for r1 in range(10):
            for c1 in range(9):
                p = self.board[r1][c1]
                if p and self.get_piece_color(p) == color:
                    for r2 in range(10):
                        for c2 in range(9):
                            if self.is_valid_move(r1, c1, r2, c2):
                                temp = [row[:] for row in self.board]
                                temp[r2][c2] = p
                                temp[r1][c1] = None
                                if not self.is_king_in_check(color, temp) and not self.is_generals_facing(temp):
                                    moves.append((r1, c1, r2, c2))
        return moves

    def get_threats(self, color):
        threats = []
        enemy_color = RED if color == BLACK else BLACK
        enemy_moves = self.get_all_valid_moves(enemy_color)
        for m in enemy_moves:
            target = self.board[m[2]][m[3]]
            if target and self.get_piece_color(target) == color:
                threats.append({'r': m[2], 'c': m[3]})
        return threats

    PIECE_VALUES = {'k': 10000, 'r': 90, 'c': 45, 'n': 40, 'b': 20, 'a': 20, 'p': 10}

    def evaluate_board(self, board):
        score = 0
        for r in range(10):
            for c in range(9):
                p = board[r][c]
                if not p: continue
                
                val = self.PIECE_VALUES.get(p.lower(), 0)
                
                # Positional bonuses for Soldiers
                if p == 'P': # Red Soldier
                    if r <= 4: val += 10 # Crossed river
                elif p == 'p': # Black Soldier
                    if r >= 5: val += 10 # Crossed river
                
                if p.isupper(): score += val
                else: score -= val
        return score

    def minimax(self, board, depth, alpha, beta, maximizing_player):
        if depth == 0:
            return self.evaluate_board(board)

        color = RED if maximizing_player else BLACK
        # We need a way to get moves for a specific board
        moves = self.get_board_valid_moves(board, color)
        
        if not moves:
            # If no moves, checkmate or stalemate
            return -99999 if maximizing_player else 99999

        if maximizing_player:
            max_eval = float('-inf')
            for m in moves:
                temp_board = [row[:] for row in board]
                temp_board[m[2]][m[3]] = temp_board[m[0]][m[1]]
                temp_board[m[0]][m[1]] = None
                
                eval = self.minimax(temp_board, depth - 1, alpha, beta, False)
                max_eval = max(max_eval, eval)
                alpha = max(alpha, eval)
                if beta <= alpha: break
            return max_eval
        else:
            min_eval = float('inf')
            for m in moves:
                temp_board = [row[:] for row in board]
                temp_board[m[2]][m[3]] = temp_board[m[0]][m[1]]
                temp_board[m[0]][m[1]] = None
                
                eval = self.minimax(temp_board, depth - 1, alpha, beta, True)
                min_eval = min(min_eval, eval)
                beta = min(beta, eval)
                if beta <= alpha: break
            return min_eval

    def get_board_valid_moves(self, board, color):
        valid_moves = []
        for r1 in range(10):
            for c1 in range(9):
                p = board[r1][c1]
                if p and self.get_piece_color(p) == color:
                    for r2 in range(10):
                        for c2 in range(9):
                            if self.is_valid_move(r1, c1, r2, c2, board):
                                # Basic checkmate/check check on the simulated board
                                temp = [row[:] for row in board]
                                temp[r2][c2] = p
                                temp[r1][c1] = None
                                if not self.is_king_in_check(color, temp) and not self.is_generals_facing(temp):
                                    valid_moves.append((r1, c1, r2, c2))
        return valid_moves

    def ai_move(self, level='medium'):
        import random
        moves = self.get_all_valid_moves(BLACK)
        if not moves: return False
        
        if level == 'easy':
            return self.make_move(*random.choice(moves))
        
        elif level == 'medium':
            best_moves = []
            max_val = -1
            for m in moves:
                target = self.board[m[2]][m[3]]
                val = self.PIECE_VALUES.get(target.lower(), 0) if target else 0
                if val > max_val:
                    max_val = val
                    best_moves = [m]
                elif val == max_val:
                    best_moves.append(m)
            return self.make_move(*random.choice(best_moves))
            
        elif level == 'hard':
            # 3-ply minimax with alpha-beta pruning
            best_score = float('inf')
            best_moves = []
            
            # Sort moves to improve alpha-beta efficiency (captures first)
            moves.sort(key=lambda m: self.PIECE_VALUES.get((self.board[m[2]][m[3]] or ' ').lower(), 0), reverse=True)

            for m in moves:
                temp_board = [row[:] for row in self.board]
                temp_board[m[2]][m[3]] = temp_board[m[0]][m[1]]
                temp_board[m[0]][m[1]] = None
                
                score = self.minimax(temp_board, 2, float('-inf'), float('inf'), True)
                
                if score < best_score:
                    best_score = score
                    best_moves = [m]
                elif score == best_score:
                    best_moves.append(m)
            
            if not best_moves: return False
            return self.make_move(*random.choice(best_moves))
        
        return False


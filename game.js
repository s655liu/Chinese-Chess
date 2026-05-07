export const PIECE_TYPES = {
    KING: 'k',
    ADVISOR: 'a',
    BISHOP: 'b',
    KNIGHT: 'n',
    ROOK: 'r',
    CANNON: 'c',
    PAWN: 'p'
};

export const COLORS = {
    RED: 'red',
    BLACK: 'black'
};

const INITIAL_BOARD = [
    ['r', 'n', 'b', 'a', 'k', 'a', 'b', 'n', 'r'],
    [null, null, null, null, null, null, null, null, null],
    [null, 'c', null, null, null, null, null, 'c', null],
    ['p', null, 'p', null, 'p', null, 'p', null, 'p'],
    [null, null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null, null],
    ['P', null, 'P', null, 'P', null, 'P', null, 'P'],
    [null, 'C', null, null, null, null, null, 'C', null],
    [null, null, null, null, null, null, null, null, null],
    ['R', 'N', 'B', 'A', 'K', 'A', 'B', 'N', 'R']
];

export class XiangqiGame {
    constructor() {
        this.board = this.cloneBoard(INITIAL_BOARD);
        this.currentTurn = COLORS.RED;
        this.history = [];
        this.gameOver = false;
        this.winner = null;
        this.inCheck = false;
    }

    cloneBoard(board) {
        return board.map(row => [...row]);
    }

    getPiece(row, col) {
        if (row < 0 || row > 9 || col < 0 || col > 8) return null;
        return this.board[row][col];
    }

    getPieceColor(piece) {
        if (!piece) return null;
        return piece === piece.toUpperCase() ? COLORS.RED : COLORS.BLACK;
    }

    isRed(piece) {
        return this.getPieceColor(piece) === COLORS.RED;
    }

    movePiece(startRow, startCol, endRow, endCol) {
        if (this.gameOver) return false;
        
        const piece = this.getPiece(startRow, startCol);
        if (!piece || this.getPieceColor(piece) !== this.currentTurn) return false;

        if (!this.isValidMove(startRow, startCol, endRow, endCol)) return false;

        // Perform move on a clone to check for "Flying General" and leaving King in check
        const boardClone = this.cloneBoard(this.board);
        const captured = boardClone[endRow][endCol];
        boardClone[endRow][endCol] = piece;
        boardClone[startRow][startCol] = null;

        if (this.isKingInCheck(this.currentTurn, boardClone)) return false;
        if (this.isGeneralsFacing(boardClone)) return false;

        // Commit move
        this.board = boardClone;
        this.history.push({
            piece,
            start: {r: startRow, c: startCol},
            end: {r: endRow, c: endCol},
            captured
        });

        this.currentTurn = this.currentTurn === COLORS.RED ? COLORS.BLACK : COLORS.RED;
        
        // Check for check or checkmate
        this.inCheck = this.isKingInCheck(this.currentTurn, this.board);
        if (this.isCheckmate(this.currentTurn)) {
            this.gameOver = true;
            this.winner = this.currentTurn === COLORS.RED ? COLORS.BLACK : COLORS.RED;
        }

        return true;
    }

    isValidMove(r1, c1, r2, c2) {
        if (r1 === r2 && c1 === c2) return false;
        const piece = this.getPiece(r1, c1);
        const target = this.getPiece(r2, c2);
        
        // Cannot capture own piece
        if (target && this.getPieceColor(piece) === this.getPieceColor(target)) return false;

        const type = piece.toLowerCase();
        const dr = r2 - r1;
        const dc = c2 - c1;
        const adr = Math.abs(dr);
        const adc = Math.abs(dc);

        const isRed = this.isRed(piece);

        switch (type) {
            case PIECE_TYPES.KING:
                // Move 1 step orthogonally
                if (adr + adc !== 1) return false;
                // Must stay in palace
                if (c2 < 3 || c2 > 5) return false;
                if (isRed && r2 < 7) return false;
                if (!isRed && r2 > 2) return false;
                return true;

            case PIECE_TYPES.ADVISOR:
                // Move 1 step diagonally
                if (adr !== 1 || adc !== 1) return false;
                // Must stay in palace
                if (c2 < 3 || c2 > 5) return false;
                if (isRed && r2 < 7) return false;
                if (!isRed && r2 > 2) return false;
                return true;

            case PIECE_TYPES.BISHOP:
                // Move exactly 2 steps diagonally
                if (adr !== 2 || adc !== 2) return false;
                // Cannot cross river
                if (isRed && r2 < 5) return false;
                if (!isRed && r2 > 4) return false;
                // Check if blocked (elephant eye)
                if (this.getPiece(r1 + dr/2, c1 + dc/2)) return false;
                return true;

            case PIECE_TYPES.KNIGHT:
                // Move 1 step orthogonal, then 1 step diagonal
                if (!((adr === 2 && adc === 1) || (adr === 1 && adc === 2))) return false;
                // Check if blocked (horse leg)
                if (adr === 2 && this.getPiece(r1 + dr/2, c1)) return false;
                if (adc === 2 && this.getPiece(r1, c1 + dc/2)) return false;
                return true;

            case PIECE_TYPES.ROOK:
                // Move any distance orthogonally, cannot jump
                if (adr !== 0 && adc !== 0) return false;
                const rStep = adr === 0 ? 0 : dr / adr;
                const cStep = adc === 0 ? 0 : dc / adc;
                let cr = r1 + rStep;
                let cc = c1 + cStep;
                while (cr !== r2 || cc !== c2) {
                    if (this.getPiece(cr, cc)) return false;
                    cr += rStep;
                    cc += cStep;
                }
                return true;

            case PIECE_TYPES.CANNON:
                // Move like rook, capture by jumping exactly one piece
                if (adr !== 0 && adc !== 0) return false;
                const crStep = adr === 0 ? 0 : dr / adr;
                const ccStep = adc === 0 ? 0 : dc / adc;
                let currR = r1 + crStep;
                let currC = c1 + ccStep;
                let count = 0;
                while (currR !== r2 || currC !== c2) {
                    if (this.getPiece(currR, currC)) count++;
                    currR += crStep;
                    currC += ccStep;
                }
                if (target) {
                    return count === 1; // Capture requires exactly 1 screen
                } else {
                    return count === 0; // Move requires 0 screens
                }

            case PIECE_TYPES.PAWN:
                if (isRed) {
                    // Red moves up (r decreases)
                    if (r2 > r1) return false; 
                    if (r1 > 4) {
                        // Before river: only forward 1
                        return dr === -1 && dc === 0;
                    } else {
                        // After river: forward 1 or sideways 1
                        return (dr === -1 && dc === 0) || (dr === 0 && adc === 1);
                    }
                } else {
                    // Black moves down (r increases)
                    if (r2 < r1) return false;
                    if (r1 < 5) {
                        return dr === 1 && dc === 0;
                    } else {
                        return (dr === 1 && dc === 0) || (dr === 0 && adc === 1);
                    }
                }
        }
        return false;
    }

    isGeneralsFacing(board) {
        let redKing = null, blackKing = null;
        for (let r = 0; r < 10; r++) {
            for (let c = 3; c <= 5; c++) {
                if (board[r][c] === 'K') redKing = {r, c};
                if (board[r][c] === 'k') blackKing = {r, c};
            }
        }
        if (redKing && blackKing && redKing.c === blackKing.c) {
            const col = redKing.c;
            for (let r = blackKing.r + 1; r < redKing.r; r++) {
                if (board[r][col]) return false; // Blocked
            }
            return true; // Facing directly
        }
        return false;
    }

    isKingInCheck(color, board) {
        // Find king
        const targetKing = color === COLORS.RED ? 'K' : 'k';
        let kr = -1, kc = -1;
        for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 9; c++) {
                if (board[r][c] === targetKing) {
                    kr = r; kc = c; break;
                }
            }
            if (kr !== -1) break;
        }

        // Temporarily swap board to use isValidMove logic
        const tempBoard = this.board;
        this.board = board;

        // Check if any opponent piece can attack king
        for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 9; c++) {
                const piece = board[r][c];
                if (piece && this.getPieceColor(piece) !== color) {
                    if (this.isValidMove(r, c, kr, kc)) {
                        this.board = tempBoard;
                        return true;
                    }
                }
            }
        }

        this.board = tempBoard;
        return false;
    }

    isCheckmate(color) {
        // Simple brute force: try all possible moves for all pieces of 'color'
        for (let r1 = 0; r1 < 10; r1++) {
            for (let c1 = 0; c1 < 9; c1++) {
                const piece = this.getPiece(r1, c1);
                if (piece && this.getPieceColor(piece) === color) {
                    for (let r2 = 0; r2 < 10; r2++) {
                        for (let c2 = 0; c2 < 9; c2++) {
                            if (this.isValidMove(r1, c1, r2, c2)) {
                                const boardClone = this.cloneBoard(this.board);
                                boardClone[r2][c2] = piece;
                                boardClone[r1][c1] = null;
                                if (!this.isKingInCheck(color, boardClone) && !this.isGeneralsFacing(boardClone)) {
                                    return false; // Found at least one valid move
                                }
                            }
                        }
                    }
                }
            }
        }
        return true;
    }

    getValidMoves(r, c) {
        const piece = this.getPiece(r, c);
        if (!piece || this.getPieceColor(piece) !== this.currentTurn) return [];

        const moves = [];
        for (let r2 = 0; r2 < 10; r2++) {
            for (let c2 = 0; c2 < 9; c2++) {
                if (this.isValidMove(r, c, r2, c2)) {
                    const boardClone = this.cloneBoard(this.board);
                    boardClone[r2][c2] = piece;
                    boardClone[r][c] = null;
                    if (!this.isKingInCheck(this.currentTurn, boardClone) && !this.isGeneralsFacing(boardClone)) {
                        moves.push({r: r2, c: c2});
                    }
                }
            }
        }
        return moves;
    }
}

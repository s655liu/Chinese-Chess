import { XiangqiGame, COLORS, PIECE_TYPES } from './game.js';

const game = new XiangqiGame();
console.log("Current turn:", game.currentTurn);
const moves = game.getValidMoves(6, 0); // Red Pawn
console.log("Valid moves for Red Pawn at 6,0:", moves);

const cannonMoves = game.getValidMoves(7, 1); // Red Cannon
console.log("Valid moves for Red Cannon at 7,1:", cannonMoves);

// Make a move
const success = game.movePiece(6, 0, 5, 0);
console.log("Move success:", success);
console.log("New piece at 5,0:", game.getPiece(5, 0));
console.log("New turn:", game.currentTurn);

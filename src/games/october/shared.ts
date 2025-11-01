export type PieceTypeKey =
    | 'king'
    | 'pawn'
    | 'knight'
    | 'bishop'
    | 'rook'
    | 'queen'
    | 'bean'
    | 'shoe'
    | 'ball'
    | 'can'
    | 'bomb'
    | 'chargedBattery'
    | 'lowBattery';

export interface Position {
    x: number;
    y: number;
}

export interface Piece {
    piece: keyof typeof PIECES;
    position: Position;
}

export interface PieceType {
    symbol: string;
    enemy: boolean;
    value: number;
    generateMoves: (
        pieces: Piece[],
        piece: Piece,
        board: BoardState,
    ) => Generator<{position: Position; type: 'move' | 'capture' | 'both'}>;
    onMove?: (pieces: Piece[], piece: Piece, move: Position, board: BoardState) => () => void;
}

export interface Level {
    pieces: Piece[];
    boardSize: Position;
    moves: number;
    text?: string;
    walls: Position[];
}

export interface BoardState {
    level: Level;
    enemyTurn: boolean;
}

export function findPiece(pieces: Piece[], position: Position) {
    return pieces.find(piece => piece.position.x === position.x && piece.position.y === position.y);
}

export function getNeighbors(piece: Piece) {
    return [
        {x: piece.position.x + 1, y: piece.position.y},
        {x: piece.position.x + 1, y: piece.position.y + 1},
        {x: piece.position.x, y: piece.position.y + 1},
        {x: piece.position.x - 1, y: piece.position.y + 1},
        {x: piece.position.x - 1, y: piece.position.y},
        {x: piece.position.x - 1, y: piece.position.y - 1},
        {x: piece.position.x, y: piece.position.y - 1},
        {x: piece.position.x + 1, y: piece.position.y - 1},
    ];
}

export function* generateSlidingMoves(
    pieces: Piece[],
    piece: Piece,
    board: BoardState,
    directions: {dx: number; dy: number}[],
    canJump = false,
) {
    for (const {dx, dy} of directions) {
        for (let i = 1; ; ++i) {
            const position = {x: piece.position.x + i * dx, y: piece.position.y + i * dy};
            if (
                position.x < 0 ||
                position.x >= board.level.boardSize.x ||
                position.y < 0 ||
                position.y >= board.level.boardSize.y ||
                board.level.walls.some(wall => wall.x === position.x && wall.y === position.y)
            ) {
                break;
            }
            yield {position, type: 'both'} as const;
            if (!canJump && findPiece(pieces, position)) break;
        }
    }
}

export function defaultMove(pieces: Piece[], piece: Piece, move: Position): () => void {
    const originalPosition = piece.position;
    const target = findPiece(pieces, move);
    const targetIndex = target ? pieces.indexOf(target) : -1;

    if (target) pieces.splice(targetIndex, 1);
    piece.position = move;

    return () => {
        piece.position = originalPosition;
        if (target) pieces.splice(targetIndex, 0, target);
    };
}

export const PIECES: Record<PieceTypeKey, PieceType> = {
    king: {
        symbol: '♚',
        enemy: true,
        value: 0,
        generateMoves: function* (_: Piece[], piece: Piece) {
            for (const position of getNeighbors(piece)) yield {position, type: 'both'};
        },
    },
    pawn: {
        symbol: '♟',
        enemy: true,
        value: 1,
        generateMoves: function* (pieces: Piece[], piece: Piece) {
            const front = {x: piece.position.x, y: piece.position.y + 1};
            yield {position: front, type: 'move'};
            if (piece.position.y === 1 && !findPiece(pieces, front)) {
                yield {position: {x: piece.position.x, y: piece.position.y + 2}, type: 'move'};
            }
            const leftCapture = {x: piece.position.x - 1, y: piece.position.y + 1};
            const rightCapture = {x: piece.position.x + 1, y: piece.position.y + 1};
            if (findPiece(pieces, leftCapture)) yield {position: leftCapture, type: 'capture'};
            if (findPiece(pieces, rightCapture)) yield {position: rightCapture, type: 'capture'};
        },
        onMove: (pieces: Piece[], piece: Piece, move: Position, board: BoardState) => {
            const defaultUndo = defaultMove(pieces, piece, move);
            if (move.y === board.level.boardSize.y - 1) piece.piece = 'queen';
            return () => {
                piece.piece = 'pawn';
                defaultUndo();
            };
        },
    },
    knight: {
        symbol: '♞',
        enemy: true,
        value: 3,
        generateMoves: function* (_: Piece[], piece: Piece) {
            yield {position: {x: piece.position.x + 1, y: piece.position.y + 2}, type: 'both'};
            yield {position: {x: piece.position.x + 1, y: piece.position.y - 2}, type: 'both'};
            yield {position: {x: piece.position.x - 1, y: piece.position.y + 2}, type: 'both'};
            yield {position: {x: piece.position.x - 1, y: piece.position.y - 2}, type: 'both'};
            yield {position: {x: piece.position.x + 2, y: piece.position.y + 1}, type: 'both'};
            yield {position: {x: piece.position.x + 2, y: piece.position.y - 1}, type: 'both'};
            yield {position: {x: piece.position.x - 2, y: piece.position.y + 1}, type: 'both'};
            yield {position: {x: piece.position.x - 2, y: piece.position.y - 1}, type: 'both'};
        },
    },
    bishop: {
        symbol: '♝',
        enemy: true,
        value: 3,
        generateMoves: function* (pieces: Piece[], piece: Piece, board: BoardState) {
            yield* generateSlidingMoves(pieces, piece, board, [
                {dx: -1, dy: -1},
                {dx: 1, dy: -1},
                {dx: -1, dy: 1},
                {dx: 1, dy: 1},
            ]);
        },
    },
    rook: {
        symbol: '♜',
        enemy: true,
        value: 5,
        generateMoves: function* (pieces: Piece[], piece: Piece, board: BoardState) {
            yield* generateSlidingMoves(pieces, piece, board, [
                {dx: -1, dy: 0},
                {dx: 1, dy: 0},
                {dx: 0, dy: -1},
                {dx: 0, dy: 1},
            ]);
        },
    },
    queen: {
        symbol: '♛',
        enemy: true,
        value: 9,
        generateMoves: function* (pieces: Piece[], piece: Piece, board: BoardState) {
            yield* PIECES.rook.generateMoves(pieces, piece, board);
            yield* PIECES.bishop.generateMoves(pieces, piece, board);
        },
    },
    bean: {
        symbol: '🫘',
        enemy: false,
        value: 2,
        generateMoves: function* (_: Piece[], piece: Piece) {
            for (const position of getNeighbors(piece)) yield {position, type: 'both'};
        },
    },
    shoe: {
        symbol: '👟',
        enemy: false,
        value: 2,
        generateMoves: function* (_: Piece[], piece: Piece) {
            for (const position of getNeighbors(piece)) yield {position, type: 'move'};
        },
    },
    ball: {
        symbol: '⚽',
        enemy: false,
        value: 2,
        generateMoves: function* (pieces: Piece[], piece: Piece, board: BoardState) {
            const shoes = pieces
                .filter(other => other.piece === 'shoe')
                .filter(
                    other =>
                        Math.abs(other.position.x - piece.position.x) <= 1 &&
                        Math.abs(other.position.y - piece.position.y) <= 1,
                );

            for (const shoe of shoes) {
                yield* generateSlidingMoves(pieces, piece, board, [
                    {dx: piece.position.x - shoe.position.x, dy: piece.position.y - shoe.position.y},
                ]);
            }
        },
    },
    can: {
        symbol: '🥫',
        enemy: false,
        value: 5,
        generateMoves: function* (_: Piece[], piece: Piece) {
            for (const position of getNeighbors(piece)) yield {position, type: 'move'};
        },
        onMove: (pieces: Piece[], _: Piece, move: Position): (() => void) => {
            const newBean: Piece = {position: move, piece: 'bean'};
            pieces.push(newBean);
            return () => pieces.splice(pieces.indexOf(newBean), 1);
        },
    },
    bomb: {
        symbol: '💣',
        enemy: false,
        value: 12,
        generateMoves: function* (pieces: Piece[], piece: Piece, board: BoardState) {
            yield* PIECES.rook.generateMoves(pieces, piece, board);
        },
        onMove: (pieces: Piece[], piece: Piece, move: Position): (() => void) => {
            const undoDefaultMove = defaultMove(pieces, piece, move);
            const explodedNeighbors: {piece: Piece; index: number}[] = [];

            for (const neighbor of getNeighbors(piece)) {
                const target = findPiece(pieces, neighbor);
                if (target) explodedNeighbors.push({piece: target, index: pieces.indexOf(target)});
            }

            explodedNeighbors.sort((a, b) => b.index - a.index);
            for (const neighbor of explodedNeighbors) pieces.splice(neighbor.index, 1);

            return () => {
                explodedNeighbors.sort((a, b) => a.index - b.index);
                for (const neighbor of explodedNeighbors) pieces.splice(neighbor.index, 0, neighbor.piece);
                undoDefaultMove();
            };
        },
    },
    chargedBattery: {
        symbol: '🔋',
        enemy: false,
        value: 7,
        generateMoves: function* (pieces: Piece[], piece: Piece, board: BoardState) {
            yield* PIECES.rook.generateMoves(pieces, piece, board);
            yield* PIECES.bishop.generateMoves(pieces, piece, board);
        },
        onMove: (pieces: Piece[], piece: Piece, move: Position) => {
            const defaultUndo = defaultMove(pieces, piece, move);
            piece.piece = 'lowBattery';
            return () => {
                piece.piece = 'chargedBattery';
                defaultUndo();
            };
        },
    },
    lowBattery: {
        symbol: '🪫',
        enemy: false,
        value: 2,
        generateMoves: function* (_: Piece[], piece: Piece) {
            for (const position of getNeighbors(piece)) yield {position, type: 'both'};
        },
    },
};

export function isPlayerThreateningKing(board: BoardState) {
    for (const piece of board.level.pieces) {
        if (PIECES[piece.piece].enemy) continue;
        const piecePosition = piece.position;
        for (const move of generatePieceMoves(board, piece)) {
            const undo = executeMove(board, piecePosition, move);
            const kingIsGone = board.level.pieces.every(other => other.piece !== 'king');
            undo();
            if (kingIsGone) return true;
        }
    }
    return false;
}

export function executeMove(board: BoardState, from: Position, to: Position): () => void {
    const fromPiece = findPiece(board.level.pieces, from)!;
    const undoOnMove = (PIECES[fromPiece.piece].onMove ?? defaultMove)(board.level.pieces, fromPiece, to, board);
    const originalEnemyTurn = board.enemyTurn;
    board.enemyTurn = !board.enemyTurn;

    return () => {
        undoOnMove();
        board.enemyTurn = originalEnemyTurn;
    };
}

export function* generatePieceMoves(board: BoardState, piece: Piece) {
    const {boardSize, walls, pieces} = board.level;
    for (const {position, type} of PIECES[piece.piece].generateMoves(pieces, piece, board)) {
        if (
            position.x < 0 ||
            position.x >= boardSize.x ||
            position.y < 0 ||
            position.y >= boardSize.y ||
            walls.some(wall => wall.x === position.x && wall.y === position.y)
        ) {
            continue;
        }

        const target = findPiece(pieces, position);
        if (
            (target && PIECES[target.piece].enemy === PIECES[piece.piece].enemy) ||
            (type === 'move' && target) ||
            (type === 'capture' && !target)
        ) {
            continue;
        }

        if (PIECES[piece.piece].enemy) {
            const tempBoard = structuredClone(board);
            executeMove(tempBoard, piece.position, position);
            if (isPlayerThreateningKing(tempBoard)) continue;
        }

        yield position;
    }
}

export function evaluate(board: BoardState): number {
    if (board.level.pieces.every(piece => PIECES[piece.piece].enemy)) return -BEST_VALUE;

    const hasEnemyMoves = board.level.pieces
        .filter(p => PIECES[p.piece].enemy)
        .some(p => !generatePieceMoves(board, p).next().done);

    if (!hasEnemyMoves) return isPlayerThreateningKing(board) ? BEST_VALUE : -BEST_VALUE;

    let score = 0;

    for (const piece of board.level.pieces) {
        const pieceType = PIECES[piece.piece];
        score += (pieceType.enemy ? -1 : 1) * pieceType.value;
    }

    if (isPlayerThreateningKing(board)) score += 10;

    let playerMobility = 0;
    let enemyMobility = 0;
    for (const piece of board.level.pieces) {
        const moves = [...generatePieceMoves(board, piece)];
        if (PIECES[piece.piece].enemy) enemyMobility += moves.length;
        else playerMobility += moves.length;
    }

    score += 0.1 * (playerMobility - enemyMobility);

    return score;
}

interface CacheEntry {
    depth: number;
    score: number;
    type: 'exact' | 'lowerbound' | 'upperbound';
    move: {from: Position; to: Position} | null;
}

function getBoardKey(board: BoardState) {
    const sortedPieces = [...board.level.pieces].sort((a, b) => {
        if (a.piece !== b.piece) return a.piece.localeCompare(b.piece);
        if (a.position.x !== b.position.x) return a.position.x - b.position.x;
        return a.position.y - b.position.y;
    });
    return JSON.stringify({pieces: sortedPieces, enemyTurn: board.enemyTurn});
}

const BEST_VALUE = 10000;

export function getBestMove(
    board: BoardState,
    lookaheadMoves: number,
): {move: {from: Position; to: Position} | null; score: number} {
    const cache = new Map<string, CacheEntry>();
    let bestMove: {from: Position; to: Position} | null = null;
    let bestScore = -Infinity;

    for (let depth = 1; depth <= lookaheadMoves + 2; ++depth) {
        const {move, score} = negamax(board, depth, -Infinity, Infinity, cache);
        bestMove = move;
        bestScore = score;

        if (bestScore === BEST_VALUE) break;
    }

    return {move: bestMove, score: bestScore};
}

function countOpponentPieces(board: BoardState, pieces: Piece[]) {
    return pieces.filter(piece => PIECES[piece.piece].enemy !== board.enemyTurn).length;
}

function negamax(
    board: BoardState,
    depth: number,
    alpha: number,
    beta: number,
    cache: Map<string, CacheEntry>,
): {score: number; move: {from: Position; to: Position} | null} {
    const perspective = board.enemyTurn ? -1 : 1;
    const evaluation = evaluate(board);

    if (depth === 0 || Math.abs(evaluation) === BEST_VALUE) return {score: evaluation * perspective, move: null};

    const originalAlpha = alpha;
    const key = getBoardKey(board);
    const entry = cache.get(key);

    if (entry && entry.depth >= depth) {
        if (entry.type === 'exact') return {score: entry.score, move: entry.move};
        if (entry.type === 'lowerbound') alpha = Math.max(alpha, entry.score);
        else beta = Math.min(beta, entry.score);
        if (alpha >= beta) return {score: entry.score, move: entry.move};
    }

    const piecesToMove = board.level.pieces.filter(piece => PIECES[piece.piece].enemy === board.enemyTurn);

    const hasMoves = piecesToMove.some(piece => generatePieceMoves(board, piece).next().done === false);
    if (!hasMoves) return {score: evaluation * perspective, move: null};

    let bestMove: {from: Position; to: Position} | null = entry?.move ?? null;

    const opponentPiecesBefore = countOpponentPieces(board, board.level.pieces);

    const allMoves = piecesToMove.flatMap(piece => [...generatePieceMoves(board, piece)].map(move => ({piece, move})));

    allMoves.sort((a, b) => {
        if (bestMove) {
            const aIsBest =
                a.piece.position.x === bestMove.from.x &&
                a.piece.position.y === bestMove.from.y &&
                a.move.x === bestMove.to.x &&
                a.move.y === bestMove.to.y;
            const bIsBest =
                b.piece.position.x === bestMove.from.x &&
                b.piece.position.y === bestMove.from.y &&
                b.move.x === bestMove.to.x &&
                b.move.y === bestMove.to.y;
            if (aIsBest) return -1;
            if (bIsBest) return 1;
        }

        const undoA = executeMove(board, a.piece.position, a.move);
        const capturesA = opponentPiecesBefore - countOpponentPieces(board, board.level.pieces);
        undoA();

        const undoB = executeMove(board, b.piece.position, b.move);
        const capturesB = opponentPiecesBefore - countOpponentPieces(board, board.level.pieces);
        undoB();

        return capturesB - capturesA;
    });

    for (const {piece, move} of allMoves) {
        const piecePosition = piece.position;
        const undo = executeMove(board, piecePosition, move);
        const score = -negamax(board, depth - 1, -beta, -alpha, cache).score;
        undo();
        if (score >= beta) {
            const fullMove = {from: piecePosition, to: move};
            cache.set(key, {depth, score: beta, type: 'lowerbound', move: fullMove});
            return {score: beta, move: fullMove};
        }
        if (score > alpha) {
            alpha = score;
            bestMove = {from: piecePosition, to: move};
        }
    }

    cache.set(key, {depth, score: alpha, type: alpha > originalAlpha ? 'exact' : 'upperbound', move: bestMove});

    return {score: alpha, move: bestMove};
}

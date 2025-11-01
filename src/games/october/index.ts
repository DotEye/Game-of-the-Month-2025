import click from '../../assets/click.ogg';
import logo from './logo.webp';
import lose from '../../assets/lose.ogg';
import music from './music.ogg';
import win from '../../assets/win.ogg';
import {
    BoardState,
    executeMove,
    findPiece,
    generatePieceMoves,
    isPlayerThreateningKing,
    Level,
    Piece,
    PIECES,
    Position,
} from './shared.ts';
import {FONT, UI_BLACK, UI_WHITE} from '../../shared/style';
import {ResponseEvent} from '../../shared/worker.ts';
import {canvas, context, overlay, setOverlay} from '../../dom';
import {clamp, distance} from '../../util.ts';
import {setupMusic, setupSoundEffect} from '../../audio';
import {setupStorage} from '../../shared/storage';

export function october(worker: Worker) {
    const BACKGROUND_COLOR = '#c5b0ff';
    const CHOICE_COLOR = '#5a7cc2';
    const ENEMY_COLOR = '#ff0000';
    const SELECTION_COLOR = '#a1edcb';
    const TILE_COLOR_1 = '#ffffff';
    const TILE_COLOR_2 = '#000000';

    const ANIMATION_DURATION = 200;
    const BOARD_Y_OFFSET = 50;
    const DRAG_THRESHOLD = 10;
    const ENEMY_FONT_SIZE_INCREASE = 15;
    const FLASH_DURATION = 500;
    const PIECE_FONT_SCALE = 0.6;
    const THINKING_DELAY = 200;
    const TILE_SIZE = 60;

    const LEVELS: Level[] = [
        // 1 (🫘)
        {
            pieces: [
                {piece: 'bean', position: {x: 0, y: 3}},
                {piece: 'bean', position: {x: 1, y: 3}},
                {piece: 'king', position: {x: 0, y: 0}},
            ],
            boardSize: {x: 2, y: 4},
            moves: 3,
            text: 'Click/tap on or drag an emoji to control it and checkmate the king.',
            walls: [],
        },
        // 2 (🫘)
        {
            pieces: [
                {piece: 'bean', position: {x: 0, y: 3}},
                {piece: 'bean', position: {x: 1, y: 3}},
                {piece: 'bean', position: {x: 2, y: 3}},
                {piece: 'king', position: {x: 1, y: 0}},
                {piece: 'pawn', position: {x: 0, y: 1}},
                {piece: 'pawn', position: {x: 1, y: 1}},
                {piece: 'pawn', position: {x: 2, y: 1}},
            ],
            boardSize: {x: 3, y: 4},
            moves: 4,
            text: '',
            walls: [],
        },
        // 3 (👟⚽)
        {
            pieces: [
                {piece: 'ball', position: {x: 1, y: 2}},
                {piece: 'king', position: {x: 0, y: 0}},
                {piece: 'shoe', position: {x: 0, y: 2}},
                {piece: 'shoe', position: {x: 3, y: 3}},
                {piece: 'shoe', position: {x: 7, y: 1}},
            ],
            boardSize: {x: 8, y: 4},
            moves: 3,
            text: 'Balls can only be moved when next to shoes. Shoes move like a kings.',
            walls: [
                {x: 0, y: 1},
                {x: 1, y: 1},
                {x: 2, y: 1},
                {x: 3, y: 1},
            ],
        },
        // 4 (🫘👟⚽)
        {
            pieces: [
                {piece: 'ball', position: {x: 1, y: 3}},
                {piece: 'bean', position: {x: 2, y: 0}},
                {piece: 'king', position: {x: 4, y: 0}},
                {piece: 'pawn', position: {x: 4, y: 1}},
                {piece: 'rook', position: {x: 4, y: 2}},
                {piece: 'shoe', position: {x: 1, y: 4}},
            ],
            boardSize: {x: 5, y: 5},
            moves: 4,
            text: '',
            walls: [],
        },
        // 5 (🥫)
        {
            pieces: [
                {piece: 'can', position: {x: 1, y: 3}},
                {piece: 'king', position: {x: 0, y: 0}},
            ],
            boardSize: {x: 3, y: 4},
            moves: 3,
            text: 'Cans spawn beans instead of moving.',
            walls: [],
        },
        // 6 (👟⚽🥫)
        {
            pieces: [
                {piece: 'ball', position: {x: 0, y: 3}},
                {piece: 'can', position: {x: 1, y: 3}},
                {piece: 'king', position: {x: 0, y: 0}},
                {piece: 'rook', position: {x: 3, y: 0}},
                {piece: 'shoe', position: {x: 1, y: 4}},
            ],
            boardSize: {x: 4, y: 5},
            moves: 3,
            text: '',
            walls: [
                {x: 2, y: 0},
                {x: 2, y: 1},
            ],
        },
        // 7 (🫘💣)
        {
            pieces: [
                {piece: 'bean', position: {x: 0, y: 1}},
                {piece: 'bean', position: {x: 0, y: 3}},
                {piece: 'bean', position: {x: 1, y: 1}},
                {piece: 'bean', position: {x: 2, y: 1}},
                {piece: 'bean', position: {x: 2, y: 3}},
                {piece: 'bishop', position: {x: 2, y: 2}},
                {piece: 'bomb', position: {x: 1, y: 5}},
                {piece: 'king', position: {x: 4, y: 1}},
                {piece: 'knight', position: {x: 0, y: 2}},
                {piece: 'pawn', position: {x: 3, y: 4}},
                {piece: 'rook', position: {x: 1, y: 2}},
            ],
            boardSize: {x: 5, y: 6},
            moves: 2,
            text: 'Bombs capture all pieces neighboring the tile they move to.',
            walls: [
                {x: 3, y: 1},
                {x: 3, y: 2},
                {x: 3, y: 3},
                {x: 4, y: 2},
                {x: 4, y: 3},
                {x: 4, y: 4},
                {x: 4, y: 5},
            ],
        },
        // 8 (🫘💣)
        {
            pieces: [
                {piece: 'bean', position: {x: 2, y: 2}},
                {piece: 'bean', position: {x: 3, y: 2}},
                {piece: 'bean', position: {x: 4, y: 2}},
                {piece: 'bomb', position: {x: 0, y: 1}},
                {piece: 'bomb', position: {x: 0, y: 2}},
                {piece: 'king', position: {x: 6, y: 0}},
                {piece: 'rook', position: {x: 6, y: 2}},
            ],
            boardSize: {x: 7, y: 3},
            moves: 3,
            text: '',
            walls: [
                {x: 0, y: 0},
                {x: 1, y: 0},
                {x: 2, y: 0},
                {x: 2, y: 3},
                {x: 2, y: 4},
                {x: 3, y: 0},
                {x: 3, y: 3},
                {x: 3, y: 4},
                {x: 4, y: 0},
                {x: 4, y: 1},
                {x: 4, y: 3},
                {x: 4, y: 4},
            ],
            // 8
        },
        // 9 (💣)
        {
            pieces: [
                {piece: 'bomb', position: {x: 1, y: 5}},
                {piece: 'king', position: {x: 5, y: 1}},
                {piece: 'knight', position: {x: 3, y: 2}},
                {piece: 'pawn', position: {x: 0, y: 3}},
                {piece: 'pawn', position: {x: 1, y: 3}},
                {piece: 'pawn', position: {x: 2, y: 3}},
                {piece: 'rook', position: {x: 3, y: 0}},
            ],
            boardSize: {x: 6, y: 6},
            moves: 4,
            text: '',
            walls: [
                {x: 3, y: 3},
                {x: 3, y: 4},
                {x: 3, y: 5},
                {x: 4, y: 3},
                {x: 4, y: 4},
                {x: 4, y: 5},
                {x: 5, y: 3},
                {x: 5, y: 4},
                {x: 5, y: 5},
            ],
        },
        // 10 (🔋)
        {
            pieces: [
                {piece: 'chargedBattery', position: {x: 1, y: 4}},
                {piece: 'chargedBattery', position: {x: 4, y: 4}},
                {piece: 'king', position: {x: 1, y: 0}},
                {piece: 'pawn', position: {x: 0, y: 1}},
                {piece: 'pawn', position: {x: 1, y: 1}},
                {piece: 'pawn', position: {x: 2, y: 1}},
            ],
            boardSize: {x: 5, y: 5},
            moves: 1,
            text: 'Batteries behave like queens when full and kings when empty.',
            walls: [],
        },
        // 11 (🔋)
        {
            pieces: [
                {piece: 'chargedBattery', position: {x: 0, y: 0}},
                {piece: 'chargedBattery', position: {x: 0, y: 2}},
                {piece: 'king', position: {x: 6, y: 0}},
                {piece: 'rook', position: {x: 2, y: 0}},
            ],
            boardSize: {x: 7, y: 3},
            moves: 2,
            text: '',
            walls: [
                {x: 3, y: 2},
                {x: 4, y: 2},
                {x: 5, y: 1},
                {x: 5, y: 2},
                {x: 6, y: 1},
                {x: 6, y: 2},
            ],
        },
        // 12 (👟⚽🔋)
        {
            pieces: [
                {piece: 'ball', position: {x: 2, y: 3}},
                {piece: 'bishop', position: {x: 3, y: 0}},
                {piece: 'chargedBattery', position: {x: 0, y: 5}},
                {piece: 'chargedBattery', position: {x: 2, y: 5}},
                {piece: 'chargedBattery', position: {x: 4, y: 5}},
                {piece: 'king', position: {x: 2, y: 1}},
                {piece: 'pawn', position: {x: 0, y: 1}},
                {piece: 'pawn', position: {x: 1, y: 1}},
                {piece: 'pawn', position: {x: 3, y: 1}},
                {piece: 'pawn', position: {x: 4, y: 1}},
                {piece: 'shoe', position: {x: 0, y: 4}},
                {piece: 'shoe', position: {x: 3, y: 3}},
            ],
            boardSize: {
                x: 5,
                y: 6,
            },
            moves: 2,
            text: '',
            walls: [],
        },
    ];

    const musicAudio = setupMusic(music);
    const storage = setupStorage('october');

    const clickAudio = setupSoundEffect(click);
    const loseAudio = setupSoundEffect(lose);
    const winAudio = setupSoundEffect(win);

    let animation: {startTime: number; from: Piece[]; to: Piece[]; callback?: () => void} | null = null;
    let board = {level: structuredClone(LEVELS[0]), enemyTurn: false};
    let complete = true;
    let done = false;
    let dragging = false;
    let flashText: string | null = null;
    let levelIndex = 0;
    let pointerDownStart: Position | null = null;
    let pointerPosition = {x: 0, y: 0};
    let selectedPiece: Piece | null = null;
    let thinking: {id: string; start: number} | undefined;
    let undoStack: {board: BoardState}[] = [];

    function saveUndoState() {
        undoStack.push({board: structuredClone(board)});
        updateUndoButtonState();
    }

    function updateUndoButtonState() {
        const undoButton = document.getElementById('october-undo-button');
        if (undoButton) (undoButton as HTMLButtonElement).disabled = undoStack.length === 0;
    }

    function undo() {
        if (undoStack.length === 0 || animation) return;

        thinking = undefined;

        const fromPieces = structuredClone(board.level.pieces);
        const state = undoStack.pop()!;
        board = state.board;
        selectedPiece = null;

        startAnimation(fromPieces, board.level.pieces);

        updateUndoButtonState();
        updateMovesIndicator();
    }

    function mainMenu() {
        complete = true;
        thinking = undefined;

        context.fillStyle = BACKGROUND_COLOR;
        context.fillRect(0, 0, canvas.width, canvas.height);

        const nextLevel = +(storage.get('nextLevel') ?? '0');

        setOverlay(`
            <div class="center" style="display: flex; flex-direction: column; align-items: center; gap: 50px; color: var(--ui-black)">
                <img src="${logo}" alt="The Bean's Gambit" width="300" />
                <span>
                    Basic chess knowledge is requried to play.
                    <a href="https://en.wikipedia.org/wiki/Chess#Rules" target="_blank" style="color: var(--ui-black);">Learn here</a>.
                </span>
                <div id="october-level-buttons" style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; max-width: 500px">
                    ${LEVELS.map((_, index) => `<button class="dark" style="width: 70px; height: 35px; ${nextLevel === index ? 'border-width: 5px; border-style: dashed; padding: 0' : ''}" ${nextLevel < index ? 'disabled' : ''}>${index + 1} ${nextLevel > index ? '🏆' : ''}</button>`).join('')}
                </div>
                <span>More levels coming soon!</span>
            </div>
        `);

        overlay.querySelectorAll('#october-level-buttons > button').forEach((button, index) => {
            button.addEventListener('click', () => loadLevel(index));
        });
    }

    function winLevel() {
        if (complete) return;

        selectedPiece = null;
        draw();
        complete = true;
        winAudio.play();

        const currentMax = +(storage.get('nextLevel') ?? '0');
        if (levelIndex >= currentMax) storage.set('nextLevel', String(levelIndex + 1));

        setOverlay(`
            <div style="display: flex; flex-direction: column; gap: 10px; background-color: ${BACKGROUND_COLOR}; border: 1px solid var(--ui-black); padding: 15px; align-items: center; margin: 5px 0 0 5px; width: fit-content; color: var(--ui-black)">
                Level ${levelIndex + 1} complete 🏆
                <div style="display: flex; gap: 5px">
                    <button class="dark" id="october-menu-button">MENU</button>
                    ${levelIndex < LEVELS.length - 1 ? '<button class="dark" id="october-next-button">NEXT LEVEL</button>' : ''}
                </div>
            </div>
        `);

        document.getElementById('october-menu-button')!.addEventListener('click', () => {
            clickAudio.play();
            mainMenu();
        });

        document.getElementById('october-next-button')?.addEventListener('click', () => loadLevel(levelIndex + 1));
    }

    function loadLevel(index: number, reload = false) {
        complete = false;
        if (!reload) {
            thinking = undefined;

            clickAudio.play();
            levelIndex = index;
            board = {level: structuredClone(LEVELS[levelIndex]), enemyTurn: false};
            selectedPiece = null;
            animation = null;
            undoStack = [];
        }

        setOverlay(`
            <div style="position: absolute; top: 5px; left: 5px; display: flex; gap: 5px; align-items: center; color: var(--ui-black)">
                <button id="october-menu-button" class="dark">MENU</button>
                <button id="october-reset-button" class="dark">RESET</button>
                <button id="october-undo-button" class="dark">UNDO</button>
                Level ${levelIndex + 1} | <span id="october-moves-indicator">Checkmate in: ${board.level.moves - undoStack.length}</span>
            </div>
        `);

        document.getElementById('october-menu-button')!.addEventListener('click', () => {
            clickAudio.play();
            mainMenu();
        });

        document.getElementById('october-reset-button')!.addEventListener('click', () => loadLevel(levelIndex));

        document.getElementById('october-undo-button')!.addEventListener('click', () => {
            clickAudio.play();
            undo();
        });

        updateUndoButtonState();
        requestAnimationFrame(draw);
    }

    function flash(text: string) {
        flashText = text;
        setTimeout(() => (flashText = null), FLASH_DURATION);
    }

    function postPlayerMove() {
        const inCheck = isPlayerThreateningKing(board);
        const hasEnemyMoves = board.level.pieces
            .filter(other => PIECES[other.piece].enemy)
            .some(enemyPiece => !generatePieceMoves(board, enemyPiece).next().done);

        if (!hasEnemyMoves) {
            if (inCheck) {
                flash('CHECKMATE!');
                requestAnimationFrame(winLevel);
            } else {
                requestAnimationFrame(() => failLevel('Stalemate!'));
            }
            return;
        }

        if (inCheck) flash('CHECK!');

        setTimeout(enemyMove, inCheck ? FLASH_DURATION : 0);
    }

    function failLevel(reason: string) {
        selectedPiece = null;
        draw();
        complete = true;
        loseAudio.play();

        setOverlay(`
            <div style="display: flex; flex-direction: column; gap: 10px; background-color: ${BACKGROUND_COLOR}; border: 1px solid var(--ui-black); padding: 15px; align-items: center; margin: 5px 0 0 5px; width: fit-content; color: var(--ui-black)">
                Level failed: ${reason}
                <div style="display: flex; gap: 5px">
                    <button class="dark" id="october-back-button">BACK</button>
                    <button class="dark" id="october-reset-button">RESET</button>
                    <button class="dark" id="october-undo-button">UNDO</button>
                </div>
            </div>
        `);

        document.getElementById('october-back-button')!.addEventListener('click', () => {
            clickAudio.play();
            mainMenu();
        });

        document.getElementById('october-reset-button')!.addEventListener('click', () => {
            clickAudio.play();
            loadLevel(levelIndex);
        });

        document.getElementById('october-undo-button')!.addEventListener('click', () => {
            clickAudio.play();
            undo();
            loadLevel(levelIndex, true);
        });
    }

    function updateMovesIndicator() {
        const indicator = document.getElementById('october-moves-indicator');
        if (indicator) indicator.textContent = `Checkmate in: ${board.level.moves - undoStack.length}`;
    }

    function sortPieces(a: Piece, b: Piece) {
        return a.piece.localeCompare(b.piece) || a.position.x - b.position.x || a.position.y - b.position.y;
    }

    function startAnimation(fromPieces: Piece[], toPieces: Piece[], callback?: () => void) {
        if (JSON.stringify([...fromPieces].sort(sortPieces)) === JSON.stringify([...toPieces].sort(sortPieces))) {
            callback?.();
        } else {
            animation = {
                startTime: performance.now(),
                from: fromPieces,
                to: toPieces,
                callback,
            };
        }
    }

    function getTileCoordinates(event: PointerEvent) {
        return {
            x: Math.floor((event.offsetX - canvas.width / 2 + (board.level.boardSize.x * TILE_SIZE) / 2) / TILE_SIZE),
            y: Math.floor(
                (event.offsetY -
                    canvas.height / 2 -
                    (board.level.text ? BOARD_Y_OFFSET : 0) +
                    (board.level.boardSize.y * TILE_SIZE) / 2) /
                    TILE_SIZE,
            ),
        };
    }

    function draw() {
        if (done || complete) return;

        context.fillStyle = BACKGROUND_COLOR;
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.textAlign = 'center';

        const {text, boardSize, walls, pieces} = board.level;

        if (text) {
            context.font = `16px ${FONT}`;
            context.fillStyle = UI_BLACK;
            context.fillText(text, canvas.width / 2, canvas.height / 2 - (boardSize.y * TILE_SIZE) / 2);
        }

        context.save();
        context.translate(
            canvas.width / 2 - (boardSize.x * TILE_SIZE) / 2,
            canvas.height / 2 - (boardSize.y * TILE_SIZE) / 2 + (text ? BOARD_Y_OFFSET : 0),
        );

        for (let x = 0; x < boardSize.x; x++) {
            for (let y = 0; y < boardSize.y; y++) {
                if (walls.some(wall => wall.x === x && wall.y === y)) continue;
                context.fillStyle = (x + y) % 2 === 0 ? TILE_COLOR_1 : TILE_COLOR_2;
                context.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }

        if (selectedPiece) {
            context.fillStyle = SELECTION_COLOR;
            context.fillRect(
                selectedPiece.position.x * TILE_SIZE,
                selectedPiece.position.y * TILE_SIZE,
                TILE_SIZE,
                TILE_SIZE,
            );
        }

        if (animation) {
            const progress = clamp((performance.now() - animation.startTime) / ANIMATION_DURATION, 0, 1);

            const fromCopy = structuredClone(animation.from);
            const toCopy = structuredClone(animation.to);

            const stationary: Piece[] = [];
            const moved: {from: Piece; to: Piece}[] = [];

            for (let index = toCopy.length - 1; index >= 0; --index) {
                const toPiece = toCopy[index];
                const fromIndex = fromCopy.findIndex(
                    piece =>
                        piece.piece === toPiece.piece &&
                        piece.position.x === toPiece.position.x &&
                        piece.position.y === toPiece.position.y,
                );
                if (fromIndex !== -1) {
                    stationary.push(toPiece);
                    toCopy.splice(index, 1);
                    fromCopy.splice(fromIndex, 1);
                }
            }

            for (let index = toCopy.length - 1; index >= 0; --index) {
                const toPiece = toCopy[index];
                const fromIndex = fromCopy.findIndex(p => p.piece === toPiece.piece);
                if (fromIndex !== -1) {
                    moved.push({from: fromCopy[fromIndex], to: toPiece});
                    toCopy.splice(index, 1);
                    fromCopy.splice(fromIndex, 1);
                }
            }

            const drawPiece = (piece: Piece, x: number, y: number) => {
                context.font = `${TILE_SIZE * PIECE_FONT_SCALE + (PIECES[piece.piece].enemy ? ENEMY_FONT_SIZE_INCREASE : 0)}px ${FONT}`;
                context.fillStyle = ENEMY_COLOR;
                context.fillText(PIECES[piece.piece].symbol, x, y);
            };

            for (const piece of stationary) {
                if (dragging && piece === selectedPiece) continue;
                drawPiece(
                    piece,
                    piece.position.x * TILE_SIZE + TILE_SIZE / 2,
                    piece.position.y * TILE_SIZE + TILE_SIZE / 2,
                );
            }

            context.globalAlpha = 1;
            for (const {from, to} of moved) {
                if (dragging && to === selectedPiece) continue;
                const fromX = from.position.x * TILE_SIZE + TILE_SIZE / 2;
                const fromY = from.position.y * TILE_SIZE + TILE_SIZE / 2;
                const toX = to.position.x * TILE_SIZE + TILE_SIZE / 2;
                const toY = to.position.y * TILE_SIZE + TILE_SIZE / 2;
                drawPiece(to, fromX + (toX - fromX) * progress, fromY + (toY - fromY) * progress);
            }

            context.globalAlpha = 1 - progress;
            for (const piece of fromCopy) {
                drawPiece(
                    piece,
                    piece.position.x * TILE_SIZE + TILE_SIZE / 2,
                    piece.position.y * TILE_SIZE + TILE_SIZE / 2,
                );
            }

            context.globalAlpha = progress;
            for (const piece of toCopy) {
                drawPiece(
                    piece,
                    piece.position.x * TILE_SIZE + TILE_SIZE / 2,
                    piece.position.y * TILE_SIZE + TILE_SIZE / 2,
                );
            }

            context.globalAlpha = 1;

            if (progress >= 1) {
                const callback = animation.callback;
                animation = null;
                callback?.();
            }
        } else {
            for (const piece of pieces) {
                if (dragging && piece === selectedPiece) continue;
                const x = piece.position.x * TILE_SIZE + TILE_SIZE / 2;
                const y = piece.position.y * TILE_SIZE + TILE_SIZE / 2;
                context.font = `${TILE_SIZE * PIECE_FONT_SCALE + (PIECES[piece.piece].enemy ? ENEMY_FONT_SIZE_INCREASE : 0)}px ${FONT}`;
                context.fillStyle = ENEMY_COLOR;
                context.fillText(PIECES[piece.piece].symbol, x, y);
            }
        }

        if (selectedPiece) {
            context.fillStyle = CHOICE_COLOR;
            for (const move of generatePieceMoves(board, selectedPiece)) {
                context.beginPath();
                context.arc(
                    move.x * TILE_SIZE + TILE_SIZE / 2,
                    move.y * TILE_SIZE + TILE_SIZE / 2,
                    TILE_SIZE / 8,
                    0,
                    Math.PI * 2,
                );
                context.fill();
            }
        }

        context.restore();

        if (selectedPiece && dragging) {
            context.font = `${TILE_SIZE * 0.6}px ${FONT}`;
            context.fillStyle = ENEMY_COLOR;
            context.fillText(PIECES[selectedPiece.piece].symbol, pointerPosition.x, pointerPosition.y);
        }

        if (thinking && performance.now() - thinking.start > THINKING_DELAY) {
            context.fillStyle = 'rgba(0, 0, 0, 0.5)';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = UI_WHITE;
            context.font = `32px ${FONT}`;
            context.fillText('Thinking...', canvas.width / 2, canvas.height / 2);
        }

        if (flashText) {
            const king = board.level.pieces.find(piece => piece.piece === 'king');
            if (king) {
                const {text, boardSize} = board.level;

                context.font = `bold 16px ${FONT}`;
                context.fillStyle = ENEMY_COLOR;
                context.fillText(
                    flashText,
                    canvas.width / 2 - (boardSize.x * TILE_SIZE) / 2 + (king.position.x * TILE_SIZE + TILE_SIZE / 2),
                    canvas.height / 2 -
                        (boardSize.y * TILE_SIZE) / 2 +
                        (text ? BOARD_Y_OFFSET : 0) +
                        (king.position.y * TILE_SIZE + TILE_SIZE / 2) -
                        50,
                );
            }
        }

        if (!complete) requestAnimationFrame(draw);
    }

    function enemyMove() {
        thinking = {id: Math.random().toString(), start: performance.now()};
        worker.postMessage({
            month: 'october',
            data: {
                type: 'bestMove',
                board,
                lookaheadMoves: board.level.moves - undoStack.length,
                thinkId: thinking.id,
            },
        });
    }

    function onPointerDown(event: PointerEvent) {
        if (animation !== null || thinking || flashText) return;

        const {boardSize, pieces} = board.level;

        pointerDownStart = {x: event.offsetX, y: event.offsetY};
        const {x, y} = getTileCoordinates(event);

        if (x < 0 || x >= boardSize.x || y < 0 || y >= boardSize.y) return;

        const piece = findPiece(pieces, {x, y});

        if (complete) return;

        if (piece && !PIECES[piece.piece].enemy && selectedPiece !== piece) {
            clickAudio.play();
            selectedPiece = piece;
        }
    }

    function onPointerMove(event: PointerEvent) {
        if (
            selectedPiece &&
            pointerDownStart &&
            !dragging &&
            distance(pointerDownStart.x, pointerDownStart.y, event.offsetX, event.offsetY) > DRAG_THRESHOLD
        ) {
            dragging = true;
        }

        if (dragging) pointerPosition = {x: event.offsetX, y: event.offsetY};
    }

    function onPointerUp(event: PointerEvent) {
        const {boardSize, pieces} = board.level;

        const wasDragging = dragging;
        dragging = false;
        pointerDownStart = null;

        if (complete || animation !== null || !selectedPiece || thinking || flashText) return;

        const {x, y} = getTileCoordinates(event);

        if (
            x >= 0 &&
            x < boardSize.x &&
            y >= 0 &&
            y < boardSize.y &&
            [...generatePieceMoves(board, selectedPiece)].some(position => position.x === x && position.y === y)
        ) {
            if (!wasDragging) clickAudio.play();
            saveUndoState();

            const fromPieces = structuredClone(board.level.pieces);
            const originalPosition = structuredClone(selectedPiece.position);
            const pieceType = selectedPiece.piece;
            executeMove(board, selectedPiece.position, {x, y});
            const toPieces = board.level.pieces;

            if (wasDragging) {
                const movedPieceInTo = findPiece(toPieces, {x, y});
                if (movedPieceInTo?.piece === pieceType) {
                    const movedPieceInFrom = fromPieces.find(
                        piece => piece.position.x === originalPosition.x && piece.position.y === originalPosition.y,
                    );
                    if (movedPieceInFrom) {
                        movedPieceInFrom.position = {x, y};
                    }
                }
            }

            selectedPiece = null;

            updateMovesIndicator();
            startAnimation(fromPieces, toPieces, postPlayerMove);
        } else if (!wasDragging) {
            const pieceOnTile = findPiece(pieces, {x, y});
            if (!pieceOnTile || PIECES[pieceOnTile.piece].enemy) selectedPiece = null;
        }
    }

    function onKeyDown(event: KeyboardEvent) {
        if (animation || thinking || flashText) return;

        if (event.key === 'r') document.getElementById('october-reset-button')?.click();
        else if (event.key === 'z') document.getElementById('october-undo-button')?.click();
    }

    function receiveWorkerMessage(
        event: ResponseEvent<{
            type: 'bestMove';
            move: {from: Position; to: Position} | null;
            score: number;
            thinkId: string;
        }>,
    ) {
        const {month, data} = event.data;
        if (month !== 'october' || data.type !== 'bestMove') return;

        if (!thinking || data.thinkId !== thinking.id) return;
        thinking = undefined;

        const {move} = data;

        const fromPieces = structuredClone(board.level.pieces);
        if (board.enemyTurn) {
            executeMove(board, move!.from, move!.to);
        } else {
            saveUndoState();
            executeMove(board, move!.from, move!.to);
            updateMovesIndicator();
        }

        startAnimation(
            fromPieces,
            board.level.pieces,
            !board.enemyTurn
                ? () => {
                      if (undoStack.length >= board.level.moves) {
                          requestAnimationFrame(() => failLevel('Out of moves!'));
                      }
                  }
                : postPlayerMove,
        );
    }

    context.textAlign = 'center';
    context.textBaseline = 'middle';

    mainMenu();

    musicAudio.play();
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('keydown', onKeyDown);
    worker.addEventListener('message', receiveWorkerMessage);
    return () => {
        musicAudio.pause();
        done = true;
        document.removeEventListener('pointerdown', onPointerDown);
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('keydown', onKeyDown);
        worker.removeEventListener('message', receiveWorkerMessage);
    };
}

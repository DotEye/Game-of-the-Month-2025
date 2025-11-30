import {canvas, context, setOverlay} from '../../dom.ts';
import {setupStorage} from '../../shared/storage.ts';
import {create} from 'random-seed';
import click from '../../assets/click.ogg';
import explode from '../../assets/explode.ogg';
import win from '../../assets/win.ogg';
import {audioContext, downloadAndDecode, setupSoundEffect} from '../../audio.ts';
import {FONT, UI_BLACK, UI_WHITE} from '../../shared/style.ts';
import {setupBufferSource} from '../../util.ts';
import intro from './music/intro.ogg';
import loop from './music/loop.ogg';
import logo from './logo.webp';

type Rotation = 0 | 1 | 2 | 3;

interface Block {
    colorIndex: number;
}

interface PieceBlock {
    x: number;
    y: number;
    colorIndex: number;
}

namespace State {
    export interface Menu {
        type: 'menu';
    }

    export interface Building {
        type: 'building';
        piece: PieceBlock[];
        draggedBlock?: {x: number; y: number; colorIndex: number};
    }

    export interface Dropping {
        type: 'dropping';
        piece: PieceBlock[];
        position: {x: number; y: number};
        rotation: Rotation;
        isFastDropping: boolean;
    }

    export interface Scoring {
        type: 'scoring';
        roundScore: number;
        iteration: number;
        scoreEffects: {x: number; y: number; text: string}[];
    }

    export interface Retry {
        type: 'retry';
        roundScore: number;
    }

    export interface Results {
        type: 'results';
    }

    export interface Play {
        type: 'play';
        board: (Block | null)[][];
        placedBlocks: Set<string>;
        scores: number[];
        piecesHistory: PieceBlock[][];
        state: Building | Dropping | Scoring | Results | Retry;
        boardBeforeDrop?: (Block | null)[][];
        placedBlocksBeforeDrop?: Set<string>;
    }

    export type Any = Menu | Play;
}

export function november() {
    const BACKGROUND_COLOR = '#1d1d1d';
    const BLOCK_GENERATION_PROBABILITY = 0.5;
    const BLOCK_HOLE_DIVISOR = 6;
    const BOARD_GEN_HEIGHT = 12;
    const BUILD_GRID_SIZE = 5;
    const BUILD_GRID_Y = 50;
    const BUILD_TILE_SIZE = 40;
    const CLEAR_PAUSE_DURATION = 500;
    const DEFAULT_COLORS = ['#ff4136', '#ffd700', '#00c816', '#0065bb'];
    const DROP_SPEED = 500;
    const DROP_SPEED_FAST = 50;
    const FONT_SIZE_DEFAULT = 16;
    const FONT_SIZE_ITERATION = 48;
    const FONT_SIZE_SCORE = 24;
    const GRID_COLOR = 'gray';
    const GRID_SIZE = 20;
    const IMAGE_SIZE = 1080;
    const MIN_DATE = new Date(2025, 10, 1, 0, 0, 0, 0);
    const MIN_GROUP_SIZE = 3;
    const NUM_ROUNDS = 3;
    const PALETTE_SPACING = 10;
    const PALETTE_TILE_SIZE = 40;
    const PALETTE_X_OFFSET = 150;
    const PALETTE_Y = 50;
    const POINTER_SWIPE_THRESHOLD = 20;
    const SCORE_EFFECT_OFFSET_Y = 10;
    const SHAPE_PREVIEW_Y = 478;
    const SWIPE_DOWN_THRESHOLD = 30;

    const SCORE_SEGMENTS = [
        {name: 'Good', value: 10},
        {name: 'Great', value: 25},
        {name: 'Amazing', value: 50},
        {name: 'Incredible', value: 100},
        {name: 'Genius', value: 250},
    ];

    const TODAY = new Date();
    TODAY.setHours(0, 0, 0, 0);

    const clickAudio = setupSoundEffect(click);
    const explodeAudio = setupSoundEffect(explode);
    const winAudio = setupSoundEffect(win);
    const storage = setupStorage('november');

    let introSource: ReturnType<typeof setupBufferSource> | undefined;
    let loopSource: ReturnType<typeof setupBufferSource> | undefined;

    Promise.all([downloadAndDecode(intro), downloadAndDecode(loop)]).then(([introBuffer, loopBuffer]) => {
        if (done) return;

        introSource = setupBufferSource(introBuffer);
        if (introSource) {
            introSource.source.loop = false;
            introSource.gain.gain.setValueAtTime(1, audioContext.currentTime);

            const introStartTime = audioContext.currentTime;

            loopSource = setupBufferSource(loopBuffer, introStartTime + introBuffer.duration);
            if (loopSource) loopSource.gain.gain.setValueAtTime(1, audioContext.currentTime);
        }
    });

    const BOARD_TILE_SIZE = IMAGE_SIZE / GRID_SIZE;
    const BUILD_GRID_WIDTH = BUILD_GRID_SIZE * BUILD_TILE_SIZE;
    const BUILD_GRID_X = (canvas.width - BUILD_GRID_WIDTH) / 2;
    const COLORS: string[] = storage.get('colors') ?? [...DEFAULT_COLORS];
    const PALETTE_WIDTH = COLORS.length * (PALETTE_TILE_SIZE + 10) - 10;
    const PALETTE_X = (canvas.width - PALETTE_WIDTH) / 2 - PALETTE_X_OFFSET;
    const TILE_SIZE = canvas.width / GRID_SIZE;

    let useDistinctShapes = storage.get('useDistinctShapes') ?? false;
    let canvasScale = 1;
    let done = false;
    let dropInterval: number | undefined;
    let selectedDate = TODAY;
    let state: State.Any = {type: 'menu'};
    let pointerDownState: {
        id: number;
        startX: number;
        startY: number;
        currentX: number;
        currentY: number;
        isSwipe: boolean;
    } | null = null;

    function getTotalScore() {
        if (state.type !== 'play') return 0;
        let total = state.scores.reduce((a, b) => a + b, 0);
        if (state.state.type === 'scoring' || state.state.type === 'retry') total += state.state.roundScore;
        return total;
    }

    function createScoreProgressBar(score: number) {
        let result = '<div style="display: flex; gap: 5px; padding: 0 20px">';
        let scoreRemaining = score;
        let previousSegmentValue = 0;

        for (const segment of SCORE_SEGMENTS) {
            const segmentRange = segment.value - previousSegmentValue;
            const valueInSegment = Math.max(0, Math.min(scoreRemaining, segmentRange));
            const progress = segmentRange > 0 ? valueInSegment / segmentRange : 0;

            result += `
                <div style="flex: 1; text-align: center">
                    <label style="font-size: 12px">${segment.name} (${segment.value})</label>
                    <progress value="${progress}" max="1" style="width: 100%"></progress>
                </div>
            `;

            scoreRemaining -= valueInSegment;
            previousSegmentValue = segment.value;
        }

        return result + '</div>';
    }

    function getScoreSegmentName(score: number) {
        const reversed = [...SCORE_SEGMENTS].reverse();
        for (const segment of reversed) if (score >= segment.value) return segment.name;
    }

    function getDateString(date: Date) {
        return date.toISOString().split('T')[0];
    }

    function getHumanReadableDateString(date: Date) {
        return new Intl.DateTimeFormat('en-US', {
            timeZone: 'UTC',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        }).format(date);
    }

    function getSeedFromDate(date: Date) {
        return `${date.getFullYear()}-${date.getMonth()}-${date.getUTCDate()}`;
    }

    function drawShape(
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
        x: number,
        y: number,
        size: number,
        colorIndex: number,
        hole = false,
    ) {
        if (colorIndex === -1) {
            const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
            COLORS.forEach((c, i) => gradient.addColorStop(i / (COLORS.length - 1), c));
            ctx.fillStyle = gradient;
            ctx.fillRect(x, y, size, size);
            return;
        }
        ctx.fillStyle = COLORS[colorIndex];

        if (!useDistinctShapes) {
            ctx.fillRect(x, y, size, size);
        } else {
            ctx.beginPath();
            const distinctSize = size / 2;
            switch (colorIndex) {
                case 0:
                    ctx.moveTo(x + distinctSize, y);
                    ctx.lineTo(x + size, y);
                    ctx.lineTo(x + size, y + size);
                    ctx.lineTo(x, y + size);
                    ctx.lineTo(x, y + distinctSize);
                    ctx.closePath();
                    break;
                case 1:
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + size - distinctSize, y);
                    ctx.lineTo(x + size, y + distinctSize);
                    ctx.lineTo(x + size, y + size);
                    ctx.lineTo(x, y + size);
                    ctx.closePath();
                    break;
                case 2:
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + size, y);
                    ctx.lineTo(x + size, y + size - distinctSize);
                    ctx.lineTo(x + size - distinctSize, y + size);
                    ctx.lineTo(x, y + size);
                    ctx.closePath();
                    break;
                case 3:
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + size, y);
                    ctx.lineTo(x + size, y + size);
                    ctx.lineTo(x + distinctSize, y + size);
                    ctx.lineTo(x, y + size - distinctSize);
                    ctx.closePath();
                    break;
                default:
                    ctx.closePath();
                    ctx.fillRect(x, y, size, size);
                    return;
            }
            ctx.fill();
        }

        if (hole) {
            ctx.fillStyle = BACKGROUND_COLOR;
            ctx.beginPath();
            ctx.arc(x + size / 2, y + size / 2, size / BLOCK_HOLE_DIVISOR, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function draw() {
        if (done) return;

        context.fillStyle = BACKGROUND_COLOR;
        context.fillRect(0, 0, canvas.width, canvas.height);

        if (state.type === 'menu') {
            const totalWidth = COLORS.length * (BUILD_TILE_SIZE + PALETTE_SPACING) - PALETTE_SPACING;
            const startX = (canvas.width - totalWidth) / 2;
            COLORS.forEach((_, index) => {
                drawShape(
                    context,
                    startX + index * (BUILD_TILE_SIZE + PALETTE_SPACING),
                    SHAPE_PREVIEW_Y,
                    BUILD_TILE_SIZE,
                    index,
                );
            });
        }

        if (state.type === 'play') {
            for (let y = 0; y < GRID_SIZE; ++y) {
                for (let x = 0; x < GRID_SIZE; ++x) {
                    const block = state.board[y][x];
                    if (block) {
                        drawShape(
                            context,
                            x * TILE_SIZE,
                            y * TILE_SIZE,
                            TILE_SIZE,
                            block.colorIndex,
                            state.placedBlocks.has(`${x},${y}`),
                        );
                    }
                }
            }
        }

        if (state.type === 'play' && state.state.type === 'building') {
            context.fillStyle = UI_WHITE;
            context.font = `bold ${FONT_SIZE_DEFAULT}px ${FONT}`;
            context.fillText('Drag onto grid', PALETTE_X + PALETTE_TILE_SIZE / 2, 30);

            COLORS.forEach((_, index) => {
                drawShape(
                    context,
                    PALETTE_X,
                    PALETTE_Y + index * (PALETTE_TILE_SIZE + PALETTE_SPACING),
                    PALETTE_TILE_SIZE,
                    index,
                    true,
                );
            });

            const halfGrid = Math.floor(BUILD_GRID_SIZE / 2);

            const validPlacements = new Set<string>();
            for (const block of state.state.piece) {
                for (const [dx, dy] of [
                    [0, 1],
                    [0, -1],
                    [1, 0],
                    [-1, 0],
                ]) {
                    const nx = block.x + dx;
                    const ny = block.y + dy;

                    if (nx < -halfGrid || nx > halfGrid || ny < -halfGrid || ny > halfGrid) continue;

                    if (!state.state.piece.some(p => p.x === nx && p.y === ny)) {
                        validPlacements.add(`${nx},${ny}`);
                    }
                }
            }

            context.strokeStyle = GRID_COLOR;
            for (const key of validPlacements) {
                const [x, y] = key.split(',').map(Number);
                const drawX = BUILD_GRID_X + (x + halfGrid) * BUILD_TILE_SIZE;
                const drawY = BUILD_GRID_Y + (y + halfGrid) * BUILD_TILE_SIZE;
                context.strokeRect(drawX, drawY, BUILD_TILE_SIZE, BUILD_TILE_SIZE);
            }

            for (const block of state.state.piece) {
                const drawX = BUILD_GRID_X + (block.x + halfGrid) * BUILD_TILE_SIZE;
                const drawY = BUILD_GRID_Y + (block.y + halfGrid) * BUILD_TILE_SIZE;
                drawShape(context, drawX, drawY, BUILD_TILE_SIZE, block.colorIndex, true);
            }
        }

        if (state.type === 'play') {
            if (state.state.type === 'dropping') {
                const rotatedPiece = getRotatedPiece(state.state.piece, state.state.rotation);
                for (const block of rotatedPiece) {
                    const drawX = (state.state.position.x + block.x) * TILE_SIZE;
                    const drawY = (state.state.position.y + block.y) * TILE_SIZE;
                    drawShape(context, drawX, drawY, TILE_SIZE, block.colorIndex, true);
                }
            }

            if (state.state.type === 'building' && state.state.draggedBlock) {
                drawShape(
                    context,
                    state.state.draggedBlock.x - BUILD_TILE_SIZE / 1.5,
                    state.state.draggedBlock.y - BUILD_TILE_SIZE / 1.5,
                    BUILD_TILE_SIZE * 1.5,
                    state.state.draggedBlock.colorIndex,
                    true,
                );
            }

            if (state.state.type === 'scoring') {
                context.font = `bold ${FONT_SIZE_ITERATION}px ${FONT}`;
                context.fillStyle = UI_WHITE;
                context.strokeStyle = UI_BLACK;
                context.lineWidth = 2;
                const text = `x${Math.pow(2, state.state.iteration)}`;
                const x = canvas.width / 2;
                const y = FONT_SIZE_ITERATION;
                context.strokeText(text, x, y);
                context.fillText(text, x, y);
            }
        }

        if (state.type === 'play' && state.state.type === 'scoring') {
            context.fillStyle = UI_WHITE;
            context.strokeStyle = UI_BLACK;
            context.font = `bold ${FONT_SIZE_SCORE}px ${FONT}`;
            for (const effect of state.state.scoreEffects) {
                context.strokeText(effect.text, effect.x, effect.y);
                context.fillText(effect.text, effect.x, effect.y);
            }
        }
    }

    async function generateBoard(date: Date) {
        const generator = create(getSeedFromDate(date));
        const board: (Block | null)[][] = Array(GRID_SIZE)
            .fill(0)
            .map(() => Array(GRID_SIZE).fill(null));

        for (let y = GRID_SIZE - BOARD_GEN_HEIGHT; y < GRID_SIZE; ++y) {
            for (let x = 0; x < GRID_SIZE; ++x) {
                if (generator.random() < BLOCK_GENERATION_PROBABILITY) {
                    board[y][x] = {colorIndex: Math.floor(generator.random() * COLORS.length)};
                }
            }
        }

        while (true) {
            await handleDanglingPieces(board, false);

            const toClear = new Set<string>();
            const visited = new Set<string>();

            for (let y = 0; y < GRID_SIZE; ++y) {
                for (let x = 0; x < GRID_SIZE; ++x) {
                    const key = `${x},${y}`;
                    if (board[y][x] && !visited.has(key)) {
                        const group = findConnected(board, x, y, board[y][x]!.colorIndex);
                        group.forEach(gKey => visited.add(gKey));
                        if (group.size >= MIN_GROUP_SIZE) {
                            group.forEach(gKey => toClear.add(gKey));
                        }
                    }
                }
            }

            if (toClear.size > 0) {
                toClear.forEach(key => {
                    const [x, y] = key.split(',').map(Number);
                    board[y][x] = null;
                });
            } else break;
        }

        return board;
    }

    async function handleDanglingPieces(board: (Block | null)[][], animated: boolean) {
        while (true) {
            const supported = new Set<string>();
            const queue: {x: number; y: number}[] = [];
            for (let x = 0; x < GRID_SIZE; ++x) {
                if (board[GRID_SIZE - 1][x]) {
                    queue.push({x, y: GRID_SIZE - 1});
                    supported.add(`${x},${GRID_SIZE - 1}`);
                }
            }

            let head = 0;
            while (head < queue.length) {
                const {x, y} = queue[head++];
                for (const [nx, ny] of [
                    [x, y - 1],
                    [x, y + 1],
                    [x - 1, y],
                    [x + 1, y],
                ]) {
                    if (ny < 0 || ny >= GRID_SIZE || nx < 0 || nx >= GRID_SIZE || supported.has(`${nx},${ny}`)) {
                        continue;
                    }

                    if (board[ny][nx]) {
                        supported.add(`${nx},${ny}`);
                        queue.push({x: nx, y: ny});
                    }
                }
            }

            const dangling = [];
            for (let y = GRID_SIZE - 2; y >= 0; --y) {
                for (let x = 0; x < GRID_SIZE; ++x) {
                    if (board[y][x] && !supported.has(`${x},${y}`)) {
                        dangling.push({x, y});
                    }
                }
            }

            if (dangling.length === 0) break;

            let dropped = false;
            for (const {x, y} of dangling.sort((a, b) => b.y - a.y)) {
                if (board[y][x] && y + 1 < GRID_SIZE && !board[y + 1][x]) {
                    board[y + 1][x] = board[y][x];
                    if (state.type === 'play' && state.placedBlocks.has(`${x},${y}`)) {
                        state.placedBlocks.delete(`${x},${y}`);
                        state.placedBlocks.add(`${x},${y + 1}`);
                    }
                    board[y][x] = null;
                    dropped = true;
                }
            }

            if (dropped) {
                if (animated) {
                    draw();
                    await new Promise(resolve => setTimeout(resolve, DROP_SPEED));
                }
                continue;
            }

            if (!dropped) break;
        }
    }

    function getRotatedPiece(piece: PieceBlock[], rotation: number) {
        return piece.map(block => {
            let {x, y} = block;
            for (let i = 0; i < rotation; ++i) {
                const tempX = x;
                x = y;
                y = -tempX;
            }
            return {...block, x, y};
        });
    }

    function mainMenu() {
        state = {type: 'menu'};
        if (dropInterval) clearInterval(dropInterval);

        setOverlay(`
            <div class="center" style="display: flex; flex-direction: column; gap: 10px; color: var(--ui-white)">
                <img src="${logo}" alt="Make and Break" width="300" />
                <div style="display: flex; gap: 10px; align-items: center">
                    <button id="november-prev-button" class="light">Prev</button>
                    <input id="november-date-input" type="date" min="${getDateString(MIN_DATE)}" style="border: none; padding: 10px">
                    <button id="november-next-button" class="light">Next</button>
                </div>
                <span><strong>Best score</strong>: <span id="november-best-score">-</span></span>
                <button id="november-start-game-button" class="light" style="font-weight: bold">START GAME</button>
                <label>
                    <input type="checkbox" id="november-shape-toggle" ${useDistinctShapes ? 'checked' : ''}>
                    Use distinct shapes
                </label>
                Click piece to change color:
                <div id="november-color-inputs" style="display: flex; align-items: center; gap: ${PALETTE_SPACING}px; opacity: 0">
                    ${COLORS.map(
                        color =>
                            `<input type="color" style="width: ${BUILD_TILE_SIZE}px; height: ${BUILD_TILE_SIZE}px" value="${color}">`,
                    ).join('')}
                </div>
                <div style="display: flex; gap: 10px">
                    <button id="november-how-to-play-button" class="light">HOW TO PLAY</button>
                    <button id="november-reset-colors-button" class="light">Reset to Default Colors</button>
                </div>
            </div>
        `);

        const inputElement = document.getElementById('november-date-input') as HTMLInputElement;
        const prevButton = document.getElementById('november-prev-button') as HTMLButtonElement;
        const nextButton = document.getElementById('november-next-button') as HTMLButtonElement;
        const startButton = document.getElementById('november-start-game-button') as HTMLButtonElement;
        const howToPlayButton = document.getElementById('november-how-to-play-button') as HTMLButtonElement;
        const bestScoreSpan = document.getElementById('november-best-score') as HTMLSpanElement;
        const shapeToggle = document.getElementById('november-shape-toggle') as HTMLInputElement;
        const resetColorsButton = document.getElementById('november-reset-colors-button') as HTMLButtonElement;
        const colorInputs = document.querySelectorAll('#november-color-inputs > input');

        resetColorsButton.addEventListener('click', () => {
            clickAudio.play();
            DEFAULT_COLORS.forEach((color, index) => {
                COLORS[index] = color;
                (colorInputs[index] as HTMLInputElement).value = color;
            });
            storage.set('colors', COLORS);
            draw();
        });

        colorInputs.forEach((input, index) => {
            input.addEventListener('input', () => {
                COLORS[index] = (input as HTMLInputElement).value;
                storage.set('colors', COLORS);
                draw();
            });
        });

        shapeToggle.addEventListener('change', () => {
            clickAudio.play();
            useDistinctShapes = shapeToggle.checked;
            storage.set('useDistinctShapes', useDistinctShapes);
            draw();
        });

        const TODAY_NORM = getDateString(TODAY);
        const MIN_DATE_NORM = getDateString(MIN_DATE);

        inputElement.value = getDateString(selectedDate);
        inputElement.max = TODAY_NORM;

        function onDateChange(date = new Date(inputElement.value)) {
            // @ts-ignore this is the best way for checking invalid dates https://stackoverflow.com/questions/1353684
            if (isNaN(date)) {
                inputElement.value = getDateString(selectedDate);
                return;
            }
            if (date > TODAY) date = new Date(TODAY_NORM);
            else if (date < MIN_DATE) date = new Date(MIN_DATE_NORM);
            selectedDate = date;
            inputElement.value = getDateString(date);
            prevButton.disabled = inputElement.value <= MIN_DATE_NORM;
            nextButton.disabled = inputElement.value >= TODAY_NORM;
            bestScoreSpan.textContent = `${storage.get(`bestScore-${getDateString(date)}`) ?? '-'}`;
        }

        inputElement.addEventListener('change', () => {
            clickAudio.play();
            onDateChange();
        });
        prevButton.addEventListener('click', () => {
            const date = new Date(inputElement.value);
            date.setUTCDate(date.getUTCDate() - 1);
            clickAudio.play();
            onDateChange(date);
        });
        nextButton.addEventListener('click', () => {
            const date = new Date(inputElement.value);
            date.setUTCDate(date.getUTCDate() + 1);
            clickAudio.play();
            onDateChange(date);
        });
        startButton.addEventListener('click', () => {
            clickAudio.play();
            startGame();
        });
        howToPlayButton.addEventListener('click', () => {
            clickAudio.play();
            howToPlay();
        });

        onDateChange();
        draw();
    }

    function howToPlay() {
        context.fillStyle = BACKGROUND_COLOR;
        context.fillRect(0, 0, canvas.width, canvas.height);
        setOverlay(`
            <div class="center" style="display: flex; flex-direction: column; gap: 15px; color: var(--ui-white)">
                <h2>How to Play Make and Break</h2>
                <ol style="padding: 0 20px; list-style: none; display: flex; flex-direction: column; gap: 5px">
                    <li>🟥 <strong>Board</strong>: each day there is a new randomly generated board.</li>
                    <li>🏗️ <strong>Build</strong>: drag blocks to build your piece on the ${BUILD_GRID_SIZE}x${BUILD_GRID_SIZE} grid. Blocks must be connected to the wild piece in the center. Click/tap a block on your piece to remove it.</li>
                    <li>💧 <strong>Drop</strong>: when you're ready, hit "DROP!". Use left and right arrow keys or swipe left and right to move the piece, and "A"/"D" keys or tap screen edges to rotate.</li>
                    <li>⏩ <strong>Fast drop</strong>: hold the down arrow key or swipe down and hold to drop the piece faster.</li>
                    <li>💯 <strong>Clear</strong>: when your piece lands, it clears any groups of matching colors of ${MIN_GROUP_SIZE} or larger.</li>
                    <li>⛓️ <strong>Chain reactions</strong>: any blocks left unsupported will fall, potentially causing more clears and scoring bonus points. Chain reactions are essential for large scores.</li>
                    <li>🌈 <strong>Wild</strong>: the rainbow block in the center of your piece is a wild block. It will match with any color, but does not count towards your score.</li>
                    <li>🕳️ <strong>Holes</strong>: blocks you use to build your piece have holes in them. They work just like any other block, but do not count towards your score.</li>
                    <li>🔢 <strong>${NUM_ROUNDS} rounds</strong>: you get ${NUM_ROUNDS} pieces to drop. Try to score as many points as possible!</li>
                </ol>
                <button id="november-back-button" class="light">BACK</button>
            </div>
        `);

        document.getElementById('november-back-button')!.addEventListener('click', () => {
            clickAudio.play();
            mainMenu();
        });
    }

    async function startGame() {
        const board = await generateBoard(selectedDate);
        startBuilding(board, [], {scores: []});
    }

    function startBuilding(
        board: (Block | null)[][],
        piecesHistory: PieceBlock[][],
        options: {piece?: PieceBlock[]; placedBlocks?: Set<string>; scores?: number[]} = {},
    ) {
        const {piece, placedBlocks} = options;
        const initialPiece: PieceBlock[] = piece ?? [{x: 0, y: 0, colorIndex: -1}];

        state = {
            type: 'play',
            board,
            placedBlocks: placedBlocks ?? (state.type === 'play' ? state.placedBlocks : new Set()),
            scores: options.scores ?? (state.type === 'play' ? state.scores : []),
            piecesHistory,
            state: {type: 'building', piece: initialPiece},
        };

        setOverlay(`
            <div style="position: absolute; top: 5px; right: 5px; display: flex; flex-direction: column; gap: 5px">
                <button id="november-menu-button" class="light">MENU</button>
                <div style="display: flex; flex-direction: column; gap: 5px">
                    <span>${getDateString(selectedDate)}</span>
                    <span><strong>Round</strong>: ${state.scores.length + 1}/3</span>
                    <span><strong>Score</strong>: ${getTotalScore()}</span>
                </div>
                <button id="november-clear-button" class="light">CLEAR</button>
                <button id="november-drop-button" class="light" style="font-weight: bold; font-size: 32px">DROP!</button>
            </div>
        `);

        document.getElementById('november-menu-button')!.addEventListener('click', () => {
            clickAudio.play();
            mainMenu();
        });

        document.getElementById('november-clear-button')!.addEventListener('click', () => {
            if (state.type !== 'play' || state.state.type !== 'building') return;
            clickAudio.play();
            state.state.piece = [{x: 0, y: 0, colorIndex: -1}];
            draw();
        });

        document.getElementById('november-drop-button')!.addEventListener('click', () => {
            if (state.type !== 'play' || state.state.type !== 'building' || state.state.piece.length === 0) return;
            clickAudio.play();

            if (state.type === 'play') {
                state.boardBeforeDrop = JSON.parse(JSON.stringify(state.board));
                state.placedBlocksBeforeDrop = new Set(state.placedBlocks);
            }

            startDropping();
        });

        draw();
    }

    function setDropInterval() {
        if (dropInterval) clearInterval(dropInterval);
        if (state.type !== 'play' || state.state.type !== 'dropping') return;
        const speed = state.state.isFastDropping ? DROP_SPEED_FAST : DROP_SPEED;
        dropInterval = setInterval(() => {
            if (state.type !== 'play' || state.state.type !== 'dropping') return;
            const nextPos = {x: state.state.position.x, y: state.state.position.y + 1};
            if (checkCollision(state.state.piece, nextPos, state.state.rotation, state.board)) {
                placePiece();
            } else {
                state.state.position = nextPos;
                draw();
            }
        }, speed);
    }

    function startDropping() {
        if (state.type !== 'play' || state.state.type !== 'building') return;
        const {piecesHistory, scores} = state;
        const {piece} = state.state;

        const pieceWidth = Math.max(...piece.map(b => b.x)) - Math.min(...piece.map(b => b.x)) + 1;
        const startX = Math.floor((GRID_SIZE - pieceWidth) / 2);
        const startY = -Math.max(...piece.map(b => b.y));

        state.state = {
            type: 'dropping',
            piece,
            position: {x: startX, y: startY},
            rotation: 0,
            isFastDropping: false,
        };
        state.piecesHistory = [...piecesHistory, piece];

        setOverlay(`
            <div style="position: absolute; top: 5px; right: 5px; display: flex; flex-direction: column; gap: 5px">
                <span>${getDateString(selectedDate)}</span>
                <span><strong>Round</strong>: ${scores.length + 1}/3</span>
                <span><strong>Score</strong>: <span id="november-score-span">${getTotalScore()}</span></span>
            </div>
        `);
        draw();
        setDropInterval();
    }

    function checkCollision(
        piece: PieceBlock[],
        position: {x: number; y: number},
        rotation: number,
        board: (Block | null)[][],
    ) {
        const rotatedPiece = getRotatedPiece(piece, rotation);
        for (const block of rotatedPiece) {
            const boardX = position.x + block.x;
            const boardY = position.y + block.y;
            if (boardX < 0 || boardX >= GRID_SIZE || boardY >= GRID_SIZE || (boardY >= 0 && board[boardY][boardX])) {
                return true;
            }
        }
        return false;
    }

    function placePiece() {
        if (state.type !== 'play' || state.state.type !== 'dropping') return;
        if (dropInterval) clearInterval(dropInterval);
        dropInterval = undefined;

        const {board, piecesHistory} = state;
        const {piece, position, rotation} = state.state;
        const rotatedPiece = getRotatedPiece(piece, rotation);

        for (const block of rotatedPiece) {
            const boardX = position.x + block.x;
            const boardY = position.y + block.y;
            if (boardY >= 0 && boardY < GRID_SIZE && boardX >= 0 && boardX < GRID_SIZE) {
                board[boardY][boardX] = {colorIndex: block.colorIndex};
                state.placedBlocks.add(`${boardX},${boardY}`);
            }
        }

        startScoring(board, 0, piecesHistory);
    }

    async function startScoring(board: (Block | null)[][], roundScore: number, piecesHistory: PieceBlock[][]) {
        if (state.type !== 'play') return;
        state.state = {type: 'scoring', roundScore, iteration: 0, scoreEffects: []};
        draw();
        await new Promise(resolve => setTimeout(resolve, CLEAR_PAUSE_DURATION));

        while (true) {
            if (state.type !== 'play' || state.state.type !== 'scoring') return;

            draw();

            const toClear = new Set<string>();
            const scoringBlocks = new Set<string>();
            const visited = new Set<string>();

            for (let y = 0; y < GRID_SIZE; ++y) {
                for (let x = 0; x < GRID_SIZE; ++x) {
                    const block = board[y][x];
                    if (block && block.colorIndex !== -1 && !visited.has(`${x},${y}`)) {
                        const group = findConnected(board, x, y, block.colorIndex);
                        group.forEach(key => visited.add(key));

                        if (group.size >= MIN_GROUP_SIZE) {
                            group.forEach(key => toClear.add(key));
                            for (const key of group) if (!state.placedBlocks.has(key)) scoringBlocks.add(key);
                        }
                    }
                }
            }

            if (toClear.size > 0) {
                const scoreIncrease = Math.pow(scoringBlocks.size, 2) * Math.pow(2, state.state.iteration!);
                if (scoreIncrease > 0) {
                    state.state.roundScore += scoreIncrease;
                    document.getElementById('november-score-span')!.innerText = getTotalScore().toString();

                    let minX = GRID_SIZE;
                    let maxX = 0;
                    let minY = GRID_SIZE;
                    toClear.forEach(key => {
                        const [x, y] = key.split(',').map(Number);
                        minX = Math.min(minX, x);
                        maxX = Math.max(maxX, x);
                        minY = Math.min(minY, y);
                    });
                    const centerX = ((minX + maxX + 1) * TILE_SIZE) / 2;
                    const topY = minY * TILE_SIZE;

                    state.state.scoreEffects.push({
                        x: centerX,
                        y: topY - SCORE_EFFECT_OFFSET_Y,
                        text: `+${scoreIncrease}`,
                    });
                }

                explodeAudio.play();
                toClear.forEach(key => {
                    const [x, y] = key.split(',').map(Number);
                    board[y][x] = null;
                    (state as State.Play).placedBlocks.delete(`${x},${y}`);
                });
                draw();
                await new Promise(resolve => setTimeout(resolve, CLEAR_PAUSE_DURATION));
                state.state.scoreEffects = [];
            }

            await handleDanglingPieces(board, true);

            if (toClear.size === 0) break;

            ++state.state.iteration!;
        }

        if (state.type !== 'play' || state.state.type !== 'scoring') return;

        showRetryScreen(board, state.state.roundScore, piecesHistory);
    }

    function showRetryScreen(board: (Block | null)[][], roundScore: number, piecesHistory: PieceBlock[][]) {
        if (state.type !== 'play') return;

        state.state = {type: 'retry', roundScore: roundScore};

        draw();

        const round = state.scores.length + 1;
        const totalScore = getTotalScore();

        setOverlay(`
            <div style="display: flex; flex-direction: column; gap: 15px; color: var(--ui-white); text-align: center">
                <div></div>
                <h2>Round ${round} complete!</h2>
                <h3>Score for this round: ${roundScore.toLocaleString()}</h3>
                <h3>Total Score: ${totalScore.toLocaleString()}</h3>
                ${createScoreProgressBar(totalScore)}
                <div style="display: flex; gap: 10px; justify-content: center">
                    <button id="november-retry-button" class="light">RETRY ROUND</button>
                    <button id="november-next-round-button" class="light">${round >= NUM_ROUNDS ? 'Finish' : 'Next Round'}</button>
                </div>
            </div>
        `);

        document.getElementById('november-retry-button')!.addEventListener('click', () => {
            clickAudio.play();
            if (state.type !== 'play') return;

            const board = state.boardBeforeDrop!;
            const placedBlocks = state.placedBlocksBeforeDrop!;
            const piece = piecesHistory.at(-1)!;

            const newPiecesHistory = piecesHistory.slice(0, -1);

            startBuilding(board, newPiecesHistory, {piece, placedBlocks});
        });

        document.getElementById('november-next-round-button')!.addEventListener('click', () => {
            clickAudio.play();
            if (state.type !== 'play') return;

            state.scores.push(roundScore);

            if (round < NUM_ROUNDS) startBuilding(board, piecesHistory);
            else showResults();
        });
    }

    function findConnected(board: (Block | null)[][], startX: number, startY: number, colorIndex: number) {
        const connected = new Set<string>();
        const queue = [{x: startX, y: startY}];
        connected.add(`${startX},${startY}`);
        while (queue.length > 0) {
            const {x, y} = queue.shift()!;
            const neighbors = [
                [x, y - 1],
                [x, y + 1],
                [x - 1, y],
                [x + 1, y],
            ];
            for (const [neighborX, neighborY] of neighbors) {
                if (
                    neighborY < 0 ||
                    neighborY >= GRID_SIZE ||
                    neighborX < 0 ||
                    neighborX >= GRID_SIZE ||
                    connected.has(`${neighborX},${neighborY}`)
                ) {
                    continue;
                }

                const neighbor = board[neighborY][neighborX];
                if (neighbor && (neighbor.colorIndex === colorIndex || neighbor.colorIndex === -1)) {
                    connected.add(`${neighborX},${neighborY}`);
                    queue.push({x: neighborX, y: neighborY});
                }
            }
        }

        return connected;
    }

    function showResults() {
        if (state.type !== 'play') return;

        winAudio.play();

        state.state = {type: 'results'};
        const totalScore = getTotalScore();
        draw();

        const bestScoreKey = `bestScore-${getDateString(selectedDate)}`;
        const oldBest = storage.get(bestScoreKey) ?? 0;
        if (totalScore > oldBest) storage.set(bestScoreKey, totalScore);

        const scoreSegment = getScoreSegmentName(totalScore);

        setOverlay(`
            <div style="backdrop-filter: blur(5px); background: #000000aa; height: 100%; display: flex; flex-direction: column; gap: 15px; color: var(--ui-white); text-align: center">
                <div></div>
                <h2>GAME OVER</h2>
                ${state.scores.map((score, index) => `<h3>Round ${index + 1}: ${score.toLocaleString()}</h3>`).join('')}
                <h2><strong>Total: ${totalScore.toLocaleString()}</strong></h2>
                ${createScoreProgressBar(totalScore)}
                ${totalScore > oldBest ? '<h3>New best score!</h3>' : `<h3>Best for this day: ${oldBest.toLocaleString()}</h3>`}
                <div style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: center">
                    <button id="november-menu-button" class="light">MENU</button>
                    <button id="november-restart-button" class="light">RESTART</button>
                    <button id="november-share-button" class="light">SHARE</button>
                </div>
                <button id="november-download-board-image-button" class="light" style="margin: 0 auto">DOWNLOAD BOARD IMAGE</button>
            </div>
        `);

        document.getElementById('november-menu-button')!.addEventListener('click', () => {
            clickAudio.play();
            mainMenu();
        });

        document.getElementById('november-restart-button')!.addEventListener('click', () => {
            clickAudio.play();
            startGame();
        });

        const shareButton = document.getElementById('november-share-button')!;
        shareButton.addEventListener('click', () => {
            clickAudio.play();
            navigator.clipboard.writeText(
                `Make and Break ${getHumanReadableDateString(selectedDate)}\n\n` +
                    (state as State.Play).scores
                        .map((score, index) => `Round ${index + 1}: ${score.toLocaleString()}`)
                        .join('\n') +
                    `\n\nTotal Score: ${totalScore.toLocaleString()}${scoreSegment ? ` (${scoreSegment})` : ''}`,
            );
            shareButton.innerText = 'COPIED!';
            setTimeout(() => (shareButton.innerText = 'SHARE'), 1000);
        });

        const downloadButton = document.getElementById('november-download-board-image-button')!;
        downloadButton.addEventListener('click', () => {
            clickAudio.play();
            downloadButton.innerText = 'DOWNLOADING...';

            const offscreenCanvas = new OffscreenCanvas(IMAGE_SIZE, IMAGE_SIZE);
            const offscreenContext = offscreenCanvas.getContext('2d')!;

            if (state.type !== 'play') return;
            const {piecesHistory, board} = state;
            const pieceAreaWidth = IMAGE_SIZE / piecesHistory.length;

            offscreenContext.fillStyle = BACKGROUND_COLOR;
            offscreenContext.fillRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);

            piecesHistory.forEach((piece, index) => {
                const centerX = index * pieceAreaWidth + (BUILD_GRID_SIZE * BOARD_TILE_SIZE) / 2 + BOARD_TILE_SIZE / 2;
                const centerY = (BUILD_GRID_SIZE * BOARD_TILE_SIZE) / 2;

                piece.forEach(block => {
                    const blockX = centerX + block.x * BOARD_TILE_SIZE;
                    const blockY = centerY + block.y * BOARD_TILE_SIZE;
                    drawShape(offscreenContext, blockX, blockY, BOARD_TILE_SIZE, block.colorIndex);
                });
            });

            for (let y = 0; y < GRID_SIZE; ++y) {
                for (let x = 0; x < GRID_SIZE; ++x) {
                    const block = board[y][x];
                    if (block) {
                        drawShape(
                            offscreenContext,
                            x * BOARD_TILE_SIZE,
                            y * BOARD_TILE_SIZE,
                            BOARD_TILE_SIZE,
                            block.colorIndex,
                        );
                    }
                }
            }

            offscreenCanvas.convertToBlob({type: 'image/png'}).then(blob => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `make_and_break_${getDateString(selectedDate)}.png`;
                a.click();
                URL.revokeObjectURL(url);
                downloadButton.innerText = 'DOWNLOAD BOARD IMAGE';
            });
        });
    }

    function tryRotate(clockwise: boolean) {
        if (state.type !== 'play' || state.state.type !== 'dropping') return;

        const {board} = state;
        const {piece, position, rotation} = state.state;

        const newRotation = clockwise ? (((rotation + 1) % 4) as Rotation) : (((rotation - 1 + 4) % 4) as Rotation);

        for (const pivot of [...piece].sort(
            (a, b) => Math.abs(a.x) + Math.abs(a.y) - (Math.abs(b.x) + Math.abs(b.y)),
        )) {
            const rotatedPivotCurrent = getRotatedPiece([pivot], rotation)[0];
            const rotatedPivotNew = getRotatedPiece([pivot], newRotation)[0];

            const newPosition = {
                x: position.x + rotatedPivotCurrent.x - rotatedPivotNew.x,
                y: position.y + rotatedPivotCurrent.y - rotatedPivotNew.y,
            };

            if (!checkCollision(piece, newPosition, newRotation, board)) {
                state.state.position = newPosition;
                state.state.rotation = newRotation;
                draw();
                return;
            }
        }
    }

    function pruneDanglingBlocks(piece: PieceBlock[]) {
        if (piece.length <= 1) return piece;
        const connected = new Set<PieceBlock>();
        const queue: PieceBlock[] = piece.length > 0 ? [piece[0]] : [];
        const visited = new Set<PieceBlock>(queue);
        if (queue.length > 0) connected.add(queue[0]);

        while (queue.length > 0) {
            const current = queue.shift()!;
            for (const other of piece) {
                if (visited.has(other)) continue;
                const isAdjacent = Math.abs(current.x - other.x) + Math.abs(current.y - other.y) === 1;
                if (isAdjacent) {
                    visited.add(other);
                    connected.add(other);
                    queue.push(other);
                }
            }
        }
        return piece.filter(b => connected.has(b));
    }

    function adjustCoordinates(event: PointerEvent) {
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        return {x: x / canvasScale, y: y / canvasScale};
    }

    function onKeyDown(event: KeyboardEvent) {
        if (state.type !== 'play' || state.state.type !== 'dropping') return;

        event.preventDefault();

        if (event.key === 'ArrowLeft') {
            const nextPosition = {x: state.state.position.x - 1, y: state.state.position.y};
            if (!checkCollision(state.state.piece, nextPosition, state.state.rotation, state.board)) {
                state.state.position = nextPosition;
                draw();
            }
        } else if (event.key === 'ArrowRight') {
            const nextPosition = {x: state.state.position.x + 1, y: state.state.position.y};
            if (!checkCollision(state.state.piece, nextPosition, state.state.rotation, state.board)) {
                state.state.position = nextPosition;
                draw();
            }
        } else if (event.key === 'ArrowDown') {
            if (!state.state.isFastDropping) {
                state.state.isFastDropping = true;
                setDropInterval();
            }
        } else if (event.key === 'a') {
            tryRotate(true);
        } else if (event.key === 'd') {
            tryRotate(false);
        }
    }

    function onKeyUp(event: KeyboardEvent) {
        if (state.type !== 'play' || state.state.type !== 'dropping') return;
        if (event.key === 'ArrowDown') {
            if (state.state.isFastDropping) {
                state.state.isFastDropping = false;
                setDropInterval();
            }
        }
    }

    function onBlur() {
        if (done) return;
        audioContext.suspend();
    }

    function onFocus() {
        if (done) return;
        audioContext.resume();
    }

    function getBuildGridCell(x: number, y: number) {
        if (
            x >= BUILD_GRID_X &&
            x <= BUILD_GRID_X + BUILD_GRID_WIDTH &&
            y >= BUILD_GRID_Y &&
            y <= BUILD_GRID_Y + BUILD_GRID_WIDTH
        ) {
            const gridCellX = Math.floor((x - BUILD_GRID_X) / BUILD_TILE_SIZE) - Math.floor(BUILD_GRID_SIZE / 2);
            const gridCellY = Math.floor((y - BUILD_GRID_Y) / BUILD_TILE_SIZE) - Math.floor(BUILD_GRID_SIZE / 2);
            return {x: gridCellX, y: gridCellY};
        }
    }

    function onPointerDown(event: PointerEvent) {
        const {x, y} = adjustCoordinates(event);

        if (state.type === 'play' && state.state.type === 'dropping') {
            pointerDownState = {id: event.pointerId, startX: x, startY: y, currentX: x, currentY: y, isSwipe: false};
        } else if (state.type === 'play' && state.state.type === 'building') {
            for (let colorIndex = 0; colorIndex < COLORS.length; ++colorIndex) {
                const colorY = PALETTE_Y + colorIndex * (PALETTE_TILE_SIZE + 10);
                if (
                    x >= PALETTE_X &&
                    x <= PALETTE_X + PALETTE_TILE_SIZE &&
                    y >= colorY &&
                    y <= colorY + PALETTE_TILE_SIZE
                ) {
                    state.state.draggedBlock = {x, y, colorIndex};
                    draw();
                    return;
                }
            }

            const cell = getBuildGridCell(x, y);
            if (cell) {
                const {x: gridCellX, y: gridCellY} = cell;

                if (gridCellX === 0 && gridCellY === 0) return;

                const blockIndex = state.state.piece.findIndex(b => b.x === gridCellX && b.y === gridCellY);
                if (blockIndex !== -1) {
                    state.state.piece.splice(blockIndex, 1);
                    state.state.piece = pruneDanglingBlocks(state.state.piece);
                    draw();
                }
            }
        }
    }

    function onPointerMove(event: PointerEvent) {
        const {x, y} = adjustCoordinates(event);

        if (
            state.type === 'play' &&
            state.state.type === 'dropping' &&
            pointerDownState &&
            pointerDownState.id === event.pointerId
        ) {
            pointerDownState.currentX = x;
            pointerDownState.currentY = y;

            const deltaX = x - pointerDownState.startX;
            const deltaY = y - pointerDownState.startY;

            if (Math.abs(deltaX) > POINTER_SWIPE_THRESHOLD || Math.abs(deltaY) > POINTER_SWIPE_THRESHOLD) {
                pointerDownState.isSwipe = true;
            }

            if (pointerDownState.isSwipe) {
                const deltaY = pointerDownState.currentY - pointerDownState.startY;
                const deltaX = pointerDownState.currentX - pointerDownState.startX;
                if (
                    deltaY > SWIPE_DOWN_THRESHOLD &&
                    Math.abs(deltaY) > Math.abs(deltaX) &&
                    !state.state.isFastDropping
                ) {
                    state.state.isFastDropping = true;
                    setDropInterval();
                }
            }
        } else if (state.type === 'play' && state.state.type === 'building' && state.state.draggedBlock) {
            state.state.draggedBlock.x = x;
            state.state.draggedBlock.y = y;
            draw();
        }
    }

    function onPointerUp(event: PointerEvent) {
        if (
            state.type === 'play' &&
            state.state.type === 'dropping' &&
            pointerDownState &&
            pointerDownState.id === event.pointerId
        ) {
            if (state.state.isFastDropping) {
                state.state.isFastDropping = false;
                setDropInterval();
            }

            if (pointerDownState.isSwipe) {
                const deltaX = pointerDownState.currentX - pointerDownState.startX;
                const deltaY = pointerDownState.currentY - pointerDownState.startY;

                if (Math.abs(deltaX) > Math.abs(deltaY)) {
                    let {x, y} = state.state.position;
                    if (deltaX > 0) ++x;
                    else --x;
                    if (!checkCollision(state.state.piece, {x, y}, state.state.rotation, state.board)) {
                        state.state.position = {x, y};
                        draw();
                    }
                }
            } else {
                tryRotate(pointerDownState.startX < canvas.width / 2);
            }
            pointerDownState = null;
        } else if (state.type === 'play' && state.state.type === 'building' && state.state.draggedBlock) {
            const {x, y} = adjustCoordinates(event);

            const cell = getBuildGridCell(x, y);
            if (cell) {
                const {x: gridCellX, y: gridCellY} = cell;

                const existingBlock = state.state.piece.find(block => block.x === gridCellX && block.y === gridCellY);
                if (existingBlock) {
                    if (existingBlock.x !== 0 || existingBlock.y !== 0) {
                        existingBlock.colorIndex = state.state.draggedBlock.colorIndex;
                    }
                } else {
                    if (
                        state.state.piece.some(
                            block => Math.abs(block.x - gridCellX) + Math.abs(block.y - gridCellY) === 1,
                        )
                    ) {
                        state.state.piece.push({
                            x: gridCellX,
                            y: gridCellY,
                            colorIndex: state.state.draggedBlock.colorIndex,
                        });
                    }
                }
            }

            state.state.draggedBlock = undefined;
            draw();
        }
    }

    function resize() {
        const {width} = canvas.getBoundingClientRect();
        canvasScale = width / canvas.width;
    }

    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = 1;

    mainMenu();
    resize();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    window.addEventListener('resize', resize);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
        done = true;
        if (dropInterval) clearInterval(dropInterval);
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        document.removeEventListener('pointerdown', onPointerDown);
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('resize', resize);
        window.removeEventListener('blur', onBlur);
        window.removeEventListener('focus', onFocus);
        introSource?.source.stop();
        loopSource?.source.stop();
    };
}

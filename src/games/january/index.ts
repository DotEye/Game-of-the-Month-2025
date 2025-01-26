import {choice, distance, randomInt} from '../../util.ts';
import music from './music.mp3';
import logo from './logo.webp';
import click from '../../assets/click.wav';
import eat from '../../assets/eat.wav';
import lose from '../../assets/lose.wav';
import win from '../../assets/win.wav';
import {setupStorage} from '../../shared/storage.ts';
import {setupMusic, setupSoundEffect} from '../../audio.ts';
import {canvas, context, setOverlay} from '../../dom.ts';
import {UI_BLACK, UI_WHITE} from '../../shared/style.ts';

export function january() {
    const BACKDROP_COLOR = '#00000099';
    const BACKGROUND_COLOR = '#30324c';
    const DEATH_COLOR = '#aa1212';
    const FOOD_COLOR = '#00b2ff';
    const WORM_COLOR_HUE = 136;
    const SPEEDS = {slow: 500, normal: 350, fast: 200};
    const BOARD_SIZES = {
        tiny: {tiles: 5, tileSize: canvas.width / 5, tilePadding: 5},
        small: {tiles: 8, tileSize: canvas.width / 8, tilePadding: 3},
        normal: {tiles: 12, tileSize: canvas.width / 12, tilePadding: 2},
        large: {tiles: 15, tileSize: canvas.width / 15, tilePadding: 2},
    };
    const DIRECTIONS = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
    ];
    const PAUSE_KEYS = ['Escape', ' '];
    const KEYS = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
    const ALTERNATE_KEYS = ['w', 'd', 's', 'a'];
    const BACKWARDS_KEYS = ['ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight'];
    const WORM_STARTS: Record<keyof typeof BOARD_SIZES, [number, number][]> = {
        tiny: [
            [3, 1],
            [2, 1],
            [1, 1],
        ],
        small: [
            [3, 1],
            [2, 1],
            [1, 1],
        ],
        normal: [
            [4, 2],
            [3, 2],
            [2, 2],
        ],
        large: [
            [5, 3],
            [4, 3],
            [3, 3],
        ],
    };
    const FOOD_STARTS: Record<keyof typeof BOARD_SIZES, [number, number][]> = {
        tiny: [
            [1, 3],
            [3, 3],
        ],
        small: [
            [1, 6],
            [6, 1],
        ],
        normal: [
            [2, 9],
            [9, 2],
        ],
        large: [
            [3, 11],
            [11, 3],
        ],
    };
    const RESET_TIME = 1000;
    const SWIPE_RADIUS = 50;

    const storage = setupStorage('january');

    const musicAudio = setupMusic(music);
    const clickAudio = setupSoundEffect(click);
    const eatAudio = setupSoundEffect(eat);
    const loseAudio = setupSoundEffect(lose);
    const winAudio = setupSoundEffect(win);

    let playing = false;
    let direction = 1;
    let lastTick = 0;
    let boardSize: keyof typeof BOARD_SIZES = 'normal';
    let speed: 'strategy' | keyof typeof SPEEDS = 'normal';
    let worm = structuredClone(WORM_STARTS[boardSize]);
    let foods = structuredClone(FOOD_STARTS[boardSize]);
    let resetTimeout: number | undefined = undefined;
    let swipeOrigin: [number, number] | undefined = undefined;
    let paused = false;
    let drawn = true;

    // Becomes undefined after eating food, temporarily allowing movement in any direction.
    let lastDirection: number | undefined = direction;

    function getScoreWithTrophy(value: number | undefined, win: number) {
        return value === undefined ? '-' : `${value}${value === win ? '🏆' : ''}`;
    }

    function openMenu() {
        const highScore = storage.get(`${boardSize}-${speed}`);
        setOverlay(`
            <div class="center" style="display: flex; flex-direction: column; gap: 25px">
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 15px">
                    <img src="${logo}" alt="Wormhole" width="500">
                    <div style="text-align: center">
                        <h2>${
                            worm.length > 3
                                ? `
                                    <span style="display: flex; align-items: center; gap: 10px">
                                        <span><strong>Score</strong>: ${getScoreWithTrophy(worm.length, BOARD_SIZES[boardSize].tiles ** 2)}</span>
                                        <button id="january-share-button">Share</button>
                                    </span>
                                `
                                : ''
                        }</h2>
                        <h3 style="line-height: 2"><strong>High score</strong>: ${getScoreWithTrophy(highScore, BOARD_SIZES[boardSize].tiles ** 2)}</h3>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 5px; align-items: center">
                    <span>Board size</span>
                    <div style="display: flex">
                        ${Object.keys(BOARD_SIZES)
                            .map(
                                option =>
                                    `<button id="january-board-size-${option}"${option === boardSize ? `style="background: var(--ui-white); color: var(--ui-black)"` : ''}>${option}</button>`,
                            )
                            .join('')}
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 5px; align-items: center">
                    <span>Speed</span>
                    <div style="display: flex">
                        ${['strategy']
                            .concat(Object.keys(SPEEDS))
                            .map(
                                option =>
                                    `<button id="january-speed-${option}"${option === speed ? `style="background: var(--ui-white); color: var(--ui-black)"` : ''}>${option}</button>`,
                            )
                            .join('')}
                    </div>
                </div>
                <span>WASD/arrow keys/swipe to start</span>

                <button id="january-how-to-play-button">HOW TO PLAY</button>
            </div>
        `);

        const boardSizeButtons = Object.keys(BOARD_SIZES).map(
            option => document.getElementById(`january-board-size-${option}`) as HTMLButtonElement,
        );
        const speedButtons = ['strategy']
            .concat(Object.keys(SPEEDS))
            .map(option => document.getElementById(`january-speed-${option}`) as HTMLButtonElement);
        const howToPlayButton = document.getElementById('january-how-to-play-button') as HTMLButtonElement;

        boardSizeButtons.forEach(button =>
            button.addEventListener('click', () => {
                boardSize = button.id.split('-').at(-1) as keyof typeof BOARD_SIZES;
                boardSizeButtons.forEach(otherButton => {
                    otherButton.style.background = '';
                    otherButton.style.color = '';
                });
                button.style.background = UI_WHITE;
                button.style.color = UI_BLACK;
                resetGame();
            }),
        );

        speedButtons.forEach(button =>
            button.addEventListener('click', () => {
                speed = button.id.split('-').at(-1) as typeof speed;
                speedButtons.forEach(otherButton => {
                    otherButton.style.background = '';
                    otherButton.style.color = '';
                });
                button.style.background = UI_WHITE;
                button.style.color = UI_BLACK;
                resetGame();
            }),
        );

        howToPlayButton.addEventListener('click', () => {
            setOverlay(`
                <div class="center">
                    <div style="display: flex; flex-direction: column; gap: 25px; max-width: 80%">
                        <h1>HOW TO PLAY</h1>
                        <span>
                            Your goal is to eat as much food (blue circles) as possible.
                            However, eating one piece of food teleports the head of your worm to the other.
                            Avoid running into yourself or the edges of the screen.
                        </span>
                        <span>
                            <strong>Slow/medium/fast speed</strong>:
                            Use WASD/arrow keys/swipe to change your worm's direction.
                            It will constantly move in the direction its facing.
                        </span>
                        <span>
                            <strong>Strategy speed</strong>:
                            Use WASD/arrow keys/swipe to move your worm.
                            It will move only one tile in the desired direction per input.
                        </span>
                        <span>
                            <strong>Visual aids</strong>:
                            <ul>
                                <li>The back of your worm has a hole to indicate the tile will be clear after the next tick</li>
                                <li>The oldest gap in your worm is shown by a dotted line to indicate which segment will start to clear next</li>
                            </ul>
                        </span>
                        <button id="how-to-play-done-button">BACK</button>
                    </div>
                </div>
            `);

            const doneButton = document.getElementById('how-to-play-done-button') as HTMLButtonElement;
            doneButton.addEventListener('click', openMenu);
        });

        if (worm.length > 3) {
            (document.getElementById('january-share-button') as HTMLButtonElement).addEventListener('click', share);
        }
    }

    function share(event: MouseEvent) {
        const emojiBoard: string[][] = Array(BOARD_SIZES[boardSize].tiles + 2)
            .fill(null)
            .map((_, outerIndex, outerArray) =>
                Array(BOARD_SIZES[boardSize].tiles + 2)
                    .fill(null)
                    .map((_, innerIndex, innerArray) =>
                        innerIndex === 0 ||
                        innerIndex === innerArray.length - 1 ||
                        outerIndex === 0 ||
                        outerIndex === outerArray.length - 1
                            ? '⬜'
                            : '⬛',
                    ),
            );
        worm.forEach((piece, index) => {
            const death = index === 0 && (checkOutOfBounds(piece) || checkCollision(piece));

            // Don't override a death marker
            if (emojiBoard[piece[1] + 1][piece[0] + 1] === '❌') return;

            emojiBoard[piece[1] + 1][piece[0] + 1] = death ? '❌' : '🟩';
        });
        foods.forEach(food => {
            // Food positions are set to negative values when the game is won
            if (food[0] < 0 || food[1] < 0) return;

            emojiBoard[food[1] + 1][food[0] + 1] = '🔵';
        });
        const stringBoard = emojiBoard.map(row => row.join('')).join('\n');
        navigator.clipboard.writeText(
            `Wormhole\n\nBoard size: ${boardSize}\nSpeed: ${speed}\nScore: ${getScoreWithTrophy(worm.length, BOARD_SIZES[boardSize].tiles ** 2)}\n${stringBoard}`,
        );
        (event.target as HTMLButtonElement).innerText = 'Copied!';
        setTimeout(() => {
            (event.target as HTMLButtonElement).innerText = 'Share';
        }, 1000);
    }

    function setGameHudOverlay() {
        const highScore = storage.get(`${boardSize}-${speed}`);
        setOverlay(`
            <div style="text-align: center; margin-top: 5px; position: absolute; top: 0; width: 100%">
                <strong>Score</strong>: ${worm.length} | <strong>High score</strong>: ${getScoreWithTrophy(highScore, BOARD_SIZES[boardSize].tiles ** 2)}
            </div>
            ${paused ? '<h1 class="center">Paused</h1>' : ''}
        `);
    }

    function directionInput(key: string) {
        if (!playing) {
            if (resetTimeout !== undefined) return;
            resetGame();
            setGameHudOverlay();
            playing = true;
            loop();
            if (lastDirection === undefined || key !== BACKWARDS_KEYS[lastDirection]) direction = KEYS.indexOf(key);
            requestDraw();
            return;
        }

        if (lastDirection !== undefined && key === BACKWARDS_KEYS[lastDirection]) return;

        direction = KEYS.indexOf(key);
        if (speed === 'strategy') tick();
        requestDraw();
    }

    function onKeyDown(event: KeyboardEvent) {
        if (PAUSE_KEYS.includes(event.key)) {
            event.preventDefault();
            if (speed !== 'strategy' && playing) {
                if (paused) musicAudio.play();
                else musicAudio.pause();
                paused = !paused;
                setGameHudOverlay();
                requestDraw();
                return;
            }
        }

        const key = ALTERNATE_KEYS.includes(event.key) ? KEYS[ALTERNATE_KEYS.indexOf(event.key)] : event.key;
        if (!KEYS.includes(key)) return;
        if (paused) {
            paused = false;
            musicAudio.play();
        }
        event.preventDefault();

        directionInput(key);
    }

    function onTouchStart(event: TouchEvent) {
        swipeOrigin = [event.touches[0].clientX, event.touches[0].clientY];
    }

    function onTouchEnd() {
        swipeOrigin = undefined;
    }

    function onTouchMove(event: TouchEvent) {
        if (swipeOrigin === undefined) return;
        const {clientY, clientX} = event.touches[0];
        if (distance(clientX, clientY, swipeOrigin[0], swipeOrigin[1]) > SWIPE_RADIUS) {
            const dx = clientX - swipeOrigin[0];
            const dy = clientY - swipeOrigin[1];
            if (Math.abs(dx) > Math.abs(dy)) directionInput(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
            else directionInput(dy > 0 ? 'ArrowDown' : 'ArrowUp');
            swipeOrigin = undefined;
        }
    }

    function checkOutOfBounds(piece: [number, number]) {
        return (
            piece[0] < 0 ||
            piece[0] >= BOARD_SIZES[boardSize].tiles ||
            piece[1] < 0 ||
            piece[1] >= BOARD_SIZES[boardSize].tiles
        );
    }

    function checkCollision(piece: [number, number]) {
        return worm.slice(1).some(other => other[0] === piece[0] && other[1] === piece[1]);
    }

    function resetGame() {
        clickAudio.play();
        if (resetTimeout !== undefined) {
            clearTimeout(resetTimeout);
            resetTimeout = undefined;
        }
        worm = structuredClone(WORM_STARTS[boardSize]);
        foods = structuredClone(FOOD_STARTS[boardSize]);
        direction = 1;
        lastDirection = direction;
        lastTick = Date.now();
        requestDraw();
        openMenu();
    }

    function getPieceCenter(piece: [number, number]) {
        const {tileSize} = BOARD_SIZES[boardSize];
        return {
            x: piece[0] * tileSize + tileSize / 2,
            y: piece[1] * tileSize + tileSize / 2,
        };
    }

    function draw() {
        drawn = true;

        const {tileSize, tilePadding} = BOARD_SIZES[boardSize];

        context.fillStyle = BACKGROUND_COLOR;
        context.fillRect(0, 0, canvas.width, canvas.height);

        let previous = {piece: worm[0], color: 'green'};
        for (const [index, piece] of worm.entries()) {
            const ratio = (worm.length - index) / worm.length;
            const color = `hsl(${WORM_COLOR_HUE}, ${ratio * 80 + 20}%, 35%)`;

            if (distance(previous.piece[0], previous.piece[1], piece[0], piece[1]) <= 1) {
                const {x: x1, y: y1} = getPieceCenter(previous.piece);
                const {x: x2, y: y2} = getPieceCenter(piece);
                const gradient = context.createLinearGradient(x1, y1, x2, y2);
                gradient.addColorStop(0, previous.color);
                gradient.addColorStop(1, color);
                context.lineWidth = tilePadding;
                context.strokeStyle = gradient;
                context.setLineDash([]);
                context.beginPath();
                context.moveTo(x1, y1);
                context.lineTo(x2, y2);
                context.stroke();
            }

            previous = {piece, color};
        }

        previous = {piece: worm.at(-1)!, color: 'green'};
        for (const [index, piece] of [...worm.entries()].reverse()) {
            const ratio = (worm.length - index) / worm.length;
            const color = `hsl(${WORM_COLOR_HUE}, ${ratio * 80 + 20}%, 35%)`;

            if (distance(previous.piece[0], previous.piece[1], piece[0], piece[1]) > 1) {
                const {x: x1, y: y1} = getPieceCenter(previous.piece);
                const {x: x2, y: y2} = getPieceCenter(piece);
                const gradient = context.createLinearGradient(x1, y1, x2, y2);
                gradient.addColorStop(0, previous.color);
                gradient.addColorStop(1, color);
                context.strokeStyle = gradient;
                context.lineCap = 'round';
                context.lineWidth = tilePadding;
                context.setLineDash([5, 10]);
                context.beginPath();
                context.moveTo(x1, y1);
                context.lineTo(x2, y2);
                context.stroke();
                break;
            }

            previous = {piece, color};
        }

        for (const [index, piece] of worm.entries()) {
            const ratio = (worm.length - index) / worm.length;
            const padding = tilePadding + tilePadding * (2 - ratio * 2);
            context.fillStyle = `hsl(${WORM_COLOR_HUE}, ${ratio * 80 + 20}%, 35%)`;
            context.fillRect(
                piece[0] * tileSize + padding,
                piece[1] * tileSize + padding,
                tileSize - padding * 2,
                tileSize - padding * 2,
            );
            if (index === worm.length - 1) {
                context.fillStyle = BACKGROUND_COLOR;
                context.fillRect(
                    piece[0] * tileSize + tilePadding * 8,
                    piece[1] * tileSize + tilePadding * 8,
                    tileSize - tilePadding * 16,
                    tileSize - tilePadding * 16,
                );
            }
        }

        for (const food of foods) {
            context.fillStyle = FOOD_COLOR;
            context.beginPath();
            context.arc(
                food[0] * tileSize + tileSize / 2,
                food[1] * tileSize + tileSize / 2,
                tileSize / 2 - tilePadding * 2,
                0,
                2 * Math.PI,
            );
            context.fill();
        }

        // Draw a rectangle on the worm's head in the direction its facing
        context.fillStyle = `hsl(${WORM_COLOR_HUE}, 100%, 80%)`;
        context.fillRect(
            worm[0][0] * tileSize + (direction === 1 ? tileSize - tilePadding * 3 : tilePadding),
            worm[0][1] * tileSize + (direction === 2 ? tileSize - tilePadding * 3 : tilePadding),
            direction % 2 === 0 ? tileSize - tilePadding * 2 : tilePadding * 2,
            direction % 2 === 1 ? tileSize - tilePadding * 2 : tilePadding * 2,
        );

        if (checkOutOfBounds(worm[0]) || checkCollision(worm[0])) {
            context.fillStyle = DEATH_COLOR;
            context.fillRect(
                worm[0][0] * tileSize - tilePadding * 4,
                worm[0][1] * tileSize - tilePadding * 4,
                tileSize + tilePadding * 8,
                tileSize + tilePadding * 8,
            );
        }

        if ((!playing || paused) && resetTimeout === undefined) {
            context.fillStyle = BACKDROP_COLOR;
            context.fillRect(0, 0, canvas.width, canvas.height);
        }
    }

    function updateFoods() {
        const remainingTiles: [number, number][] = [];
        for (let x = 0; x < BOARD_SIZES[boardSize].tiles; ++x) {
            for (let y = 0; y < BOARD_SIZES[boardSize].tiles; ++y) {
                if (worm.some(piece => piece[0] === x && piece[1] === y)) continue;
                remainingTiles.push([x, y]);
            }
        }

        if (remainingTiles.length < 2) {
            // Hide food
            foods[0] = [-2, -2];
            foods[1] = [-2, -2];
            worm.unshift(remainingTiles[0]);
            gameOver(true);
            return;
        }

        const tileIndex = randomInt(0, remainingTiles.length - 1);
        const tile1 = remainingTiles.splice(tileIndex, 1)[0];
        const tile2 = choice(remainingTiles);
        foods[0] = tile1;
        foods[1] = tile2;
    }

    function checkGameOver() {
        const head = worm[0];
        if (checkOutOfBounds(head) || checkCollision(head)) gameOver();
    }

    function gameOver(win = false) {
        const audio = win ? winAudio : loseAudio;
        audio.currentTime = 0;
        audio.play();
        playing = false;
        const highScore = storage.get(`${boardSize}-${speed}`);
        if (highScore === undefined || worm.length > highScore) storage.set(`${boardSize}-${speed}`, worm.length);
        requestDraw();
        setGameHudOverlay();
        musicAudio.pause();
        resetTimeout = setTimeout(() => {
            resetTimeout = undefined;
            requestDraw();
            openMenu();
            musicAudio.play();
        }, RESET_TIME);
    }

    function eatFood() {
        eatAudio.currentTime = 0;
        eatAudio.play();
        lastDirection = undefined;
        updateFoods();
    }

    function tick() {
        lastDirection = direction;

        const nextX = worm[0][0] + DIRECTIONS[direction][0];
        const nextY = worm[0][1] + DIRECTIONS[direction][1];

        if (foods[0][0] === nextX && foods[0][1] === nextY) {
            worm.unshift([foods[0][0], foods[0][1]]);
            worm.unshift([foods[1][0], foods[1][1]]);
            eatFood();
        } else if (foods[1][0] === nextX && foods[1][1] === nextY) {
            worm.unshift([foods[1][0], foods[1][1]]);
            worm.unshift([foods[0][0], foods[0][1]]);
            eatFood();
        } else {
            worm.unshift([nextX, nextY]);
        }

        // Don't continue if the player has won
        if (!playing) return;

        worm.pop();
        checkGameOver();
        requestDraw();
        setGameHudOverlay();
    }

    function loop() {
        if (!playing) return;

        if (speed !== 'strategy' && Date.now() - lastTick > SPEEDS[speed] && !paused) {
            lastTick = Date.now();
            tick();
        }

        setTimeout(loop, 10);
    }

    function requestDraw() {
        if (!drawn) return;
        drawn = false;
        requestAnimationFrame(draw);
    }

    requestDraw();
    openMenu();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('touchstart', onTouchStart);
    document.addEventListener('touchmove', onTouchMove);
    document.addEventListener('touchend', onTouchEnd);
    musicAudio.play();
    return () => {
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('touchstart', onTouchStart);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        musicAudio.pause();
        playing = false;
        if (resetTimeout !== undefined) clearTimeout(resetTimeout);
    };
}

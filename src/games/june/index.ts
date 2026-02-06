import click from '../../assets/click.ogg';
import explode from '../../assets/explode.ogg';
import hiss from '../../assets/hiss.ogg';
import hit from '../../assets/mine.ogg';
import logo from './logo.webp';
import lose from '../../assets/lose.ogg';
import intro from './music/intro.ogg';
import loop from './music/loop.ogg';
import menu from './music/menu.ogg';
import {FONT, UI_BLACK, UI_WHITE} from '../../shared/style.ts';
import {canvas, context, setOverlay} from '../../dom.ts';
import {choice, distance, setupBufferSource} from '../../util.ts';
import {create} from 'random-seed';
import {audioContext, downloadAndDecode, setupSoundEffect} from '../../audio.ts';
import {setupStorage} from '../../shared/storage.ts';

namespace State {
    export interface Menu {
        type: 'menu';
        randomSeedChecked: boolean;
    }

    export interface Play {
        type: 'play';
        seed: string;
        setSeed: boolean;
        position: {x: number; y: number};
        snail: {x: number; y: number};
        health: number;
        tilesMined: number;
        clear: Set<string>;
        cascading: Set<string>;
        flags: Set<string>;
        trail: Set<string>;
        hints: Map<string, number>;
        intervalIds: Set<number>;
        timeoutIds: Set<number>;
        startTime: number;
        readyTime: boolean;
    }

    export interface GameOver {
        type: 'gameOver';
    }

    export type Any = Menu | Play | GameOver;
}

export function june() {
    const HINT_COLORS = ['#1515e8', '#3f7d1b', '#bd2f25', '#341da0', '#6d110b', '#267676', '#323131', '#5f743b'];

    const BACKGROUND_COLOR = '#404040';
    const CLEAR_COLOR = '#828282';
    const DETONATION_COLOR = '#ff6200';
    const FLAG_COLOR = '#ff0000';
    const HEALTH_BAR_BACKGROUND = '#ff0000';
    const HEALTH_BAR_FOREGROUND = '#00ff00';
    const PLAYER_BACKGROUND_COLOR = '#ffb91a';
    const SNAIL_WARNING_TEXT_COLOR = '#ffffff88';
    const TRAIL_COLOR = '#319831';

    const KEYS = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
    const ALTERNATE_KEYS = ['w', 'd', 's', 'a'];
    const MOVE_DIRECTIONS = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
    ];
    const DIRECTIONS = [
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
    ];
    const DIFFICULTIES = {
        beginner: {
            base: 0.05,
            increment: 0.015,
            regen: 0.025,
            tickRate: 2000,
        },
        intermediate: {
            base: 0.055,
            increment: 0.02,
            regen: 0.02,
            tickRate: 1500,
        },
        advanced: {
            base: 0.06,
            increment: 0.025,
            regen: 0.01,
            tickRate: 1000,
        },
        expert: {
            base: 0.065,
            increment: 0.03,
            regen: 0,
            tickRate: 500,
        },
    };

    const BOARD_ZOOM = 50;
    const CASCADE_INTERVAL = 25;
    const CASCADE_ITERATIONS = 10;
    const HEAD_START = 30000;
    const IMAGE_LOGO_PADDING = 16;
    const IMAGE_LOGO_SIZE = 128;
    const IMAGE_PADDING = 20;
    const IMAGE_SIZE = 1080;
    const MUSIC_FADE_DURATION = 1;
    const MUSIC_INTRO_DURATION = 1.125;
    const MUSIC_INTRO_EXTRA = 0.281;
    const STARTING_AREA_SIZE = 2;
    const SWIPE_RADIUS = 50;
    const WARNING_TEXT_DURATION = 2000;

    const viewRange = Math.floor(canvas.width / BOARD_ZOOM / 2) + 1;

    const clickAudio = setupSoundEffect(click);
    const hissAudio = setupSoundEffect(hiss);
    const explodeAudio = setupSoundEffect(explode);
    const mineAudio = setupSoundEffect(hit);
    const loseAudio = setupSoundEffect(lose);

    const storage = setupStorage('june');

    let state: State.Any = {type: 'menu', randomSeedChecked: true};
    let difficulty: keyof typeof DIFFICULTIES = 'intermediate';
    let swipeData: {x: number; y: number; secondFinger: boolean} | undefined = undefined;
    let menuBuffer: AudioBuffer | undefined;
    let menuSource: ReturnType<typeof setupBufferSource> | undefined;
    let introBuffer: AudioBuffer | undefined;
    let introSource: ReturnType<typeof setupBufferSource> | undefined;
    let loopBuffer: AudioBuffer | undefined;
    let loopSource: ReturnType<typeof setupBufferSource> | undefined;
    let done = false;

    downloadAndDecode(menu).then(buffer => {
        menuBuffer = buffer;
        if (!done && state.type === 'menu') {
            menuSource = setupBufferSource(menuBuffer);
            menuSource.gain.gain.setValueAtTime(1, audioContext.currentTime);
        }
    });
    downloadAndDecode(intro).then(buffer => (introBuffer = buffer));
    downloadAndDecode(loop).then(buffer => (loopBuffer = buffer));

    function startMusicMenu() {
        introSource?.source.stop();
        introSource = undefined;
        loopSource?.source.stop();
        loopSource = undefined;

        menuSource = setupBufferSource(menuBuffer!);
        menuSource.gain.gain.setValueAtTime(1, audioContext.currentTime);
    }

    function startMusicIntro() {
        introSource?.source.stop();
        if (menuSource !== undefined) {
            menuSource.gain.gain.setValueAtTime(1, audioContext.currentTime);
            menuSource.gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + MUSIC_FADE_DURATION);
            const source = menuSource.source;
            setTimeout(() => source.stop(), MUSIC_FADE_DURATION * 1000);
            menuSource = undefined;
        }

        introSource = setupBufferSource(introBuffer!);
        introSource.source.loop = false;
        introSource.gain.gain.setValueAtTime(1, audioContext.currentTime);
    }

    function startMusicLoop() {
        loopSource = setupBufferSource(
            loopBuffer!,
            audioContext.currentTime + HEAD_START / 1000 + MUSIC_INTRO_DURATION + MUSIC_INTRO_EXTRA,
        );
        loopSource.gain.gain.setValueAtTime(1, audioContext.currentTime);
    }

    function isMine(x: number, y: number, seed = (state as State.Play).seed) {
        if (x >= -STARTING_AREA_SIZE && x <= STARTING_AREA_SIZE && y >= -STARTING_AREA_SIZE && y <= STARTING_AREA_SIZE)
            return false;

        const generator = create(`${seed},${x},${y}`);

        const distance = x ** 2 + y ** 2;
        return (
            generator.random() < 1 - 1 / distance ** DIFFICULTIES[difficulty].increment + DIFFICULTIES[difficulty].base
        );
    }

    function mainMenu(startMusic = true) {
        context.fillStyle = BACKGROUND_COLOR;
        context.fillRect(0, 0, canvas.width, canvas.height);

        if (startMusic) startMusicMenu();

        const highScore = storage.get(`highScore-${difficulty}`) ?? '-';

        setOverlay(`
            <div class="center" style="display: flex; flex-direction: column; align-items: center; gap: 25px">
                <img src="${logo}" alt="Snailsweeper" width="300" />
                <div style="display: flex; flex-direction: column; gap: 5px; align-items: center">
                    <span>Difficulty</span>
                    <div style="display: flex">
                        ${Object.keys(DIFFICULTIES)
                            .map(
                                option =>
                                    `<button id="june-difficulty-${option}"${option === difficulty ? `style="background: var(--ui-white); color: var(--ui-black)"` : ''} class="light">${option}</button>`,
                            )
                            .join('')}
                    </div>
                </div>
                <span><strong>High score</strong>: <span id="june-high-score-span">${highScore}</span></span>
                <div style="display: flex; flex-direction: column; gap: 5px; align-items: center">
                    <label>
                        <input id="june-random-seed-checkbox" type="checkbox" ${(state as State.Menu).randomSeedChecked ? 'checked' : ''} />
                        Random seed
                    </label>
                    ${(state as State.Menu).randomSeedChecked ? '' : '<input id="june-seed-input" type="text" placeholder="Seed">'}
                </div>
                <div style="display: flex; gap: 10px">
                    <button id="june-how-to-play-button">HOW TO PLAY</button>
                    <button id="june-start-game-button" style="background: var(--ui-white); color: var(--ui-black)">START GAME</button>
                </div>
            </div>
        `);

        const difficultyButtons = Object.keys(DIFFICULTIES).map(
            option => document.getElementById(`june-difficulty-${option}`) as HTMLButtonElement,
        );

        difficultyButtons.forEach(button =>
            button.addEventListener('click', () => {
                clickAudio.play();
                difficulty = button.id.split('-').at(-1) as keyof typeof DIFFICULTIES;
                document.getElementById('june-high-score-span')!.textContent =
                    storage.get(`highScore-${difficulty}`) ?? '-';
                difficultyButtons.forEach(otherButton => {
                    otherButton.style.background = '';
                    otherButton.style.color = '';
                });
                button.style.background = UI_WHITE;
                button.style.color = UI_BLACK;
            }),
        );

        const randomSeedCheckbox = document.getElementById('june-random-seed-checkbox') as HTMLInputElement;
        randomSeedCheckbox.addEventListener('change', () => {
            clickAudio.play();
            (state as State.Menu).randomSeedChecked = randomSeedCheckbox.checked;
            mainMenu(false);
        });

        document
            .getElementById('june-start-game-button')!
            .addEventListener('click', () =>
                startGame(
                    !randomSeedCheckbox.checked
                        ? (document.getElementById('june-seed-input') as HTMLInputElement).value
                        : undefined,
                ),
            );

        document.getElementById('june-how-to-play-button')!.addEventListener('click', () => {
            clickAudio.play();

            setOverlay(`
                <div class="center" style="display: flex; flex-direction: column; align-items: center; gap: 25px">
                    <h3>HOW TO PLAY SNAILSWEEPER</h3>
                    <ul style="text-align: left; padding: 0 25px">
                        <li>🕹️ Use WASD OR arrow keys OR swipe (mobile) to move</li>
                        <li>⛏️ Move into walls to mine them</li>
                        <li>💣 Avoid mines! Numbers on tiles indicate how many mines neighbor them. Mines deal a large amount of damage when detonated</li>
                        <li>🚩 Use shift+WASD OR shift+arrow keys OR two finger swipe (mobile) to flag mine locations</li>
                        <li>🐌 Avoid the deadly snail that chases you</li>
                        <li>🟩 Avoid the snail's trail, as it damages you every time you move over it</li>
                    </ul>
                    <button id="june-back-button">BACK</button>
                </div>
            `);

            document.getElementById('june-back-button')!.addEventListener('click', () => {
                clickAudio.play();
                mainMenu(false);
            });
        });
    }

    function updateHints(x: number, y: number) {
        if (state.type !== 'play') return;

        let count = 0;
        for (const [dx, dy] of DIRECTIONS) {
            if (isMine(x + dx, y + dy) && !state.clear.has(`${x + dx},${y + dy}`)) ++count;
        }
        state.hints.set(`${x},${y}`, count);
    }

    function processCascades() {
        if (state.type !== 'play') return;

        for (const key of [...state.cascading].slice(0, CASCADE_ITERATIONS)) {
            state.cascading.delete(key);
            state.clear.add(key);
            state.flags.delete(key);
            const [x, y] = key.split(',').map(Number);
            updateHints(x, y);
            if ((state.hints.get(key) ?? 0) > 0) continue;

            for (const [dx, dy] of DIRECTIONS) {
                const nextX = x + dx;
                const nextY = y + dy;
                const nextKey = `${nextX},${nextY}`;
                if (state.clear.has(nextKey) || isMine(nextX, nextY)) continue;
                state.cascading.add(nextKey);
            }
        }

        draw();
    }

    function gameOver(reason: string) {
        if (state.type !== 'play') return;

        introSource?.source.stop();
        loopSource?.source.stop();

        const {clear, trail, flags, tilesMined, position, snail, seed, setSeed} = state;

        draw(true);

        state.intervalIds.forEach(clearInterval);
        state.timeoutIds.forEach(clearTimeout);

        loseAudio.play();

        const minesDetonated = [...clear].reduce((total, tile) => {
            const [x, y] = tile.split(',').map(Number);
            return total + (isMine(x, y) ? 1 : 0);
        }, 0);

        const correctFlags = [...flags].reduce((total, tile) => {
            const [x, y] = tile.split(',').map(Number);
            return total + (isMine(x, y) ? 1 : 0);
        }, 0);

        const incorrectFlags = flags.size - correctFlags;

        const score = tilesMined - minesDetonated * 5 + correctFlags - incorrectFlags;

        const highScoreBeaten = score > (storage.get(`highScore-${difficulty}`) ?? 0);
        if (highScoreBeaten) storage.set(`highScore-${difficulty}`, score);

        const tilesMinedString = `${tilesMined} (+${tilesMined})`;
        const minesDetonatedString = `${minesDetonated} (-${minesDetonated * 5})`;
        const correctFlagsString = `${correctFlags} (+${correctFlags})`;
        const incorrectFlagsString = `${incorrectFlags} (-${incorrectFlags})`;

        setOverlay(`
            <div class="center" style="display: flex; flex-direction: column; align-items: center; gap: 25px; background-color: #000000BB; user-select: text">
                <h1>GAME OVER</h1>
                <h3>${reason}</h3>
                <div style="display: flex; flex-direction: column; gap: 5px">
                    <span><strong>Difficulty</strong>: ${difficulty}</span>
                    <span><strong>Tiles mined</strong>: ${tilesMinedString}</span>
                    <span><strong>Mines detonated</strong>: ${minesDetonatedString}</span>
                    <span><strong>Correct flags</strong>: ${correctFlagsString}</span>
                    <span><strong>Incorrect flags</strong>: ${incorrectFlagsString}</span>
                    <span><strong>Seed</strong>: ${seed}</span>
                </div>
                <h3><strong>Score</strong>: ${score}</h3>
                <span><strong>High score</strong>: ${storage.get(`highScore-${difficulty}`) ?? 0}${highScoreBeaten ? ' (NEW!)' : ''}</span>
                <div style="display: flex; gap: 5px">
                    <button id="june-menu-button">MENU</button>
                    <button id="june-share-button">SHARE</button>
                    <button id="june-play-again-button">PLAY AGAIN</button>
                </div>
                <button id="june-download-board-image-button">DOWNLOAD BOARD IMAGE</button>
            </div>
        `);

        state = {type: 'gameOver'};

        document.getElementById('june-menu-button')!.addEventListener('click', () => {
            clickAudio.play();
            state = {type: 'menu', randomSeedChecked: true};
            mainMenu(true);
        });

        const shareButton = document.getElementById('june-share-button')!;
        shareButton.addEventListener('click', () => {
            clickAudio.play();
            navigator.clipboard.writeText(
                `🐌 Snailsweeper (${difficulty})\n\n` +
                    `⛏️ Tiles mined: ${tilesMinedString}\n` +
                    `💥 Mines detonated: ${minesDetonatedString}\n` +
                    `🚩 Correct flags: ${correctFlagsString}\n` +
                    `❌ Incorrect flags: ${incorrectFlagsString}\n\n` +
                    `💯 Score: ${score}`,
            );
            shareButton.innerText = 'COPIED!';
            setTimeout(() => (shareButton.innerText = 'SHARE'), 1000);
        });

        document
            .getElementById('june-play-again-button')!
            .addEventListener('click', () => startGame(setSeed ? seed : undefined));

        const downloadBoardImageButton = document.getElementById('june-download-board-image-button')!;
        downloadBoardImageButton.addEventListener('click', () => {
            clickAudio.play();
            downloadBoardImageButton.innerText = 'DOWNLOADING...';

            const image = new Image();
            image.src = logo;
            image.onload = () => {
                const xNumbers = [...clear].map(entry => Number(entry.split(',')[0]));
                const yNumbers = [...clear].map(entry => Number(entry.split(',')[1]));

                const leftX = Math.min(...xNumbers);
                const rightX = Math.max(...xNumbers);
                const topY = Math.min(...yNumbers);
                const bottomY = Math.max(...yNumbers);

                const horizontalTiles = rightX - leftX;
                const verticalTiles = bottomY - topY;

                const offscreenCanvas = new OffscreenCanvas(IMAGE_SIZE, IMAGE_SIZE);
                const offscreenContext = offscreenCanvas.getContext('2d')!;
                offscreenContext.fillStyle = BACKGROUND_COLOR;
                offscreenContext.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

                const tileSize = Math.min(
                    (offscreenCanvas.width - IMAGE_PADDING * 2) / horizontalTiles,
                    (offscreenCanvas.height - IMAGE_PADDING * 2) / verticalTiles,
                );

                const offsetX = (offscreenCanvas.width - tileSize * horizontalTiles) / 2;
                const offsetY = (offscreenCanvas.height - tileSize * verticalTiles) / 2;

                const fontSize = tileSize * 0.8;
                const fontScale = Math.max(1, 1 / fontSize);

                offscreenContext.font = `${fontSize * fontScale}px ${FONT}`;
                offscreenContext.textAlign = 'center';
                offscreenContext.textBaseline = 'middle';

                offscreenContext.save();
                offscreenContext.scale(1 / fontScale, 1 / fontScale);

                const size = Math.max(horizontalTiles, verticalTiles);
                const dx = Math.floor((size - horizontalTiles) / 2);
                const dy = Math.floor((size - verticalTiles) / 2);

                for (let x = leftX - dx; x < rightX + dx; x++) {
                    for (let y = topY - dy; y < bottomY + dy; y++) {
                        const key = `${x},${y}`;

                        if (!clear.has(key)) {
                            if (isMine(x, y, seed)) {
                                offscreenContext.fillText(
                                    '💣',
                                    ((x - leftX) * tileSize + offsetX + tileSize / 2) * fontScale,
                                    ((y - topY) * tileSize + offsetY + tileSize / 2) * fontScale,
                                );
                            }
                            continue;
                        }

                        offscreenContext.fillStyle = isMine(x, y, seed)
                            ? DETONATION_COLOR
                            : trail.has(key)
                              ? TRAIL_COLOR
                              : CLEAR_COLOR;

                        offscreenContext.fillRect(
                            (x - leftX) * tileSize + offsetX,
                            (y - topY) * tileSize + offsetY,
                            tileSize - 2,
                            tileSize - 2,
                        );
                    }
                }

                offscreenContext.fillText(
                    '🐌',
                    ((snail.x - leftX) * tileSize + offsetX + tileSize / 2) * fontScale,
                    ((snail.y - topY) * tileSize + offsetY + tileSize / 2) * fontScale,
                );
                offscreenContext.fillText(
                    '⛏️',
                    ((position.x - leftX) * tileSize + offsetX + tileSize / 2) * fontScale,
                    ((position.y - topY) * tileSize + offsetY + tileSize / 2) * fontScale,
                );

                offscreenContext.restore();

                offscreenContext.drawImage(
                    image,
                    offscreenCanvas.width - (IMAGE_LOGO_SIZE + IMAGE_LOGO_PADDING),
                    offscreenCanvas.height - (IMAGE_LOGO_SIZE + IMAGE_LOGO_PADDING),
                    IMAGE_LOGO_SIZE,
                    IMAGE_LOGO_SIZE,
                );

                offscreenCanvas.convertToBlob({type: 'image/png'}).then(blob => {
                    const url = URL.createObjectURL(blob);

                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `snailsweeper_${difficulty}_${new Date().toLocaleDateString()}.png`;
                    a.click();

                    URL.revokeObjectURL(url);
                    downloadBoardImageButton.innerText = 'DOWNLOAD BOARD IMAGE';
                });
            };
        });
    }

    function setPlayingOverlay() {
        if (state.type !== 'play') return;

        const elapsedTime = Date.now() - state.startTime;
        const warningText = elapsedTime > HEAD_START && elapsedTime < HEAD_START + WARNING_TEXT_DURATION;

        setOverlay(`
            <div style="display: flex; align-items: center; gap: 10px; margin: 5px 0 0 5px">
                <button id="june-menu-button">MENU</button>
                <strong>${state.tilesMined} ⛏️</strong>
            </div>
            ${warningText ? `<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 48px; font-weight: bold; text-align: center">SNAIL<br /><br />AWAKE!</div>` : ''}
        `);

        document.getElementById('june-menu-button')!.addEventListener('click', () => {
            clickAudio.play();
            (state as State.Play).intervalIds.forEach(clearInterval);
            (state as State.Play).timeoutIds.forEach(clearTimeout);
            state = {type: 'menu', randomSeedChecked: true};
            mainMenu(true);
        });
    }

    function* generateDirections() {
        const directions = new Set([0, 1, 2, 3]);
        while (directions.size > 0) {
            const direction = choice([...directions]);
            directions.delete(direction);
            yield direction;
        }
    }

    function getNextSnailMove() {
        if (state.type !== 'play') return 0;

        const visited = new Map<string, number | null>();
        const {position, clear, snail} = state;

        const queue: {x: number; y: number; direction: number | null}[] = [
            {x: position.x, y: position.y, direction: null},
        ];

        const directions = [...generateDirections()];

        while (queue.length > 0) {
            const {x, y, direction} = queue.shift()!;

            if (x === snail.x && y === snail.y) return direction;

            for (const nextDirection of directions) {
                const [dx, dy] = MOVE_DIRECTIONS[nextDirection];
                const nextX = x + dx;
                const nextY = y + dy;
                const key = `${nextX},${nextY}`;
                if (clear.has(key) && !visited.has(key)) {
                    const newDirection = (nextDirection + 2) % MOVE_DIRECTIONS.length;
                    visited.set(key, newDirection);
                    queue.push({x: nextX, y: nextY, direction: newDirection});
                }
            }
        }

        return null;
    }

    function takeDamage(amount: number, reason: string) {
        if (state.type !== 'play') return;

        state.health -= amount;
        setPlayingOverlay();

        if (state.health <= 0) gameOver(reason);
    }

    function startGame(seed?: string) {
        clickAudio.play();

        startMusicIntro();
        startMusicLoop();

        context.fillStyle = BACKGROUND_COLOR;
        context.fillRect(0, 0, canvas.width, canvas.height);

        state = {
            type: 'play',
            seed: seed || Math.random().toString().slice(2),
            setSeed: Boolean(seed),
            position: {x: 0, y: 0},
            health: 1,
            clear: new Set(),
            cascading: new Set(),
            flags: new Set(),
            hints: new Map<string, number>(),
            tilesMined: 0,
            snail: {x: 0, y: -1},
            trail: new Set(['0,-1']),
            intervalIds: new Set([setInterval(processCascades, CASCADE_INTERVAL)]),
            timeoutIds: new Set([
                setTimeout(() => {
                    (state as State.Play).readyTime = false;
                    (state as State.Play).startTime = Date.now();
                    (state as State.Play).intervalIds.add(
                        setInterval(() => {
                            if (state.type !== 'play') return;

                            processCascades();

                            if (state.health < 1) {
                                state.health = Math.min(state.health + DIFFICULTIES[difficulty].regen, 1);
                            }

                            if (Date.now() - state.startTime < HEAD_START) {
                                draw();
                                return;
                            }

                            const nextMove = getNextSnailMove();

                            if (nextMove !== null) {
                                state.snail.x += MOVE_DIRECTIONS[nextMove][0];
                                state.snail.y += MOVE_DIRECTIONS[nextMove][1];
                            }

                            state.trail.add(`${state.snail.x},${state.snail.y}`);

                            if (state.position.x === state.snail.x && state.position.y === state.snail.y) {
                                gameOver('The snail touched you!');
                                return;
                            }

                            draw();
                        }, DIFFICULTIES[difficulty].tickRate),
                    );
                    (state as State.Play).timeoutIds = new Set([
                        setTimeout(setPlayingOverlay, HEAD_START),
                        setTimeout(setPlayingOverlay, HEAD_START + WARNING_TEXT_DURATION),
                    ]);
                }, MUSIC_INTRO_DURATION * 1000),
            ]),
            readyTime: true,
            startTime: Date.now(),
        };

        for (let x = -STARTING_AREA_SIZE; x <= STARTING_AREA_SIZE; ++x) {
            for (let y = -STARTING_AREA_SIZE; y <= STARTING_AREA_SIZE; ++y) {
                const key = `${x},${y}`;
                state.clear.add(key);
                updateHints(x, y);
                state.cascading.add(key);
            }
        }

        setPlayingOverlay();
        draw();
    }

    function draw(showMines = false) {
        if (state.type !== 'play') return;

        const {position, clear, flags, hints, snail, readyTime} = state;

        context.fillStyle = BACKGROUND_COLOR;
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.translate(canvas.width / 2 - BOARD_ZOOM / 2, canvas.height / 2 - BOARD_ZOOM / 2);
        context.scale(BOARD_ZOOM, BOARD_ZOOM);
        context.translate(-position.x, -position.y);

        for (let x = position.x - viewRange; x < position.x + viewRange; ++x) {
            for (let y = position.y - viewRange; y < position.y + viewRange; ++y) {
                if (clear.has(`${x},${y}`)) {
                    context.fillStyle = state.trail.has(`${x},${y}`)
                        ? TRAIL_COLOR
                        : isMine(x, y)
                          ? DETONATION_COLOR
                          : CLEAR_COLOR;
                    context.fillRect(x + 0.05, y + 0.05, 0.9, 0.9);
                }
            }
        }

        for (const flag of flags) {
            const [x, y] = flag.split(',').map(Number);
            context.fillStyle = FLAG_COLOR;
            context.fillRect(x + 0.25, y + 0.25, 0.11, 0.5);
            context.beginPath();
            context.moveTo(x + 0.35, y + 0.25);
            context.lineTo(x + 0.75, y + 0.4);
            context.lineTo(x + 0.35, y + 0.55);
            context.fill();
        }

        const playerGradient = context.createRadialGradient(
            position.x + 0.5,
            position.y + 0.6,
            0,
            position.x + 0.5,
            position.y + 0.6,
            0.325,
        );
        playerGradient.addColorStop(0, PLAYER_BACKGROUND_COLOR);
        playerGradient.addColorStop(0.25, PLAYER_BACKGROUND_COLOR);
        playerGradient.addColorStop(1, `${PLAYER_BACKGROUND_COLOR}00`);
        context.fillStyle = playerGradient;
        context.beginPath();
        context.arc(position.x + 0.5, position.y + 0.6, 0.325, 0, 2 * Math.PI);
        context.fill();

        // Use a larger font size while drawing emojis as certain browsers such as Firefox
        // render them with a resolution proportional to their font size, regardless of scale
        context.save();
        context.font = `64px ${FONT}`;
        context.translate(position.x + 0.5, position.y + 0.6);
        context.scale(1 / 128, 1 / 128);
        context.fillText('⛏️', 0, 0);
        context.restore();

        context.fillStyle = HEALTH_BAR_BACKGROUND;
        context.fillRect(position.x + 0.1, position.y + 0.1, 0.8, 0.15);
        context.fillStyle = HEALTH_BAR_FOREGROUND;
        context.fillRect(position.x + 0.1, position.y + 0.1, state.health * 0.8, 0.15);

        context.save();
        context.font = `bold 64px ${FONT}`;
        context.translate(snail.x + 0.5, snail.y + 0.5);
        context.scale(3 / 256, 3 / 256);
        context.fillText('🐌', 0, 0);
        context.restore();

        if (showMines) {
            for (let x = position.x - viewRange; x < position.x + viewRange; ++x) {
                for (let y = position.y - viewRange; y < position.y + viewRange; ++y) {
                    if (isMine(x, y) && !state.clear.has(`${x},${y}`)) {
                        context.save();
                        context.font = `bold 64px ${FONT}`;
                        context.translate(x + 0.5, y + 0.5);
                        context.scale(3 / 256, 3 / 256);
                        context.fillText('💣', 0, 0);
                        context.restore();
                    }
                }
            }
        }

        for (const [key, value] of hints) {
            if (value === 0 || !clear.has(key)) continue;
            const [x, y] = key.split(',').map(Number);
            context.fillStyle = HINT_COLORS[value - 1];
            context.save();
            context.translate(x + 0.5, y + 0.555);
            context.scale(0.5, 0.5);
            context.fillText(value.toString(), 0, 0);
            context.restore();
        }

        const timeDifference = Date.now() - state.startTime;
        if (timeDifference < HEAD_START) {
            context.fillStyle = SNAIL_WARNING_TEXT_COLOR;
            const text = readyTime ? 'READY?' : `SNAIL AWAKENS IN ${((HEAD_START - timeDifference) / 1000).toFixed(0)}`;
            context.save();
            context.translate(0.5, -1.5);
            context.scale(0.5, 0.5);
            context.fillText(text, 0, 0);
            context.restore();
        }

        context.resetTransform();
    }

    function move(directionIndex: number) {
        if (state.type !== 'play') return;

        const {position, clear, flags, cascading, snail, trail} = state;
        const [dx, dy] = MOVE_DIRECTIONS[directionIndex];

        if (flags.has(`${position.x + dx},${position.y + dy}`)) return;

        position.x += dx;
        position.y += dy;

        if (position.x === snail.x && position.y === snail.y) {
            gameOver('You touched the snail!');
            return;
        }

        if (trail.has(`${position.x},${position.y}`)) {
            takeDamage(0.1, "You were poisoned by the snail's trail.");
            hissAudio.play();
            draw();
            setPlayingOverlay();
            return;
        }

        const key = `${position.x},${position.y}`;

        const detonated = isMine(position.x, position.y) && !state.clear.has(`${position.x},${position.y}`);

        if (!detonated && !clear.has(key)) {
            ++state.tilesMined;
            mineAudio.play();
            clear.add(key);
            flags.delete(key);
            updateHints(position.x, position.y);
            cascading.add(`${position.x},${position.y}`);
            draw();
            setPlayingOverlay();
            return;
        }

        if (detonated) {
            clear.add(key);
            flags.delete(key);
            cascading.add(`${position.x},${position.y}`);

            for (let x = position.x - 1; x <= position.x + 1; ++x) {
                for (let y = position.y - 1; y <= position.y + 1; ++y) {
                    updateHints(x, y);
                    const neighborKey = `${x},${y}`;
                    if (state.hints.get(neighborKey) === 0 && (!isMine(x, y) || state.clear.has(neighborKey))) {
                        cascading.add(neighborKey);
                    }
                }
            }

            draw();
            takeDamage(0.5, 'You exploded.');
            explodeAudio.play();
        }

        draw();
    }

    function flag(directionIndex: number) {
        if (state.type !== 'play') return;

        const {position, clear, flags} = state;
        const [dx, dy] = MOVE_DIRECTIONS[directionIndex];

        const key = `${position.x + dx},${position.y + dy}`;
        if (clear.has(key)) {
            move(directionIndex);
            return;
        }

        clickAudio.play();

        if (flags.has(key)) flags.delete(key);
        else flags.add(key);

        draw();
    }

    function onKeyDown(event: KeyboardEvent) {
        if (state.type !== 'play') return;

        const index = ALTERNATE_KEYS.includes(event.key.toLowerCase())
            ? ALTERNATE_KEYS.indexOf(event.key.toLowerCase())
            : KEYS.indexOf(event.key);
        if (index === -1) return;

        event.preventDefault();

        (event.shiftKey ? flag : move)(index);
    }

    function onTouchStart(event: TouchEvent) {
        swipeData = {x: event.touches[0].clientX, y: event.touches[0].clientY, secondFinger: event.touches.length > 1};
    }

    function onTouchEnd() {
        swipeData = undefined;
    }

    function onTouchMove(event: TouchEvent) {
        if (swipeData === undefined) return;
        if (event.touches.length > 1) swipeData.secondFinger = true;
        const {clientY, clientX} = event.touches[0];
        if (distance(clientX, clientY, swipeData.x, swipeData.y) > SWIPE_RADIUS) {
            const dx = clientX - swipeData.x;
            const dy = clientY - swipeData.y;
            const handler = swipeData.secondFinger ? flag : move;
            if (Math.abs(dx) > Math.abs(dy)) handler(dx > 0 ? 1 : 3);
            else handler(dy > 0 ? 2 : 0);
            swipeData = undefined;
        }
    }

    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `bold 1.5px ${FONT}`;

    mainMenu();

    function onBlur() {
        if (done) return;
        audioContext.suspend();
    }

    function onFocus() {
        if (done) return;
        audioContext.resume();
    }

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('touchstart', onTouchStart);
    document.addEventListener('touchmove', onTouchMove);
    document.addEventListener('touchend', onTouchEnd);
    return () => {
        done = true;
        menuSource?.source.stop();
        introSource?.source.stop();
        loopSource?.source.stop();
        if (state.type === 'play') {
            state.intervalIds.forEach(clearInterval);
            state.timeoutIds.forEach(clearTimeout);
        }

        window.removeEventListener('blur', onBlur);
        window.removeEventListener('focus', onFocus);

        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('touchstart', onTouchStart);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
    };
}

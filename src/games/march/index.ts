import a3 from './sounds/a3.ogg';
import b3 from './sounds/b3.ogg';
import chord from './sounds/chord.ogg';
import click from '../../assets/click.ogg';
import d3 from './sounds/d3.ogg';
import d4 from './sounds/d4.ogg';
import e3 from './sounds/e3.ogg';
import e4 from './sounds/e4.ogg';
import g3 from './sounds/g3.ogg';
import lick from './sounds/lick.ogg';
import logo from './logo.webp';
import music1 from './music/1drums.ogg';
import music2 from './music/2shaker.ogg';
import music3 from './music/3guitar.ogg';
import music4 from './music/4groove.ogg';
import music5 from './music/5strings.ogg';
import music6 from './music/6full.ogg';
import bend from './sounds/bend.ogg';
import {FONT, UI_BLACK} from '../../shared/style.ts';
import {audioContext, downloadAndDecode, setupSoundEffect} from '../../audio.ts';
import {canvas, context, overlay, setOverlay} from '../../dom.ts';
import {choice, distance, getRectangleIntersection, randomInt, setupBufferSource, weightedChoice} from '../../util.ts';
import {create} from 'random-seed';
import {setupStorage} from '../../shared/storage.ts';

namespace State {
    export interface Menu {
        type: 'menu';
    }

    export interface Setup {
        type: 'setup';
    }

    export interface Play {
        type: 'play';
        blocks: Block[];
        balls: {
            position: {x: number; y: number};
            direction: 0 | 1 | 2 | 3;
            next?: {
                position: {x: number; y: number};
                direction: 0 | 1 | 2 | 3;
                blockIndex: number;
                totalHalfBeats: number;
                remainingHalfBeats: number;
            };
        }[];
        startTime: number;
        ticks: number; // Each tick is half of a beat
        timeBonus: number;
        lastTrackIndex: number;
        roundOver: boolean;
        movementStarted: boolean;
        transitionStartTimes: number[];
        breakEffects: {
            x: number;
            y: number;
            size: number;
            dashed: boolean;
            text: string;
            color: string;
        }[];
    }

    export type Any = Menu | Setup | Play;
}

interface Block {
    x: number;
    y: number;
    size: number;
    type: 'normal' | 'draggable' | 'multiply' | 'multi-ball' | 'armored' | 'invisible';
    value: number;
    overrideX?: number;
    overrideY?: number;
}

export function march() {
    const BACKGROUND_COLORS = ['#eee', '#ffb3b3', '#f8ef91', '#9dffb9', '#b3baff', '#e9b7ff'];
    const BLOCK_COLORS = ['#995cff', '#5790fb', '#63beff', '#00d9ff', '#00ffd0', '#00ff33', '#99ff00'];
    const MULTIPLY_COLOR = '#ff519b';
    const MULTI_BALL_COLOR = '#ea68fb';
    const ARMOR_COLOR = '#0020a3';

    const BOARD_CENTER = {x: canvas.width / 2, y: canvas.height / 2};
    const MUSIC_HALF_BPS = 74 / 30; // 74 BPM
    const DISTANCE_PER_HALF_BEAT = 100;
    const BOARD_CLEAR_BONUS = 1000;
    const TRAIL_DOT_RADIUS = 3;
    const BALL_RADIUS = 5;
    const MIN_BLOCKS = 10;
    const MAX_BLOCKS = 50;
    const MIN_SPACING = 10;
    const PROTECTED_ZONE_SIZE = 150;
    const MIN_SIZE = 25;
    const MAX_SIZE = 100;
    const VALUES = [5, 10, 15, 20, 25, 50, 100];
    const FADE_IN_DURATION = 0.5;
    const FADE_OUT_DURATION = 3;
    const OUT_OF_BOUNDS = {x: -100, y: -100};
    const LINE_DASH = [5];
    const MIN_DATE = new Date(2025, 2, 1, 0, 0, 0, 0);
    const TODAY = new Date();
    TODAY.setHours(0, 0, 0, 0);

    const ARROWS = [0, 90, 270, 180].map(
        rotation => `
        <svg width="25" height="25" xmlns="http://www.w3.org/2000/svg">
            <g transform="rotate(${rotation} 12.5 12.5)">
                <path d="M 0 0 L 20 0 L 0 20" fill="#000" />
                <path d="M 0 7.5 L 17.5 25 L 25 17.5 L 7.5 0" fill="#000" />
            </g>
        </svg>
    `,
    );

    const DIRECTIONS = [
        [1, -1], // Northeast
        [1, 1], // Southeast
        [-1, 1], // Southwest
        [-1, -1], // Northwest
    ] as const;
    const BOUNCE_MAP = {x: {0: 3, 1: 2, 2: 1, 3: 0}, y: {0: 1, 1: 0, 2: 3, 3: 2}} as const;
    const CORNER_BOUNCE_MAP = [
        [1, 0],
        [2, 3],
    ] as const;

    const chordAudio = setupSoundEffect(chord);
    const clickAudio = setupSoundEffect(click);
    const lickAudio = setupSoundEffect(lick);
    const bendAudio = setupSoundEffect(bend);
    const hitAudios = [d3, e3, g3, a3, b3, d4, e4].map(setupSoundEffect);
    const storage = setupStorage('march');

    let blocks: Block[] = [];
    let blocksTemplate: Block[] = [];
    let done = false;
    let draggingIndex: number | undefined;
    let mouseX: number;
    let mouseY: number;
    let musicState: {startTime: number; halfBeats: number} | undefined;
    let score = 0;
    let selectedDate = TODAY;
    let state: State.Any = {type: 'menu'};
    let trails: {lines: {x1: number; y1: number; x2: number; y2: number}[]; dots: {x: number; y: number}[]}[] = [];

    let bufferSources: ReturnType<typeof setupBufferSource>[] = [];
    Promise.all<AudioBuffer>([music1, music2, music3, music4, music5, music6].map(downloadAndDecode)).then(decoded => {
        if (done) return;
        bufferSources = decoded.map(setupBufferSource);
        bufferSources[0].gain.gain.setValueAtTime(1, audioContext.currentTime);
        musicState = {startTime: audioContext.currentTime, halfBeats: 0};
    });

    function mainMenu() {
        trails = [];
        state = {type: 'menu'};
        score = 0;
        updateMusic();

        setOverlay(`
            <div class="center" style="backdrop-filter: blur(10px); display: flex; flex-direction: column; gap: 10px; color: var(--ui-black)">
                <img src="${logo}" alt="Brick Bop" width="500">
                <div style="display: flex; gap: 10px">
                    <button id="march-prev-button" class="dark">Prev</button>
                    <input type="date" min="${getDateString(MIN_DATE)}" style="background-color: var(--ui-black); color: var(--ui-white); color-scheme: dark">
                    <button id="march-next-button" class="dark">Next</button>
                </div>
                <span><strong>Best score</strong>: <span id="march-best-score">-</span></span>
                <span><strong>Par</strong>: <span id="march-par">-</span></span>
                <button id="march-how-to-play-button" class="dark">HOW TO PLAY</button>
                <button id="march-play-button" class="dark" style="font-size: 24px; font-weight: bold; border: 2px solid var(--ui-black)">Play</button>
            </div>
        `);

        const inputElement = document.querySelector('input') as HTMLInputElement;
        const prevButton = document.getElementById('march-prev-button') as HTMLButtonElement;
        const nextButton = document.getElementById('march-next-button') as HTMLButtonElement;
        const playButton = document.getElementById('march-play-button') as HTMLButtonElement;
        const howToPlayButton = document.getElementById('march-how-to-play-button') as HTMLButtonElement;
        const bestScoreSpan = document.getElementById('march-best-score') as HTMLSpanElement;
        const parSpan = document.getElementById('march-par') as HTMLSpanElement;

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
            generateBlocksTemplate();
            blocks = getBlocksFromStorage();
            bestScoreSpan.textContent = `${storage.get(`bestScore-${getDateString(date)}`) ?? '-'}`;
            parSpan.textContent = getPar().toString();
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

        playButton.addEventListener('click', startSetup);

        howToPlayButton.addEventListener('click', () => helpMenu().then(mainMenu));

        onDateChange();
    }

    function helpMenu() {
        clickAudio.play();
        return new Promise<void>(resolve => {
            setOverlay(`
                <div class="center">
                    <div style="color: var(--ui-black); display: flex; flex-direction: column; gap: 10px; background: #ffffff88; backdrop-filter: blur(5px); border: 2px solid var(--ui-black); padding: 10px">
                        <h1>How to play</h1>
                        <ol>
                            <li>🟩 Drag blocks with dashed lines (solid lines cannot be dragged)</li>
                            <li>🚀 Click an arrow to launch the ball in that direction</li>
                            <li>💥 Watch the ball break blocks and score points</li>
                            <li>🔁 Try again and aim to get the highest score for the day</li>
                        </ol>
                        <h3>Notes</h3>
                        <ol>
                            <li>👥 The starting board each day is identical for all players</li>
                            <li>⌛ Each beat of the music decreases your time bonus</li>
                            <li>⬜ Clear the entire board for a ${BOARD_CLEAR_BONUS} point bonus</li>
                            <li>🎵 The music gets more complex the more blocks you break</li>
                        </ol>
                        <button id="march-close-button" class="dark">CLOSE</button>
                    </div>
                </div>
            `);

            (document.getElementById('march-close-button') as HTMLButtonElement).addEventListener('click', () => {
                clickAudio.play();
                resolve();
            });
        });
    }

    function getSeedFromDate(date: Date) {
        return `${date.getFullYear()}-${date.getMonth()}-${date.getUTCDate()}`;
    }

    function getDateString(date: Date): string {
        return date.toISOString().split('T')[0];
    }

    function getHumanReadableDateString(date: Date): string {
        return new Intl.DateTimeFormat('en-US', {
            timeZone: 'UTC',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        }).format(date);
    }

    function getBlocksFromStorage() {
        const stored = storage.get(`blocks-${getDateString(selectedDate)}`);
        const result = structuredClone(blocksTemplate);
        if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return result;

        for (const [indexString, position] of Object.entries(stored)) {
            const index = +indexString;
            if (typeof position !== 'object' || position === null || blocksTemplate[index]?.type !== 'draggable') {
                continue;
            }

            result[index].overrideX = (position as {x: number; y: number} | undefined)?.x;
            result[index].overrideY = (position as {x: number; y: number} | undefined)?.y;
        }

        return result;
    }

    function tooClose(a: Block, b: Block) {
        return (
            Math.abs(a.x - b.x) < (a.size + b.size + MIN_SPACING) / 2 &&
            Math.abs(a.y - b.y) < (a.size + b.size + MIN_SPACING) / 2
        );
    }

    function generateBlocksTemplate() {
        const generator = create(getSeedFromDate(selectedDate));

        // Start with an invisible block in the center to prevent other blocks from being placed here.
        // This block is later removed.
        blocksTemplate = [
            {
                ...BOARD_CENTER,
                size: PROTECTED_ZONE_SIZE,
                type: 'invisible',
                value: 0,
            },
        ];
        const numBlocks = randomInt(MIN_BLOCKS, MAX_BLOCKS, generator.random);
        for (let i = 0; i < numBlocks; ++i) {
            const size = randomInt(MIN_SIZE, MAX_SIZE, generator.random);
            const x = randomInt(size / 2, canvas.width - size / 2, generator.random);
            const y = randomInt(size / 2, canvas.height - size / 2, generator.random);
            const type =
                i < 3 // Ensure the first three blocks are draggable
                    ? 'draggable'
                    : weightedChoice(
                          ['normal', 'draggable', 'armored', 'multiply', 'multi-ball'] as const,
                          [0.35, 0.35, 0.1, 0.1, 0.1],
                          generator.random,
                      );
            const value = choice(VALUES, () =>
                // Guarantee armored blocks are at least 50s or 100s.
                type === 'armored' ? generator.random() / 4 + 0.75 : generator.random(),
            );
            const block = {x, y, size, type, value};
            if (blocksTemplate.some(otherBlock => tooClose(block, otherBlock))) {
                if (i < MIN_BLOCKS) --i;
                continue;
            }
            blocksTemplate.push(block);
        }
    }

    function getLineFromBall({position: {x, y}, direction}: State.Play['balls'][number]) {
        const [dx, dy] = DIRECTIONS[direction];
        return [x, y, x + dx * canvas.width, y + dy * canvas.height] as const;
    }

    function getBlocksAlongPaths() {
        const {balls, blocks} = state as State.Play;
        const result: {
            ballIndex: number;
            blockIndex: number;
            distance: number;
            point: {x: number; y: number};
            type: 'x' | 'y';
            corner: boolean;
        }[] = [];
        for (const [ballIndex, ball] of balls.entries()) {
            if (ball.next?.blockIndex === -1) continue;
            const line = getLineFromBall(ball);
            for (const [blockIndex, block] of blocks.entries()) {
                if (block.type === 'invisible') continue;
                const {x, y} = getBlockPosition(block);
                const size = block.size + BALL_RADIUS * 2;
                const intersection = getRectangleIntersection(...line, x - size / 2, y - size / 2, size, size);
                if (intersection === undefined) continue;
                result.push({ballIndex, blockIndex, ...intersection});
            }
        }

        return result.sort((a, b) => a.distance - b.distance);
    }

    function getBlockPosition(block: Block) {
        return {x: block.overrideX ?? block.x, y: block.overrideY ?? block.y};
    }

    function addTrailDots() {
        // Calculate the position of the balls entirely based on the beat ratio
        const ballPositions = (state as State.Play).balls.map(ball => {
            if (ball.next === undefined) return BOARD_CENTER;
            const ratio = (ball.next.totalHalfBeats - ball.next.remainingHalfBeats + 1) / ball.next.totalHalfBeats;
            return {
                x: ball.position.x * (1 - ratio) + ball.next.position.x * ratio,
                y: ball.position.y * (1 - ratio) + ball.next.position.y * ratio,
            };
        });

        // Add a trail dot at each ball position
        for (const [index, ballPosition] of ballPositions.entries()) {
            trails[index].dots.push(ballPosition);
        }
    }

    function getMaximumPossibleBlockScore() {
        return (
            [...blocks]
                // Process multiply blocks last
                .sort((a, b) => Number(a.type === 'multiply') - Number(b.type === 'multiply'))
                .reduce(
                    (total, block) =>
                        block.type === 'multiply' ? total * 2 : block.type === 'multi-ball' ? 0 : total + block.value,
                    0,
                )
        );
    }

    function getBlocksHit() {
        return (
            (state as State.Play).blocks.reduce((total, block) => (block.type === 'invisible' ? total + 1 : total), 0) -
            1
        );
    }

    function getStageIndex() {
        if (state.type !== 'play') return 0;

        return Math.min(
            Math.floor(getBlocksHit() / ((blocksTemplate.length - 1) / bufferSources.length)),
            bufferSources.length - 1,
        );
    }

    function getBlockColor(block: Block) {
        return block.type === 'multiply'
            ? MULTIPLY_COLOR
            : block.type === 'multi-ball'
              ? MULTI_BALL_COLOR
              : BLOCK_COLORS[VALUES.indexOf(block.value)];
    }

    function getBlockText(block: Block) {
        return block.type === 'multi-ball' ? '••' : block.type === 'multiply' ? 'x2' : block.value.toString();
    }

    function addBlockToPar(par: number, block: Block) {
        if (block.type === 'normal') return par + block.value * 0.75;
        if (block.type === 'draggable') return par + block.value;
        if (block.type === 'multiply') return par * 1.5;
        if (block.type === 'armored') return par + block.value * 0.5;
        return par;
    }

    function getPar() {
        return (
            Math.floor(
                ([...blocks]
                    // Process multiply blocks last
                    .sort((a, b) => Number(a.type === 'multiply') - Number(b.type === 'multiply'))
                    .reduce(addBlockToPar, 0) *
                    getTimeBonus(blocksTemplate.length) *
                    0.75) /
                    500,
            ) * 500
        );
    }

    function getTimeBonus(numBlocks: number) {
        return Math.ceil(numBlocks / 5);
    }

    function setPlayOverlay() {
        setOverlay(`
            <div class="center">
                <div style="color: var(--ui-black); display: flex; flex-direction: column; gap: 10px; backdrop-filter: blur(5px); border: 1px solid var(--ui-black); padding: 10px; text-align: center; width: ${PROTECTED_ZONE_SIZE}px">
                    <span><strong>Block Score</strong>: <span id="march-block-score-span">${score}</span></span>
                    <span><strong>Time Bonus</strong>: <span id="march-time-bonus-span">${(state as State.Play).timeBonus.toFixed(1)}</span>x</span>
                    <button id="march-stop-button" class="dark">STOP</button>
                    <span>(click/tap to<br />skip beat)</span>
                </div>
            </div>
        `);
        document.getElementById('march-stop-button')!.addEventListener('click', startSetup);
    }

    function updatePlayOverlay() {
        const scoreSpan = document.getElementById('march-block-score-span');
        if (scoreSpan === null) {
            // The play overlay has been cleared and this call is stale
            return;
        }
        scoreSpan.textContent = score.toString();

        (document.getElementById('march-time-bonus-span') as HTMLSpanElement).textContent = (
            state as State.Play
        ).timeBonus.toFixed(1);

        if (getBlocksHit() === blocksTemplate.length - 1) {
            bendAudio.play();
            setOverlay(`
                <div class="center" style="color: var(--ui-black); display: flex; flex-direction: column; text-align: center; gap: 5px;">
                    <h1>BOARD CLEAR! 🏆</h1>
                    <h3>+${BOARD_CLEAR_BONUS}</h3>
                </div>
            `);
        }
    }

    function startSetup() {
        clickAudio.play();
        state = {type: 'setup'};
        score = 0;
        updateMusic();

        setOverlay(`
            <div class="center">
                <div style="color: var(--ui-black); display: flex; flex-direction: column; text-align: center; gap: 5px; font-size: 12px; align-items: center">
                    <div style="display: flex; align-items: center; justify-content: space-between; width: 100%">
                        <span style="font-size: 16px"><strong>Par</strong>: ${getPar()}</span>
                        <button id="march-menu-button" class="dark" style="padding: 3px;">MENU</button>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 15px">
                        ${['northwest', 'northeast', 'southwest', 'southeast'].map((direction, index) => `<button id="march-launch-${direction}-button" class="dark" style="padding: 0; line-height: 0; width: 32px; height: 32px;">${ARROWS[index]}</button>`).join('')}
                    </div>
                    <div style="display: flex; gap: 5px">
                        <button id="march-clear-button" class="dark" style="padding: 3px;">CLEAR</button>
                        <button id="march-reset-button" class="dark" style="padding: 3px;">RESET</button>
                        <button id="march-help-button" class="dark" style="padding: 3px; width: 25px">?</button>
                    </div>
                </div>
            </div>
        `);

        document.getElementById('march-launch-northwest-button')!.addEventListener('click', () => start(3));
        document.getElementById('march-launch-northeast-button')!.addEventListener('click', () => start(0));
        document.getElementById('march-launch-southwest-button')!.addEventListener('click', () => start(2));
        document.getElementById('march-launch-southeast-button')!.addEventListener('click', () => start(1));
        document.getElementById('march-menu-button')!.addEventListener('click', mainMenu);
        document.getElementById('march-clear-button')!.addEventListener('click', () => {
            clickAudio.play();
            trails = [];
        });
        document.getElementById('march-reset-button')!.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset all blocks to their original positions?')) {
                clickAudio.play();
                blocks = structuredClone(blocksTemplate);
                storage.set(`blocks-${getDateString(selectedDate)}`, {});
            }
        });
        document.getElementById('march-help-button')!.addEventListener('click', () => helpMenu().then(startSetup));
    }

    function roundOver() {
        const blocksHit = getBlocksHit();
        // The invisible block is always there, so subtract one from the length
        const boardClear = blocksHit === blocksTemplate.length - 1;
        const totalScore = Math.ceil((score + (boardClear ? BOARD_CLEAR_BONUS : 0)) * (state as State.Play).timeBonus);

        let newBest = false;
        if (totalScore > (storage.get(`bestScore-${getDateString(selectedDate)}`) ?? -1)) {
            storage.set(`bestScore-${getDateString(selectedDate)}`, totalScore);
            newBest = true;
        }

        const blockScoreString = `${score}${score === getMaximumPossibleBlockScore() ? ' 🏆' : ''}`;
        const timeBonusString = `${(state as State.Play).timeBonus.toFixed(1)}x`;
        const blocksHitString = `${blocksHit} / ${blocksTemplate.length - 1}${boardClear ? ` 🏆 (+${BOARD_CLEAR_BONUS})` : ''}`;

        const par = getPar();

        setOverlay(`
            <div class="center">
                <div style="color: var(--ui-black); display: flex; flex-direction: column; gap: 10px; background: #ffffff22; backdrop-filter: blur(5px); border: 1px solid var(--ui-black); padding: 10px">
                    <strong style="font-size: 24px">${getHumanReadableDateString(selectedDate)}</strong>
                    <span><strong>Block score</strong>: ${blockScoreString}</span>
                    <span><strong>Time bonus</strong>: ${timeBonusString}</span>
                    <span><strong>Blocks hit</strong>: ${blocksHitString}</span>
                    <span style="font-size: 24px"><strong>Total score</strong>: ${totalScore}</span>
                    <span><strong>Par</strong>: ${par}${totalScore > par ? ' 🏆' : ''}</span>
                    <span><strong>${newBest ? '[NEW] ' : ''}Best score for this day</strong>: ${storage.get(`bestScore-${getDateString(selectedDate)}`) ?? '-'}</span>
                    <button id="march-try-again-button" class="dark">TRY AGAIN</button>
                    <button id="march-share-button" class="dark">SHARE</button>
                    <button id="march-main-menu-button" class="dark">MAIN MENU</button>
                </div>
            </div>
        `);

        (state as State.Play).roundOver = true;
        const shareButton = document.getElementById('march-share-button') as HTMLButtonElement;
        shareButton.addEventListener('click', () => {
            clickAudio.play();
            navigator.clipboard.writeText(
                `🧱🎵 Brick Bop ${getHumanReadableDateString(selectedDate)}\n\n` +
                    `🔢 Block score: ${blockScoreString}\n` +
                    `⌛ Time bonus: ${timeBonusString}\n` +
                    `💥 Blocks hit: ${blocksHitString}\n\n` +
                    `💯 Total score: ${totalScore}`,
            );
            shareButton.innerText = 'COPIED!';
            setTimeout(() => (shareButton.innerText = 'SHARE'), 1000);
        });

        (document.getElementById('march-try-again-button') as HTMLButtonElement).addEventListener('click', startSetup);
        (document.getElementById('march-main-menu-button') as HTMLButtonElement).addEventListener('click', mainMenu);
    }

    function start(direction: State.Play['balls'][number]['direction']) {
        state = {
            type: 'play',
            balls: [{position: BOARD_CENTER, direction}],
            blocks: structuredClone(blocks),
            startTime: Date.now(),
            ticks: 0,
            lastTrackIndex: 0,
            timeBonus: getTimeBonus(blocks.length),
            roundOver: false,
            movementStarted: false,
            transitionStartTimes: [],
            breakEffects: [],
        };
        trails = [{lines: [], dots: []}];
        setPlayOverlay();
        clickAudio.play();
    }

    function updateMusic() {
        const trackIndex = getStageIndex();
        if (state.type === 'play') {
            if (trackIndex === state.lastTrackIndex) return;
            state.transitionStartTimes.push(Date.now());
            state.lastTrackIndex = trackIndex;
        }

        bufferSources.forEach((source, index) => {
            source.gain.gain.cancelScheduledValues(audioContext.currentTime);
            source.gain.gain.setValueAtTime(source.gain.gain.value, audioContext.currentTime);
            source.gain.gain.linearRampToValueAtTime(
                trackIndex === index ? 1 : 0,
                audioContext.currentTime +
                    (state.type === 'play' || trackIndex === index ? FADE_IN_DURATION : FADE_OUT_DURATION),
            );
        });
    }

    function tick() {
        ++(state as State.Play).ticks;
        (state as State.Play).breakEffects = [];
        if ((state as State.Play).ticks % 2 === 0) {
            (state as State.Play).movementStarted = true;
            addTrailDots();
            (state as State.Play).timeBonus -= 0.1;
        }

        if (!(state as State.Play).movementStarted) return true;

        const {balls, blocks} = state as State.Play;

        function breakBlock(index: number) {
            const {x, y} = getBlockPosition(blocks[index]);
            (state as State.Play).breakEffects.push({
                x,
                y,
                size: blocks[index].size,
                dashed: blocks[index].type === 'draggable',
                text: blocks[index].type === 'multi-ball' ? '' : getBlockText(blocks[index]),
                color: getBlockColor(blocks[index]),
            });
            blocks[index].type = 'invisible';
        }

        const ballsToAdd: State.Play['balls'] = [];
        let collision = false;
        for (const ball of balls) {
            if (ball.next?.blockIndex === -1 && ball.next.remainingHalfBeats <= 0) {
                ball.position = OUT_OF_BOUNDS;
                ball.next.position = OUT_OF_BOUNDS;
                continue;
            }

            if (ball.next !== undefined) {
                if (ball.next.blockIndex !== -1 && ball.next.remainingHalfBeats <= 1) {
                    const block = blocks[ball.next.blockIndex];
                    switch (block.type) {
                        case 'armored':
                            hitAudios[VALUES.indexOf(block.value)].play();
                            block.type = 'normal';
                            break;
                        case 'multi-ball':
                            chordAudio.play();
                            ballsToAdd.push({
                                position: ball.next.position,
                                direction: ((ball.next.direction + 2) % 4) as State.Play['balls'][number]['direction'],
                            });
                            breakBlock(ball.next.blockIndex);
                            trails.push({lines: [], dots: []});
                            break;
                        case 'multiply':
                            lickAudio.play();
                            score *= 2;
                            breakBlock(ball.next.blockIndex);
                            break;
                        default:
                            hitAudios[VALUES.indexOf(block.value)].play();
                            score += block.value;
                            breakBlock(ball.next.blockIndex);
                    }
                    ball.position = ball.next.position;
                    ball.direction = ball.next.direction;
                    ball.next = {...ball.next, remainingHalfBeats: 0};
                    collision = true;
                } else --ball.next.remainingHalfBeats;
            }
        }

        for (const ball of ballsToAdd) balls.push(ball);

        if (balls.every(ball => ball.position === OUT_OF_BOUNDS)) {
            roundOver();
            return true;
        }

        const blocksAlongPath = getBlocksAlongPaths();
        const updatedBallIndexes = new Set<number>();
        const usedBlockIndexes = new Map<number, 'armorBroken' | 'hit'>();

        function addUsedBlock(index: number) {
            usedBlockIndexes.set(
                index,
                (state as State.Play).blocks[index].type === 'armored' && usedBlockIndexes.get(index) !== 'armorBroken'
                    ? 'armorBroken'
                    : 'hit',
            );
        }

        // Ignore blocks that are already "claimed" by balls
        for (const [index, ball] of balls.entries()) {
            if (ball.next === undefined || ball.next.remainingHalfBeats <= 0 || ball.next.blockIndex === -1) continue;
            updatedBallIndexes.add(index);
            addUsedBlock(ball.next.blockIndex);
        }

        for (const {ballIndex, blockIndex, point, distance, type, corner} of blocksAlongPath) {
            if (
                updatedBallIndexes.has(ballIndex) ||
                usedBlockIndexes.get(blockIndex) === 'hit' ||
                blockIndex === balls[ballIndex].next?.blockIndex
            )
                continue;

            updatedBallIndexes.add(ballIndex);
            addUsedBlock(blockIndex);

            const blockPosition = getBlockPosition(blocks[blockIndex]);
            const halfBeats = Math.floor(distance / DISTANCE_PER_HALF_BEAT) + 1;
            balls[ballIndex] = {
                ...balls[ballIndex],
                next: {
                    position: point,
                    direction: corner
                        ? CORNER_BOUNCE_MAP[+(point.x < blockPosition.x)][+(point.y < blockPosition.y)]
                        : BOUNCE_MAP[type][balls[ballIndex].direction],
                    blockIndex,
                    totalHalfBeats: halfBeats,
                    remainingHalfBeats: halfBeats,
                },
            };

            trails[ballIndex].lines.push({
                x1: balls[ballIndex].position.x,
                y1: balls[ballIndex].position.y,
                x2: point.x,
                y2: point.y,
            });
        }

        for (const [index, ball] of balls.entries()) {
            if (updatedBallIndexes.has(index) || ball.next?.blockIndex === -1) continue;
            const intersection = getRectangleIntersection(...getLineFromBall(ball), 0, 0, canvas.width, canvas.height);

            // In rare cases, the ball can already be out of bounds when it bounces
            // If this happens, just keep it in the same position and set the distance to 0
            const point = intersection === undefined ? ball.position : intersection.point;
            const intersectionDistance = intersection === undefined ? 0 : intersection.distance;

            const halfBeats = Math.floor(intersectionDistance / DISTANCE_PER_HALF_BEAT) + 1;
            balls[index] = {
                position: balls[index].next?.position ?? balls[index].position,
                direction: balls[index].next?.direction ?? balls[index].direction,
                next: {
                    position: {
                        x: point.x + DIRECTIONS[ball.direction][0] * BALL_RADIUS,
                        y: point.y + DIRECTIONS[ball.direction][1] * BALL_RADIUS,
                    },
                    direction: balls[index].next?.direction ?? balls[index].direction,
                    blockIndex: -1,
                    totalHalfBeats: halfBeats,
                    remainingHalfBeats: halfBeats,
                },
            };
            trails[index].lines.push({
                x1: ball.position.x,
                y1: ball.position.y,
                x2: balls[index].next!.position.x,
                y2: balls[index].next!.position.y,
            });
        }

        updateMusic();
        updatePlayOverlay();
        return collision;
    }

    function draw() {
        if (done) return;

        if (
            musicState !== undefined &&
            audioContext.currentTime - musicState.startTime > musicState.halfBeats / MUSIC_HALF_BPS
        ) {
            ++musicState.halfBeats;
            if (state.type === 'play' && !state.roundOver) tick();
        }

        const ratio =
            state.type === 'play'
                ? ((audioContext.currentTime - musicState!.startTime) % (1 / MUSIC_HALF_BPS)) * MUSIC_HALF_BPS
                : undefined;

        context.fillStyle = BACKGROUND_COLORS[0];
        context.fillRect(0, 0, canvas.width, canvas.height);

        if (state.type === 'play') {
            for (const [index, transitionStartTime] of state.transitionStartTimes.entries()) {
                const transitionProgress = Math.min(1, (Date.now() - transitionStartTime) / (FADE_IN_DURATION * 1000));
                context.fillStyle = BACKGROUND_COLORS[index + 1];
                const size = canvas.width * transitionProgress;
                context.fillRect(canvas.width / 2 - size / 2, canvas.height / 2 - size / 2, size, size);
            }
        }

        if (state.type === 'play') {
            for (const {x, y, size, dashed, color, text} of state.breakEffects) {
                const drawnSize = size * (1 - ratio!);
                context.fillStyle = color;
                context.fillRect(x - drawnSize / 2, y - drawnSize / 2, drawnSize, drawnSize);

                context.strokeStyle = UI_BLACK;
                context.lineWidth = drawnSize / 25;
                context.setLineDash(dashed ? LINE_DASH : []);
                const adjustedSize = drawnSize - context.lineWidth;
                context.strokeRect(x - adjustedSize / 2, y - adjustedSize / 2, adjustedSize, adjustedSize);

                context.fillStyle = UI_BLACK;
                context.font = `${size / 2.5}px ${FONT}`;

                context.fillText(
                    text,
                    x + (canvas.width / 2 - x) * ratio!,
                    y + (canvas.height / 2 - y) * ratio! + size / 30,
                );
            }
        }

        for (const block of state.type === 'play' ? state.blocks : blocks) {
            const {x, y} = getBlockPosition(block);
            const {size, type} = block;
            if (type !== 'invisible') {
                context.fillStyle = getBlockColor(block);
                context.fillRect(x - size / 2, y - size / 2, size, size);
            }

            if (type !== 'invisible' || state.type !== 'play') {
                context.strokeStyle = type === 'armored' ? ARMOR_COLOR : UI_BLACK;
                context.lineWidth = type === 'invisible' ? 1 : block.type === 'armored' ? size / 5 : size / 25;
                context.setLineDash(type === 'draggable' ? LINE_DASH : []);
                const adjustedSize = size - context.lineWidth;
                context.strokeRect(x - adjustedSize / 2, y - adjustedSize / 2, adjustedSize, adjustedSize);
            }

            if (type !== 'invisible') {
                context.fillStyle = UI_BLACK;
                context.font = `${size / 2.5}px ${FONT}`;
                const text = getBlockText(block);
                context.fillText(text, x, y + size / 30);
            }
        }

        const ballPositions = (() => {
            if (state.type === 'play') {
                return state.balls.map(ball => {
                    if (ball.next === undefined) return BOARD_CENTER;
                    const adjustedRatio =
                        (ball.next.totalHalfBeats - ball.next.remainingHalfBeats) / ball.next.totalHalfBeats +
                        ratio! / ball.next.totalHalfBeats;
                    return {
                        x: ball.position.x * (1 - adjustedRatio) + ball.next.position.x * adjustedRatio,
                        y: ball.position.y * (1 - adjustedRatio) + ball.next.position.y * adjustedRatio,
                    };
                });
            }

            return [BOARD_CENTER];
        })();

        context.setLineDash([]);
        context.lineWidth = 2;
        for (const [index, {lines, dots}] of trails.entries()) {
            context.strokeStyle = `hsl(${(index / trails.length) * 360}, 100%, 50%)`;
            context.beginPath();
            for (const [segment, {x1, y1, x2, y2}] of lines.entries()) {
                context.moveTo(x1, y1);
                if (
                    state.type === 'play' &&
                    state.balls[index].position !== OUT_OF_BOUNDS &&
                    segment === lines.length - 1
                ) {
                    context.lineTo(ballPositions[index].x, ballPositions[index].y);
                } else {
                    context.lineTo(x2, y2);
                }
            }
            context.stroke();

            context.fillStyle = `hsl(${(index / trails.length) * 360}, 100%, 50%)`;
            for (const dot of dots) {
                context.beginPath();
                context.arc(dot.x, dot.y, TRAIL_DOT_RADIUS, 0, 2 * Math.PI);
                context.fill();
            }
        }

        context.fillStyle = UI_BLACK;
        for (const {x, y} of ballPositions) {
            context.beginPath();
            context.arc(x, y, BALL_RADIUS, 0, 2 * Math.PI);
            context.fill();
        }

        if (draggingIndex !== undefined && state.type === 'setup') {
            const {x, y} = getBlockPosition(blocks[draggingIndex]);
            if (distance(x, y, mouseX, mouseY) > 5) {
                const block = blocks[draggingIndex];
                context.strokeStyle = 'red';
                context.lineWidth = 2;
                context.setLineDash(LINE_DASH);
                context.strokeRect(mouseX - block.size / 2, mouseY - block.size / 2, block.size, block.size);
            }
        }

        requestAnimationFrame(draw);
    }

    function onPointerDown(event: PointerEvent) {
        // Click/tap to skip beat
        if (state.type === 'play' && !state.roundOver) {
            tick();
            if (state.ticks % 2 !== 0) tick();
            return;
        }

        if (state.type !== 'setup' || event.target !== overlay.firstElementChild) return;
        const {offsetX, offsetY} = event;

        for (const [index, block] of blocks.entries()) {
            if (block.type !== 'draggable') continue;
            const {x, y} = getBlockPosition(block);
            const {size} = block;
            if (offsetX > x - size / 2 && offsetX < x + size / 2 && offsetY > y - size / 2 && offsetY < y + size / 2) {
                draggingIndex = index;
                hitAudios[VALUES.indexOf(block.value)].play();
                overlay.style.pointerEvents = 'none';
                break;
            }
        }

        onPointerMove({...event, offsetX: event.offsetX, offsetY: event.offsetY, target: canvas});
    }

    function onPointerMove(event: PointerEvent) {
        if (draggingIndex === undefined || (event.target !== canvas && !overlay.contains(event.target as HTMLElement)))
            return;
        const {size} = blocks[draggingIndex];
        const halfSize = size / 2;
        let {offsetX, offsetY} = event;
        mouseX = offsetX;
        mouseY = offsetY;

        // Prevent blocks from leaving the view
        if (offsetX + halfSize > canvas.width) offsetX = canvas.width - halfSize;
        if (offsetX - halfSize < 0) offsetX = halfSize;
        if (offsetY + halfSize > canvas.height) offsetY = canvas.height - halfSize;
        if (offsetY - halfSize < 0) offsetY = halfSize;

        // Prevent blocks from overlapping with other blocks
        for (const otherBlock of blocks) {
            if (otherBlock === blocks[draggingIndex]) continue;

            const {x: otherX, y: otherY} = getBlockPosition(otherBlock);

            const otherHalfSize = otherBlock.size / 2;
            const dx = offsetX - otherX;
            const dy = offsetY - otherY;
            const overlapX = halfSize + otherHalfSize - Math.abs(dx);
            const overlapY = halfSize + otherHalfSize - Math.abs(dy);

            if (overlapX > 0 && overlapY > 0) {
                // Resolve collision by prioritizing the axis with the least overlap
                if (overlapX < overlapY) {
                    offsetX = dx > 0 ? otherX + otherHalfSize + halfSize : otherX - otherHalfSize - halfSize;
                } else {
                    offsetY = dy > 0 ? otherY + otherHalfSize + halfSize : otherY - otherHalfSize - halfSize;
                }

                // Ensure the block does not snap outside the canvas after collision resolution
                offsetX = Math.max(halfSize, Math.min(canvas.width - halfSize, offsetX));
                offsetY = Math.max(halfSize, Math.min(canvas.height - halfSize, offsetY));
            }
        }

        // If the resulting position overlaps with another block, don't apply it.
        for (const otherBlock of blocks) {
            if (otherBlock === blocks[draggingIndex]) continue;
            const {x: otherX, y: otherY} = getBlockPosition(otherBlock);

            if (
                Math.abs(offsetX - otherX) < (otherBlock.size + size) / 2 &&
                Math.abs(offsetY - otherY) < (otherBlock.size + size) / 2
            ) {
                return;
            }
        }

        blocks[draggingIndex].overrideX = offsetX;
        blocks[draggingIndex].overrideY = offsetY;
    }

    function onPointerUp() {
        draggingIndex = undefined;
        storage.set(
            `blocks-${getDateString(selectedDate)}`,
            Object.fromEntries(
                blocks.flatMap((block, index) =>
                    block.type === 'draggable' ? [[index, getBlockPosition(block)]] : [],
                ),
            ),
        );
        overlay.style.pointerEvents = 'all';
    }

    mainMenu();

    context.textAlign = 'center';
    context.textBaseline = 'middle';

    requestAnimationFrame(draw);

    function onBlur() {
        if (done || (state.type === 'play' && !state.roundOver)) return;
        audioContext.suspend();
    }

    function onFocus() {
        if (done || (state.type === 'play' && !state.roundOver)) return;
        audioContext.resume();
    }

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    return () => {
        window.removeEventListener('blur', onBlur);
        window.removeEventListener('focus', onFocus);
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerdown', onPointerDown);
        document.removeEventListener('pointerup', onPointerUp);
        bufferSources.forEach(bufferSource => bufferSource.source.stop());
        done = true;
    };
}

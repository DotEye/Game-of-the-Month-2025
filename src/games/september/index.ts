import click from '../../assets/click.ogg';
import intro from './music/intro.ogg';
import logo from './logo.webp';
import loop from './music/loop.ogg';
import {
    calculateTurn,
    MAGNET_PICKUP_RADIUS,
    MAGNET_RADIUS,
    MAGNET_SPEED,
    MAX_SIMULATION_STEPS,
    outOfBounds,
} from './shared.ts';
import type {ResponseEvent} from '../../shared/worker.ts';
import {Decimal} from 'decimal.js';
import {FONT, UI_BLACK, UI_WHITE} from '../../shared/style.ts';
import {audioContext, downloadAndDecode, setupSoundEffect} from '../../audio.ts';
import {canvas, context, setOverlay} from '../../dom';
import {distance, setupBufferSource} from '../../util.ts';
import {create} from 'random-seed';
import {setupStorage} from '../../shared/storage.ts';

export interface Negative {
    x: number;
    y: number;
}

export interface Positive {
    x: Decimal;
    y: Decimal;
    startColor: string;
    endColor: string;
    angle?: Decimal;
}

export function september(worker: Worker) {
    const BACKGROUND_COLOR = [255, 255, 255];
    const CANON_COLOR = 'grey';
    const NEGATIVE_MAGNET_COLOR = 'black';

    const ANIMATION_DURATION = 2000;
    const ANIMATION_NEGATIVE_RADIUS = 50;
    const CANON_LENGTH = 100;
    const CANON_WIDTH = 25;
    const CENTER = {x: new Decimal(canvas.width / 2), y: new Decimal(canvas.height / 2)};
    const NEGATIVE_MIN_DISTANCE = 100;
    const NEGATIVE_PADDING = 100;
    const NUM_SHOTS = 5;
    const PI = Decimal.acos(-1);
    const UPDATE_INTERVAL = 15;

    // Completely made up this number, but it seems to work well enough
    const DECIMAL_PRECISION_PADDING = 5;

    const MIN_DATE = new Date(2025, 8, 1, 0, 0, 0, 0);
    const TODAY = new Date();
    TODAY.setHours(0, 0, 0, 0);

    const clickAudio = setupSoundEffect(click);
    const storage = setupStorage('september');

    const background = document.createElement('canvas');
    background.width = canvas.width;
    background.height = canvas.height;
    const backgroundContext = background.getContext('2d', {willReadFrequently: true})!;

    const trajectory = document.createElement('canvas');
    trajectory.width = canvas.width;
    trajectory.height = canvas.height;
    const trajectoryContext = trajectory.getContext('2d')!;
    trajectoryContext.strokeStyle = 'red';
    trajectoryContext.lineWidth = 2;

    let angle = new Decimal(0);
    let angleIncrement = new Decimal(0.01);
    let animationStartTime = 0;
    let canvasScale = 1;
    let done = false;
    let gameState: 'mainMenu' | 'animating' | 'playing' | 'calculating' | 'gameOver' = 'mainMenu';
    let introSource: ReturnType<typeof setupBufferSource> | undefined;
    let introStartTime: number | undefined;
    let lastPointerX: number | undefined = undefined;
    let lastUpdate = 0;
    let loopSource: ReturnType<typeof setupBufferSource> | undefined;
    let negatives: Negative[] = [];
    let negativesTemplate: Negative[] = [];
    let positive: Positive = {x: CENTER.x, y: CENTER.y, startColor: '#ffffff', endColor: '#ffffff'};
    let positivesTemplate: Positive[] = [];
    let scores: number[] = [];
    let selectedDate = TODAY;
    let simulationData = {step: 0, lastX: CENTER.x.toNumber(), lastY: CENTER.y.toNumber()};

    downloadAndDecode(intro).then(buffer => {
        if (done) return;
        introSource = setupBufferSource(buffer);
        introSource.source.loop = false;
        introSource.gain.gain.setValueAtTime(1, audioContext.currentTime);
        introStartTime = audioContext.currentTime;
    });
    downloadAndDecode(loop).then(buffer => {
        if (done) return;
        loopSource = setupBufferSource(buffer, (introStartTime ?? audioContext.currentTime) + 13.2951);
        loopSource.gain.gain.setValueAtTime(1, audioContext.currentTime);
    });

    function getPrecision() {
        return Math.abs(angleIncrement.e) + DECIMAL_PRECISION_PADDING;
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

    function generateTemplates() {
        const generator = create(getSeedFromDate(selectedDate));

        // Generate 5 different positive magnet starting positions (one for each shot)
        positivesTemplate = [];
        const sideLength = canvas.width + MAGNET_RADIUS * 4;

        for (let i = 0; i < NUM_SHOTS; i++) {
            const position = generator.random() * sideLength * 4;
            const color = {
                startColor: `hsl(${generator.random() * 360}, 100%, 50%)`,
                endColor: `hsl(${generator.random() * 360}, 100%, 50%)`,
            };

            let positiveTemplate: Positive;
            if (position < sideLength) {
                positiveTemplate = {...color, x: new Decimal(position - MAGNET_RADIUS * 2), y: new Decimal(-MAGNET_RADIUS * 2)};
            } else if (position < sideLength * 2) {
                positiveTemplate = {
                    ...color,
                    x: new Decimal(canvas.width + MAGNET_RADIUS * 2),
                    y: new Decimal(position - sideLength - MAGNET_RADIUS * 2),
                };
            } else if (position < sideLength * 3) {
                positiveTemplate = {
                    ...color,
                    x: new Decimal(canvas.width - (position - sideLength * 2 - MAGNET_RADIUS * 2)),
                    y: new Decimal(canvas.height + MAGNET_RADIUS * 2),
                };
            } else {
                positiveTemplate = {
                    ...color,
                    x: new Decimal(-MAGNET_RADIUS * 2),
                    y: new Decimal(canvas.height - (position - sideLength * 3 - MAGNET_RADIUS * 2)),
                };
            }
            positivesTemplate.push(positiveTemplate);
        }

        // Generate all negative magnets templates (one for each shot)
        negativesTemplate = [];
        const existingPositions: {x: number; y: number}[] = [{x: canvas.width / 2, y: canvas.height / 2}];

        for (let i = 0; i < NUM_SHOTS; i++) {
            let attempts = 0;
            while (attempts < 1000) {
                const candidate = {
                    x: generator.random() * (canvas.width - NEGATIVE_PADDING * 2) + NEGATIVE_PADDING,
                    y: generator.random() * (canvas.height - NEGATIVE_PADDING * 2) + NEGATIVE_PADDING,
                };

                if (!existingPositions.some(other => distance(other.x, other.y, candidate.x, candidate.y) < NEGATIVE_MIN_DISTANCE)) {
                    negativesTemplate.push(candidate);
                    existingPositions.push(candidate);
                    break;
                }
                attempts++;
            }
        }
    }

    function howToPlay() {
        clickAudio.play();

        setOverlay(`
            <div class="center" style="display: flex; flex-direction: column; gap: 25px; color: black; text-align: center">
                <h1>How to Play Drawn Together</h1>
                <ol style="text-align: left; width: 500px; margin: 0 auto; line-height: 1.5">
                    <li>Each round, you launch a positive magnet from the edge of the screen that leaves a permanent trail.</li>
                    <li>Click/tap and drag left and right, or click the "<" and ">" buttons to adjust the angle of the shot.</li>
                    <li>You can adjust the granularity of the angle controls to achieve infinitely precise shots.</li>
                    <li>Negative magnets on the screen will attract your positive magnet.</li>
                    <li>You get ${NUM_SHOTS} shots (magnets) per game.</li>
                    <li>After each shot, a new negative magnet is randomly added to the board.</li>
                    <li>At the end of the game, your score is the percentage of the screen you have covered.</li>
                </ol>
                <button id="september-back-button" class="dark">BACK</button>
            </div>
        `);

        (document.getElementById('september-back-button') as HTMLButtonElement).addEventListener('click', () => {
            clickAudio.play();
            mainMenu();
        });
    }

    function mainMenu() {
        backgroundContext.clearRect(0, 0, canvas.width, canvas.height);
        trajectoryContext.clearRect(0, 0, canvas.width, canvas.height);
        negatives = [];

        context.fillStyle = `rgb(${BACKGROUND_COLOR.join(',')})`;
        context.fillRect(0, 0, canvas.width, canvas.height);

        gameState = 'mainMenu';
        setOverlay(`
            <div class="center" style="display: flex; flex-direction: column; gap: 10px">
                <img src="${logo}" alt="Drawn Together" />
                <div style="display: flex; gap: 10px">
                    <button id="september-prev-button" class="dark">Prev</button>
                    <input type="date" min="${getDateString(MIN_DATE)}" style="background-color: var(--ui-black); color: var(--ui-white); color-scheme: dark">
                    <button id="september-next-button" class="dark">Next</button>
                </div>
                <span style="color: black"><strong>Best score</strong>: <span id="september-best-score">-</span></span>
                <button id="september-play-button" class="dark">PLAY</button>
                <button id="september-how-to-play-button" class="dark">HOW TO PLAY</button>
                <button id="september-music-credits-button" class="link" style="color: var(--ui-black)">Drawn Together Music Credits</button>
            </div>
        `);

        const inputElement = document.querySelector('input') as HTMLInputElement;
        const prevButton = document.getElementById('september-prev-button') as HTMLButtonElement;
        const nextButton = document.getElementById('september-next-button') as HTMLButtonElement;
        const playButton = document.getElementById('september-play-button') as HTMLButtonElement;
        const howToPlayButton = document.getElementById('september-how-to-play-button') as HTMLButtonElement;
        const bestScoreSpan = document.getElementById('september-best-score') as HTMLSpanElement;

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
            generateTemplates();
            const bestScore = storage.get(`bestScore-${getDateString(date)}`);
            bestScoreSpan.textContent = bestScore !== undefined ? `${bestScore.toFixed(2)}%` : '-';
        }

        inputElement.addEventListener('change', () => {
            clickAudio.play();
            onDateChange();
        });

        prevButton.addEventListener('click', () => {
            clickAudio.play();
            const date = new Date(inputElement.value);
            date.setUTCDate(date.getUTCDate() - 1);
            onDateChange(date);
        });

        nextButton.addEventListener('click', () => {
            clickAudio.play();
            const date = new Date(inputElement.value);
            date.setUTCDate(date.getUTCDate() + 1);
            onDateChange(date);
        });

        playButton.addEventListener('click', () => {
            clickAudio.play();
            setupGame();
        });

        howToPlayButton.addEventListener('click', howToPlay);

        document.getElementById('september-music-credits-button')!.addEventListener('click', () => {
            clickAudio.play();
            setOverlay(`
                <div class="center" style="display: flex; flex-direction: column; gap: 25px; color: black">
                    <h1 style="width: 100%; text-align: center">Drawn Together Music Credits</h1>
                    <span><a href="https://instagram.com/arieschtruth" target="_blank">Ari Eschtruth</a> - Composer, Producer</span>
                    <span><a href="https://instagram.com/alex_golden_sax" target="_blank">Alex Golden</a> - Tenor Saxophone</span>
                    <button id="september-back-button" class="dark">BACK</button>
                </div>
            `);

            (document.getElementById('september-back-button') as HTMLButtonElement).addEventListener('click', () => {
                clickAudio.play();
                mainMenu();
            });
        });

        onDateChange();
    }

    function setGameOver() {
        gameState = 'gameOver';
        const finalScore = scores.reduce((a, b) => a + b, 0);
        const scoreBreakdown = scores.map((score, index) => `Shot ${index + 1}: +${score.toFixed(2)}%`);

        let newBest = false;
        if (finalScore > (storage.get(`bestScore-${getDateString(selectedDate)}`) ?? -1)) {
            storage.set(`bestScore-${getDateString(selectedDate)}`, finalScore);
            newBest = true;
        }

        context.drawImage(background, 0, 0);

        setOverlay(`
            <div class="center" style="display: flex; flex-direction: column; gap: 5px; color: white; background: radial-gradient(black, transparent)">
                <h1>GAME OVER</h1>
                <p><strong>${getHumanReadableDateString(selectedDate)}</strong></p>
                <p>${scoreBreakdown.join('</p><p>')}</p>
                <p><strong>Final score</strong>: ${finalScore.toFixed(2)}%</p>
                <p><strong>${newBest ? '[NEW] ' : ''}Best score for this day</strong>: ${(storage.get(`bestScore-${getDateString(selectedDate)}`) ?? 0).toFixed(2)}%</p>
                <div style="display: flex; gap: 5px">
                    <button id="september-menu-button" class="light">MENU</button>
                    <button id="september-restart-button" class="light">RESTART</button>
                    <button id="september-share-button" class="light">SHARE</button>
                </div>
                <button id="september-download-button" class="light">DOWNLOAD IMAGE</button>
            </div>
        `);

        document.getElementById('september-menu-button')!.addEventListener('click', () => {
            clickAudio.play();
            mainMenu();
        });

        document.getElementById('september-restart-button')!.addEventListener('click', () => {
            clickAudio.play();
            setupGame();
        });

        document.getElementById('september-share-button')!.addEventListener('click', () => {
            clickAudio.play();
            navigator.clipboard
                .writeText(
                    `🧲 Drawn Together ${getHumanReadableDateString(selectedDate)}\n\n${scoreBreakdown.join('\n')}\n\nFinal score: ${finalScore.toFixed(2)}%`,
                )
                .then(() => {
                    const shareButton = document.getElementById('september-share-button')!;
                    shareButton.textContent = 'COPIED!';
                    setTimeout(() => (shareButton.textContent = 'SHARE'), 1000);
                });
        });

        document.getElementById('september-download-button')!.addEventListener('click', () => {
            clickAudio.play();
            const a = document.createElement('a');
            a.download = `drawn_together_${getDateString(selectedDate)}.png`;
            a.href = background.toDataURL('image/png');
            a.click();
        });
    }

    function setupGame() {
        gameState = 'animating';
        animationStartTime = performance.now();
        scores = [];
        negatives = [negativesTemplate[0]];
        positive = {...positivesTemplate[0]};
        backgroundContext.fillStyle = `rgb(${BACKGROUND_COLOR.join(',')})`;
        backgroundContext.fillRect(0, 0, canvas.width, canvas.height);
        setAngle('center');

        setOverlay(`
            <div class="center" style="display: flex; flex-direction: column; gap: 15px; color: var(--ui-black)">
                <div style="display: none; align-items: center; gap: 5px" class="september-hide">
                    <span>Granularity:</span>
                    <button id="september-granularity-minus" class="dark">-</button>
                    <span id="september-granularity-value" style="width: 50px; text-align: center"></span>
                    <button id="september-granularity-plus" class="dark">+</button>
                </div>
                <span id="september-angle-value" style="display: none; font-size: 24px"></span>
                <div style="display: none; align-items: center; gap: 25px" class="september-hide">
                    <button id="september-angle-minus" class="dark">&lt;</button>
                    <button id="september-launch-button" class="dark">LAUNCH</button>
                    <button id="september-angle-plus" class="dark">&gt;</button>
                </div>
                <span class="september-hide"><span>Shot <span id="september-shot-count">1</span>/${NUM_SHOTS}</span></span>
            </div>
        `);

        [
            {id: 'september-angle-minus', callback: () => adjustAngle(-1)},
            {id: 'september-launch-button', callback: () => launch()},
            {id: 'september-angle-plus', callback: () => adjustAngle(1)},
            {id: 'september-granularity-minus', callback: () => adjustIncrement(10)},
            {id: 'september-granularity-plus', callback: () => adjustIncrement(0.1)},
        ].forEach(({id, callback}) => {
            document.getElementById(id)!.addEventListener('click', () => {
                clickAudio.play();
                callback();
            });
        });

        updateAngleDisplay();
        adjustIncrement(0.1);
    }

    function hideUi() {
        document
            .querySelectorAll('.september-hide')
            .forEach(element => ((element as HTMLDivElement).style.display = 'none'));
    }

    function showUi() {
        document.getElementById('september-angle-value')!.style.display = 'unset';
        document
            .querySelectorAll('.september-hide')
            .forEach(element => ((element as HTMLDivElement).style.display = 'flex'));
    }

    function setAngle(newAngle: Decimal | 'center') {
        if (newAngle === 'center') {
            newAngle = Decimal.atan2(CENTER.y.minus(positive.y), CENTER.x.minus(positive.x));
            if (newAngle.gt(PI.mul(2))) newAngle = newAngle.sub(PI.mul(2));
            if (newAngle.lt(0)) newAngle = newAngle.plus(PI.mul(2));
        }
        if (angle.eq(newAngle)) return;
        worker.postMessage({
            month: 'september',
            data: {
                type: 'angle',
                angle: newAngle.toPrecision(),
                negatives,
                start: {x: positive.x.toPrecision(), y: positive.y.toPrecision()},
                precision: getPrecision(),
            },
        });

        angle = newAngle;

        const min = (() => {
            if (positive.y.lte(0) && positive.x.lte(canvas.width)) return new Decimal(0);
            if (positive.x.gte(canvas.width) && positive.y.lte(canvas.height)) return PI.div(2);
            if (positive.y.gte(canvas.height) && positive.x.gte(0)) return PI;
            return PI.mul(1.5);
        })();

        const max = (() => {
            if (positive.y.gte(canvas.height) && positive.x.lte(canvas.width)) return PI.mul(2);
            if (positive.x.lte(0) && positive.y.lte(canvas.height)) return PI.div(2);
            if (positive.y.lte(0) && positive.x.gte(0)) return PI;
            return PI.mul(1.5);
        })();

        if (min < max) {
            if (angle.lt(min)) angle = max;
            if (angle.gt(max)) angle = min;
        } else {
            const oppositeAngle = angle.gt(PI) ? angle.sub(PI) : angle.plus(PI);
            if (oppositeAngle.lt(max)) angle = max;
            if (oppositeAngle.gt(min)) angle = min;
        }
        if (angle.gt(PI.mul(2))) angle = angle.sub(PI.mul(2));
        if (angle.lt(0)) angle = angle.plus(PI.mul(2));
        updateAngleDisplay();
    }

    function updateAngleDisplay() {
        const angleValueElement = document.getElementById('september-angle-value');
        if (angleValueElement) {
            angleValueElement.textContent = `${angle
                .mul(180)
                .div(PI)
                .toPrecision(Math.abs(angleIncrement.e) + 3)}°`;
        }
    }

    function adjustAngle(amount: number) {
        setAngle(angle.plus(angleIncrement.times(amount)));
    }

    function adjustIncrement(factor: number) {
        angleIncrement = angleIncrement.times(factor);
        if (angleIncrement.gt(0.1)) angleIncrement = new Decimal(0.1);
        Decimal.config({precision: getPrecision()});
        document.getElementById('september-granularity-value')!.textContent = Math.abs(angleIncrement.e).toString();
    }

    function launch() {
        positive.angle = angle;
        trajectoryContext.clearRect(0, 0, canvas.width, canvas.height);
        document.getElementById('september-angle-value')!.style.display = 'none';
        hideUi();
    }

    function nextShot() {
        const imageData = backgroundContext.getImageData(0, 0, canvas.width, canvas.height);
        worker.postMessage(
            {month: 'september', data: {type: 'score', imageData: imageData.data, backgroundColor: BACKGROUND_COLOR}},
            [imageData.data.buffer],
        );
        context.fillStyle = UI_BLACK;
        context.fillRect(canvas.width / 2 - 65, canvas.height / 2 - 20, 130, 40);
        context.fillStyle = UI_WHITE;
        context.fillText('CALCULATING', canvas.width / 2, canvas.height / 2);
        gameState = 'calculating';
    }

    function createGradient(x: number, y: number, color1: string, color2: string) {
        const gradient = backgroundContext.createLinearGradient(
            x - MAGNET_PICKUP_RADIUS,
            y - MAGNET_PICKUP_RADIUS,
            x + MAGNET_PICKUP_RADIUS,
            y + MAGNET_PICKUP_RADIUS,
        );
        gradient.addColorStop(0, color1);
        gradient.addColorStop(1, color2);
        return gradient;
    }

    function update() {
        if (gameState !== 'playing') return;

        if (positive.angle === undefined) return;

        const turn = calculateTurn(positive, negatives);
        if (turn === 'hit magnet') {
            nextShot();
            return;
        }
        positive.angle = positive.angle.plus(turn);

        positive.x = positive.x.plus(positive.angle.cos().times(MAGNET_SPEED));
        positive.y = positive.y.plus(positive.angle.sin().times(MAGNET_SPEED));

        const x = positive.x.toNumber();
        const y = positive.y.toNumber();
        backgroundContext.fillStyle = createGradient(x, y, positive.startColor, positive.endColor);
        backgroundContext.beginPath();
        backgroundContext.arc(x, y, MAGNET_PICKUP_RADIUS, 0, Math.PI * 2);
        backgroundContext.fill();

        if (outOfBounds(positive)) {
            nextShot();
            return;
        }
    }

    function draw() {
        context.drawImage(background, 0, 0);

        if (positive.angle === undefined) {
            context.globalAlpha = 0.5;
            context.fillStyle = 'white';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.globalAlpha = 1;
        }

        for (const [index, magnet] of negatives.entries()) {
            let radius = MAGNET_RADIUS;
            if (gameState === 'animating' && index === negatives.length - 1) {
                const progress = (performance.now() - animationStartTime) / ANIMATION_DURATION;
                if (progress >= 1) {
                    gameState = 'playing';
                    setAngle('center');
                    showUi();
                }

                radius = progress >= 0.5 ? radius + (1 - progress) * ANIMATION_NEGATIVE_RADIUS : 0;

                if (scores.length >= 1) {
                    context.globalAlpha = 1;
                    context.fillStyle = UI_BLACK;
                    context.font = `bold 48px ${FONT}`;
                    context.fillText(`+${scores.at(-1)?.toFixed(2)}%`, canvas.width / 2, canvas.height / 2);
                    context.font = `bold 16px ${FONT}`;
                }

                context.globalAlpha = (progress - 0.5) * 2;
            }

            context.fillStyle = NEGATIVE_MAGNET_COLOR;
            context.beginPath();
            context.arc(magnet.x, magnet.y, radius, 0, Math.PI * 2);
            context.fill();

            context.fillStyle = 'white';
            context.fillText('-', magnet.x, magnet.y);
        }

        context.globalAlpha = 1;

        if (gameState !== 'playing') return;

        context.drawImage(trajectory, 0, 0);

        if (gameState === 'playing') {
            const x = positive.x.toNumber();
            const y = positive.y.toNumber();

            context.fillStyle = 'white';
            context.fillText('+', x, y);

            if (positive.angle === undefined) {
                context.strokeStyle = CANON_COLOR;
                context.lineWidth = CANON_WIDTH;
                context.beginPath();
                context.moveTo(x, y);
                context.lineTo(x + angle.cos().toNumber() * CANON_LENGTH, y + angle.sin().toNumber() * CANON_LENGTH);
                context.stroke();
            }
        }
    }

    function gameLoop(time: number) {
        if (done) return;
        if (time - lastUpdate > UPDATE_INTERVAL) {
            update();
            lastUpdate = time;
        }
        draw();
        requestAnimationFrame(gameLoop);
    }

    function adjustCoordinates(event: PointerEvent) {
        return {x: event.offsetX / canvasScale, y: event.offsetY / canvasScale};
    }

    function receiveWorkerMessage(
        event: ResponseEvent<
            {type: 'clear'} | {type: 'position'; x: number; y: number} | {type: 'score'; score: number}
        >,
    ) {
        const {month, data} = event.data;
        if (month !== 'september') return;

        if (data.type === 'clear') {
            trajectoryContext.globalAlpha = 1;
            trajectoryContext.clearRect(0, 0, canvas.width, canvas.height);
            simulationData = {step: 0, lastX: positive.x.toNumber(), lastY: positive.y.toNumber()};
            return;
        }

        if (data.type === 'position') {
            if (gameState !== 'playing' || positive.angle !== undefined) return;

            const {x, y} = data;

            trajectoryContext.globalAlpha = 1 - simulationData.step / MAX_SIMULATION_STEPS;

            trajectoryContext.beginPath();
            trajectoryContext.moveTo(simulationData.lastX, simulationData.lastY);

            trajectoryContext.lineTo(x, y);
            trajectoryContext.stroke();

            simulationData.lastX = x;
            simulationData.lastY = y;

            ++simulationData.step;
            return;
        }

        scores.push(data.score - scores.reduce((a, b) => a + b, 0));
        if (scores.length === NUM_SHOTS) {
            setGameOver();
            return;
        }
        negatives.push(negativesTemplate[scores.length]);
        positive = {...positivesTemplate[scores.length]};
        gameState = 'animating';
        animationStartTime = performance.now();
        angleIncrement = new Decimal(0.01);
        adjustIncrement(1);
        document.getElementById('september-shot-count')!.textContent = (scores.length + 1).toString();
    }

    function onPointerDown(event: PointerEvent) {
        if (
            gameState !== 'playing' ||
            positive.angle !== undefined ||
            (event.target as HTMLElement).closest('button')
        ) {
            return;
        }

        lastPointerX = adjustCoordinates(event).x;
        hideUi();
    }

    function onPointerMove(event: PointerEvent) {
        if (gameState !== 'playing' || positive.angle !== undefined || lastPointerX === undefined) {
            lastPointerX = undefined;
            return;
        }
        const {x} = adjustCoordinates(event);
        adjustAngle(x - lastPointerX!);
        lastPointerX = x;
    }

    function onPointerUp() {
        if (lastPointerX !== undefined) {
            lastPointerX = undefined;
            showUi();
        }
    }

    function onKeyDown(event: KeyboardEvent) {
        if (gameState !== 'playing' || positive.angle !== undefined) return;

        switch (event.key) {
            case 'ArrowLeft':
                clickAudio.play();
                adjustAngle(-1);
                break;
            case 'ArrowRight':
                clickAudio.play();
                adjustAngle(1);
                break;
            case '-':
            case '_':
                clickAudio.play();
                adjustIncrement(10);
                break;
            case '+':
            case '=':
                clickAudio.play();
                adjustIncrement(0.1);
                break;
            case ' ':
                clickAudio.play();
                launch();
                break;
        }
    }

    function resize() {
        const {width} = canvas.getBoundingClientRect();
        canvasScale = width / canvas.width;
    }

    context.font = `bold 16px ${FONT}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    resize();
    mainMenu();
    requestAnimationFrame(gameLoop);

    function onBlur() {
        if (done) return;
        audioContext.suspend();
    }

    function onFocus() {
        if (done) return;
        audioContext.resume();
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('resize', resize);
    worker.addEventListener('message', receiveWorkerMessage);
    return () => {
        done = true;
        introSource?.source.stop();
        loopSource?.source.stop();
        worker.removeEventListener('message', receiveWorkerMessage);
        document.removeEventListener('pointerdown', onPointerDown);
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);
        document.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('resize', resize);
        window.removeEventListener('blur', onBlur);
        window.removeEventListener('focus', onFocus);
    };
}

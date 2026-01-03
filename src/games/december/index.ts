import {canvas, context, setOverlay} from '../../dom.ts';
import {audioContext, downloadAndDecode, musicGain} from '../../audio.ts';
import {FONT, UI_BLACK, UI_WHITE} from '../../shared/style.ts';
import {choice, setupBufferSource} from '../../util.ts';
import {setupStorage} from '../../shared/storage.ts';
import kornivore from './music/kornivore.ogg';
import cascade from './music/cascade.ogg';
import brickBop from './music/brickbop.ogg';
import wormhole from './music/wormhole.ogg';
import logo from './logo.webp';

type Note = [number, number];

interface Particle {
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
}

interface TutorialText {
    text: string;
    key?: number;
}

interface Track {
    name: string;
    difficulty: '-' | 'easy' | 'medium' | 'hard';
    song: string;
    color: string;
    accent: string;
    dark: boolean;
    notes: Note[];
    tutorialTexts?: Record<number, TutorialText>;
}

interface PlayState {
    track: Track;
    trackIndex: number;
    noteWidth: number;
    startTime: number;
    score: number;
    hitNotes: Set<number>;
    missedNotes: Set<number>;
    combo: number;
    maxCombo: number;
    timingCounts: Record<string, number>;
    multiplierCounts: Record<number, number>;
    lastSuccessfulKey: number | null;
    particles: Particle[];
    paused: boolean;
    lastPhysicsTime: number;
    physicsAccumulator: number;
    gameEndTime?: number;
    offscreenIndex?: number;
    last?: {
        key: number;
        index: number;
    };
    tutorial?: {
        noteIndex: number;
        inputAllowedTime: number;
        key?: number;
    };
    lastTextUpdateTime?: number;
}

export function december() {
    const BACKGROUND_COLOR = '#2e0030';
    const MISSED_NOTE_COLOR = '#ff0000';
    const PRESSED_KEY_COLOR = '#00ff0033';

    const GAME_NAME = 'Groovy Keys';
    const GRAVITY = 0.05;
    const KEY_MULTIPLIERS = [1, 1.25, 1.5, 2, 1.5, 1.25, 1];
    const KEY_PRESS_DURATION = 0.1;
    const MAX_PARTICLE_VELOCITY = 5;
    const NOTE_HEIGHT = 25;
    const PARTICLE_SIZE = 4;
    const PLAY_LINE_Y = 400;
    const RESULTS_DELAY = 2;
    const SCROLL_SPEED_DEFAULT = 100;
    const SCROLL_SPEED_MAX = 300;
    const SCROLL_SPEED_MIN = 25;
    const TEXT_CLEAR_TIME = 1;
    const TIME_STEP = (1 / 120) * 1000;
    const TIMINGS = [0.2, 0.16, 0.12, 0.08, 0.04];
    const TIMING_MULTIPLIERS = [2, 4, 6, 8, 10];
    const TIMING_NAMES = ['Okay', 'Good', 'Great', 'Amazing', 'Perfect'];
    const TUTORIAL_INPUT_DELAY = 500;

    const REVERSED_TIMINGS = TIMINGS.slice().reverse();

    const TRACKS: Track[] = [
        {
            name: 'Tutorial',
            difficulty: '-',
            song: wormhole,
            color: BACKGROUND_COLOR,
            accent: 'white',
            dark: false,
            // prettier-ignore
            notes: [[3.87096, 1], [7.74192, 2], [11.61288, 1], [15.48384, 1], [19.3548, 2], [23.22576, 2], [27.58059, 0], [28.54833, 0], [29.99994, 2], [30.74994, 1], [35.32251, 0], [35.80638, 1], [36.29025, 0], [37.25799, 1], [37.74186, 2], [38.22573, 1], [38.49186, 0]],
            tutorialTexts: {
                0: {
                    text: 'When a note is between the play lines, press any key to play it. For this tutorial, press 4.',
                    key: 4,
                },
                1: {
                    text: 'The next note is to the right of the previous note, so the next key you press must be to the right of the last key you pressed. In this case, 5, 6, and 7 are valid since they are to the right of 4.',
                },
                2: {
                    text: 'The next note is to the left of the previous note, so the next key you press must be to the left of the last key you pressed.',
                },
                3: {
                    text: 'The next note is the same as the previous note, so the next key you press must be the same as the last key you pressed.',
                },
                4: {
                    text: 'Each key multiplies your score by the specified amount. Keys towards the center (4) are worth the most points. Try to avoid playing keys on the edge (1 and 7) as much as possible.',
                },
                5: {
                    text: 'Your score is also determined by how close to the center of the play line the notes are played. The tutorial will no longer pause. Try playing the following melody!',
                },
            },
        },

        // prettier-ignore
        {name: 'Cascade', difficulty: 'easy', song: cascade, color: '#282c34', accent: '#dddddd', dark: false, notes: [[5.9295, 5], [6.339, 9], [6.669, 10], [7.0605, 12], [12.351, 9], [12.7215, 10], [13.071, 12], [17.9175, 5], [18.291, 9], [18.6675, 10], [19.0725, 12], [20.562, 11], [22.083, 10], [24.3, 9], [24.639, 10], [25.032, 12], [29.6625, 10], [31.9125, 6], [33.4125, 9], [34.9125, 8], [35.6625, 5], [41.6625, 10], [43.9125, 7], [45.4125, 6], [46.9125, 9], [47.6625, 5], [53.6625, 10], [55.9125, 6], [57.4125, 9], [58.9125, 8], [59.6625, 5], [66.0, 10], [67.9125, 7], [69.4125, 6], [70.9125, 9], [71.6625, 5], [73.875, 4], [75.4125, 3], [76.9125, 1], [77.6625, 2], [78.4125, 0]]},
        // prettier-ignore
        {name: 'Brick Bop', difficulty: 'medium', song: brickBop, color: '#eee', accent: '#3f6000', dark: true, notes: [[3.231, 0], [3.608, 0], [6.252, 2], [6.43, 3], [6.628, 2], [6.838, 0], [9.691, 0], [10.094, 0], [12.359, 2], [12.755, 2], [12.966, 3], [13.151, 2], [13.346, 0], [17.008, 2], [18.812, 3], [19.233, 4], [19.663, 0], [20.07, 2], [21.671, 1], [23.313, 0], [25.336, 3], [25.716, 2], [26.1, 0], [30.042, 5], [31.844, 8], [32.242, 6], [32.628, 4], [33.058, 5], [33.45, 2], [33.841, 0], [34.684, 1], [36.242, 2], [38.25, 3], [38.656, 2], [38.897, 3], [39.071, 2], [39.312, 0], [42.171, 6], [42.534, 8], [44.402, 9], [45.371, 6], [45.751, 8], [47.574, 7], [48.603, 6], [48.997, 8], [50.805, 9], [51.84, 6], [52.236, 8], [54.048, 7], [55.098, 6], [55.49, 8], [57.379, 9], [57.976, 9], [58.374, 6], [58.741, 8], [60.588, 7], [61.175, 7], [61.559, 6], [61.948, 8], [63.8, 9], [64.47, 9], [64.818, 6], [65.197, 8], [67.029, 7], [67.647, 7], [68.175, 13], [70.322, 15], [71.301, 13], [73.575, 12], [74.539, 10], [76.831, 11], [77.803, 8], [79.642, 10], [80.074, 11], [80.499, 15], [80.852, 13], [83.3, 15], [84.283, 13], [86.589, 12], [87.522, 10], [89.819, 11], [90.805, 8], [92.569, 10], [92.985, 11], [93.485, 14], [93.825, 13]]},
        // prettier-ignore
        {name: 'Kornivore', difficulty: 'hard', song: kornivore, color: '#0a3209', accent: '#d5b803', dark: false, notes: [[7.92682, 2], [8.30125, 5], [8.51391, 6], [8.8739, 8], [9.45416, 2], [9.85365, 4], [10.04504, 6], [10.42175, 2], [14.0301, 2], [14.41516, 5], [14.62933, 6], [15.02883, 8], [15.58174, 2], [15.92503, 4], [16.12477, 6], [16.51743, 2], [18.05312, 2], [20.07489, 3], [20.4478, 6], [20.68856, 8], [21.12679, 9], [21.41464, 8], [21.57565, 6], [21.79894, 8], [23.07868, 4], [23.29666, 2], [23.45691, 4], [23.7364, 6], [24.09564, 7], [24.48071, 6], [24.62501, 4], [24.8802, 6], [25.27286, 1], [26.08931, 2], [26.51083, 4], [26.76222, 2], [27.12298, 7], [27.46247, 11], [27.55665, 7], [27.7488, 6], [27.93791, 4], [28.12551, 6], [28.31766, 4], [28.50905, 2], [28.70652, 0], [28.89259, 2], [29.2488, 2], [29.64297, 0], [29.84955, 0], [30.21411, 2], [32.16373, 8], [32.61411, 12], [32.84347, 13], [33.23841, 14], [33.81106, 12], [34.16195, 13], [34.39284, 14], [34.73385, 15], [35.25562, 14], [35.54802, 13], [35.68017, 14], [35.88296, 13], [36.0341, 11], [36.2665, 10], [38.39536, 9], [38.58371, 8], [38.70371, 9], [38.93764, 11], [39.32726, 13], [39.79055, 9], [40.04498, 6], [40.80447, 11], [41.35586, 11], [41.72193, 11], [41.9475, 9], [42.07889, 11], [42.31965, 12], [44.44016, 2], [44.81307, 5], [45.03636, 6], [45.40623, 8], [45.95003, 2], [46.30167, 4], [46.51053, 6], [46.87357, 2], [48.36901, 6], [48.52015, 9], [48.75559, 8], [48.91888, 6], [49.14369, 8], [49.51736, 1], [50.4166, 2], [50.88596, 4], [51.14571, 2], [51.53153, 6], [51.90368, 2], [52.07077, 4], [52.31988, 2], [52.46723, 7], [52.70039, 8], [52.8333, 11], [53.06798, 12], [53.21001, 13], [53.62773, 13], [54.00975, 11], [54.25203, 11], [54.5976, 13]]},
    ];

    const storage = setupStorage('december');

    let done = false;
    let state: PlayState | null = null;
    let musicSource: ReturnType<typeof setupBufferSource> | undefined;
    let scrollSpeed = storage.get('scrollSpeed') ?? SCROLL_SPEED_DEFAULT;

    function mainMenu() {
        if (state !== null) state = null;

        downloadAndDecode(choice(TRACKS).song).then(buffer => {
            musicSource = setupBufferSource(buffer);
            musicSource.gain.gain.setValueAtTime(1, audioContext.currentTime);
        });

        audioContext.resume();
        stopTrack();

        context.fillStyle = BACKGROUND_COLOR;
        context.fillRect(0, 0, canvas.width, canvas.height);

        setOverlay(`
            <div class="center" style="display: flex; flex-direction: column; gap: 10px">
                <img src="${logo}" alt="${GAME_NAME}" />
                <p>Choose a track to play</p>
                <table id="december-tracks" style="background-color: #000000aa; border-radius: 10px">
                    <tr>
                        <th style="padding: 5px"><h2>Track</h2></th>
                        <th style="padding: 5px"><h2>Difficulty</h2></th>
                        <th style="padding: 5px"><h2>Personal best</h2></th>
                        <th style="padding: 5px"><h2>Play</h2></th>
                    </tr>
                    ${TRACKS.map(track => {
                        const bestScore = storage.get(`bestScore_${track.name}`) ?? 0;
                        return `
                            <tr>
                                <td style="padding: 5px">${track.name}</td>
                                <td style="padding: 5px">${track.difficulty}</td>
                                <td style="padding: 5px">${track.name === 'Tutorial' ? '-' : bestScore}</td>
                                <td style="padding: 5px"><button>Play</button></td>
                            </tr>
                        `;
                    }).join('')}
                </table>
                <p>More tracks coming soon!</p>
                <table>
                    <tr>
                        <td>Music volume</td>
                        <td><input id="december-volume-slider" type="range" min="0" max="1" step="0.05" value="${localStorage.getItem('music-volume') ?? '0.75'}" /></td>
                    </tr>
                    <tr>
                        <td>Scroll speed</td>
                        <td style="display: flex; align-items: center; gap: 10px"><input id="december-speed-slider" type="range" min="${SCROLL_SPEED_MIN}" max="${SCROLL_SPEED_MAX}" step="5" value="${scrollSpeed}" /><span id="december-speed-value" style="width: 50px">${scrollSpeed}</span></td>
                    </tr>
                </table>
            </div>
        `);

        document.querySelectorAll('#december-tracks button').forEach((button, index) => {
            button.addEventListener('click', () => {
                loadTrack(index);
            });
        });

        const volumeSlider = document.getElementById('december-volume-slider') as HTMLInputElement;
        volumeSlider.addEventListener('input', () => {
            musicGain.gain.setValueAtTime(+volumeSlider.value, audioContext.currentTime);
            localStorage.setItem('music-volume', volumeSlider.value);
        });

        const speedSlider = document.getElementById('december-speed-slider') as HTMLInputElement;
        const speedValueSpan = document.getElementById('december-speed-value') as HTMLSpanElement;
        speedSlider.addEventListener('input', () => {
            scrollSpeed = +speedSlider.value;
            speedValueSpan.textContent = scrollSpeed.toString();
            storage.set('scrollSpeed', scrollSpeed);
        });
    }

    function calculateNoteWidth(index: number) {
        const pitches = TRACKS[index].notes.map(note => note[1]);
        return canvas.width / (Math.max(...pitches) - Math.min(...pitches) + 1);
    }

    function stopTrack() {
        if (musicSource) {
            musicSource.source.stop();
            musicSource = undefined;
        }
    }

    function setGameOverlay(initialText?: string) {
        if (state === null) return;

        setOverlay(`
            <div style="padding: 5px; display: flex; flex-direction: column; gap: 5px">
                <button id="december-pause-button" ${state.track.dark ? 'class="dark"' : ''} style="width: 100px">MENU</button>
                <span ${state.track.dark ? `style="color: ${UI_BLACK}"` : ''}>${state.track.name}</span>
                <span ${state.track.dark ? `style="color: ${UI_BLACK}"` : ''}>Score: <span id="december-score-span">${state.score}</span></span>
            </div>
            <span id="december-text" style="font-size: 24px; color: ${state!.track.dark ? UI_BLACK : UI_WHITE}; position: absolute; top: 50%; transform: translateY(-50%); padding: 20px; text-align: center; width: calc(100% - 40px)">${initialText ?? (state.tutorial ? state.track.tutorialTexts?.[state.tutorial.noteIndex]?.text : '')}</span>
            <div id="december-keys" style="position: absolute; bottom: 0; display: flex; gap: 5px; width: calc(100% - 10px); padding: 5px; background: ${state.track.color}">
                ${KEY_MULTIPLIERS.map(
                    (multiplier, index) => `
                        <button style="flex: 1; height: 100px; border: 2px solid ${state!.track.dark ? UI_BLACK : UI_WHITE}; display: flex; flex-direction: column; gap: 0; line-height: 1; justify-content: center; ${
                            state!.lastSuccessfulKey === index + 1 ? `background-color: ${PRESSED_KEY_COLOR}` : ''
                        }" ${state!.track.dark ? 'class="dark"' : ''}>
                            <span style="font-size: 32px">${index + 1}</span>
                            <span>x${multiplier}</span>
                        </button>
                    `,
                ).join('')}
            </div>
        `);

        document.querySelectorAll('#december-keys > button').forEach((button, index) => {
            button.addEventListener('pointerdown', event => {
                event.preventDefault();
                pressKey(index + 1);
            });
        });

        document.getElementById('december-pause-button')!.addEventListener('click', pauseGame);

        if (state.tutorial) {
            const tutorial = state.track.tutorialTexts?.[state.tutorial.noteIndex];
            if (tutorial) {
                document.getElementById('december-text')!.textContent = tutorial.text;
                const buttons = document.querySelectorAll<HTMLElement>('#december-keys > button');
                buttons.forEach((button, key) => {
                    if (
                        (tutorial.key !== undefined && tutorial.key !== key + 1) ||
                        !validKey(key + 1, state!.tutorial!.noteIndex)
                    ) {
                        button.setAttribute('disabled', 'true');
                    }
                });
            }
        }
    }

    function pauseGame() {
        audioContext.suspend();

        if (state === null || state.gameEndTime !== undefined) return;

        context.fillStyle = state.track.color;
        context.fillRect(0, 0, canvas.width, canvas.height);

        state.paused = true;

        setOverlay(`
            <div class="center" style="display: flex; flex-direction: column; gap: 20px">
                <h1 ${state.track.dark ? `style="color: ${UI_BLACK}"` : ''}>PAUSED</h1>
                <button id="december-resume-button" ${state.track.dark ? 'class="dark"' : ''}>RESUME</button>
                <button id="december-restart-button" ${state.track.dark ? 'class="dark"' : ''}>RESTART TRACK</button>
                <button id="december-main-menu-button" ${state.track.dark ? 'class="dark"' : ''}>MAIN MENU</button>
            </div>
        `);

        document.getElementById('december-resume-button')!.addEventListener('click', resumeGame);
        document
            .getElementById('december-restart-button')!
            .addEventListener('click', () => loadTrack(state!.trackIndex));
        document.getElementById('december-main-menu-button')!.addEventListener('click', mainMenu);
    }

    function resumeGame() {
        if (state === null) return;
        setGameOverlay();
        if (!state.tutorial) {
            audioContext.resume();
            state.paused = false;
        }
        draw();
    }

    async function loadTrack(index: number) {
        if (done) return;

        audioContext.resume();
        stopTrack();
        const track = TRACKS[index];

        setOverlay(`<div class="center" ${track.dark ? `style="color: ${UI_BLACK}"` : ''}>LOADING...</div>`);
        context.fillStyle = track.color;
        context.fillRect(0, 0, canvas.width, canvas.height);

        const buffer = await downloadAndDecode(track.song);

        musicSource = setupBufferSource(buffer);
        musicSource.source.loop = false;
        musicSource.gain.gain.setValueAtTime(1, audioContext.currentTime);

        state = {
            track,
            trackIndex: index,
            noteWidth: calculateNoteWidth(index),
            startTime: audioContext.currentTime,
            hitNotes: new Set(),
            missedNotes: new Set(),
            score: 0,
            combo: 0,
            maxCombo: 0,
            timingCounts: {},
            multiplierCounts: Object.fromEntries(KEY_MULTIPLIERS.map(multiplier => [multiplier, 0])),
            lastSuccessfulKey: null,
            particles: [],
            paused: false,
            lastPhysicsTime: performance.now(),
            physicsAccumulator: 0,
        };

        setGameOverlay(TRACKS[index].tutorialTexts ? 'Wait...' : undefined);

        draw();
    }

    function scorePage() {
        if (state === null) return;

        context.fillStyle = state.track.color;
        context.fillRect(0, 0, canvas.width, canvas.height);

        const {score, maxCombo, timingCounts, track, hitNotes, multiplierCounts} = state;

        const finalScore = Math.round(score);

        let isNewBest = false;
        if (track.name !== 'Tutorial') {
            const bestScoreKey = `bestScore_${track.name}`;
            const personalBest = storage.get(bestScoreKey) ?? 0;
            if (finalScore > personalBest) {
                storage.set(bestScoreKey, finalScore);
                isNewBest = true;
            }
        }

        const reversedTimingNames = [...TIMING_NAMES].reverse();
        const perfectCombo = hitNotes.size === track.notes.length;
        const multiplierStats = Object.entries(multiplierCounts).sort((a, b) => b[0].localeCompare(a[0]));

        setOverlay(`
            <div class="center" style="display: flex; flex-direction: column; gap: 20px; text-align: center; ${state.track.dark ? `color: ${UI_BLACK}` : ''}">
                <h1>${track.name}</h1>
                ${isNewBest ? '<h2>New personal best!</h2>' : ''}
                <h2>Score: ${finalScore}</h2>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px 20px; text-align: right">
                    ${reversedTimingNames
                        .map(name => `<span>${name}</span><span>${timingCounts[name] ?? 0}</span>`)
                        .join('')}
                    <span>Miss</span><span>${track.notes.length - hitNotes.size}</span>
                    <span></span><span></span>
                    ${multiplierStats
                        .map(
                            ([multiplier, count]) => `
                                <span>x${multiplier}</span>
                                <span>${count}</span>
                            `,
                        )
                        .join('')}
                    <span></span><span></span>
                    <span>Max Combo</span><span>${perfectCombo ? '🏆' : ''}${maxCombo}</span>
                </div>
                <div style="display: flex; gap: 5px">
                    <button id="december-menu-button" ${state.track.dark ? 'class="dark"' : ''}>MENU</button>
                    <button id="december-restart-button" ${state.track.dark ? 'class="dark"' : ''}>RESTART</button>
                    <button id="december-share-button" ${state.track.dark ? 'class="dark"' : ''}>SHARE</button>
                </div>
            </div>
        `);

        document.getElementById('december-menu-button')!.addEventListener('click', mainMenu);
        document
            .getElementById('december-restart-button')!
            .addEventListener('click', () => loadTrack(state!.trackIndex));
        document.getElementById('december-share-button')!.addEventListener('click', () => {
            const text =
                `🎵 ${GAME_NAME} - ${track.name} 🎵\n\n` +
                reversedTimingNames.map(name => `${name}: ${timingCounts[name] ?? 0}`).join('\n') +
                `\nMiss: ${track.notes.length - state!.hitNotes.size}\n\n` +
                `${multiplierStats.map(([multiplier, count]) => `x${multiplier}: ${count}`).join('\n')}\n\n` +
                `Max Combo: ${maxCombo}${perfectCombo ? '🏆' : ''}\n` +
                `Score: ${finalScore}\n`;
            navigator.clipboard.writeText(text).then(() => {
                const shareButton = document.getElementById('december-share-button')!;
                shareButton.textContent = 'COPIED!';
                setTimeout(() => (shareButton.textContent = 'SHARE'), 1000);
            });
        });
    }

    function addScore(amount: number) {
        if (state === null) return;
        state.score += amount;
        document.getElementById('december-score-span')!.textContent = state.score.toString();
    }

    function getDirection(nextIndex: number) {
        if (state === null || state.last === undefined) return 'any';

        const previousNote = state.track.notes[state.last.index];
        const currentNote = state.track.notes[nextIndex];

        return currentNote[1] > previousNote[1] ? 'right' : currentNote[1] < previousNote[1] ? 'left' : 'down';
    }

    function draw() {
        if (done || state === null || (state.paused && !state.tutorial)) return;

        if (state.gameEndTime) {
            if (audioContext.currentTime - state.gameEndTime >= RESULTS_DELAY) {
                scorePage();
                return;
            }
        } else if (state.hitNotes.size + state.missedNotes.size === state.track.notes.length) {
            state.gameEndTime = audioContext.currentTime;
        }

        context.fillStyle = state.track.color;
        context.fillRect(0, 0, canvas.width, canvas.height);

        const time = audioContext.currentTime - state.startTime;
        const currentTrack = TRACKS[state.trackIndex];

        if (
            !state.paused &&
            state.lastTextUpdateTime !== undefined &&
            time - state.lastTextUpdateTime >= TEXT_CLEAR_TIME
        ) {
            document.getElementById('december-text')!.textContent = '';
            state.lastTextUpdateTime = undefined;
        }

        for (let index = state.offscreenIndex ?? 0; index < state.track.notes.length; ++index) {
            const note = state.track.notes[index];
            const noteY = PLAY_LINE_Y + (time - note[0]) * scrollSpeed - NOTE_HEIGHT / 2;

            if (noteY < -NOTE_HEIGHT) break;
            if (noteY > canvas.height) state.offscreenIndex = index;

            if (state.hitNotes.has(index)) continue;

            const tutorial = currentTrack.tutorialTexts?.[index];
            if (tutorial && !state.tutorial && noteY + NOTE_HEIGHT / 2 >= PLAY_LINE_Y && !state.paused) {
                audioContext.suspend();
                state.paused = true;
                state.tutorial = {
                    noteIndex: index,
                    key: tutorial.key,
                    inputAllowedTime: Date.now() + TUTORIAL_INPUT_DELAY,
                };
                document.getElementById('december-text')!.textContent = tutorial.text;
                const buttons = document.querySelectorAll<HTMLElement>('#december-keys > button');
                buttons.forEach((button, key) => {
                    if ((tutorial.key !== undefined && tutorial.key !== key + 1) || !validKey(key + 1, index)) {
                        button.setAttribute('disabled', 'true');
                    }
                });
            }

            if (!state.missedNotes.has(index) && time > note[0] + TIMINGS[0]) {
                if (!state.tutorial || state.tutorial.noteIndex !== index) {
                    if (!state.paused) {
                        state.missedNotes.add(index);
                        document.getElementById('december-text')!.textContent = 'Miss! +0';
                        state.lastTextUpdateTime = time;
                        state.combo = 0;
                    }
                }
            }

            context.fillStyle = state.missedNotes.has(index) ? MISSED_NOTE_COLOR : state.track.accent;

            if (noteY > canvas.height) continue;

            context.fillRect(note[1] * state.noteWidth, noteY, state.noteWidth, NOTE_HEIGHT);

            if (state.last !== undefined && index > state.last.index) {
                const prevNote = state.track.notes[state.last.index];
                const direction = note[1] > prevNote[1] ? 'right' : note[1] < prevNote[1] ? 'left' : 'down';

                const centerX = note[1] * state.noteWidth + state.noteWidth / 2;
                const centerY = noteY + NOTE_HEIGHT / 2;
                const arrowSize = Math.min(state.noteWidth, NOTE_HEIGHT) / 3;

                context.fillStyle = state.track.dark ? UI_WHITE : UI_BLACK;
                context.beginPath();
                if (direction === 'down') {
                    context.moveTo(centerX - arrowSize, centerY - arrowSize);
                    context.lineTo(centerX + arrowSize, centerY - arrowSize);
                    context.lineTo(centerX, centerY + arrowSize);
                } else if (direction === 'left') {
                    context.moveTo(centerX + arrowSize, centerY - arrowSize);
                    context.lineTo(centerX + arrowSize, centerY + arrowSize);
                    context.lineTo(centerX - arrowSize, centerY);
                } else {
                    context.moveTo(centerX - arrowSize, centerY - arrowSize);
                    context.lineTo(centerX - arrowSize, centerY + arrowSize);
                    context.lineTo(centerX + arrowSize, centerY);
                }
                context.closePath();
                context.fill();
            }
        }

        context.strokeStyle = state.track.accent;
        context.strokeRect(0, PLAY_LINE_Y - NOTE_HEIGHT / 2, canvas.width, NOTE_HEIGHT);

        state.physicsAccumulator += Math.min(performance.now() - state.lastPhysicsTime, 1000);
        state.lastPhysicsTime = performance.now();

        while (state.physicsAccumulator >= TIME_STEP) {
            for (let index = state.particles.length - 1; index >= 0; --index) {
                const particle = state.particles[index];
                particle.x += particle.velocityX;
                particle.y += particle.velocityY;
                particle.velocityY += GRAVITY;

                if (particle.x < 0 || particle.x > canvas.width || particle.y < 0 || particle.y > canvas.height) {
                    state.particles.splice(index, 1);
                }
            }
            state.physicsAccumulator -= TIME_STEP;
        }

        for (const particle of state.particles) {
            context.fillStyle = state.track.accent;
            context.fillRect(
                particle.x - PARTICLE_SIZE / 2,
                particle.y - PARTICLE_SIZE / 2,
                PARTICLE_SIZE,
                PARTICLE_SIZE,
            );
        }

        if (state.combo >= 3) {
            context.fillStyle = state.track.dark ? UI_BLACK : UI_WHITE;
            context.fillText(`${state.combo} COMBO`, canvas.width / 2, 100);
        }

        if (!state.paused) requestAnimationFrame(draw);
    }

    function hitNote(noteIndex: number, key: number, fromTutorial: boolean = false) {
        if (!state) return;
        const time = audioContext.currentTime - state.startTime;
        const buttons = document.querySelectorAll<HTMLElement>('#december-keys > button');

        state.lastSuccessfulKey = key;

        buttons.forEach((button, index) => {
            button.style.backgroundColor = index + 1 === key ? PRESSED_KEY_COLOR : '';
        });

        const note = state.track.notes[noteIndex];
        state.hitNotes.add(noteIndex);
        ++state.combo;
        if (state.combo > state.maxCombo) state.maxCombo = state.combo;
        const diff = fromTutorial ? 0 : Math.abs(time - note[0]);
        const reverseIndex = REVERSED_TIMINGS.findIndex(timing => diff <= timing);
        const timingIndex = TIMINGS.length - 1 - reverseIndex;
        const timingName = TIMING_NAMES[timingIndex];
        state.timingCounts[timingName] = (state.timingCounts[timingName] ?? 0) + 1;

        const multiplier = KEY_MULTIPLIERS[key - 1];
        state.multiplierCounts[multiplier] = (state.multiplierCounts[multiplier] ?? 0) + 1;

        const timingMultiplier = TIMING_MULTIPLIERS[timingIndex];
        const score = timingMultiplier * multiplier;
        addScore(score);

        document.getElementById('december-text')!.textContent =
            `${timingName} ${timingMultiplier}x${multiplier} +${score}`;
        state.lastTextUpdateTime = time;
        state.last = {key, index: noteIndex};

        for (let i = 0; i < score; ++i) {
            state.particles.push({
                x: note[1] * state.noteWidth + Math.random() * state.noteWidth,
                y: PLAY_LINE_Y + (time - note[0]) * scrollSpeed - NOTE_HEIGHT / 2 + Math.random() * NOTE_HEIGHT,
                velocityX: (Math.random() - 0.5) * MAX_PARTICLE_VELOCITY,
                velocityY: (Math.random() * -MAX_PARTICLE_VELOCITY) / 2,
            });
        }
    }

    function validKey(key: number, index: number) {
        if (state === null) return false;
        const direction = getDirection(index);
        return (
            direction === 'any' ||
            state.last === undefined ||
            (direction === 'down' && state.last.key === key) ||
            (direction === 'right' && key > state.last.key) ||
            (direction === 'left' && key < state.last.key)
        );
    }

    function pressKey(key: number) {
        if (state === null) return;

        if (state.tutorial) {
            if (Date.now() < state.tutorial.inputAllowedTime) return;
            const {noteIndex, key: tutorialKey} = state.tutorial;
            if (tutorialKey === undefined ? validKey(key, noteIndex) : key === tutorialKey) {
                audioContext.resume();
                state.paused = false;
                hitNote(noteIndex, key, true);
                state.tutorial = undefined;
                const buttons = document.querySelectorAll<HTMLElement>('#december-keys > button');
                buttons.forEach(button => button.removeAttribute('disabled'));
                draw();
            }
            return;
        }

        if (state.paused) return;

        const time = audioContext.currentTime - state.startTime;

        let noteIndex: number | undefined = undefined;
        for (let index = state.offscreenIndex ?? 0; index < state.track.notes.length; ++index) {
            const note = state.track.notes[index];
            if (
                index <= (state.last?.index ?? -1) ||
                state.hitNotes.has(index) ||
                state.missedNotes.has(index) ||
                !(time > note[0] - TIMINGS[0] && time < note[0] + TIMINGS[0]) ||
                TRACKS[state.trackIndex].tutorialTexts?.[index]
            ) {
                continue;
            }

            if (!validKey(key, index)) {
                document.getElementById('december-text')!.textContent = 'WRONG DIRECTION!';
                state.lastTextUpdateTime = time;
                continue;
            }

            noteIndex = index;
            break;
        }

        const buttons = document.querySelectorAll<HTMLElement>('#december-keys > button');

        if (noteIndex !== undefined) {
            hitNote(noteIndex, key);
        } else {
            if (key > 0 && key <= buttons.length) {
                const button = buttons[key - 1];
                if (key !== state.lastSuccessfulKey) {
                    button.style.backgroundColor = PRESSED_KEY_COLOR;
                    setTimeout(() => {
                        button.style.backgroundColor = '';
                    }, KEY_PRESS_DURATION * 1000);
                }
            }
        }
    }

    function onKeyDown(event: KeyboardEvent) {
        if (event.repeat) return;
        if (event.code === 'Escape') {
            if (state !== null) {
                if (document.getElementById('december-resume-button')) resumeGame();
                else pauseGame();
            }
            return;
        }
        const key = Number(event.key);
        if (isNaN(key) || key > KEY_MULTIPLIERS.length) return;
        pressKey(key);
    }

    function focus() {
        if (state === null) audioContext.resume();
    }

    context.font = `36px ${FONT}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    mainMenu();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', pauseGame);
    window.addEventListener('focus', focus);
    return () => {
        done = true;
        if (musicSource) musicSource.source.stop();
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('blur', pauseGame);
        window.removeEventListener('focus', focus);
    };
}

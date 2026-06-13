import action from './music/action.ogg';
import click from '../../assets/click.ogg';
import explode from '../../assets/explode.ogg';
import fire from './sounds/fire.ogg';
import logo from './logo.webp';
import menu from './music/menu.ogg';
import mine from '../../assets/mine.ogg';
import riser from './music/riser.ogg';
import {FONT} from '../../shared/style.ts';
import {audioContext, downloadAndDecode, setupSoundEffect} from '../../audio.ts';
import {canvas, context, setOverlay} from '../../dom';
import {choice, clamp, distance, getRectangleIntersection, modulo, randomInt, setupBufferSource} from '../../util.ts';
import {setupStorage} from '../../shared/storage.ts';

enum Role {
    THRUST_CONTROL,
    STEERING,
    AIM,
    FIRING,
    MINING,
    REPAIR,
}

const PERKS = {
    highPowerEngines: {
        description: 'move forward 25% faster',
        role: Role.THRUST_CONTROL,
    },
    warpDrive: {
        description: 'every second, have a 4% chance to warp to the asteroid',
        role: Role.THRUST_CONTROL,
    },
    prospectorsLuck: {
        description: 'every second, have a 6% chance to gain 1 ore',
        role: Role.STEERING,
    },
    evasion: {
        description: 'enemies shots have a 15% chance of missing',
        role: Role.STEERING,
    },
    scavenger: {
        description: 'destroying an enemy ship gives 1 ore',
        role: Role.AIM,
    },
    lifeSteal: {
        description: 'destroying an enemy ship has a 15% chance to restore 1 hp',
        role: Role.AIM,
    },
    piercingShots: {
        description: 'shots destroy all ships along their path',
        role: Role.FIRING,
    },
    tripleShot: {
        description: 'fire two additional shots at +/- 10°',
        role: Role.FIRING,
    },
    miningEfficiency: {
        description: 'depleting an asteroid gives 3 extra ore',
        role: Role.MINING,
    },
    tractorBeam: {
        description: 'asteroids are pulled towards the ship',
        role: Role.MINING,
    },
    shields: {
        description: 'increase max hp by 5',
        role: Role.REPAIR,
    },
    minersRespite: {
        description: 'depleting an asteroid has a 25% chance to restore 1 hp',
        role: Role.REPAIR,
    },
};

interface CrewMember {
    emoji: string;
    skill: number;
    perk: (typeof PERKS)[keyof typeof PERKS];
    rate: number;
}

interface CrewLogicHelpers {
    asteroidDistance: number;
    asteroidDirection: number;
    targetTurretDirection: number;
}

interface Enemy {
    x: number;
    y: number;
    direction: number;
    turretDirection: number;
    fireStartTime?: number;
    lastFireAudio?: ReturnType<typeof setupSoundEffect>;
    lastShotTime?: number;
    lastShotAttemptTime?: number;
}

namespace State {
    export interface Menu {
        type: 'menu';
    }

    export namespace PlayState {
        export namespace PlayingState {
            export interface Countdown {
                type: 'countdown';
                startTime: number;
            }

            export interface Live {
                type: 'live';
                startTime: number;
                position: {x: number; y: number};
                enemies: Enemy[];
                direction: number;
                turretDirection: number;
                activeRoles: Record<Role, boolean>;
                texts: {text: string; x: number; y: number; time: number}[];
                startingOre: number;
                lastHitTime?: number;
                lastEnemySpawnTime?: number;
                fireStartTime?: number;
                lastFireAudio?: ReturnType<typeof setupSoundEffect>;
                mineStartTime?: number;
                repairStartTime?: number;
                lastPerkCheckTime?: number;
                gameOverTimeoutId?: number;
            }

            export type Any = Countdown | Live;
        }

        export interface Playing {
            type: 'playing';
            intervalId: number;
            asteroid: {x: number; y: number; size: number};
            lastDrawTime?: number;
            currentRole?: Role;
            tutorialRole?: Role | 'done';

            spaceDown: boolean;
            pointersDown: Set<number>;

            state: PlayingState.Any;
        }

        export interface Results {
            type: 'results';
            candidates: CrewMember[];
            oreGained: number;
        }

        export interface GameOver {
            type: 'gameOver';
            highScoreBeaten: boolean;
        }

        export type Any = Playing | Results | GameOver;
    }

    export interface Play {
        type: 'play';
        roundNumber: number;
        crew: Partial<Record<Role, CrewMember>>;
        ore: number;
        hp: number;
        enemiesDestroyed: number;

        state: PlayState.Any;
    }

    export type Any = Menu | Play;
}

export function may() {
    const ASTEROID_COLOR = '#787878';
    const BACKGROUND_COLOR = '#000000';
    const ENEMY_SHIP_COLOR = '#a30000';
    const ENEMY_TURRET_ARM_COLOR = '#ff0000';
    const PLAYER_SHIP_COLOR = '#00009f';
    const PLAYER_TURRET_ARM_COLOR = '#0092ff';
    const REPAIR_COLOR = '#49ff49';
    const SHOT_COLOR = '#ff5a00';
    const SHOT_PRIMING_COLOR = '#fff100';
    const STAR_COLOR = '#ffffff';
    const THRUST_COLOR = '#ff7300';
    const ROLE_COLORS = {
        [Role.THRUST_CONTROL]: '#ff0000',
        [Role.STEERING]: '#ff7300',
        [Role.AIM]: '#f7ff00',
        [Role.FIRING]: '#22ff00',
        [Role.MINING]: '#0033ff',
        [Role.REPAIR]: '#c800ff',
    };

    const ASTEROID_DRAW_SIZE_MULTIPLIER = 4;
    const ASTEROID_SPEED = 0.01;
    const COUNTDOWN_NUMBERS = 3;
    const COUNTDOWN_TIME = 1395;
    const ENEMY_FIRING_COOLDOWN = 3000;
    const ENEMY_SHIP_SIZE = 30;
    const ENEMY_SHIP_SPEED = 0.02;
    const ENEMY_SHIP_TURRET_SPEED = 0.00025;
    const ENEMY_SHOT_ATTEMPT_COOLDOWN = 1500;
    const ENEMY_SPAWN_DIRECTION_VARIANCE = Math.PI / 3;
    const ENEMY_SPAWN_OFFSET = 15;
    const FADE_IN_DELAY = 1;
    const FADE_IN_DURATION = 1.5;
    const FADE_OUT_DURATION = 3;
    const GAME_OVER_TIME = 1000;
    const HIT_IMMUNITY_DURATION = 1000;
    const MAX_ASTEROID_SIZE = 10;
    const MAX_HP = 10;
    const MINING_CHARGE_TIME = 750;
    const MIN_ASTEROID_SIZE = 4;
    const PLAYER_SHIP_SIZE = 40;
    const PLAY_AREA = 500;
    const PRIMARY_THRUST_SIZE = 20;
    const REPAIR_CHARGE_TIME = 7000;
    const ROUND_DURATION = 60000;
    const SHIP_SPEED = 0.1;
    const SHOT_DURATION = 1000;
    const SHOT_WIDTH_MULTIPLIER = 5;
    const STAR_COUNT = 100;
    const STAR_SIZE_VARIABILITY = 1.5;
    const STEERING_SPEED = 0.0025;
    const STEERING_THRUST_SIZE = 10;
    const TEXT_DURATION = 1500;
    const TEXT_POSITION_VARIANCE = 30;
    const TURRET_SPEED = 0.003;

    // prettier-ignore
    const CREW_EMOJIS = ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '🫠', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🫢', '🫣', '🤫', '🤔', '🫡', '🤐', '🤨', '🤗', '🤭', '🫢', '🫣', '🤫', '🤔', '🫡', '🤐', '🤨', '😐', '😑', '😶', '🫥', '😶‍🌫️', '😏', '😒', '🙄', '😬', '😮‍💨', '🤥', '🫨', '🙂‍↔️', '🙂‍↕️', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '😵‍💫', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😕', '🫤', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '🥹', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '🙈', '🙉', '🙊'];

    const TUTORIAL_ORDER = [Role.STEERING, Role.THRUST_CONTROL, Role.MINING, Role.AIM, Role.FIRING, Role.REPAIR];

    const ROLE_ICONS = {
        [Role.THRUST_CONTROL]: `
            <path fill="white" d="M 64,0 32,85 96,85" />
            <path fill="white" d="M 48,90 80,90 64,128" />
        `,
        [Role.STEERING]: `
            <path fill="white" d="M 64,22 32,107 96,107" />
            <path fill="white" d="M 60,25 51,47 31,27" />
            <path fill="white" d="M 97,102 88,80 116,82" />
        `,
        [Role.AIM]: `
            <path stroke="white" stroke-width="10" d="M 20,20 108,108" />
            <path fill="white" d="M 64,28 96,28 96,16 108,32 96,48, 96,36 64,36" />
        `,
        [Role.FIRING]: `
            <path stroke="white" stroke-width="10" d="M 64,64 108,108" />
            <path stroke="white" stroke-width="5" d="M 52,52 20,20" />
            <path stroke="white" stroke-width="5" d="M 52,52 52,16" />
            <path stroke="white" stroke-width="5" d="M 52,52 16,52" />
        `,
        [Role.MINING]: `
            <circle stroke="white" stroke-width="5" cx="48" cy="80" r="32" />
            <circle fill="white" cx="80" cy="48" r="32" />
        `,
        [Role.REPAIR]: `
            <path fill="white" d="M 100,108 56,64 Q 0,48 16,32 Q 48,48 32,16 Q 48,0 64,56 L 108,100" />
        `,
    };

    const ROLE_DESCRIPTIONS = {
        [Role.THRUST_CONTROL]: 'THRUST CONTROL',
        [Role.STEERING]: 'STEERING',
        [Role.AIM]: 'AIM',
        [Role.FIRING]: 'FIRING',
        [Role.MINING]: 'MINING',
        [Role.REPAIR]: 'REPAIRING',
    };

    const CREW_LOGIC: Record<
        Role,
        (
            member: CrewMember,
            playingState: State.PlayState.Playing,
            liveState: State.PlayState.PlayingState.Live,
            helpers: CrewLogicHelpers,
            adjustedSkill: ReturnType<typeof calculateAdjustedSkill>,
        ) => boolean
    > = {
        [Role.THRUST_CONTROL]: (
            {},
            {asteroid},
            {activeRoles, direction},
            {asteroidDistance, asteroidDirection},
            {high, low},
        ) => {
            if (asteroidDistance < asteroid.size || Math.abs(direction - asteroidDirection) > Math.PI / 3) return false;
            if (activeRoles[Role.THRUST_CONTROL]) return high > Math.random();
            return low > Math.random();
        },
        [Role.STEERING]: (
            {},
            {asteroid},
            {activeRoles, direction},
            {asteroidDistance, asteroidDirection},
            {high, low},
        ) => {
            if (asteroidDistance < asteroid.size || Math.abs(direction - asteroidDirection) < Math.PI / 8) return false;
            if (activeRoles[Role.STEERING]) return high > Math.random();
            return low > Math.random();
        },
        [Role.AIM]: ({}, {}, {activeRoles}, {targetTurretDirection}, {high, low}) => {
            if (targetTurretDirection === Infinity || targetTurretDirection < Math.PI / 64) return false;
            if (activeRoles[Role.AIM]) return high > Math.random();
            return low > Math.random();
        },
        [Role.FIRING]: ({}, {}, {activeRoles, fireStartTime}, {targetTurretDirection}, {high, low}) => {
            if (targetTurretDirection === Infinity || targetTurretDirection > Math.PI / 16) {
                return fireStartTime !== undefined;
            }
            if (activeRoles[Role.FIRING]) return high > Math.random();
            return low > Math.random();
        },
        [Role.MINING]: ({}, {asteroid}, {activeRoles}, {asteroidDistance}, {high, low}) => {
            if (asteroidDistance > asteroid.size * ASTEROID_DRAW_SIZE_MULTIPLIER + PLAYER_SHIP_SIZE) return false;
            if (activeRoles[Role.MINING]) return high > Math.random();
            return low > Math.random();
        },
        [Role.REPAIR]: ({}, {}, {activeRoles}, {}, {high, low}) => {
            if (activeRoles[Role.REPAIR]) return high > Math.random();
            return low > Math.random();
        },
    };

    const backgroundCanvas = document.createElement('canvas');
    backgroundCanvas.width = canvas.width;
    backgroundCanvas.height = canvas.height;
    const backgroundContext = backgroundCanvas.getContext('2d')!;

    const clickAudio = setupSoundEffect(click);
    const explodeAudio = setupSoundEffect(explode);
    const mineAudio = setupSoundEffect(mine);
    const riserAudio = setupSoundEffect(riser);

    const storage = setupStorage('may');

    let state: State.Any = {type: 'menu'};
    let done = false;
    let menuSource: ReturnType<typeof setupBufferSource>;
    let actionSource: ReturnType<typeof setupBufferSource>;
    let usingKeyboard = true;

    Promise.all<AudioBuffer>([menu, action].map(downloadAndDecode)).then(([menuBuffer, actionBuffer]) => {
        if (done) return;

        menuSource = setupBufferSource(menuBuffer);
        actionSource = setupBufferSource(actionBuffer);

        const currentSource = state.type === 'play' && state.state.type === 'playing' ? actionSource : menuSource;
        currentSource.gain.gain.setValueAtTime(1, audioContext.currentTime);
    });

    function setTrack(track: 'menu' | 'action' | 'none') {
        if (menuSource === undefined || actionSource === undefined) return;

        const delay = track === 'action' ? FADE_IN_DELAY : 0;

        ([menuSource, actionSource] as const).forEach(source => {
            source.gain.gain.cancelScheduledValues(audioContext.currentTime);
            source.gain.gain.setValueAtTime(track === 'none' ? 0 : source.gain.gain.value, audioContext.currentTime);
            source.gain.gain.setValueAtTime(source.gain.gain.value, audioContext.currentTime + delay);

            if (track !== 'none') {
                source.gain.gain.linearRampToValueAtTime(
                    (source === menuSource && track === 'menu') || (source === actionSource && track === 'action')
                        ? 1
                        : 0,
                    audioContext.currentTime + (track === 'action' ? FADE_IN_DURATION : FADE_OUT_DURATION) + delay,
                );
            }
        });
    }

    function updateBackground() {
        backgroundContext.fillStyle = BACKGROUND_COLOR;
        backgroundContext.fillRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < STAR_COUNT; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const radius = Math.random() * STAR_SIZE_VARIABILITY;
            backgroundContext.beginPath();
            backgroundContext.arc(x, y, radius, 0, Math.PI * 2);
            backgroundContext.fillStyle = STAR_COLOR;
            backgroundContext.fill();
        }
    }

    function getMaxHp() {
        return MAX_HP + (hasPerk('shields') ? 5 : 0);
    }

    function getEnemySpawnPosition() {
        const sideLength = PLAY_AREA + ENEMY_SPAWN_OFFSET * 2;
        const position = randomInt(0, 4 * sideLength - 1);

        if (position < sideLength) return {x: position - ENEMY_SPAWN_OFFSET, y: -ENEMY_SPAWN_OFFSET};
        if (position < sideLength * 2) return {x: sideLength - ENEMY_SPAWN_OFFSET, y: position - sideLength};
        if (position < sideLength * 3) return {x: position - sideLength * 2, y: sideLength - ENEMY_SPAWN_OFFSET};
        return {x: -ENEMY_SPAWN_OFFSET, y: position - sideLength * 3};
    }

    function spawnEnemy() {
        if (state.type !== 'play' || state.state.type !== 'playing') return;

        const playingState = (state.state as State.PlayState.Playing).state as State.PlayState.PlayingState.Live;
        const position = getEnemySpawnPosition();

        const direction =
            Math.atan2(PLAY_AREA / 2 - position.y, PLAY_AREA / 2 - position.x) +
            (Math.random() * ENEMY_SPAWN_DIRECTION_VARIANCE - ENEMY_SPAWN_DIRECTION_VARIANCE / 2);

        playingState.enemies.push({
            ...position,
            direction,
            turretDirection: Math.random() * Math.PI * 2,
        });

        playingState.lastEnemySpawnTime = Date.now();
    }

    function generateCrewMember(tier: number): CrewMember {
        const skill = randomInt(tier * 20, tier * 12 + 64) / 100;
        return {
            emoji: choice(CREW_EMOJIS),
            skill,
            perk: choice(Object.values(PERKS)),
            rate: randomInt(Math.floor(skill * 20), Math.floor(10 + skill * 40)),
        };
    }

    function addText(text: string, x: number, y: number) {
        if (state.type !== 'play' || state.state.type !== 'playing' || state.state.state.type !== 'live') return;

        state.state.state.texts.push({
            text,
            x: x + randomInt(-TEXT_POSITION_VARIANCE, TEXT_POSITION_VARIANCE),
            y: y + randomInt(-TEXT_POSITION_VARIANCE, TEXT_POSITION_VARIANCE),
            time: Date.now(),
        });
    }

    function createPlayingState(tutorial = false, first = false): State.PlayState.Playing {
        return {
            type: 'playing',
            intervalId: setInterval(() => {
                const {ore} = state as State.Play;
                const {
                    intervalId,
                    asteroid,
                    currentRole,
                    spaceDown,
                    pointersDown,
                    state: playingState,
                } = (state as State.Play).state as State.PlayState.Playing;

                if (playingState.type === 'countdown') {
                    if (Date.now() - playingState.startTime >= COUNTDOWN_TIME) {
                        const inputActive = spaceDown || pointersDown.size > 0;
                        ((state as State.Play).state as State.PlayState.Playing).state = {
                            type: 'live',
                            startTime: Date.now(),
                            position: {x: 250, y: 250},
                            direction: 0,
                            turretDirection: 0,
                            activeRoles: {
                                [Role.THRUST_CONTROL]: inputActive && currentRole === Role.THRUST_CONTROL,
                                [Role.STEERING]: inputActive && currentRole === Role.STEERING,
                                [Role.AIM]: inputActive && currentRole === Role.AIM,
                                [Role.FIRING]: inputActive && currentRole === Role.FIRING,
                                [Role.MINING]: inputActive && currentRole === Role.MINING,
                                [Role.REPAIR]: inputActive && currentRole === Role.REPAIR,
                            },
                            texts: [],
                            enemies: [],
                            startingOre: ore,
                        };
                        requestAnimationFrame(draw);
                    }
                    setPlayingOverlay();
                    return;
                }

                const {startTime, lastEnemySpawnTime, lastPerkCheckTime, position, startingOre} = playingState;

                const timeLeft = (ROUND_DURATION - (Date.now() - startTime)) / 1000;
                document.getElementById('may-time-left-span')!.textContent = timeLeft.toFixed(1);
                if (timeLeft <= 0) {
                    clearInterval(intervalId);
                    (state as State.Play).state = {
                        type: 'results',
                        candidates: [generateCrewMember(1), generateCrewMember(2), generateCrewMember(3)],
                        oreGained: ore - startingOre,
                    };
                    setResultsOverlay();
                    setTrack('menu');
                    return;
                }

                const {roundNumber} = state as State.Play;
                const totalWaves = roundNumber + 2;
                if (
                    Date.now() - (lastEnemySpawnTime ?? startTime - ROUND_DURATION / totalWaves / 2) >=
                    ROUND_DURATION / totalWaves
                ) {
                    for (let i = 0; i < randomInt(1, Math.ceil(roundNumber / 3)); ++i) spawnEnemy();
                }

                if (Date.now() - (lastPerkCheckTime ?? -Infinity) > 1000) {
                    if (hasPerk('warpDrive') && Math.random() < 0.04) {
                        addText('warped!', position.x, position.y);
                        position.x = asteroid.x;
                        position.y = asteroid.y;
                    }

                    if (hasPerk('prospectorsLuck') && Math.random() < 0.06) {
                        ++(state as State.Play).ore;
                        addText('+1 ore', asteroid.x, asteroid.y);

                        setPlayingOverlay();
                    }

                    playingState.lastPerkCheckTime = Date.now();
                }
            }, 100),
            asteroid: createAsteroid(first),
            state: {
                type: 'countdown',
                startTime: Date.now(),
            },
            tutorialRole: tutorial ? Role.STEERING : undefined,
            spaceDown: false,
            pointersDown: new Set(),
        };
    }

    function getTotalCrewCost(crew: State.Play['crew']) {
        return Object.values(crew).reduce((total, {rate}) => total + rate, 0);
    }

    function startRound(tutorial = false) {
        updateBackground();
        setTrack('action');
        riserAudio.play();

        if (state.type !== 'play') {
            state = {
                type: 'play',
                roundNumber: 1,
                crew: {},
                ore: 10,
                state: createPlayingState(tutorial, true),
                hp: MAX_HP / 2,
                enemiesDestroyed: 0,
            };
        } else {
            state = {
                ...state,
                state: createPlayingState(),
                roundNumber: state.roundNumber + 1,
                ore: state.ore - getTotalCrewCost(state.crew),
            };
        }

        setPlayingOverlay();
        requestAnimationFrame(draw);
    }

    function confirmMenu() {
        clickAudio.play();

        const pauseStart = Date.now();
        if (
            !confirm(
                'Are you sure you want to return to the menu? Your progress will be lost. Only do this if you want to restart the game.',
            )
        ) {
            const pauseDuration = Date.now() - pauseStart;
            if (state.type === 'play' && state.state.type === 'playing') {
                const playingState = state.state;
                playingState.state.startTime += pauseDuration;
                if (playingState.lastDrawTime !== undefined) playingState.lastDrawTime += pauseDuration;
                if (playingState.state.type === 'live') {
                    const liveState = playingState.state;
                    if (liveState.lastHitTime !== undefined) liveState.lastHitTime += pauseDuration;
                    if (liveState.lastEnemySpawnTime !== undefined) liveState.lastEnemySpawnTime += pauseDuration;
                    if (liveState.fireStartTime !== undefined) liveState.fireStartTime += pauseDuration;
                    if (liveState.mineStartTime !== undefined) liveState.mineStartTime += pauseDuration;
                    if (liveState.repairStartTime !== undefined) liveState.repairStartTime += pauseDuration;
                    if (liveState.lastPerkCheckTime !== undefined) liveState.lastPerkCheckTime += pauseDuration;
                    for (const enemy of liveState.enemies) {
                        if (enemy.fireStartTime !== undefined) enemy.fireStartTime += pauseDuration;
                        if (enemy.lastShotTime !== undefined) enemy.lastShotTime += pauseDuration;
                        if (enemy.lastShotAttemptTime !== undefined) enemy.lastShotAttemptTime += pauseDuration;
                    }
                    for (const text of liveState.texts) {
                        text.time += pauseDuration;
                    }
                }
            }
            return;
        }

        mainMenu();
    }

    function mainMenu() {
        if (state.type === 'play' && state.state.type === 'playing') clearInterval(state.state.intervalId);
        state = {type: 'menu'};
        setTrack('menu');
        const highScore = storage.get('highScore') ?? 0;
        setOverlay(`
            <div class="center" style="flex-direction: column; gap: 10px">
                <img src="${logo}" width="350" alt="Star Squad" />
                <span>HIGH SCORE: <strong>${highScore}</strong></span>
                <label>
                    <input id="may-tutorial-checkbox" type="checkbox" ${highScore === 0 ? 'checked' : ''} />
                    SHOW TUTORIAL
                </label>
                <button id="may-play-button">PLAY</button>
            </div>
        `);

        const tutorialCheckbox = document.getElementById('may-tutorial-checkbox') as HTMLInputElement;
        tutorialCheckbox.addEventListener('click', () => clickAudio.play());

        document.getElementById('may-play-button')!.addEventListener('click', () => {
            clickAudio.play();
            startRound(tutorialCheckbox.checked);
        });
    }

    function getBackgroundHeight(now: number, role: Role) {
        if (state.type !== 'play' || state.state.type !== 'playing' || state.state.state.type !== 'live') return 0;

        const {fireStartTime, mineStartTime, repairStartTime, activeRoles} = state.state.state;

        if ([Role.FIRING, Role.MINING, Role.REPAIR].includes(role)) {
            const cooldown =
                role === Role.FIRING ? SHOT_DURATION : role === Role.MINING ? MINING_CHARGE_TIME : REPAIR_CHARGE_TIME;
            const startTime =
                role === Role.FIRING ? fireStartTime : role === Role.MINING ? mineStartTime : repairStartTime;
            const value = (now - (startTime ?? -Infinity)) / cooldown;
            return value > 1 ? 0 : clamp(value, 0, 1);
        }

        return activeRoles[role] ? 1 : 0;
    }

    function getRolesHtml(currentRole?: Role) {
        return `
            <div id="may-roles-container" style="display: flex; gap: 10px; padding: 10px; height: 80px; border-top: 2px solid white">
                ${Object.entries(ROLE_COLORS)
                    .map(([roleKey, color]) => {
                        const role = +roleKey as Role;

                        const {crew, state: playState} = state as State.Play;

                        if (
                            playState.type === 'playing' &&
                            typeof playState.tutorialRole === 'number' &&
                            TUTORIAL_ORDER.indexOf(playState.tutorialRole) < TUTORIAL_ORDER.indexOf(role)
                        ) {
                            // Keep the background div to not mess up the element order
                            return `
                                <div style="flex-basis: 80px; border: 5px solid transparent">
                                    <div class="background" style="display: none"></div>
                                </div>
                            `;
                        }

                        return `
                            <div style="flex-basis: 80px; display: flex; justify-content: center; align-items: center; border: 5px solid ${color}; position: relative; ${role === currentRole ? 'outline: 5px solid white' : ''}">
                                <div class="background" style="background-color: #444; position: absolute; bottom: 0; left: 0; height: 0; width: 100%; z-index: -1"></div>
                                <svg viewBox="0 0 128 128" style="width: 50px">
                                    ${ROLE_ICONS[role]}
                                </svg>
                                ${
                                    role in crew
                                        ? `
                                            <span style="position: absolute; bottom: 2px; left: 2px; font-size: 20px">${crew[role]!.emoji}</span>
                                            <span style="position: absolute; bottom: 0; right: 0; font-size: 16px">${(crew[role]!.skill * 100).toFixed(0)}%</span>
                                        `
                                        : ''
                                }
                                ${usingKeyboard ? `<span style="position: absolute; top: 0; left: 2px; font-size: 20px">${role + 1}</span>` : ''}
                            </div>
                        `;
                    })
                    .join('')}
            </div>
        `;
    }

    function getCrewMemberHtml({emoji, skill, rate, perk}: CrewMember, action?: string) {
        return `
            <div style="display: flex; flex-direction: column; min-width: 0; flex: 1; align-items: center; gap: 10px; padding: 10px; border: 2px solid white; max-width: 200px">
                <span style="font-size: 50px">${emoji}</span>
                <div style="display: flex; flex-direction: column">
                    <span><strong>Skill</strong>: ${(skill * 100).toFixed(0)}%</span>
                    <progress max="1" value="${skill}"></progress>
                </div>
                <span><strong>Rate</strong>: ${rate} ore/round</span>
                <span style="flex: 1; text-align: center">
                    When assigned to
                    <div style="display: inline-flex; justify-content: center; align-items: center; border: 1px solid ${ROLE_COLORS[perk.role]}; vertical-align: middle">
                        <svg viewBox="0 0 128 128" style="width: 20px">
                            ${ROLE_ICONS[perk.role]}
                        </svg>
                    </div>
                    , ${perk.description}
                </span>
                ${action === undefined ? '' : action}
            </div>
        `;
    }

    function setResultsOverlay() {
        if (state.type !== 'play' || state.state.type !== 'results') return;

        const {candidates, oreGained} = (state as State.Play).state as State.PlayState.Results;

        const totalCrewCost = getTotalCrewCost(state.crew);

        setOverlay(`
            <div style="display: flex; flex-direction: column; justify-content: space-between; height: 100%">
                <div style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 2px solid white; align-items: center">
                    <button id="may-menu-button">MENU</button>
                    <div style="display: flex; flex-direction: column; text-align: center">
                        <strong>Round ${state.roundNumber} Complete</strong>
                        <strong>Ore: ${state.ore} (+${oreGained}) | HP: ${state.hp}/${getMaxHp()}</strong>
                    </div>
                    <button id="may-next-round-button" ${state.ore < totalCrewCost ? 'disabled' : ''}>NEXT ROUND</button>
                </div>
                <div style="display: flex; flex-direction: column; align-items: center">
                    <h3 style="font-weight: bold;">${candidates.length > 0 ? 'NEW CREW MEMBERS AVAILABLE FOR HIRE' : 'ALL AVAILABLE CREW MEMBERS HIRED'}</h3>
                    <div id="may-candidates-container" style="display: flex; gap: 10px; padding: 10px; justify-content: center">
                        ${candidates.map(candidate => getCrewMemberHtml(candidate, '<button>HIRE</button>')).join('')}
                    </div>
                </div>
                ${Object.values(state.crew).length > 0 ? `<h3 style="text-align: center; font-weight: bold">CURRENT CREW COST FOR NEXT ROUND: ${Object.values(state.crew).reduce((sum, member) => sum + member.rate, 0)} ORE</h3>` : ''}
                ${state.ore < totalCrewCost ? '<h3 style="text-align: center; font-weight: bold; color: red">INSUFFICIENT ORE TO START NEXT ROUND</h3>' : ''}
                ${Object.values(state.crew).length > 0 ? `<h3 style="text-align: center; font-weight: bold">CLICK/TAP ROLE TO VIEW AND<br />MANAGE EXISTING CREW MEMBER</h3>` : ''}

                ${getRolesHtml()}
            </div>
        `);

        document.getElementById('may-menu-button')!.addEventListener('click', confirmMenu);

        document.getElementById('may-next-round-button')!.addEventListener('click', () => {
            clickAudio.play();
            startRound();
        });

        document
            .getElementById('may-candidates-container')!
            .querySelectorAll('button')
            .forEach((button, index) =>
                button.addEventListener('click', () => {
                    clickAudio.play();
                    setOverlay(`
                        <div style="display: flex; flex-direction: column; justify-content: space-between; height: 100%">
                            <div style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 2px solid white; align-items: center">
                                <button id="may-cancel-button">CANCEL</button>
                            </div>
                            <h2 style="text-align: center; font-weight: bold">CHOOSE A POSITION TO ASSIGN ${candidates[index].emoji}</h2>
                            ${getRolesHtml()}
                        </div>
                    `);

                    document.getElementById('may-cancel-button')!.addEventListener('click', () => {
                        clickAudio.play();
                        setResultsOverlay();
                    });

                    document.querySelectorAll('#may-roles-container > div').forEach((position, roleIndex) =>
                        position.addEventListener('click', () => {
                            clickAudio.play();
                            const {crew} = state as State.Play;
                            const role = roleIndex as Role;

                            if (role in crew) {
                                [crew[role], candidates[index]] = [candidates[index], crew[role]!];
                                setResultsOverlay();
                                return;
                            }

                            crew[role] = candidates[index];
                            candidates.splice(index, 1);

                            setResultsOverlay();
                        }),
                    );
                }),
            );

        document.querySelectorAll('#may-roles-container > div').forEach((position, roleIndex) =>
            position.addEventListener('click', () => {
                clickAudio.play();
                const {crew, hp} = state as State.Play;
                const role = +roleIndex as Role;

                if (!(role in crew)) return;

                setOverlay(`
                    <div style="display: flex; flex-direction: column; justify-content: space-between; text-align: center; height: 100%">
                        <div style="display: flex; flex-direction: column; gap: 10px; align-items: center; margin: auto; width: 300px">
                            <button id="may-back-button">BACK</button>
                            ${getCrewMemberHtml(crew[role]!, '<button id="may-fire-button">FIRE</button>')}
                        </div>
                        <h2>CHOOSE ROLE TO SWAP WITH</h2>
                        ${getRolesHtml(role)}
                    </div>
                `);

                document.getElementById('may-back-button')!.addEventListener('click', () => {
                    clickAudio.play();
                    setResultsOverlay();
                });

                document.getElementById('may-fire-button')!.addEventListener('click', () => {
                    clickAudio.play();
                    setOverlay(`
                        <div style="display: flex; flex-direction: column; justify-content: space-between; text-align: center; height: 100%">
                            <div style="display: flex; flex-direction: column; gap: 10px; align-items: center; margin: auto; width: 350px">
                                <h2>Are you sure you want to fire ${crew[role]!.emoji}?</h2>
                                <strong>They cannot be rehired!</strong>
                                ${getCrewMemberHtml(crew[role]!)}
                                <div style="display: flex; gap: 10px">
                                    <button id="may-cancel-button">CANCEL</button>
                                    <button id="may-fire-button">FIRE</button>
                                </div>
                            </div>
                        </div>
                    `);

                    document.getElementById('may-cancel-button')!.addEventListener('click', () => {
                        clickAudio.play();
                        setResultsOverlay();
                    });

                    document.getElementById('may-fire-button')!.addEventListener('click', () => {
                        clickAudio.play();
                        delete crew[role];
                        (state as State.Play).hp = Math.min(hp, getMaxHp());
                        setResultsOverlay();
                    });
                });

                document.querySelectorAll('#may-roles-container > div').forEach((position, newRoleIndex) =>
                    position.addEventListener('click', () => {
                        clickAudio.play();
                        const newRole = +newRoleIndex as Role;

                        if (newRole in crew) {
                            [crew[role], crew[newRole]] = [crew[newRole], crew[role]];
                        } else {
                            crew[newRole] = crew[role];
                            delete crew[role];
                        }

                        setResultsOverlay();
                    }),
                );
            }),
        );
    }

    function getTutorialHtml() {
        if (state.type !== 'play' || state.state.type !== 'playing' || state.state.state.type !== 'live') return '';

        const {tutorialRole, currentRole} = state.state;

        if (tutorialRole === undefined) return '';

        if (tutorialRole === 'done') {
            return `
                <span style="padding: 0 25px">CONTINUE TO <strong>MINE ASTEROIDS</strong>, <strong>SHOOT ENEMIES</strong>, <strong>AND SURVIVE THE ROUND</strong>!</span>
            `;
        }

        if (currentRole !== tutorialRole) {
            return `
                TAP
                <div style="display: inline-flex; justify-content: center; align-items: center; border: 5px solid ${ROLE_COLORS[tutorialRole]}">
                    <svg viewBox="0 0 128 128" style="width: 25px">
                        ${ROLE_ICONS[tutorialRole]}
                    </svg>
                </div>
                OR PRESS ${tutorialRole + 1} TO SELECT <strong>${ROLE_DESCRIPTIONS[tutorialRole]}</strong>
            `;
        }

        switch (tutorialRole) {
            case Role.STEERING:
                return '<span>HOLD SPACE BAR/TAP HERE TO <strong>TURN<br />CLOCKWISE AND FACE ASTEROID</strong></span>';
            case Role.THRUST_CONTROL:
                return '<span>HOLD SPACE BAR/TAP HERE TO <strong>MOVE<br />FORWARD AND MEET ASTEROID</strong></span>';
            case Role.MINING:
                return '<span>HOLD SPACE BAR/TAP HERE TO<br /><strong>MINE ORE FROM ASTEROID</strong></span>';
            case Role.AIM:
                return '<span>HOLD SPACE BAR/TAP HERE<br />TO <strong>AIM TURRET</strong></span>';
            case Role.FIRING:
                return '<span>HOLD SPACE BAR/TAP HERE<br />TO <strong>FIRE TURRET</strong></span>';
            case Role.REPAIR:
                return '<span>HOLD SPACE BAR/TAP HERE<br />TO <strong>REPAIR SHIP</strong></span>';
        }
    }

    function setPlayingOverlay() {
        if (state.type !== 'play' || state.state.type !== 'playing') return;
        const {startTime} = state.state.state;
        const roundTimeLeft = ROUND_DURATION - (Date.now() - startTime);

        if (!document.getElementById('may-game-container')) {
            setOverlay(`
                <div id="may-playing-overlay" style="display: flex; flex-direction: column; height: 100%">
                    <div style="display: flex; flex-grow: 1">
                        <div id="may-game-container" style="flex: 1; display: flex; align-items: center; justify-content: center">
                            <div id="may-countdown-container"></div>
                            <h4 id="may-tutorial-container" style="padding-top: ${PLAY_AREA / 2}px; display: flex; align-items: center; gap: 5px; text-align: center; pointer-events: none"></h4>
                        </div>
                        <div style="flex-basis: ${canvas.width - PLAY_AREA}px; display: flex; flex-direction: column; justify-content: space-between; padding: 10px 0; border-left: 2px solid white; align-items: center">
                            <button id="may-menu-button">MENU</button>
                            <div style="display: flex; flex-direction: column; text-align: center">
                                <strong>Round ${state.roundNumber}</strong>
                                <span><span id="may-time-left-span"></span>s</span>
                            </div>
                            <div style="display: flex; flex-direction: column; text-align: center">
                                <strong id="may-hp-display"></strong>
                                <strong id="may-ore-display"></strong>
                            </div>
                        </div>
                    </div>
                    <div id="may-roles-outer-container"></div>
                </div>
            `);

            document.getElementById('may-menu-button')!.addEventListener('click', confirmMenu);

            const rolesOuter = document.getElementById('may-roles-outer-container');
            if (rolesOuter) {
                rolesOuter.addEventListener('pointerdown', event => {
                    const target = event.target as HTMLElement;
                    const div = target.closest('#may-roles-container > div');
                    if (div) {
                        const container = document.getElementById('may-roles-container');
                        if (container && container.contains(div)) {
                            const divs = Array.from(container.children);
                            const roleIndex = divs.indexOf(div);
                            if (roleIndex !== -1) {
                                switchRole(event, roleIndex as Role);
                            }
                        }
                    }
                });
            }
        }

        const countdownContainer = document.getElementById('may-countdown-container');
        if (countdownContainer) {
            if (state.state.state.type === 'countdown') {
                const count = Math.ceil(((COUNTDOWN_TIME - (Date.now() - startTime)) / COUNTDOWN_TIME) * COUNTDOWN_NUMBERS);
                countdownContainer.innerHTML = `<h1 style="font-size: 100px">${count}</h1>`;
            } else {
                countdownContainer.innerHTML = '';
            }
        }

        const tutorialContainer = document.getElementById('may-tutorial-container');
        if (tutorialContainer) tutorialContainer.innerHTML = getTutorialHtml();

        const timeLeftSpan = document.getElementById('may-time-left-span');
        if (timeLeftSpan) timeLeftSpan.textContent = state.state.state.type === 'live' ? (roundTimeLeft / 1000).toFixed(1) : (ROUND_DURATION / 1000).toFixed(1);

        const hpDisplay = document.getElementById('may-hp-display');
        if (hpDisplay) hpDisplay.textContent = `HP: ${state.hp}/${getMaxHp()}`;

        const oreDisplay = document.getElementById('may-ore-display');
        if (oreDisplay) oreDisplay.textContent = `Ore: ${state.ore}`;

        const rolesOuter = document.getElementById('may-roles-outer-container');
        if (rolesOuter) rolesOuter.innerHTML = getRolesHtml(state.state.currentRole);
    }

    function calculateScore() {
        const {roundNumber, ore, enemiesDestroyed} = state as State.Play;
        return (roundNumber - 1) * 100 + ore * 5 + enemiesDestroyed;
    }

    function setGameOverOverlay() {
        if (state.type !== 'play' || state.state.type !== 'gameOver') return;

        const {roundNumber, ore, enemiesDestroyed, crew} = state;
        const {highScoreBeaten} = state.state;

        const score = calculateScore();

        const roundsSurvivedString = `${roundNumber - 1} (+${(roundNumber - 1) * 100})`;
        const remainingOreString = `${ore} (+${ore * 5})`;
        const enemiesDestroyedString = `${enemiesDestroyed} (+${enemiesDestroyed})`;

        setOverlay(`
            <div id="may-playing-overlay" style="display: flex; flex-direction: column; height: 100%">
                <div style="display: flex; flex-grow: 1">
                    <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; flex-grow: 1; gap: 10px">
                        <h2 style="font-weight: bold">GAME OVER</h2>
                        <table>
                            <tbody>
                                <tr>
                                    <td><strong>Rounds survived</strong></td>
                                    <td>${roundsSurvivedString}</td>
                                </tr>
                                <tr>
                                    <td><strong>Remaining ore</strong></td>
                                    <td>${remainingOreString}</td>
                                </tr>
                                <tr>
                                    <td><strong>Enemies destroyed</strong></td>
                                    <td>${enemiesDestroyedString}</td>
                                </tr>
                                <tr>
                                    <td><strong>Score</strong></td>
                                    <td>${score}</td>
                                </tr>
                                <tr>
                                    <td><strong>High Score${highScoreBeaten ? ' (NEW!)' : ''}</strong></td>
                                    <td>${storage.get('highScore') ?? score}</td>
                                </tr>
                            </tbody>
                        </table>
                        <button id="may-share-button">SHARE</button>
                        <button id="may-play-again-button">PLAY AGAIN</button>
                        <button id="may-menu-button">MAIN MENU</button>
                    </div>
                </div>
                ${getRolesHtml()}
            </div>
        `);

        const shareButton = document.getElementById('may-share-button') as HTMLButtonElement;
        shareButton.addEventListener('click', () => {
            clickAudio.play();
            const crewEntries = Object.entries(crew);
            navigator.clipboard.writeText(
                `🚀 Star Squad\n\n` +
                    `🔢 Rounds survived: ${roundsSurvivedString}\n` +
                    `🪨 Remaining ore: ${remainingOreString}\n` +
                    `💥 Enemies destroyed: ${enemiesDestroyedString}\n` +
                    (crewEntries.length > 0
                        ? `🧑‍🚀 Final crew members: ${crewEntries.length}/6\n` +
                          `🧠 Average final crew skill: ${((crewEntries.reduce((sum, [, member]) => sum + member.skill, 0) / crewEntries.length) * 100).toFixed(0)}%`
                        : '🚫 No final crew') +
                    `\n\n💯 Score: ${score}`,
            );
            shareButton.innerText = 'COPIED!';
            setTimeout(() => (shareButton.innerText = 'SHARE'), 1000);
        });

        document.getElementById('may-play-again-button')!.addEventListener('click', () => {
            clickAudio.play();
            state = {type: 'menu'};
            startRound();
        });

        document.getElementById('may-menu-button')!.addEventListener('click', () => {
            clickAudio.play();
            mainMenu();
        });

        document.querySelectorAll('#may-roles-container > div').forEach((position, roleIndex) =>
            position.addEventListener('click', () => {
                clickAudio.play();
                const {crew} = state as State.Play;
                const role = +roleIndex as Role;

                if (!(role in crew)) return;

                setOverlay(`
                    <div style="display: flex; flex-direction: column; justify-content: space-between; text-align: center; height: 100%">
                        <div style="display: flex; flex-direction: column; gap: 10px; align-items: center; margin: auto; width: 300px">
                            <button id="may-back-button">BACK</button>
                            ${getCrewMemberHtml(crew[role]!)}
                        </div>
                    </div>
                `);

                document.getElementById('may-back-button')!.addEventListener('click', () => {
                    clickAudio.play();
                    setGameOverOverlay();
                });
            }),
        );
    }

    function drawTriangle(x: number, y: number, size: number, direction: number) {
        const thinSize = size / 1.5;

        context.save();
        context.translate(x, y);
        context.rotate(direction);

        context.beginPath();
        context.moveTo(size, 0);
        context.lineTo(-thinSize, -thinSize);
        context.lineTo(-thinSize, thinSize);
        context.fill();

        context.restore();
    }

    function drawTurretArm(x: number, y: number, direction: number, length: number) {
        context.lineWidth = 5;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + Math.cos(direction) * length, y + Math.sin(direction) * length);
        context.stroke();
    }

    function takeDamage(now: number) {
        const playState = state as State.Play;
        const playingState = playState.state as State.PlayState.Playing;
        const liveState = playingState.state as State.PlayState.PlayingState.Live;

        if (liveState.gameOverTimeoutId !== undefined) return;

        if (now - (liveState.lastHitTime ?? -Infinity) > HIT_IMMUNITY_DURATION) {
            liveState.lastHitTime = now;
            --playState.hp;

            if (playState.hp <= 0) {
                clearInterval(playingState.intervalId);
                setTrack('none');
                const score = calculateScore();
                const highScoreBeaten = score > (storage.get('highScore') ?? 0);
                if (highScoreBeaten) storage.set('highScore', score);
                explodeAudio.play();
                liveState.gameOverTimeoutId = setTimeout(() => {
                    (state as State.Play).state = {type: 'gameOver', highScoreBeaten};
                    setTrack('menu');
                    setGameOverOverlay();
                }, GAME_OVER_TIME);
            }

            setPlayingOverlay();
        }
    }

    function createAsteroid(first = false) {
        const drawnMaxAsteroidSize = MAX_ASTEROID_SIZE * ASTEROID_DRAW_SIZE_MULTIPLIER;
        return {
            x: first ? 400 : Math.random() * (PLAY_AREA - drawnMaxAsteroidSize * 2) + drawnMaxAsteroidSize,
            y: first ? 100 : Math.random() * (PLAY_AREA - drawnMaxAsteroidSize * 2) + drawnMaxAsteroidSize,
            size: first ? MAX_ASTEROID_SIZE : randomInt(MIN_ASTEROID_SIZE, MAX_ASTEROID_SIZE),
        };
    }

    function hasPerk(perkKey: keyof typeof PERKS) {
        if (state.type !== 'play') return false;

        const perk = PERKS[perkKey];

        return state.crew[perk.role]?.perk === perk;
    }

    function updatePlayer(now: number, delta: number) {
        if (state.type !== 'play' || state.state.type !== 'playing' || state.state.state.type !== 'live') {
            return {timeSinceLastShot: 0, timeSinceLastMine: 0, timeSinceLastRepair: 0};
        }

        const {asteroid, tutorialRole} = state.state;
        const {position, direction, turretDirection, fireStartTime, mineStartTime, repairStartTime, activeRoles} =
            state.state.state;

        if (activeRoles[Role.THRUST_CONTROL]) {
            const adjustedShipSpeed = SHIP_SPEED * (hasPerk('highPowerEngines') ? 1.25 : 1);
            position.x = Math.max(
                PLAYER_SHIP_SIZE,
                Math.min(position.x + Math.cos(direction) * delta * adjustedShipSpeed, PLAY_AREA - PLAYER_SHIP_SIZE),
            );
            position.y = Math.max(
                PLAYER_SHIP_SIZE,
                Math.min(position.y + Math.sin(direction) * delta * adjustedShipSpeed, PLAY_AREA - PLAYER_SHIP_SIZE),
            );

            context.fillStyle = THRUST_COLOR;
            drawTriangle(
                position.x - Math.cos(direction) * PLAYER_SHIP_SIZE,
                position.y - Math.sin(direction) * PLAYER_SHIP_SIZE,
                PRIMARY_THRUST_SIZE,
                direction + Math.PI,
            );

            if (
                tutorialRole === Role.THRUST_CONTROL &&
                distance(position.x, position.y, asteroid.x, asteroid.y) <
                    asteroid.size * ASTEROID_DRAW_SIZE_MULTIPLIER + PLAYER_SHIP_SIZE
            ) {
                state.state.tutorialRole = Role.MINING;
                setPlayingOverlay();
            }
        }

        if (activeRoles[Role.STEERING]) {
            state.state.state.direction += STEERING_SPEED * delta;
            state.state.state.direction = modulo(state.state.state.direction, Math.PI * 2);
            context.fillStyle = THRUST_COLOR;
            context.save();
            context.rotate(direction);
            context.translate(-5, -10);
            context.rotate(-direction);
            drawTriangle(
                position.x + Math.cos(direction) * (PLAYER_SHIP_SIZE * 0.75),
                position.y + Math.sin(direction) * (PLAYER_SHIP_SIZE * 0.75),
                STEERING_THRUST_SIZE,
                direction - Math.PI / 2,
            );
            context.rotate(direction);
            context.translate(20, 35);
            context.rotate(-direction);
            drawTriangle(
                position.x - Math.cos(direction) * (PLAYER_SHIP_SIZE * 0.75),
                position.y - Math.sin(direction) * (PLAYER_SHIP_SIZE * 0.75),
                STEERING_THRUST_SIZE,
                direction + Math.PI / 2,
            );
            context.restore();
        }

        if (activeRoles[Role.AIM]) {
            state.state.state.turretDirection += TURRET_SPEED * delta;
            state.state.state.turretDirection = modulo(state.state.state.turretDirection, Math.PI * 2);
            if (tutorialRole === Role.AIM && turretDirection > Math.PI / 4) {
                state.state.tutorialRole = Role.FIRING;
                setPlayingOverlay();
            }
        }

        if (activeRoles[Role.FIRING]) {
            if (fireStartTime === undefined) {
                state.state.state.lastFireAudio = setupSoundEffect(fire);
                state.state.state.lastFireAudio.play();
                state.state.state.fireStartTime = now;
            }
        } else {
            state.state.state.fireStartTime = undefined;
            state.state.state.lastFireAudio?.pause();
        }

        if (activeRoles[Role.MINING]) {
            if (mineStartTime === undefined) state.state.state.mineStartTime = now;
            if (now - (mineStartTime ?? now) >= MINING_CHARGE_TIME) {
                const distanceToAsteroid = distance(position.x, position.y, asteroid.x, asteroid.y);
                const asteroidDrawSize = asteroid.size * ASTEROID_DRAW_SIZE_MULTIPLIER + PLAYER_SHIP_SIZE;
                if (distanceToAsteroid < asteroidDrawSize) {
                    ++state.ore;
                    addText('+1 ore', asteroid.x, asteroid.y);
                    mineAudio.play();

                    if (asteroid.size < MIN_ASTEROID_SIZE) {
                        if (tutorialRole === Role.MINING) state.state.tutorialRole = Role.AIM;
                        if (hasPerk('miningEfficiency')) {
                            addText('+3 ore', asteroid.x, asteroid.y);
                            state.ore += 3;
                        }
                        if (hasPerk('minersRespite') && Math.random() < 0.25 && state.hp < getMaxHp()) {
                            addText('+1 hp', position.x, position.y);
                            ++state.hp;
                        }
                        state.state.asteroid = createAsteroid();
                    } else --asteroid.size;

                    if (
                        tutorialRole === Role.MINING &&
                        distanceToAsteroid >= asteroidDrawSize - ASTEROID_DRAW_SIZE_MULTIPLIER
                    ) {
                        state.state.tutorialRole = Role.THRUST_CONTROL;
                        setPlayingOverlay();
                    }

                    setPlayingOverlay();
                }

                state.state.state.mineStartTime = now;
            }
        } else {
            state.state.state.mineStartTime = undefined;
        }

        if (activeRoles[Role.REPAIR]) {
            if (repairStartTime === undefined && state.hp < getMaxHp()) state.state.state.repairStartTime = now;
            if (now - (repairStartTime ?? now) >= REPAIR_CHARGE_TIME && state.hp < getMaxHp()) {
                ++state.hp;
                addText('+1 hp', position.x, position.y);
                if (tutorialRole === Role.REPAIR) state.state.tutorialRole = 'done';
                state.state.state.repairStartTime = state.hp < getMaxHp() ? now : undefined;
                setPlayingOverlay();
            }
        } else {
            state.state.state.repairStartTime = undefined;
        }

        document.querySelectorAll('#may-roles-container .background').forEach((element, role) => {
            (element as HTMLDivElement).style.height = `${getBackgroundHeight(now, +role) * 100}%`;
        });

        if ([Role.STEERING, Role.THRUST_CONTROL].includes(tutorialRole as Role)) {
            const asteroidDirection = getDirection(position.x, position.y, asteroid.x, asteroid.y);
            const directionDifference = Math.min(
                modulo(direction - asteroidDirection + Math.PI * 2, Math.PI * 2),
                modulo(asteroidDirection - direction + Math.PI * 2, Math.PI * 2),
            );

            if (tutorialRole === Role.STEERING && directionDifference < Math.PI / 4) {
                state.state.tutorialRole = Role.THRUST_CONTROL;
                setPlayingOverlay();
            } else if (tutorialRole === Role.THRUST_CONTROL && directionDifference > Math.PI / 4) {
                state.state.tutorialRole = Role.STEERING;
                setPlayingOverlay();
            }
        }
    }

    function updateEnemies(now: number, delta: number) {
        if (state.type !== 'play' || state.state.type !== 'playing' || state.state.state.type !== 'live') return;

        const {position, enemies} = state.state.state;

        for (const enemy of enemies.values()) {
            enemy.x += Math.cos(enemy.direction) * delta * ENEMY_SHIP_SPEED;
            enemy.y += Math.sin(enemy.direction) * delta * ENEMY_SHIP_SPEED;

            if (
                state.roundNumber <= 1 ||
                enemy.x <= ENEMY_SPAWN_OFFSET ||
                enemy.x >= PLAY_AREA - ENEMY_SPAWN_OFFSET ||
                enemy.y <= ENEMY_SPAWN_OFFSET ||
                enemy.y >= PLAY_AREA - ENEMY_SPAWN_OFFSET
            ) {
                continue;
            }

            const targetTurretDirection = getDirection(enemy.x, enemy.y, position.x, position.y);
            const clockwiseDistance = modulo(enemy.turretDirection - targetTurretDirection + Math.PI * 2, Math.PI * 2);
            const counterClockwiseDistance = modulo(
                targetTurretDirection - enemy.turretDirection + Math.PI * 2,
                Math.PI * 2,
            );

            const change = ENEMY_SHIP_TURRET_SPEED * delta;
            enemy.turretDirection += clockwiseDistance < counterClockwiseDistance ? -change : change;
            enemy.turretDirection = modulo(enemy.turretDirection, Math.PI * 2);

            const timeSinceLastShot = now - (enemy.lastShotTime ?? -Infinity);
            const timeSinceLastShotAttempt = now - (enemy.lastShotAttemptTime ?? -Infinity);
            if (timeSinceLastShot > ENEMY_FIRING_COOLDOWN && timeSinceLastShotAttempt > ENEMY_SHOT_ATTEMPT_COOLDOWN) {
                if (
                    Math.abs(enemy.turretDirection - targetTurretDirection) / (Math.PI / 3) <
                    Math.pow(Math.random(), 3)
                ) {
                    enemy.fireStartTime = now;
                    enemy.lastFireAudio = setupSoundEffect(fire);
                    enemy.lastFireAudio.play();
                }

                enemy.lastShotAttemptTime = now;
            }
        }
    }

    function processShot<T extends {x: number; y: number}>(
        x: number,
        y: number,
        direction: number,
        intersectData?: {
            targets: T[];
            targetSize: number;
            onHit: (target: T) => void;
        },
        piercing = false,
    ) {
        const lineEndX = x + Math.cos(direction) * PLAY_AREA * 2;
        const lineEndY = y + Math.sin(direction) * PLAY_AREA * 2;

        context.strokeStyle = context.lineWidth < SHOT_WIDTH_MULTIPLIER - 1 ? SHOT_PRIMING_COLOR : SHOT_COLOR;
        context.beginPath();
        context.moveTo(x, y);

        if (intersectData === undefined) {
            context.lineTo(lineEndX, lineEndY);
            context.stroke();
            return;
        }

        const {targets, targetSize, onHit} = intersectData;

        const intersections = targets.flatMap(target => {
            const intersection = getRectangleIntersection(
                x,
                y,
                lineEndX,
                lineEndY,
                target.x - targetSize / 2,
                target.y - targetSize / 2,
                targetSize,
                targetSize,
            );
            return intersection === undefined ? [] : [{target, intersection}];
        });

        if (intersections.length === 0) {
            context.lineTo(lineEndX, lineEndY);
            context.stroke();
            return;
        }

        if (piercing) {
            context.lineTo(lineEndX, lineEndY);
            context.stroke();
            for (const {target} of intersections) onHit(target);
            return;
        }

        const [{target, intersection}] = intersections.sort(
            (a, b) => a.intersection.distance - b.intersection.distance,
        );
        context.lineTo(intersection.point.x, intersection.point.y);
        context.stroke();
        onHit(target);
    }

    function getDirection(fromX: number, fromY: number, toX: number, toY: number) {
        const direction = Math.atan2(toY - fromY, toX - fromX);
        return direction < 0 ? direction + Math.PI * 2 : direction;
    }

    function getCrewLogicHelpers(playingState: State.PlayState.Playing): CrewLogicHelpers {
        const {asteroid} = playingState;
        const {enemies, position, turretDirection} = playingState.state as State.PlayState.PlayingState.Live;

        return {
            asteroidDistance: distance(position.x, position.y, asteroid.x, asteroid.y),
            asteroidDirection: getDirection(position.x, position.y, asteroid.x, asteroid.y),
            targetTurretDirection: Math.min(
                ...enemies.map(enemy =>
                    Math.abs(turretDirection - getDirection(position.x, position.y, enemy.x, enemy.y)),
                ),
            ),
        };
    }

    function calculateAdjustedSkill(skill: number) {
        return {high: Math.pow(skill, 0.003), low: Math.pow(skill, 6)};
    }

    function updateCrew() {
        if (state.type !== 'play' || state.state.type !== 'playing' || state.state.state.type !== 'live') return;

        const {
            currentRole,
            state: {activeRoles},
        } = state.state;

        const helpers = getCrewLogicHelpers(state.state);

        for (const [roleKey, member] of Object.entries(state.crew)) {
            const role = +roleKey as Role;

            if (role === currentRole) continue;

            const adjustedSkill = calculateAdjustedSkill(member.skill);

            activeRoles[role] = CREW_LOGIC[role](member, state.state, state.state.state, helpers, adjustedSkill);
        }
    }

    function draw(now: number) {
        if (done) return;

        context.drawImage(backgroundCanvas, 0, 0);

        if (state.type !== 'play' || state.state.type !== 'playing') return;

        const {asteroid, lastDrawTime, tutorialRole} = state.state;

        const delta = lastDrawTime === undefined ? 0 : now - lastDrawTime;
        state.state.lastDrawTime = now;

        context.fillStyle = ASTEROID_COLOR;
        context.beginPath();
        context.arc(asteroid.x, asteroid.y, asteroid.size * ASTEROID_DRAW_SIZE_MULTIPLIER, 0, Math.PI * 2);
        context.fill();

        if (state.state.state.type === 'countdown') {
            const positionY = PLAY_AREA / 2;
            const positionX = (PLAY_AREA / 2) * ((Date.now() - state.state.state.startTime) / COUNTDOWN_TIME);

            context.fillStyle = PLAYER_SHIP_COLOR;
            drawTriangle(positionX, PLAY_AREA / 2, PLAYER_SHIP_SIZE, 0);

            context.fillStyle = THRUST_COLOR;
            drawTriangle(positionX - PLAYER_SHIP_SIZE, positionY, PRIMARY_THRUST_SIZE, Math.PI);

            requestAnimationFrame(draw);
            return;
        }

        const {
            position,
            direction,
            turretDirection,
            enemies,
            texts,
            lastHitTime,
            fireStartTime,
            mineStartTime,
            repairStartTime,
            gameOverTimeoutId,
        } = state.state.state;

        if (gameOverTimeoutId === undefined) {
            updateCrew();
            updatePlayer(now, delta);
            updateEnemies(now, delta);

            if (hasPerk('tractorBeam')) {
                const directionTowardsPlayer = getDirection(asteroid.x, asteroid.y, position.x, position.y);
                asteroid.x += Math.cos(directionTowardsPlayer) * delta * ASTEROID_SPEED;
                asteroid.y += Math.sin(directionTowardsPlayer) * delta * ASTEROID_SPEED;
            }

            context.fillStyle = PLAYER_SHIP_COLOR;
            context.strokeStyle = PLAYER_TURRET_ARM_COLOR;
            const timeSinceLastHit = now - (lastHitTime ?? -Infinity);
            if (timeSinceLastHit > HIT_IMMUNITY_DURATION || Math.floor(timeSinceLastHit / 100) % 2) {
                drawTriangle(position.x, position.y, PLAYER_SHIP_SIZE, direction);
            }
            drawTurretArm(position.x, position.y, turretDirection, PLAYER_SHIP_SIZE);
        }

        context.fillStyle = ENEMY_SHIP_COLOR;
        context.strokeStyle = ENEMY_TURRET_ARM_COLOR;
        for (const {turretDirection, x, y} of enemies) {
            context.fillRect(x - ENEMY_SHIP_SIZE / 2, y - ENEMY_SHIP_SIZE / 2, ENEMY_SHIP_SIZE, ENEMY_SHIP_SIZE);
            drawTurretArm(x, y, turretDirection, ENEMY_SHIP_SIZE);
        }

        if (gameOverTimeoutId === undefined && fireStartTime !== undefined) {
            // lineWidth cannot be set to 0, instead set it to a very small value
            context.lineWidth = Math.max(((now - fireStartTime) / SHOT_DURATION) ** 3 * SHOT_WIDTH_MULTIPLIER, 0.0001);
            const charged = now - fireStartTime >= SHOT_DURATION;
            (hasPerk('tripleShot') ? [-Math.PI / 18, 0, Math.PI / 18] : [0]).forEach(offset => {
                processShot(
                    position.x + Math.cos(turretDirection) * PLAYER_SHIP_SIZE,
                    position.y + Math.sin(turretDirection) * PLAYER_SHIP_SIZE,
                    turretDirection + offset,
                    charged
                        ? {
                              targets: enemies,
                              targetSize: ENEMY_SHIP_SIZE,
                              onHit: hit => {
                                  hit.lastFireAudio?.pause();
                                  enemies.splice(enemies.indexOf(hit), 1);
                                  ++(state as State.Play).enemiesDestroyed;
                                  if (hasPerk('scavenger')) {
                                      ++(state as State.Play).ore;
                                      addText('+1 ore', hit.x, hit.y);
                                  }
                                  if (
                                      hasPerk('lifeSteal') &&
                                      (state as State.Play).hp < getMaxHp() &&
                                      Math.random() < 0.15
                                  ) {
                                      addText('+1 hp', hit.x, hit.y);
                                      ++(state as State.Play).hp;
                                  }
                              },
                          }
                        : undefined,
                    hasPerk('piercingShots'),
                );
            });
            if (charged) {
                if (tutorialRole === Role.FIRING) {
                    state.state.tutorialRole = Role.REPAIR;
                    setPlayingOverlay();
                }
                state.state.state.fireStartTime = undefined;
                state.state.state.lastFireAudio = undefined;
            }
        }

        if (gameOverTimeoutId === undefined && mineStartTime !== undefined) {
            const progress = (now - mineStartTime) / MINING_CHARGE_TIME;
            context.globalAlpha = progress;
            context.strokeStyle = ASTEROID_COLOR;
            context.lineWidth = progress * 3;
            context.beginPath();
            context.arc(position.x, position.y, PLAYER_SHIP_SIZE, 0, Math.PI * 2);
            context.stroke();
            context.globalAlpha = 1;
        }

        if (gameOverTimeoutId === undefined && repairStartTime !== undefined) {
            const progress = (now - repairStartTime) / REPAIR_CHARGE_TIME;
            const radius = (PLAYER_SHIP_SIZE * (1 - progress)) / 2;
            if (radius > 0) {
                context.globalAlpha = progress;
                context.fillStyle = REPAIR_COLOR;
                context.beginPath();
                context.arc(position.x, position.y, radius, 0, Math.PI * 2);
                context.fill();
                context.globalAlpha = 1;
            }
        }

        for (const enemy of enemies) {
            if (enemy.fireStartTime === undefined) continue;

            const charged = now - enemy.fireStartTime >= SHOT_DURATION;

            // lineWidth cannot be set to 0, instead set it to a very small value
            context.lineWidth = Math.max(
                ((now - enemy.fireStartTime) / SHOT_DURATION) ** 3 * SHOT_WIDTH_MULTIPLIER,
                0.0001,
            );

            const missed = hasPerk('evasion') && Math.random() < 0.15;
            processShot(
                enemy.x + Math.cos(enemy.turretDirection) * ENEMY_SHIP_SIZE,
                enemy.y + Math.sin(enemy.turretDirection) * ENEMY_SHIP_SIZE,
                enemy.turretDirection,
                charged && !missed
                    ? {
                          targets: [position],
                          targetSize: PLAYER_SHIP_SIZE,
                          onHit: () => takeDamage(now),
                      }
                    : undefined,
            );

            if (charged) {
                if (missed) addText('miss!', position.x, position.y);

                enemy.fireStartTime = undefined;
                enemy.lastShotTime = now;
            }
        }

        state.state.state.texts = texts.filter(({time}) => Date.now() - time < TEXT_DURATION);

        for (const {text, x, y, time} of texts) {
            const progress = (Date.now() - time) / TEXT_DURATION;

            context.fillStyle = 'white';
            context.globalAlpha = 1 - progress;
            context.fillText(text, x + Math.sin(progress * 10) * 2, y - progress * 20);
            context.globalAlpha = 1;
        }

        context.drawImage(backgroundCanvas, PLAY_AREA, 0);
        context.drawImage(backgroundCanvas, 0, PLAY_AREA);

        requestAnimationFrame(draw);
    }

    function inputDown() {
        if (state.type !== 'play' || state.state.type !== 'playing' || state.state.state.type !== 'live') return;

        const {
            currentRole,
            state: {activeRoles},
        } = state.state;

        if (currentRole === undefined) return;

        if (!activeRoles[currentRole]) activeRoles[currentRole] = true;
    }

    function inputUp() {
        if (state.type !== 'play' || state.state.type !== 'playing' || state.state.state.type !== 'live') return;

        const {
            currentRole,
            state: {activeRoles},
        } = state.state;

        if (currentRole === undefined) return;

        activeRoles[currentRole] = false;
        setPlayingOverlay();
    }

    function switchRole(event: Event, role: Role) {
        event.preventDefault();

        if (state.type !== 'play' || state.state.type !== 'playing') return;

        if (
            typeof state.state.tutorialRole === 'number' &&
            TUTORIAL_ORDER.indexOf(state.state.tutorialRole) < TUTORIAL_ORDER.indexOf(role)
        ) {
            return;
        }

        const {currentRole} = state.state;

        state.state.currentRole = role;

        if (state.state.state.type !== 'live') {
            setPlayingOverlay();
            return;
        }

        const {
            spaceDown,
            pointersDown,
            state: {activeRoles},
        } = state.state;

        if (currentRole !== undefined) {
            if (role === currentRole) {
                state.state.currentRole = undefined;
                activeRoles[currentRole] = false;
                setPlayingOverlay();
                return;
            }
            activeRoles[role] = activeRoles[currentRole];
            if (!(currentRole in state.crew)) activeRoles[currentRole] = false;
        } else {
            activeRoles[role] = spaceDown || pointersDown.size > 0;
        }

        setPlayingOverlay();
    }

    function onKeyDown(event: KeyboardEvent) {
        usingKeyboard = true;

        if (state.type !== 'play' || state.state.type !== 'playing' || event.ctrlKey || event.metaKey) return;

        if (event.key === ' ') {
            event.preventDefault();
            if (!state.state.spaceDown) {
                state.state.spaceDown = true;
                inputDown();
                return;
            }
        }

        const numberKey = +event.key;
        if (numberKey >= 1 && numberKey <= 6) {
            switchRole(event, numberKey - 1);
            return;
        }
    }

    function onKeyUp(event: KeyboardEvent) {
        if (state.type !== 'play' || state.state.type !== 'playing') return;

        const {currentRole} = state.state;

        if (event.key === ' ') {
            state.state.spaceDown = false;
            if (state.state.state.type === 'live' && currentRole !== undefined) {
                state.state.state.activeRoles[currentRole] = false;
                setPlayingOverlay();
                return;
            }
        }
    }

    function onTouchStart() {
        usingKeyboard = false;
    }

    function onPointerDown(event: PointerEvent) {
        if (state.type !== 'play' || state.state.type !== 'playing') return;

        if (event.target !== null && event.target === document.getElementById('may-game-container')) {
            state.state.pointersDown.add(event.pointerId);
            event.preventDefault();
            inputDown();
        }
    }

    function onPointerUp(event: PointerEvent) {
        if (state.type !== 'play' || state.state.type !== 'playing') return;

        state.state.pointersDown.delete(event.pointerId);
        if (state.state.state.type === 'live' && state.state.pointersDown.size === 0) inputUp();
    }

    context.font = `16px ${FONT}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    updateBackground();
    requestAnimationFrame(draw);
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
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    document.addEventListener('touchstart', onTouchStart);
    return () => {
        menuSource?.source.stop();
        actionSource?.source.stop();
        done = true;
        if (state.type === 'play' && state.state.type === 'playing') {
            clearInterval(state.state.intervalId);
            if (state.state.state.type === 'live' && state.state.state.gameOverTimeoutId !== undefined) {
                clearTimeout(state.state.state.gameOverTimeoutId);
            }
        }
        window.removeEventListener('blur', onBlur);
        window.removeEventListener('focus', onFocus);

        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        document.removeEventListener('pointerdown', onPointerDown);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);
        document.removeEventListener('touchstart', onTouchStart);
    };
}

import click from '../../assets/click.ogg';
import explode from '../../assets/explode.ogg';
import hiss from '../../assets/hiss.ogg';
import logo from './logo.webp';
import mine from '../../assets/mine.ogg';
import music from './music.ogg';
import press from './sounds/press.ogg';
import splash1 from './sounds/splash1.ogg';
import splash2 from './sounds/splash2.ogg';
import tick1 from './sounds/tick1.ogg';
import tick2 from './sounds/tick2.ogg';
import tick3 from './sounds/tick3.ogg';
import tick4 from './sounds/tick4.ogg';
import tick5 from './sounds/tick5.ogg';
import tick6 from './sounds/tick6.ogg';
import win from '../../assets/win.ogg';
import {FONT, UI_WHITE} from '../../shared/style.ts';
import {canvas, context, overlay, setOverlay} from '../../dom';
import {choice, modulo} from '../../util.ts';
import {create} from 'random-seed';
import {setupSoundEffect, setupMusic} from '../../audio';
import {setupStorage} from '../../shared/storage.ts';

namespace GameObject {
    interface Base {
        x: number;
        y: number;
    }

    export interface Domino extends Base {
        type: 'domino';
        angle: number;
        curveFrom?: number;
        // false = standing, number = falling, true = fallen
        fallState: boolean | number;
        halfClackPlayed?: true;
        large?: true;
    }

    export interface Piston extends Base {
        type: 'piston';
        angle: number;
        // false = retracted, number = extending, true = extended
        extendState: boolean | number;
        display?: true;
    }

    export interface Button extends Base {
        type: 'button';
        pressed: boolean;
    }

    export interface Mine extends Base {
        type: 'mine';
    }

    export interface Spinner extends Base {
        type: 'spinner';
        angle: number;
        clockwise: boolean;
        // false = still, number = spinning, true = spun
        spinState: boolean | number;
    }

    export interface Ball extends Base {
        type: 'ball';
        moveState?: {
            direction: number;
            progress: number;
        };
    }

    export interface Wall extends Base {
        type: 'wall';
        angle: number;
    }

    export interface Text extends Base {
        type: 'text';
        text: string;
    }

    export type Any = Domino | Piston | Button | Mine | Spinner | Ball | Wall | Text;
}

namespace State {
    export interface Menu {
        type: 'menu';
    }

    export interface Play {
        type: 'play';
        levelIndex: number;
        level: GameObject.Any[];
        lastTime: number;
        complete: boolean;
        scale: number;
        explosion?: [number, number];
    }

    export type Any = Menu | Play;
}

export function august() {
    const BACKGROUND_COLOR = '#282c34';
    const BALL_BORDER_COLOR = '#004876';
    const BALL_COLOR = '#00b2b2';
    const BUTTON_BORDER_COLOR = '#76ad6e';
    const BUTTON_PRESSED_COLOR = '#00ff04';
    const BUTTON_UNPRESSED_COLOR = '#039605';
    const DOMINO_BORDER_COLOR = '#808080';
    const DOMINO_COLOR = '#dddddd';
    const EXPLOSION_START_COLOR = '#ffa800';
    const EXPLOSION_STOP_COLOR = '#fd1a1a';
    const MINE_BORDER_COLOR = '#f88a8a';
    const MINE_CENTER_COLOR = '#cb0000';
    const MINE_COLOR = '#1d1717';
    const PISTON_BORDER_COLOR = '#ffc841';
    const PISTON_COLOR = '#fffaa1';
    const SPINNER_BORDER_COLOR = '#a104b1';
    const SPINNER_COLOR = '#ea4afa';
    const WALL_BORDER_COLOR = '#ca8100';
    const WALL_COLOR = '#fff426';

    const BALL_BORDER_WIDTH = 0.05;
    const BALL_SPEED = 2;
    const BUTTON_BORDER_WIDTH = 0.1;
    const CURVE_FROM_OFFSET = 0.25;
    const DOMINO_BASE_WIDTH = 0.1;
    const DOMINO_BORDER_WIDTH = 0.025;
    const DOMINO_FULL_WIDTH = 0.5;
    const DOMINO_FULL_WIDTH_LARGE = 1;
    const DOMINO_LENGTH = 0.5;
    const DOMINO_LENGTH_LARGE = 1.5;
    const DOMINO_RANDOM_ROTATION_MAX = 0.05;
    const FALL_SPEED = 4;
    const MINE_BORDER_WIDTH = 0.05;
    const MINE_CENTER_WIDTH = 0.25;
    const MINE_WIDTH = 0.5;
    const PISTON_BORDER_WIDTH = 0.1;
    const PISTON_LENGTH = 0.5;
    const PISTON_WIDTH = 0.1;
    const SPINNER_BORDER_WIDTH = 0.05;
    const WALL_BORDER_WIDTH = 0.05;
    const WALL_WIDTH = 0.15;

    const DIRECTIONS = [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
    ];

    const OFFSETS = [
        [1, 0, 0, -1],
        [0, 0, -1, 1],
        [0, -1, 1, 0],
        [-1, 1, 0, 0],
    ];

    const LEVELS: GameObject.Any[][] = [
        // 1
        [
            {type: 'button', x: 2, y: 0, pressed: false},
            {type: 'domino', x: 1, y: 0, angle: 0, fallState: false},
            {type: 'domino', x: 0, y: 0, angle: 0, fallState: false},
            {type: 'domino', x: -1, y: 0, angle: 0, fallState: false},
            {type: 'piston', x: -2, y: 0, angle: 0, extendState: false},
            {type: 'piston', x: -0.1, y: -1, angle: 0, extendState: false, display: true},
            {type: 'text', x: 0, y: -1, text: 'Click/tap      to push dominos'},
        ],
        // 2
        [
            {type: 'button', x: -3, y: 2, pressed: false},
            {type: 'button', x: 2, y: -1, pressed: false},
            {type: 'mine', x: 2, y: 3},
            {type: 'mine', x: 0, y: -1},
            {type: 'domino', x: 0, y: 0, angle: 3, fallState: false},
            {type: 'domino', x: 0, y: 1, angle: 3, fallState: false, curveFrom: 1},
            {type: 'domino', x: 1, y: 1, angle: 2, fallState: false, curveFrom: 2},
            {type: 'domino', x: 1, y: 0, angle: 1, fallState: false},
            {type: 'domino', x: 1, y: -1, angle: 1, fallState: false},
            {type: 'domino', x: 2, y: 0, angle: 3, fallState: false},
            {type: 'domino', x: 2, y: 1, angle: 3, fallState: false},
            {type: 'domino', x: 2, y: 2, angle: 3, fallState: false, curveFrom: 0},
            {type: 'domino', x: 1, y: 2, angle: 0, fallState: false},
            {type: 'domino', x: 0, y: 2, angle: 0, fallState: false},
            {type: 'domino', x: -1, y: 2, angle: 0, fallState: false, curveFrom: 3},
            {type: 'domino', x: -1, y: 1, angle: 1, fallState: false},
            {type: 'domino', x: -1, y: 0, angle: 1, fallState: false, curveFrom: 3},
            {type: 'domino', x: -2, y: 0, angle: 0, fallState: false, curveFrom: 3},
            {type: 'domino', x: -2, y: -1, angle: 1, fallState: false, curveFrom: 2},
            {type: 'domino', x: -1, y: -1, angle: 2, fallState: false, curveFrom: 2},
            {type: 'domino', x: 1, y: 3, angle: 0, fallState: false},
            {type: 'domino', x: 0, y: 3, angle: 0, fallState: false},
            {type: 'domino', x: -1, y: 3, angle: 0, fallState: false},
            {type: 'domino', x: -2, y: 3, angle: 0, fallState: false, curveFrom: 3},
            {type: 'domino', x: -2, y: 2, angle: 1, fallState: false},
            {type: 'domino', x: -2, y: 1, angle: 1, fallState: false, curveFrom: 3},
            {type: 'domino', x: -3, y: 1, angle: 0, fallState: false, curveFrom: 3},
            {type: 'domino', x: -3, y: 0, angle: 1, fallState: false},
            {type: 'domino', x: -3, y: -1, angle: 1, fallState: false},
            {type: 'domino', x: -3, y: 3, angle: 3, fallState: false},
            {type: 'domino', x: -3, y: 4, angle: 3, fallState: false, curveFrom: 1},
            {type: 'domino', x: -2, y: 4, angle: 2, fallState: false},
            {type: 'domino', x: -1, y: 4, angle: 2, fallState: false},
            {type: 'domino', x: 0, y: 4, angle: 2, fallState: false},
            {type: 'domino', x: 1, y: 4, angle: 2, fallState: false},
            {type: 'domino', x: 2, y: 4, angle: 2, fallState: false},
            {type: 'domino', x: 3, y: 4, angle: 2, fallState: false, curveFrom: 2},
            {type: 'domino', x: 3, y: 3, angle: 1, fallState: false},
            {type: 'domino', x: 3, y: 2, angle: 1, fallState: false},
            {type: 'domino', x: 3, y: 1, angle: 1, fallState: false},
            {type: 'domino', x: 3, y: 0, angle: 1, fallState: false},
            {type: 'domino', x: 3, y: -1, angle: 1, fallState: false},
            {type: 'piston', x: -3, y: -2, angle: 1, extendState: false},
            {type: 'piston', x: -1, y: -2, angle: 1, extendState: false},
            {type: 'piston', x: 1, y: -2, angle: 1, extendState: false},
            {type: 'piston', x: 3, y: -2, angle: 1, extendState: false},
            {type: 'text', x: 0, y: -3.25, text: 'Push all buttons, avoid mines'},
        ],
        // 3
        [
            {type: 'button', x: -5, y: 3, pressed: false},
            {type: 'button', x: 5, y: 0, pressed: false},
            {type: 'mine', x: -5, y: 1},
            {type: 'domino', x: -4, y: 1, angle: 2, fallState: false},
            {type: 'domino', x: -3, y: 1, angle: 2, fallState: false},
            {type: 'domino', x: -2, y: 1, angle: 2, fallState: false},
            {type: 'domino', x: -1, y: 0, angle: 1, fallState: false},
            {type: 'domino', x: -1, y: -1, angle: 1, fallState: false},
            {type: 'domino', x: 0, y: 1, angle: 2, fallState: false},
            {type: 'domino', x: 1, y: 1, angle: 2, fallState: false},
            {type: 'domino', x: 3, y: 0, angle: 0, fallState: false},
            {type: 'domino', x: 4, y: 0, angle: 0, fallState: false},
            {type: 'domino', x: 3, y: 1, angle: 2, fallState: false},
            {type: 'domino', x: 4, y: 1, angle: 2, fallState: false},
            {type: 'domino', x: 0, y: 3, angle: 2, fallState: false},
            {type: 'domino', x: 1, y: 3, angle: 2, fallState: false},
            {type: 'domino', x: 2, y: 3, angle: 2, fallState: false},
            {type: 'domino', x: 3, y: 3, angle: 2, fallState: false},
            {type: 'domino', x: 4, y: 3, angle: 2, fallState: false},
            {type: 'ball', x: -1, y: 1},
            {type: 'piston', x: -1, y: -2, angle: 1, extendState: false},
            {type: 'piston', x: 5, y: 1, angle: 2, extendState: false},
            {type: 'piston', x: 5, y: 3, angle: 2, extendState: false},
            {type: 'spinner', x: 2, y: 1, angle: 2, spinState: false, clockwise: true},
            {type: 'text', x: 0, y: -3.5, text: 'Spinners spin, balls roll'},
            {type: 'wall', x: -1, y: 3, angle: 1},
        ],
        // 4
        [
            {type: 'button', x: -2, y: 4, pressed: false},
            {type: 'ball', x: -2, y: -3},
            {type: 'piston', x: -2, y: 0, angle: 1, extendState: false},
            {type: 'piston', x: -3, y: -3, angle: 0, extendState: false},
            {type: 'piston', x: 2, y: -4, angle: 1, extendState: false},
            {type: 'piston', x: 3, y: 1, angle: 2, extendState: false},
        ],
        // 5
        [
            {type: 'button', x: 6, y: 5, pressed: false},
            {type: 'mine', x: -6, y: 0},
            {type: 'domino', x: -6, y: -1, angle: 1, fallState: false},
            {type: 'domino', x: -6, y: -3, angle: 1, fallState: false},
            {type: 'domino', x: -6, y: -4, angle: 1, fallState: false, curveFrom: 2},
            {type: 'domino', x: -5, y: -4, angle: 2, fallState: false},
            {type: 'domino', x: -4, y: -4, angle: 2, fallState: false},
            {type: 'domino', x: -3, y: -4, angle: 2, fallState: false},
            {type: 'domino', x: -2, y: -4, angle: 2, fallState: false},
            {type: 'domino', x: -1, y: -4, angle: 2, fallState: false},
            {type: 'domino', x: 6, y: 4, angle: 1, fallState: false},
            {type: 'domino', x: 6, y: 2, angle: 1, fallState: false},
            {type: 'domino', x: 6, y: 1, angle: 1, fallState: false},
            {type: 'domino', x: 6, y: 0, angle: 1, fallState: false},
            {type: 'domino', x: 6, y: -1, angle: 1, fallState: false},
            {type: 'domino', x: 6, y: -2, angle: 1, fallState: false},
            {type: 'domino', x: 6, y: -3, angle: 1, fallState: false},
            {type: 'domino', x: 6, y: -4, angle: 1, fallState: false},
            {type: 'domino', x: 6, y: -5, angle: 1, fallState: false, curveFrom: 3},
            {type: 'domino', x: 5, y: -5, angle: 0, fallState: false},
            {type: 'domino', x: 4, y: -5, angle: 0, fallState: false},
            {type: 'domino', x: 3, y: -5, angle: 0, fallState: false},
            {type: 'domino', x: 2, y: -5, angle: 0, fallState: false},
            {type: 'domino', x: 1, y: -5, angle: 0, fallState: false},
            {type: 'domino', x: -3, y: -2, angle: 2, fallState: false},
            {type: 'domino', x: -2, y: -2, angle: 2, fallState: false, curveFrom: 1},
            {type: 'domino', x: -2, y: -1, angle: 3, fallState: false},
            {type: 'domino', x: -2, y: 0, angle: 3, fallState: false, curveFrom: 1},
            {type: 'domino', x: -1, y: 0, angle: 2, fallState: false},
            {type: 'domino', x: 3, y: 3, angle: 0, fallState: false},
            {type: 'domino', x: 2, y: 3, angle: 0, fallState: false, curveFrom: 3},
            {type: 'domino', x: 2, y: 2, angle: 1, fallState: false},
            {type: 'domino', x: 2, y: 1, angle: 1, fallState: false, curveFrom: 3},
            {type: 'domino', x: 1, y: 1, angle: 0, fallState: false},
            {type: 'ball', x: -4, y: -2},
            {type: 'ball', x: 4, y: 3},
            {type: 'piston', x: -1, y: -5, angle: 0, extendState: false},
            {type: 'piston', x: 1, y: 0, angle: 2, extendState: false},
            {type: 'spinner', x: 0, y: -5, angle: 0, spinState: false, clockwise: true},
            {type: 'spinner', x: 0, y: 0, angle: 0, spinState: false, clockwise: false},
            {type: 'wall', x: -6, y: -2, angle: 2},
            {type: 'wall', x: 6, y: 3, angle: 0},
        ],
        // 6
        [
            {type: 'button', x: -3, y: 7, pressed: false},
            {type: 'mine', x: 5, y: 7},
            {type: 'domino', x: -3, y: 6, angle: 1, fallState: false},
            {type: 'domino', x: -3, y: 5, angle: 1, fallState: false},
            {type: 'domino', x: -3, y: 4, angle: 1, fallState: false},
            {type: 'domino', x: -3, y: 2, angle: 1, fallState: false},
            {type: 'domino', x: -3, y: 0, angle: 1, fallState: false},
            {type: 'domino', x: -3, y: -1, angle: 1, fallState: false, curveFrom: 2},
            {type: 'domino', x: 0, y: 3, angle: 2, fallState: false},
            {type: 'domino', x: 1, y: 3, angle: 2, fallState: false, curveFrom: 2},
            {type: 'domino', x: 1, y: 2, angle: 1, fallState: false},
            {type: 'domino', x: 1, y: 1, angle: 1, fallState: false},
            {type: 'domino', x: 1, y: 0, angle: 1, fallState: false},
            {type: 'domino', x: 1, y: -1, angle: 1, fallState: false, curveFrom: 2},
            {type: 'domino', x: -6, y: 1, angle: 0, fallState: false},
            {type: 'domino', x: -7, y: 1, angle: 0, fallState: false, curveFrom: 3},
            {type: 'domino', x: -7, y: 0, angle: 1, fallState: false},
            {type: 'domino', x: -7, y: -1, angle: 1, fallState: false, curveFrom: 2},
            {type: 'domino', x: -6, y: -3, angle: 1, fallState: false},
            {type: 'domino', x: -6, y: -4, angle: 1, fallState: false},
            {type: 'domino', x: -6, y: -5, angle: 1, fallState: false, curveFrom: 2},
            {type: 'domino', x: -5, y: -5, angle: 2, fallState: false},
            {type: 'domino', x: -4, y: -5, angle: 2, fallState: false},
            {type: 'domino', x: -2, y: -3, angle: 1, fallState: false},
            {type: 'domino', x: -2, y: -4, angle: 1, fallState: false, curveFrom: 3},
            {type: 'domino', x: 2, y: -3, angle: 1, fallState: false},
            {type: 'domino', x: 2, y: -4, angle: 1, fallState: false, curveFrom: 3},
            {type: 'domino', x: 5, y: -2, angle: 1, fallState: false, curveFrom: 2},
            {type: 'domino', x: 6, y: -2, angle: 2, fallState: false, curveFrom: 1},
            {type: 'domino', x: 6, y: 7, angle: 3, fallState: false, curveFrom: 1},
            {type: 'domino', x: 7, y: 7, angle: 2, fallState: false, curveFrom: 2},
            {type: 'domino', x: 7, y: -2, angle: 1, fallState: false},
            {type: 'domino', x: 7, y: -4, angle: 1, fallState: false},
            {type: 'domino', x: 7, y: -5, angle: 1, fallState: false},
            {type: 'domino', x: 7, y: -6, angle: 1, fallState: false, curveFrom: 3},
            {type: 'domino', x: 6, y: -6, angle: 0, fallState: false},
            {type: 'domino', x: 5, y: -5, angle: 2, fallState: false},
            {type: 'domino', x: 6, y: -5, angle: 2, fallState: false, curveFrom: 1},
            {type: 'domino', x: 6, y: -4, angle: 3, fallState: false},
            {type: 'ball', x: -1, y: 3},
            {type: 'ball', x: -2, y: -2},
            {type: 'ball', x: -5, y: 1},
            {type: 'ball', x: -6, y: -2},
            {type: 'ball', x: 0, y: -5},
            {type: 'ball', x: 2, y: -2},
            {type: 'ball', x: 4, y: -5},
            {type: 'ball', x: 5, y: -1},
            {type: 'ball', x: 6, y: 6},
            {type: 'ball', x: 7, y: -1},
            {type: 'piston', x: -1, y: -1, angle: 2, extendState: false},
            {type: 'piston', x: -5, y: -1, angle: 2, extendState: false},
            {type: 'piston', x: 3, y: -1, angle: 2, extendState: false},
            {type: 'piston', x: 5, y: -6, angle: 0, extendState: false},
            {type: 'spinner', x: -3, y: -5, angle: 0, spinState: false, clockwise: false},
            {type: 'spinner', x: 1, y: -5, angle: 0, spinState: false, clockwise: false},
            {type: 'spinner', x: 7, y: -3, angle: 1, spinState: false, clockwise: true},
            {type: 'wall', x: -2, y: -1, angle: 1},
            {type: 'wall', x: -3, y: 1, angle: 0},
            {type: 'wall', x: -3, y: 3, angle: 2},
            {type: 'wall', x: -6, y: -1, angle: 1},
            {type: 'wall', x: 2, y: -1, angle: 1},
        ],
        // 7
        [
            {type: 'button', x: 4, y: 6, pressed: false},
            {type: 'button', x: 4, y: 1, pressed: false},
            {type: 'mine', x: -2, y: 2},
            {type: 'mine', x: -2, y: 3},
            {type: 'mine', x: -2, y: 5},
            {type: 'domino', x: 3, y: 1, angle: 0, fallState: false},
            {type: 'domino', x: 2, y: 1, angle: 0, fallState: false},
            {type: 'domino', x: 1, y: 1, angle: 0, fallState: false},
            {type: 'domino', x: -1, y: 1, angle: 0, fallState: false},
            {type: 'domino', x: -2, y: 1, angle: 0, fallState: false},
            {type: 'domino', x: 3, y: 6, angle: 0, fallState: false},
            {type: 'domino', x: 1, y: 6, angle: 0, fallState: false},
            {type: 'domino', x: 0, y: 6, angle: 0, fallState: false},
            {type: 'domino', x: -1, y: 6, angle: 0, fallState: false},
            {type: 'domino', x: -2, y: 6, angle: 0, fallState: false},
            {type: 'domino', x: 2, y: 4, angle: 1, fallState: false, curveFrom: 3},
            {type: 'domino', x: 0, y: 4, angle: 0, fallState: false},
            {type: 'domino', x: -1, y: 4, angle: 0, fallState: false},
            {type: 'domino', x: -2, y: 4, angle: 0, fallState: false},
            {type: 'domino', x: 0, y: 3, angle: 3, fallState: false, curveFrom: 1},
            {type: 'domino', x: -2, y: -5, angle: 3, fallState: false},
            {type: 'domino', x: -2, y: -3, angle: 3, fallState: false},
            {type: 'ball', x: -3, y: -1},
            {type: 'ball', x: -3, y: -3},
            {type: 'ball', x: -3, y: -5},
            {type: 'ball', x: 2, y: 5},
            {type: 'ball', x: 0, y: 2},
            {type: 'piston', x: -4, y: 1, angle: 0, extendState: false},
            {type: 'piston', x: -4, y: 2, angle: 0, extendState: false},
            {type: 'piston', x: -4, y: 3, angle: 0, extendState: false},
            {type: 'piston', x: -4, y: 4, angle: 0, extendState: false},
            {type: 'piston', x: -4, y: 5, angle: 0, extendState: false},
            {type: 'piston', x: -4, y: 6, angle: 0, extendState: false},
            {type: 'piston', x: -2, y: -1, angle: 3, extendState: false},
            {type: 'spinner', x: -2, y: -2, angle: 1, spinState: false, clockwise: false},
            {type: 'spinner', x: -2, y: -4, angle: 1, spinState: false, clockwise: false},
            {type: 'spinner', x: -2, y: -6, angle: 1, spinState: false, clockwise: false},
            {type: 'spinner', x: 1, y: 4, angle: 2, spinState: false, clockwise: false},
            {type: 'wall', x: 0, y: 1, angle: 3},
            {type: 'wall', x: 2, y: 6, angle: 1},
        ],
        // 8
        [
            {type: 'button', x: 8, y: -4, pressed: false},
            {type: 'button', x: 8, y: -5, pressed: false},
            {type: 'button', x: 8, y: 2, pressed: false},
            {type: 'button', x: 8, y: -6, pressed: false},
            {type: 'domino', x: 7, y: 2, angle: 0, fallState: false},
            {type: 'domino', x: 6, y: 2, angle: 0, fallState: false},
            {type: 'domino', x: 3, y: 2, angle: 0, fallState: false},
            {type: 'domino', x: 2, y: 2, angle: 0, fallState: false},
            {type: 'domino', x: -1, y: 2, angle: 0, fallState: false},
            {type: 'domino', x: -2, y: 2, angle: 0, fallState: false},
            {type: 'domino', x: -5, y: 2, angle: 0, fallState: false},
            {type: 'domino', x: -6, y: 2, angle: 0, fallState: false},
            {type: 'domino', x: -7, y: 2, angle: 0, fallState: false},
            {type: 'domino', x: 4, y: 1, angle: 3, fallState: false, curveFrom: 1},
            {type: 'domino', x: 0, y: 1, angle: 3, fallState: false, curveFrom: 1},
            {type: 'domino', x: -4, y: 1, angle: 3, fallState: false, curveFrom: 1},
            {type: 'ball', x: -4, y: 0},
            {type: 'ball', x: -4, y: 5},
            {type: 'ball', x: 0, y: 0},
            {type: 'ball', x: 0, y: 5},
            {type: 'ball', x: 4, y: 0},
            {type: 'ball', x: 4, y: 5},
            {type: 'piston', x: -4, y: 6, angle: 3, extendState: false},
            {type: 'piston', x: -8, y: 2, angle: 0, extendState: false},
            {type: 'piston', x: 0, y: 6, angle: 3, extendState: false},
            {type: 'piston', x: 4, y: 6, angle: 3, extendState: false},
            {type: 'piston', x: 3, y: -4, angle: 0, extendState: false},
            {type: 'piston', x: -1, y: -5, angle: 0, extendState: false},
            {type: 'piston', x: -5, y: -6, angle: 0, extendState: false},
            {type: 'spinner', x: -3, y: 2, angle: 2, spinState: false, clockwise: false},
            {type: 'spinner', x: 1, y: 2, angle: 2, spinState: false, clockwise: false},
            {type: 'spinner', x: 5, y: 2, angle: 2, spinState: false, clockwise: false},
        ],
        // 9
        [
            {type: 'button', x: 5, y: 4, pressed: false},
            {type: 'ball', x: -4, y: -4},
            {type: 'piston', x: -1, y: -5, angle: 1, extendState: false},
            {type: 'piston', x: -1, y: 0, angle: 0, extendState: false},
            {type: 'piston', x: -1, y: 1, angle: 1, extendState: false},
            {type: 'piston', x: -2, y: -1, angle: 1, extendState: false},
            {type: 'piston', x: -2, y: -2, angle: 2, extendState: false},
            {type: 'piston', x: -2, y: -3, angle: 1, extendState: false},
            {type: 'piston', x: -2, y: 3, angle: 0, extendState: false},
            {type: 'piston', x: -2, y: 4, angle: 0, extendState: false},
            {type: 'piston', x: -3, y: 0, angle: 2, extendState: false},
            {type: 'piston', x: -3, y: 2, angle: 0, extendState: false},
            {type: 'piston', x: -3, y: 3, angle: 3, extendState: false},
            {type: 'piston', x: -4, y: -5, angle: 1, extendState: false},
            {type: 'piston', x: -4, y: 5, angle: 3, extendState: false},
            {type: 'piston', x: -5, y: -1, angle: 1, extendState: false},
            {type: 'piston', x: -5, y: -2, angle: 0, extendState: false},
            {type: 'piston', x: -5, y: -4, angle: 0, extendState: false},
            {type: 'piston', x: -5, y: 2, angle: 0, extendState: false},
            {type: 'piston', x: -5, y: 4, angle: 0, extendState: false},
            {type: 'piston', x: 0, y: -3, angle: 1, extendState: false},
            {type: 'piston', x: 0, y: 5, angle: 3, extendState: false},
            {type: 'piston', x: 1, y: -5, angle: 1, extendState: false},
            {type: 'piston', x: 1, y: 5, angle: 0, extendState: false},
            {type: 'piston', x: 2, y: -1, angle: 1, extendState: false},
            {type: 'piston', x: 2, y: -2, angle: 2, extendState: false},
            {type: 'piston', x: 2, y: -3, angle: 0, extendState: false},
            {type: 'piston', x: 2, y: 3, angle: 3, extendState: false},
            {type: 'piston', x: 3, y: -5, angle: 1, extendState: false},
            {type: 'piston', x: 3, y: 0, angle: 0, extendState: false},
            {type: 'piston', x: 3, y: 2, angle: 2, extendState: false},
            {type: 'piston', x: 3, y: 5, angle: 2, extendState: false},
            {type: 'piston', x: 4, y: -4, angle: 1, extendState: false},
            {type: 'piston', x: 4, y: 5, angle: 3, extendState: false},
            {type: 'piston', x: 5, y: -3, angle: 2, extendState: false},
            {type: 'piston', x: 5, y: 1, angle: 2, extendState: false},
        ],
        // 10
        [
            {type: 'button', x: -5, y: 1, pressed: false},
            {type: 'domino', x: -5, y: 4, angle: 3, fallState: false},
            {type: 'domino', x: -5, y: 5, angle: 3, fallState: false, curveFrom: 1},
            {type: 'domino', x: -4, y: 5, angle: 2, fallState: false},
            {type: 'domino', x: -3, y: 5, angle: 2, fallState: false},
            {type: 'domino', x: -2, y: 5, angle: 2, fallState: false},
            {type: 'domino', x: -1, y: 5, angle: 2, fallState: false},
            {type: 'domino', x: 0, y: 5, angle: 2, fallState: false},
            {type: 'domino', x: 1, y: 5, angle: 2, fallState: false},
            {type: 'domino', x: 2, y: 5, angle: 2, fallState: false},
            {type: 'domino', x: 3, y: 5, angle: 2, fallState: false},
            {type: 'domino', x: 4, y: 5, angle: 2, fallState: false},
            {type: 'domino', x: 5, y: 5, angle: 2, fallState: false, curveFrom: 2},
            {type: 'domino', x: 5, y: 4, angle: 1, fallState: false},
            {type: 'domino', x: 5, y: 3, angle: 1, fallState: false},
            {type: 'domino', x: 5, y: 2, angle: 1, fallState: false},
            {type: 'domino', x: 5, y: 1, angle: 1, fallState: false},
            {type: 'domino', x: 5, y: 0, angle: 1, fallState: false},
            {type: 'domino', x: 5, y: -1, angle: 1, fallState: false},
            {type: 'domino', x: 5, y: -2, angle: 1, fallState: false},
            {type: 'domino', x: 5, y: -3, angle: 1, fallState: false},
            {type: 'domino', x: 5, y: -4, angle: 1, fallState: false, curveFrom: 3},
            {type: 'domino', x: 4, y: -4, angle: 0, fallState: false},
            {type: 'domino', x: 3, y: -4, angle: 0, fallState: false},
            {type: 'domino', x: 2, y: -4, angle: 0, fallState: false},
            {type: 'domino', x: 1, y: -4, angle: 0, fallState: false},
            {type: 'domino', x: 0, y: -4, angle: 0, fallState: false},
            {type: 'domino', x: -1, y: -4, angle: 0, fallState: false},
            {type: 'domino', x: -2, y: -4, angle: 0, fallState: false},
            {type: 'domino', x: -3, y: -4, angle: 0, fallState: false},
            {type: 'domino', x: -4, y: -4, angle: 0, fallState: false},
            {type: 'domino', x: 2, y: 3, angle: 2, fallState: false},
            {type: 'domino', x: 3, y: 3, angle: 2, fallState: false, curveFrom: 2},
            {type: 'domino', x: 3, y: 2, angle: 1, fallState: false},
            {type: 'domino', x: 3, y: 1, angle: 1, fallState: false},
            {type: 'domino', x: 3, y: 0, angle: 1, fallState: false},
            {type: 'domino', x: 3, y: -1, angle: 1, fallState: false},
            {type: 'domino', x: 3, y: -2, angle: 1, fallState: false},
            {type: 'domino', x: 3, y: -3, angle: 1, fallState: false, curveFrom: 3},
            {type: 'domino', x: 2, y: -3, angle: 0, fallState: false},
            {type: 'domino', x: 1, y: -3, angle: 0, fallState: false},
            {type: 'domino', x: 0, y: -3, angle: 0, fallState: false},
            {type: 'domino', x: -1, y: -3, angle: 0, fallState: false},
            {type: 'domino', x: -2, y: -3, angle: 0, fallState: false},
            {type: 'domino', x: -3, y: -3, angle: 0, fallState: false},
            {type: 'domino', x: -4, y: -3, angle: 0, fallState: false},
            {type: 'domino', x: 1, y: -2, angle: 1, fallState: false, curveFrom: 3},
            {type: 'domino', x: 0, y: -2, angle: 0, fallState: false},
            {type: 'domino', x: -1, y: -2, angle: 0, fallState: false},
            {type: 'domino', x: -2, y: -2, angle: 0, fallState: false},
            {type: 'domino', x: -3, y: -2, angle: 0, fallState: false},
            {type: 'domino', x: -4, y: -2, angle: 0, fallState: false},
            {type: 'ball', x: -4, y: -1},
            {type: 'piston', x: -5, y: -1, angle: 0, extendState: false},
            {type: 'piston', x: -5, y: -2, angle: 0, extendState: false},
            {type: 'piston', x: -5, y: -3, angle: 0, extendState: false},
            {type: 'piston', x: -5, y: -4, angle: 0, extendState: false},
            {type: 'wall', x: 1, y: 4, angle: 1},
            {type: 'wall', x: 2, y: -1, angle: 0},
        ],
        // 11
        [
            {type: 'button', x: -3, y: -4, pressed: false},
            {type: 'button', x: -3, y: 1, pressed: false},
            {type: 'ball', x: -3, y: -3},
            {type: 'piston', x: -3, y: -2, angle: 3, extendState: false},
            {type: 'piston', x: -4, y: -3, angle: 0, extendState: false},
            {type: 'piston', x: -4, y: 3, angle: 0, extendState: false},
            {type: 'piston', x: 3, y: -4, angle: 1, extendState: false},
            {type: 'piston', x: 3, y: 4, angle: 3, extendState: false},
            {type: 'piston', x: 4, y: -3, angle: 2, extendState: false},
            {type: 'piston', x: 4, y: 3, angle: 2, extendState: false},
            {type: 'piston', x: -3, y: 4, angle: 3, extendState: false},
            {type: 'piston', x: -3, y: 0, angle: 1, extendState: false},
        ],
        // 12
        [
            {type: 'button', x: 2, y: -7, pressed: false},
            {type: 'mine', x: 4, y: -1},
            {type: 'domino', x: 2, y: -6, angle: 3, fallState: false},
            {type: 'domino', x: 2, y: -2, angle: 3, fallState: false, curveFrom: 1},
            {type: 'domino', x: 3, y: -2, angle: 2, fallState: false},
            {type: 'domino', x: 4, y: -2, angle: 2, fallState: false},
            {type: 'domino', x: 5, y: -2, angle: 2, fallState: false},
            {type: 'domino', x: 6, y: -2, angle: 2, fallState: false, curveFrom: 1},
            {type: 'domino', x: 6, y: -1, angle: 3, fallState: false},
            {type: 'domino', x: 6, y: 0, angle: 3, fallState: false},
            {type: 'domino', x: 6, y: 1, angle: 3, fallState: false},
            {type: 'domino', x: 6, y: 2, angle: 3, fallState: false},
            {type: 'domino', x: 6, y: 3, angle: 3, fallState: false},
            {type: 'domino', x: 6, y: 4, angle: 3, fallState: false},
            {type: 'domino', x: 6, y: 5, angle: 3, fallState: false},
            {type: 'domino', x: 4, y: 0, angle: 3, fallState: false},
            {type: 'domino', x: 4, y: 2, angle: 3, fallState: false},
            {type: 'domino', x: 4, y: 4, angle: 3, fallState: false},
            {type: 'domino', x: 4, y: 5, angle: 3, fallState: false, curveFrom: 1},
            {type: 'domino', x: 5, y: 5, angle: 2, fallState: false, curveFrom: 1},
            {type: 'domino', x: 5, y: 7, angle: 3, fallState: false, curveFrom: 0},
            {type: 'domino', x: 4, y: 7, angle: 0, fallState: false},
            {type: 'domino', x: 3, y: 7, angle: 0, fallState: false},
            {type: 'domino', x: 2, y: 7, angle: 0, fallState: false},
            {type: 'domino', x: 1, y: 7, angle: 0, fallState: false},
            {type: 'domino', x: 0, y: 7, angle: 0, fallState: false},
            {type: 'domino', x: -1, y: 7, angle: 0, fallState: false},
            {type: 'domino', x: -2, y: 7, angle: 0, fallState: false},
            {type: 'domino', x: -3, y: 7, angle: 0, fallState: false},
            {type: 'domino', x: -4, y: 7, angle: 0, fallState: false},
            {type: 'domino', x: -5, y: 5, angle: 1, fallState: false},
            {type: 'domino', x: -5, y: 3, angle: 1, fallState: false},
            {type: 'domino', x: -5, y: 2, angle: 1, fallState: false, curveFrom: 2},
            {type: 'domino', x: -4, y: 2, angle: 2, fallState: false},
            {type: 'domino', x: -6, y: 3, angle: 1, fallState: false},
            {type: 'domino', x: -6, y: 2, angle: 1, fallState: false},
            {type: 'domino', x: -6, y: 1, angle: 1, fallState: false},
            {type: 'domino', x: -6, y: 0, angle: 1, fallState: false, curveFrom: 2},
            {type: 'domino', x: -5, y: 0, angle: 2, fallState: false},
            {type: 'domino', x: -4, y: 0, angle: 2, fallState: false},
            {type: 'domino', x: 2, y: 3, angle: 0, fallState: false},
            {type: 'domino', x: 0, y: 3, angle: 0, fallState: false},
            {type: 'domino', x: -1, y: 3, angle: 0, fallState: false},
            {type: 'domino', x: -2, y: 3, angle: 0, fallState: false},
            {type: 'domino', x: -3, y: 3, angle: 0, fallState: false, curveFrom: 3},
            {type: 'domino', x: 2, y: 1, angle: 0, fallState: false},
            {type: 'domino', x: 0, y: 1, angle: 0, fallState: false},
            {type: 'domino', x: -1, y: 1, angle: 0, fallState: false, curveFrom: 3},
            {type: 'domino', x: -1, y: -2, angle: 1, fallState: false},
            {type: 'domino', x: -3, y: -2, angle: 1, fallState: false},
            {type: 'domino', x: -3, y: -3, angle: 1, fallState: false},
            {type: 'domino', x: -3, y: -4, angle: 1, fallState: false},
            {type: 'ball', x: -1, y: -3},
            {type: 'ball', x: -1, y: -1},
            {type: 'ball', x: -3, y: -1},
            {type: 'ball', x: -3, y: -5},
            {type: 'ball', x: -5, y: 6},
            {type: 'ball', x: 0, y: 0},
            {type: 'ball', x: 0, y: 2},
            {type: 'ball', x: 3, y: 1},
            {type: 'ball', x: 3, y: 3},
            {type: 'piston', x: -1, y: -4, angle: 1, extendState: false},
            {type: 'piston', x: -2, y: -3, angle: 0, extendState: false},
            {type: 'piston', x: -3, y: -6, angle: 1, extendState: false},
            {type: 'piston', x: -4, y: -5, angle: 0, extendState: false},
            {type: 'piston', x: -6, y: 7, angle: 0, extendState: false},
            {type: 'spinner', x: 1, y: 1, angle: 2, spinState: false, clockwise: false},
            {type: 'spinner', x: 1, y: 3, angle: 2, spinState: false, clockwise: false},
            {type: 'wall', x: -5, y: 7, angle: 1},
            {type: 'wall', x: 2, y: -3, angle: 0},
            {type: 'wall', x: 2, y: -5, angle: 0},
            {type: 'wall', x: 4, y: 1, angle: 0},
            {type: 'wall', x: 4, y: 3, angle: 0},
            {type: 'domino', x: -6, y: 4, angle: 1, fallState: false, large: true},
            {type: 'domino', x: 6, y: 6, angle: 3, fallState: false, large: true},
        ],
        // 13
        [
            {type: 'button', x: 5, y: -6, pressed: false},
            {type: 'domino', x: 5, y: -4, angle: 3, fallState: false},
            {type: 'domino', x: 1, y: -5, angle: 0, fallState: false},
            {type: 'domino', x: 0, y: -5, angle: 0, fallState: false},
            {type: 'domino', x: -1, y: -5, angle: 0, fallState: false},
            {type: 'domino', x: -2, y: -5, angle: 0, fallState: false},
            {type: 'domino', x: -3, y: -5, angle: 0, fallState: false},
            {type: 'domino', x: -4, y: -5, angle: 0, fallState: false},
            {type: 'domino', x: -5, y: -5, angle: 0, fallState: false, curveFrom: 0},
            {type: 'domino', x: -5, y: -4, angle: 3, fallState: false},
            {type: 'domino', x: -5, y: -3, angle: 3, fallState: false},
            {type: 'domino', x: -5, y: -2, angle: 3, fallState: false},
            {type: 'domino', x: -5, y: -1, angle: 3, fallState: false},
            {type: 'domino', x: -5, y: 0, angle: 3, fallState: false},
            {type: 'domino', x: -5, y: 1, angle: 3, fallState: false, curveFrom: 1},
            {type: 'domino', x: -4, y: 1, angle: 2, fallState: false},
            {type: 'domino', x: -3, y: 1, angle: 2, fallState: false},
            {type: 'domino', x: -2, y: 1, angle: 2, fallState: false},
            {type: 'domino', x: -1, y: 1, angle: 2, fallState: false},
            {type: 'domino', x: 0, y: 1, angle: 2, fallState: false},
            {type: 'domino', x: 1, y: 1, angle: 2, fallState: false, curveFrom: 2},
            {type: 'domino', x: 1, y: 0, angle: 1, fallState: false},
            {type: 'domino', x: 1, y: -1, angle: 1, fallState: false},
            {type: 'domino', x: 1, y: -2, angle: 1, fallState: false},
            {type: 'domino', x: 1, y: -3, angle: 1, fallState: false},
            {type: 'domino', x: 1, y: -4, angle: 1, fallState: false, curveFrom: 3},
            {type: 'domino', x: 0, y: -4, angle: 0, fallState: false},
            {type: 'domino', x: -1, y: -4, angle: 0, fallState: false},
            {type: 'domino', x: -2, y: -4, angle: 0, fallState: false},
            {type: 'domino', x: -3, y: -4, angle: 0, fallState: false},
            {type: 'domino', x: -4, y: -4, angle: 0, fallState: false, curveFrom: 0},
            {type: 'domino', x: -4, y: -3, angle: 3, fallState: false},
            {type: 'domino', x: -4, y: -2, angle: 3, fallState: false},
            {type: 'domino', x: -4, y: -1, angle: 3, fallState: false},
            {type: 'domino', x: -4, y: 0, angle: 3, fallState: false, curveFrom: 1},
            {type: 'domino', x: -3, y: 0, angle: 2, fallState: false},
            {type: 'domino', x: -2, y: 0, angle: 2, fallState: false},
            {type: 'domino', x: -1, y: 0, angle: 2, fallState: false},
            {type: 'domino', x: 0, y: 0, angle: 2, fallState: false, curveFrom: 2},
            {type: 'domino', x: 0, y: -1, angle: 1, fallState: false},
            {type: 'domino', x: 0, y: -2, angle: 1, fallState: false},
            {type: 'domino', x: 0, y: -3, angle: 1, fallState: false, curveFrom: 3},
            {type: 'domino', x: -1, y: -3, angle: 0, fallState: false},
            {type: 'domino', x: -2, y: -3, angle: 0, fallState: false},
            {type: 'domino', x: -3, y: -3, angle: 0, fallState: false, curveFrom: 0},
            {type: 'domino', x: -3, y: -2, angle: 3, fallState: false},
            {type: 'domino', x: -3, y: -1, angle: 3, fallState: false, curveFrom: 1},
            {type: 'domino', x: -2, y: -1, angle: 2, fallState: false},
            {type: 'domino', x: -1, y: -1, angle: 2, fallState: false, curveFrom: 2},
            {type: 'domino', x: -1, y: -2, angle: 1, fallState: false, curveFrom: 3},
            {type: 'ball', x: -4, y: 5},
            {type: 'ball', x: 2, y: -5},
            {type: 'piston', x: -2, y: -2, angle: 0, extendState: false},
            {type: 'piston', x: -5, y: 5, angle: 0, extendState: false},
            {type: 'piston', x: 5, y: 6, angle: 3, extendState: false},
        ],
        // 14
        [
            {type: 'button', x: -8, y: -1, pressed: false},
            {type: 'button', x: -8, y: -4, pressed: false},
            {type: 'button', x: -8, y: 2, pressed: false},
            {type: 'mine', x: 4, y: -3},
            {type: 'mine', x: 4, y: 0},
            {type: 'mine', x: 4, y: 3},
            {type: 'domino', x: -7, y: -4, angle: 2, fallState: false},
            {type: 'domino', x: -6, y: -4, angle: 2, fallState: false},
            {type: 'domino', x: -5, y: -4, angle: 2, fallState: false},
            {type: 'domino', x: -4, y: -4, angle: 2, fallState: false},
            {type: 'domino', x: -3, y: -4, angle: 2, fallState: false},
            {type: 'domino', x: -2, y: -4, angle: 2, fallState: false},
            {type: 'domino', x: -1, y: -4, angle: 2, fallState: false},
            {type: 'domino', x: 0, y: -4, angle: 2, fallState: false},
            {type: 'domino', x: 0, y: -3, angle: 0, fallState: false},
            {type: 'domino', x: -7, y: -3, angle: 0, fallState: false},
            {type: 'domino', x: -7, y: -1, angle: 2, fallState: false},
            {type: 'domino', x: -6, y: -1, angle: 2, fallState: false},
            {type: 'domino', x: -5, y: -1, angle: 2, fallState: false},
            {type: 'domino', x: -4, y: -1, angle: 2, fallState: false},
            {type: 'domino', x: -3, y: -1, angle: 2, fallState: false},
            {type: 'domino', x: -2, y: -1, angle: 2, fallState: false},
            {type: 'domino', x: -1, y: -1, angle: 2, fallState: false},
            {type: 'domino', x: 0, y: -1, angle: 2, fallState: false},
            {type: 'domino', x: 0, y: 0, angle: 0, fallState: false},
            {type: 'domino', x: -1, y: 0, angle: 0, fallState: false},
            {type: 'domino', x: -6, y: 0, angle: 0, fallState: false},
            {type: 'domino', x: -7, y: 0, angle: 0, fallState: false},
            {type: 'domino', x: -7, y: 2, angle: 2, fallState: false},
            {type: 'domino', x: -6, y: 2, angle: 2, fallState: false},
            {type: 'domino', x: -5, y: 2, angle: 2, fallState: false},
            {type: 'domino', x: -4, y: 2, angle: 2, fallState: false},
            {type: 'domino', x: -3, y: 2, angle: 2, fallState: false},
            {type: 'domino', x: -2, y: 2, angle: 2, fallState: false},
            {type: 'domino', x: -1, y: 2, angle: 2, fallState: false},
            {type: 'domino', x: 0, y: 2, angle: 2, fallState: false},
            {type: 'domino', x: 0, y: 3, angle: 0, fallState: false},
            {type: 'domino', x: -1, y: 3, angle: 0, fallState: false},
            {type: 'domino', x: -2, y: 3, angle: 0, fallState: false},
            {type: 'domino', x: -5, y: 3, angle: 0, fallState: false},
            {type: 'domino', x: -6, y: 3, angle: 0, fallState: false},
            {type: 'domino', x: -7, y: 3, angle: 0, fallState: false},
            {type: 'domino', x: 3, y: -2, angle: 3, fallState: false, curveFrom: 1},
            {type: 'domino', x: 4, y: -2, angle: 2, fallState: false},
            {type: 'domino', x: 5, y: -2, angle: 2, fallState: false, curveFrom: 1},
            {type: 'domino', x: 5, y: -1, angle: 3, fallState: false},
            {type: 'domino', x: 5, y: 0, angle: 3, fallState: false, curveFrom: 1},
            {type: 'domino', x: 3, y: 1, angle: 3, fallState: false, curveFrom: 1},
            {type: 'domino', x: 4, y: 1, angle: 2, fallState: false, curveFrom: 1},
            {type: 'domino', x: 4, y: 2, angle: 3, fallState: false, curveFrom: 1},
            {type: 'domino', x: 5, y: 2, angle: 2, fallState: false, curveFrom: 2},
            {type: 'domino', x: 5, y: 1, angle: 1, fallState: false, curveFrom: 2},
            {type: 'domino', x: 3, y: 4, angle: 3, fallState: false, curveFrom: 1},
            {type: 'domino', x: 4, y: 4, angle: 2, fallState: false},
            {type: 'domino', x: 5, y: 4, angle: 2, fallState: false, curveFrom: 2},
            {type: 'domino', x: 5, y: 3, angle: 1, fallState: false, curveFrom: 2},
            {type: 'domino', x: 6, y: 3, angle: 2, fallState: false, curveFrom: 2},
            {type: 'domino', x: 6, y: 2, angle: 1, fallState: false, curveFrom: 2},
            {type: 'domino', x: 6, y: 0, angle: 2, fallState: false, large: true},
            {type: 'domino', x: 7, y: 1, angle: 2, fallState: false, large: true},
            {type: 'ball', x: -4, y: 3},
            {type: 'ball', x: -5, y: 0},
            {type: 'ball', x: -6, y: -3},
            {type: 'ball', x: 2, y: -3},
            {type: 'ball', x: 2, y: 0},
            {type: 'ball', x: 2, y: 3},
            {type: 'piston', x: -8, y: -3, angle: 0, extendState: false},
            {type: 'piston', x: -8, y: 0, angle: 0, extendState: false},
            {type: 'piston', x: -8, y: 3, angle: 0, extendState: false},
            {type: 'piston', x: 8, y: 1, angle: 2, extendState: false},
            {type: 'spinner', x: 1, y: -3, angle: 2, spinState: false, clockwise: false},
            {type: 'spinner', x: 1, y: 0, angle: 2, spinState: false, clockwise: false},
            {type: 'spinner', x: 1, y: 3, angle: 2, spinState: false, clockwise: false},
        ],
        // 15
        [
            {type: 'button', x: 1, y: 0, pressed: false},
            {type: 'domino', x: -1, y: 2, angle: 0, fallState: false},
            {type: 'domino', x: 0, y: -1, angle: 1, fallState: false},
            {type: 'domino', x: 2, y: 3, angle: 3, fallState: false},
            {type: 'domino', x: 3, y: 0, angle: 2, fallState: false},
            {type: 'ball', x: -4, y: 2},
            {type: 'ball', x: 0, y: -5},
            {type: 'ball', x: 0, y: 0},
            {type: 'ball', x: 2, y: 5},
            {type: 'ball', x: 4, y: 0},
            {type: 'piston', x: -5, y: 2, angle: 0, extendState: false},
            {type: 'piston', x: 0, y: -6, angle: 1, extendState: false},
            {type: 'piston', x: 2, y: 6, angle: 3, extendState: false},
            {type: 'piston', x: 5, y: 0, angle: 2, extendState: false},
        ],
        // 16
        [
            {type: 'button', x: 2, y: 0, pressed: false},
            {type: 'button', x: 4, y: 0, pressed: false},
            {type: 'button', x: 6, y: 0, pressed: false},
            {type: 'button', x: 7, y: 6, pressed: false},
            {type: 'mine', x: 3, y: 5},
            {type: 'domino', x: 6, y: 6, angle: 0, fallState: false},
            {type: 'domino', x: 4, y: 6, angle: 0, fallState: false},
            {type: 'domino', x: 3, y: 6, angle: 0, fallState: false},
            {type: 'domino', x: 2, y: 6, angle: 0, fallState: false},
            {type: 'domino', x: 0, y: 6, angle: 0, fallState: false},
            {type: 'domino', x: 6, y: 1, angle: 3, fallState: false},
            {type: 'domino', x: 4, y: 1, angle: 3, fallState: false},
            {type: 'domino', x: 2, y: 1, angle: 3, fallState: false},
            {type: 'domino', x: -1, y: -5, angle: 0, fallState: false},
            {type: 'domino', x: -2, y: -4, angle: 0, fallState: false, large: true},
            {type: 'domino', x: -1, y: -3, angle: 0, fallState: false},
            {type: 'domino', x: -2, y: -3, angle: 0, fallState: false},
            {type: 'domino', x: -3, y: -3, angle: 0, fallState: false, large: true},
            {type: 'domino', x: -1, y: -1, angle: 0, fallState: false},
            {type: 'domino', x: -2, y: -1, angle: 0, fallState: false},
            {type: 'domino', x: -3, y: -1, angle: 0, fallState: false},
            {type: 'domino', x: -4, y: -1, angle: 0, fallState: false},
            {type: 'domino', x: -4, y: -2, angle: 0, fallState: false, large: true},
            {type: 'domino', x: -5, y: -1, angle: 0, fallState: false, large: true},
            {type: 'domino', x: -6, y: -1, angle: 0, fallState: false},
            {type: 'ball', x: 0, y: -1},
            {type: 'ball', x: 0, y: -3},
            {type: 'ball', x: 0, y: -5},
            {type: 'ball', x: 1, y: 3},
            {type: 'ball', x: 3, y: 3},
            {type: 'ball', x: 5, y: 3},
            {type: 'piston', x: -1, y: 6, angle: 0, extendState: false},
            {type: 'piston', x: -7, y: -1, angle: 0, extendState: false},
            {type: 'piston', x: 1, y: -6, angle: 1, extendState: false},
            {type: 'piston', x: 3, y: -4, angle: 1, extendState: false},
            {type: 'piston', x: 5, y: -2, angle: 1, extendState: false},
            {type: 'piston', x: 7, y: -1, angle: 2, extendState: false},
            {type: 'piston', x: 7, y: -3, angle: 2, extendState: false},
            {type: 'piston', x: 7, y: -5, angle: 2, extendState: false},
            {type: 'spinner', x: 1, y: 2, angle: 3, spinState: false, clockwise: false},
            {type: 'spinner', x: 3, y: 2, angle: 3, spinState: false, clockwise: false},
            {type: 'spinner', x: 5, y: 2, angle: 3, spinState: false, clockwise: false},
            {type: 'wall', x: 1, y: 6, angle: 1},
            {type: 'wall', x: 5, y: 6, angle: 1},
        ],
        // 17
        [
            {type: 'button', x: 4, y: 6, pressed: false},
            {type: 'domino', x: 3, y: 6, angle: 0, fallState: false},
            {type: 'domino', x: 1, y: 6, angle: 0, fallState: false},
            {type: 'domino', x: -1, y: 6, angle: 0, fallState: false},
            {type: 'domino', x: -3, y: 6, angle: 0, fallState: false},
            {type: 'domino', x: 2, y: 4, angle: 1, fallState: false, curveFrom: 2},
            {type: 'domino', x: 3, y: 4, angle: 2, fallState: false, curveFrom: 2},
            {type: 'domino', x: 3, y: 3, angle: 1, fallState: false, curveFrom: 3},
            {type: 'domino', x: 2, y: 3, angle: 0, fallState: false, curveFrom: 3},
            {type: 'domino', x: 2, y: 2, angle: 1, fallState: false, curveFrom: 2},
            {type: 'domino', x: 3, y: 2, angle: 2, fallState: false, curveFrom: 2},
            {type: 'domino', x: 3, y: 1, angle: 1, fallState: false, curveFrom: 3},
            {type: 'domino', x: 2, y: 1, angle: 0, fallState: false, curveFrom: 3},
            {type: 'domino', x: 2, y: 0, angle: 1, fallState: false, curveFrom: 2},
            {type: 'domino', x: 3, y: 0, angle: 2, fallState: false, curveFrom: 2},
            {type: 'domino', x: 3, y: -1, angle: 1, fallState: false, curveFrom: 3},
            {type: 'domino', x: 2, y: -1, angle: 0, fallState: false, curveFrom: 3},
            {type: 'domino', x: 2, y: -2, angle: 1, fallState: false, curveFrom: 2},
            {type: 'domino', x: 3, y: -2, angle: 2, fallState: false, curveFrom: 2},
            {type: 'domino', x: 3, y: -3, angle: 1, fallState: false, curveFrom: 3},
            {type: 'domino', x: 2, y: -3, angle: 0, fallState: false, curveFrom: 3},
            {type: 'domino', x: 2, y: -4, angle: 1, fallState: false, curveFrom: 2},
            {type: 'domino', x: 3, y: -4, angle: 2, fallState: false, curveFrom: 2},
            {type: 'domino', x: 3, y: -5, angle: 1, fallState: false, curveFrom: 3},
            {type: 'domino', x: 2, y: -5, angle: 0, fallState: false, curveFrom: 3},
            {type: 'domino', x: 0, y: 4, angle: 1, fallState: false},
            {type: 'domino', x: -2, y: 4, angle: 1, fallState: false},
            {type: 'domino', x: -2, y: 3, angle: 1, fallState: false},
            {type: 'domino', x: -2, y: 2, angle: 1, fallState: false},
            {type: 'domino', x: -2, y: 1, angle: 1, fallState: false},
            {type: 'domino', x: -2, y: 0, angle: 1, fallState: false},
            {type: 'domino', x: -2, y: -1, angle: 1, fallState: false},
            {type: 'domino', x: -2, y: -2, angle: 1, fallState: false},
            {type: 'domino', x: -2, y: -3, angle: 1, fallState: false},
            {type: 'domino', x: -2, y: -4, angle: 1, fallState: false},
            {type: 'domino', x: -2, y: -5, angle: 1, fallState: false},
            {type: 'ball', x: -2, y: 5},
            {type: 'ball', x: 0, y: -5},
            {type: 'ball', x: 0, y: 5},
            {type: 'ball', x: 2, y: 5},
            {type: 'piston', x: -2, y: -6, angle: 1, extendState: false},
            {type: 'piston', x: -4, y: 6, angle: 0, extendState: false},
            {type: 'piston', x: 0, y: -6, angle: 1, extendState: false},
            {type: 'piston', x: 2, y: -6, angle: 1, extendState: false},
        ],
        // 18
        [
            {type: 'button', x: -2, y: -5, pressed: false},
            {type: 'button', x: -2, y: 1, pressed: false},
            {type: 'button', x: -7, y: 3, pressed: false},
            {type: 'button', x: 1, y: -1, pressed: false},
            {type: 'button', x: 3, y: -5, pressed: false},
            {type: 'button', x: 7, y: -2, pressed: false},
            {type: 'mine', x: -7, y: -1},
            {type: 'mine', x: 7, y: 5},
            {type: 'domino', x: -2, y: -7, angle: 2, fallState: false, curveFrom: 1},
            {type: 'domino', x: -2, y: 0, angle: 0, fallState: false},
            {type: 'domino', x: -3, y: 0, angle: 0, fallState: false},
            {type: 'domino', x: -4, y: 0, angle: 0, fallState: false},
            {type: 'domino', x: -6, y: 0, angle: 0, fallState: false},
            {type: 'domino', x: -7, y: 2, angle: 1, fallState: false},
            {type: 'domino', x: -7, y: 1, angle: 1, fallState: false, curveFrom: 2},
            {type: 'domino', x: -6, y: 1, angle: 2, fallState: false, curveFrom: 1},
            {type: 'domino', x: -5, y: 2, angle: 3, fallState: false, large: true},
            {type: 'domino', x: 6, y: 0, angle: 3, fallState: false, large: true},
            {type: 'domino', x: 0, y: 2, angle: 3, fallState: false},
            {type: 'domino', x: 0, y: 3, angle: 3, fallState: false, curveFrom: 1},
            {type: 'domino', x: -2, y: 3, angle: 3, fallState: false, curveFrom: 1},
            {type: 'domino', x: 0, y: 4, angle: 0, fallState: false},
            {type: 'domino', x: -4, y: 4, angle: 0, fallState: false, curveFrom: 3},
            {type: 'domino', x: -7, y: 4, angle: 0, fallState: false, curveFrom: 0},
            {type: 'domino', x: -7, y: 5, angle: 3, fallState: false},
            {type: 'domino', x: -7, y: 6, angle: 3, fallState: false},
            {type: 'domino', x: -7, y: 7, angle: 3, fallState: false, curveFrom: 1},
            {type: 'domino', x: -5, y: 7, angle: 2, fallState: false},
            {type: 'domino', x: -3, y: 7, angle: 2, fallState: false},
            {type: 'domino', x: -5, y: 5, angle: 3, fallState: false, curveFrom: 1},
            {type: 'domino', x: -4, y: 5, angle: 2, fallState: false},
            {type: 'domino', x: -3, y: 5, angle: 2, fallState: false},
            {type: 'domino', x: -2, y: 5, angle: 2, fallState: false},
            {type: 'domino', x: -1, y: 5, angle: 2, fallState: false},
            {type: 'domino', x: 0, y: 5, angle: 2, fallState: false},
            {type: 'domino', x: 1, y: 5, angle: 2, fallState: false, curveFrom: 1},
            {type: 'domino', x: 2, y: 5, angle: 3, fallState: false},
            {type: 'domino', x: 3, y: 1, angle: 3, fallState: false},
            {type: 'domino', x: 3, y: 2, angle: 3, fallState: false},
            {type: 'domino', x: 3, y: 3, angle: 3, fallState: false},
            {type: 'domino', x: 3, y: 5, angle: 3, fallState: false},
            {type: 'domino', x: 4, y: -1, angle: 2, fallState: false, curveFrom: 1},
            {type: 'domino', x: 4, y: 0, angle: 3, fallState: false},
            {type: 'domino', x: 4, y: 1, angle: 3, fallState: false},
            {type: 'domino', x: 4, y: 2, angle: 3, fallState: false},
            {type: 'domino', x: 4, y: 3, angle: 3, fallState: false},
            {type: 'domino', x: 4, y: 4, angle: 3, fallState: false},
            {type: 'domino', x: 4, y: 5, angle: 3, fallState: false},
            {type: 'domino', x: 5, y: 1, angle: 3, fallState: false},
            {type: 'domino', x: 5, y: 2, angle: 3, fallState: false},
            {type: 'domino', x: 5, y: 3, angle: 3, fallState: false},
            {type: 'domino', x: 5, y: 4, angle: 3, fallState: false},
            {type: 'domino', x: 5, y: 5, angle: 3, fallState: false},
            {type: 'domino', x: 6, y: 1, angle: 3, fallState: false},
            {type: 'domino', x: 6, y: 3, angle: 3, fallState: false},
            {type: 'domino', x: 6, y: 4, angle: 3, fallState: false},
            {type: 'domino', x: 6, y: 5, angle: 3, fallState: false},
            {type: 'domino', x: 7, y: 3, angle: 1, fallState: false},
            {type: 'domino', x: 7, y: 4, angle: 1, fallState: false},
            {type: 'ball', x: -1, y: -5},
            {type: 'ball', x: -1, y: 6},
            {type: 'ball', x: -3, y: -7},
            {type: 'ball', x: -3, y: 2},
            {type: 'ball', x: -3, y: 4},
            {type: 'ball', x: -3, y: 6},
            {type: 'ball', x: -4, y: -1},
            {type: 'ball', x: -4, y: -3},
            {type: 'ball', x: -4, y: -5},
            {type: 'ball', x: -5, y: 1},
            {type: 'ball', x: -5, y: 6},
            {type: 'ball', x: -6, y: -2},
            {type: 'ball', x: -6, y: -4},
            {type: 'ball', x: -6, y: -6},
            {type: 'ball', x: -6, y: 4},
            {type: 'ball', x: 0, y: 1},
            {type: 'ball', x: 1, y: 1},
            {type: 'ball', x: 2, y: 4},
            {type: 'ball', x: 3, y: -4},
            {type: 'ball', x: 6, y: -1},
            {type: 'piston', x: -1, y: -7, angle: 1, extendState: false},
            {type: 'piston', x: -1, y: 7, angle: 2, extendState: false},
            {type: 'piston', x: -4, y: 2, angle: 0, extendState: false},
            {type: 'piston', x: -7, y: 0, angle: 0, extendState: false},
            {type: 'piston', x: 1, y: -2, angle: 0, extendState: false},
            {type: 'piston', x: 1, y: -5, angle: 2, extendState: false},
            {type: 'piston', x: 1, y: 2, angle: 3, extendState: false},
            {type: 'piston', x: 1, y: 7, angle: 3, extendState: false},
            {type: 'piston', x: 2, y: -7, angle: 1, extendState: false},
            {type: 'piston', x: 2, y: 7, angle: 3, extendState: false},
            {type: 'piston', x: 3, y: -7, angle: 1, extendState: false},
            {type: 'piston', x: 3, y: 7, angle: 3, extendState: false},
            {type: 'piston', x: 4, y: 7, angle: 3, extendState: false},
            {type: 'piston', x: 5, y: 7, angle: 3, extendState: false},
            {type: 'piston', x: 6, y: 7, angle: 3, extendState: false},
            {type: 'piston', x: 7, y: -5, angle: 2, extendState: false},
            {type: 'piston', x: 7, y: -6, angle: 2, extendState: false},
            {type: 'piston', x: 7, y: 6, angle: 2, extendState: false},
            {type: 'spinner', x: -1, y: -6, angle: 1, spinState: false, clockwise: true},
            {type: 'spinner', x: -1, y: 4, angle: 2, spinState: false, clockwise: false},
            {type: 'spinner', x: -2, y: 7, angle: 2, spinState: false, clockwise: true},
            {type: 'spinner', x: -3, y: -2, angle: 0, spinState: false, clockwise: true},
            {type: 'spinner', x: -3, y: -4, angle: 0, spinState: false, clockwise: true},
            {type: 'spinner', x: -3, y: -6, angle: 0, spinState: false, clockwise: true},
            {type: 'spinner', x: -4, y: 7, angle: 2, spinState: false, clockwise: true},
            {type: 'spinner', x: -5, y: 3, angle: 3, spinState: false, clockwise: true},
            {type: 'spinner', x: -6, y: 7, angle: 2, spinState: false, clockwise: true},
            {type: 'spinner', x: -7, y: -3, angle: 0, spinState: false, clockwise: false},
            {type: 'spinner', x: -7, y: -5, angle: 0, spinState: false, clockwise: false},
            {type: 'spinner', x: -7, y: -7, angle: 0, spinState: false, clockwise: false},
            {type: 'spinner', x: 1, y: 4, angle: 2, spinState: false, clockwise: false},
            {type: 'spinner', x: 3, y: -3, angle: 3, spinState: false, clockwise: true},
            {type: 'spinner', x: 6, y: 2, angle: 3, spinState: false, clockwise: true},
            {type: 'wall', x: -1, y: 0, angle: 1},
            {type: 'wall', x: -1, y: 2, angle: 0},
            {type: 'wall', x: -5, y: 0, angle: 3},
            {type: 'wall', x: -5, y: 4, angle: 0},
            {type: 'wall', x: 3, y: 0, angle: 0},
            {type: 'wall', x: 3, y: 4, angle: 0},
        ],
    ];

    const clickAudio = setupSoundEffect(click);
    const explodeAudio = setupSoundEffect(explode);
    const hissAudio = setupSoundEffect(hiss, 0.3);
    const mineAudio = setupSoundEffect(mine);
    const musicAudio = setupMusic(music);
    const pressAudio = setupSoundEffect(press);
    const winAudio = setupSoundEffect(win);
    const tickAudios = [tick1, tick2, tick3, tick4, tick5, tick6].map(tick => setupSoundEffect(tick));
    const splashAudios = [splash1, splash2].map(splash => setupSoundEffect(splash));
    const storage = setupStorage('august');

    let state: State.Any = {type: 'menu'};
    let done = false;

    function loadLevel(index: number) {
        choice(splashAudios).play();

        const largest = Math.max(...LEVELS[index].map(object => Math.max(object.x, object.y)));
        const smallest = Math.min(...LEVELS[index].map(object => Math.min(object.x, object.y)));

        state = {
            type: 'play',
            levelIndex: index,
            level: structuredClone(LEVELS[index]),
            lastTime: 0,
            complete: false,
            scale: canvas.width / (largest - smallest + 2),
        };

        setOverlay(`
            <div style="position: absolute; top: 5px; left: 5px; display: flex; gap: 10px; align-items: center">
                <button id="august-menu-button" class="light">Menu</button>
                Level ${state.levelIndex + 1}
            </div>
            <button id="august-reset-button" class="light" style="position: absolute; top: 5px; right: 5px;">Reset</button>
        `);

        document.getElementById('august-menu-button')!.addEventListener('click', () => {
            clickAudio.play();
            mainMenu();
        });

        document.getElementById('august-reset-button')!.addEventListener('click', () => loadLevel(index));

        requestAnimationFrame(draw);
    }

    function mainMenu() {
        state = {type: 'menu'};

        const nextLevel = +(storage.get('nextLevel') ?? '0');

        context.fillStyle = BACKGROUND_COLOR;
        context.fillRect(0, 0, canvas.width, canvas.height);

        setOverlay(`
            <div class="center" style="display: flex; flex-direction: column; align-items: center; gap: 50px">
                <img src="${logo}" alt="Cascade" style="box-shadow: 0 0 20px white" />
                <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; max-width: 500px;">
                    ${LEVELS.map((_, index) => `<button class="light" style="width: 70px; height: 35px; ${nextLevel === index ? 'border-width: 5px; border-style: dashed; padding: 0' : ''}" ${nextLevel < index ? 'disabled' : ''}>${index + 1} ${nextLevel > index ? '🏆' : ''}</button>`).join('')}
                </div>
            </div>
        `);

        overlay.querySelectorAll('button').forEach((button, index) => {
            button.addEventListener('click', () => loadLevel(index));
        });
    }

    function checkWin() {
        if (state.type !== 'play') return;

        const allButtons = state.level.filter(object => object.type === 'button') as GameObject.Button[];
        if (allButtons.every(button => button.pressed)) {
            winAudio.play();
            state.complete = true;

            if (+(storage.get('nextLevel') ?? '0') <= state.levelIndex) {
                storage.set('nextLevel', state.levelIndex + 1);
            }

            const notLastLevel = state.levelIndex !== LEVELS.length - 1;

            setOverlay(`
                <div style="display: flex; flex-direction: column; gap: 10px; background-color: ${BACKGROUND_COLOR}; border: 1px solid var(--ui-white); padding: 15px; align-items: center; margin: 5px 0 0 5px; width: fit-content">
                    Level ${state.levelIndex + 1} complete 🏆
                    <div style="display: flex; gap: 5px">
                        <button class="light" id="menu">MENU</button>
                        ${notLastLevel ? '<button class="light" id="next">NEXT LEVEL</button>' : ''}
                    </div>
                </div>
            `);

            document.getElementById('menu')!.addEventListener('click', () => {
                clickAudio.play();
                mainMenu();
            });

            if (notLastLevel) {
                document
                    .getElementById('next')!
                    .addEventListener('click', () => loadLevel((state as State.Play).levelIndex + 1));
            }

            return;
        }

        pressAudio.play();
    }

    function failLevel() {
        if (state.type !== 'play') return;

        explodeAudio.play();
        state.complete = true;

        setOverlay(`
            <div style="display: flex; flex-direction: column; gap: 10px; background-color: ${BACKGROUND_COLOR}; border: 1px solid var(--ui-white); padding: 15px; align-items: center; margin: 5px 0 0 5px; width: fit-content">
                Level failed 💥
                <div style="display: flex; gap: 5px">
                    <button class="light" id="menu">MENU</button>
                    <button class="light" id="restart">RESTART</button>
                </div>
            </div>
        `);

        document.getElementById('restart')!.addEventListener('click', () => {
            clickAudio.play();
            loadLevel((state as State.Play).levelIndex);
        });

        document.getElementById('menu')!.addEventListener('click', () => {
            clickAudio.play();
            mainMenu();
        });
    }

    function update(delta: number, knocked?: {x: number; y: number; angle: number}) {
        if (state.type !== 'play') return;

        const knocks = new Map<string, {angle: number; source?: GameObject.Any}>();
        if (knocked !== undefined) knocks.set(`${knocked.x},${knocked.y}`, {angle: knocked.angle});

        for (const object of state.level) {
            switch (object.type) {
                case 'domino':
                    if (typeof object.fallState === 'number') {
                        object.fallState += delta * FALL_SPEED;
                        if (!object.halfClackPlayed && object.fallState > 0.5) {
                            choice(tickAudios).play();
                            object.halfClackPlayed = true;
                        }
                        if (object.fallState >= 1) {
                            object.fallState = true;
                            const [dx, dy] = DIRECTIONS[object.angle];
                            knocks.set(`${object.x + dx},${object.y + dy}`, {angle: object.angle, source: object});
                            if (object.large) {
                                const [largeDx, largeDy] = DIRECTIONS[modulo(object.angle - 1, 4)];
                                knocks.set(`${object.x + dx + largeDx},${object.y + dy + largeDy}`, {
                                    angle: object.angle,
                                    source: object,
                                });
                            }
                        }
                    }
                    break;
                case 'piston':
                    if (typeof object.extendState === 'number') {
                        object.extendState += delta * FALL_SPEED;
                        if (object.extendState >= 1) {
                            object.extendState = true;

                            const [dx, dy] = DIRECTIONS[object.angle];
                            update(0, {x: object.x + dx, y: object.y + dy, angle: object.angle});
                        }
                    }
                    break;
                case 'spinner':
                    if (typeof object.spinState === 'number') {
                        object.spinState += delta * FALL_SPEED;
                        if (object.spinState >= 1) {
                            object.spinState = true;

                            const [parallelX, parallelY] = DIRECTIONS[(object.angle + (object.clockwise ? 0 : 2)) % 4];
                            const [perpendicularX, perpendicularY] = DIRECTIONS[(object.angle + 1) % 4];
                            knocks.set(`${object.x + parallelX},${object.y + parallelY}`, {
                                angle: (object.angle + (object.clockwise ? 0 : 2)) % 4,
                                source: object,
                            });
                            knocks.set(
                                `${object.x + perpendicularX - parallelX},${object.y + perpendicularY - parallelY}`,
                                {
                                    angle: (object.angle + (object.clockwise ? 2 : 0)) % 4,
                                    source: object,
                                },
                            );
                        }
                    }
                    break;
                case 'ball':
                    if (object.moveState !== undefined) {
                        object.moveState.progress += delta * BALL_SPEED;
                        if (object.moveState.progress >= 1) {
                            object.x += DIRECTIONS[object.moveState.direction][0];
                            object.y += DIRECTIONS[object.moveState.direction][1];
                            object.moveState.progress = 0;

                            knocks.set(`${object.x},${object.y}`, {angle: object.moveState.direction, source: object});

                            const collision = state.level.find(
                                other => object !== other && other.x === object.x && other.y === object.y,
                            );
                            if (
                                collision !== undefined &&
                                (collision.type !== 'wall' || collision.angle === object.moveState.direction)
                            ) {
                                object.moveState = undefined;
                            }
                        }
                    }
                    break;
            }
        }

        if ([...knocks.values()].some(knock => knock.source?.type === 'domino')) {
            tickAudios[Math.floor(Math.random() * tickAudios.length)].play();
        }

        for (const [position, {angle, source}] of knocks.entries()) {
            const [x, y] = position.split(',').map(Number);

            for (const object of state.level) {
                if (object === source) continue;

                const ballKnockedEarlyPosition = (() => {
                    if (object.type !== 'ball' || object.moveState === undefined) return;
                    const [dx, dy] = DIRECTIONS[object.moveState.direction];
                    const nextX = object.x + dx;
                    const nextY = object.y + dy;
                    if (nextX !== x || nextY !== y) return;
                    return [nextX, nextY];
                })();

                const largeDominoKnocked = (() => {
                    if (object.type !== 'domino' || !object.large || object.fallState !== false) return false;
                    const [dx, dy] = DIRECTIONS[modulo(object.angle - 1, 4)];
                    const otherX = object.x + dx;
                    const otherY = object.y + dy;
                    return otherX === x && otherY === y;
                })();

                if (
                    (object.x !== x || object.y !== y) &&
                    ballKnockedEarlyPosition === undefined &&
                    !largeDominoKnocked
                ) {
                    continue;
                }

                switch (object.type) {
                    case 'domino':
                        if (!object.fallState) object.fallState = 0;
                        break;
                    case 'mine':
                        state.explosion = [x, y];
                        failLevel();
                        break;
                    case 'button':
                        if (object.pressed) continue;
                        object.pressed = true;
                        checkWin();
                        break;
                    case 'spinner':
                        if (!object.spinState) {
                            mineAudio.play();
                            object.spinState = 0;
                        }
                        break;
                    case 'ball':
                        if (ballKnockedEarlyPosition !== undefined) {
                            object.x = ballKnockedEarlyPosition[0];
                            object.y = ballKnockedEarlyPosition[1];
                        }
                        object.moveState = {
                            direction: angle,
                            progress: 0,
                        };
                        break;
                }
            }
        }
    }

    function draw(now: number) {
        if (done || state.type !== 'play' || state.complete) return;

        const delta = state.lastTime === 0 ? 0 : (now - state.lastTime) / 1000;
        state.lastTime = now;

        update(delta);

        context.fillStyle = BACKGROUND_COLOR;
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.translate(canvas.width / 2, canvas.height / 2);
        context.scale(state.scale, state.scale);
        context.translate(-0.5, -0.5);

        if (state.explosion) {
            const gradient = context.createRadialGradient(
                state.explosion[0] + 0.5,
                state.explosion[1] + 0.5,
                0,
                state.explosion[0] + 0.5,
                state.explosion[1] + 0.5,
                1,
            );
            gradient.addColorStop(0, EXPLOSION_START_COLOR);
            gradient.addColorStop(1, EXPLOSION_STOP_COLOR);
            context.fillStyle = gradient;
            context.beginPath();
            context.arc(state.explosion[0] + 0.5, state.explosion[1] + 0.5, 1, 0, Math.PI * 2);
            context.fill();
        }

        for (const object of state.level) {
            switch (object.type) {
                case 'domino':
                    context.save();

                    context.translate(object.x + 0.5, object.y + 0.5);
                    context.rotate((object.angle * Math.PI) / 2);
                    context.translate(0, -0.5);

                    for (const [index, translation] of (object.large ? [-0.25] : [0.25, -0.25]).entries()) {
                        context.save();
                        const generator = create(`${object.x},${object.y},${index}`);
                        context.rotate(
                            generator.random() * DOMINO_RANDOM_ROTATION_MAX * 2 - DOMINO_RANDOM_ROTATION_MAX,
                        );
                        if (object.curveFrom !== undefined) {
                            context.fillStyle = DOMINO_COLOR;
                            context.translate(0, 0.5);
                            context.rotate(
                                (Math.PI / 6) * (index + 1) * ((object.curveFrom - object.angle) % 2 === 0 ? -1 : 1),
                            );
                            context.translate(0, -0.5);

                            context.translate(0, OFFSETS[object.angle][object.curveFrom] * CURVE_FROM_OFFSET);
                        }
                        context.translate(translation, 0);
                        context.fillStyle = DOMINO_COLOR;
                        context.lineWidth = DOMINO_BORDER_WIDTH;
                        context.strokeStyle = DOMINO_BORDER_COLOR;
                        const length = object.large ? DOMINO_LENGTH_LARGE : DOMINO_LENGTH;
                        const fullWidth = object.large ? DOMINO_FULL_WIDTH_LARGE : DOMINO_FULL_WIDTH;
                        const params = [
                            -DOMINO_BASE_WIDTH / 2,
                            length / 2 - (object.large ? 1.5 : 0),
                            object.fallState
                                ? DOMINO_BASE_WIDTH +
                                  fullWidth *
                                      (index === 0
                                          ? (object.fallState as number) > 0.5
                                              ? ((object.fallState as number) - 0.5) * 2
                                              : 0
                                          : (object.fallState as number) <= 0.5
                                            ? (object.fallState as number) * 2
                                            : 1)
                                : DOMINO_BASE_WIDTH,
                            length,
                        ] as const;
                        context.fillRect(...params);
                        context.strokeRect(...params);
                        context.restore();
                    }

                    context.restore();
                    break;
                case 'piston':
                    context.save();

                    context.translate(object.x + 0.5, object.y + 0.5);
                    context.rotate((object.angle * Math.PI) / 2);
                    context.translate(-0.5, 0);

                    if (object.display) context.scale(0.25, 0.25);

                    context.strokeStyle = PISTON_BORDER_COLOR;
                    context.lineWidth = PISTON_WIDTH + PISTON_BORDER_WIDTH;
                    context.beginPath();
                    context.arc(0.5, 0, 0.4, 0.5, Math.PI * 2 - 0.5);
                    context.stroke();

                    context.strokeStyle = PISTON_COLOR;
                    context.lineWidth = PISTON_WIDTH;
                    context.beginPath();
                    context.arc(0.5, 0, 0.4, 0.5, Math.PI * 2 - 0.5);
                    context.stroke();

                    context.strokeStyle = PISTON_BORDER_COLOR;
                    context.fillStyle = PISTON_COLOR;
                    context.lineWidth = PISTON_BORDER_WIDTH;
                    context.beginPath();
                    context.roundRect(
                        0.25 +
                            (typeof object.extendState === 'number' ? object.extendState : object.extendState ? 1 : 0) /
                                2,
                        -PISTON_WIDTH / 2,
                        PISTON_LENGTH,
                        PISTON_WIDTH,
                        0.1,
                    );
                    context.stroke();
                    context.fill();

                    context.restore();

                    break;
                case 'button':
                    context.fillStyle = object.pressed ? BUTTON_PRESSED_COLOR : BUTTON_UNPRESSED_COLOR;
                    context.strokeStyle = BUTTON_BORDER_COLOR;
                    context.lineWidth = BUTTON_BORDER_WIDTH;
                    context.beginPath();
                    context.arc(object.x + 0.5, object.y + 0.5, 0.5, 0, 2 * Math.PI);
                    context.fill();
                    context.stroke();
                    break;
                case 'mine':
                    context.fillStyle = MINE_COLOR;
                    context.strokeStyle = MINE_BORDER_COLOR;
                    context.lineWidth = MINE_BORDER_WIDTH;
                    context.beginPath();
                    context.arc(object.x + 0.5, object.y + 0.5, MINE_WIDTH, 0, 2 * Math.PI);
                    context.fill();
                    context.stroke();
                    context.fillStyle = MINE_CENTER_COLOR;
                    context.beginPath();
                    context.arc(object.x + 0.5, object.y + 0.5, MINE_CENTER_WIDTH, 0, 2 * Math.PI);
                    context.fill();
                    break;
                case 'spinner':
                    context.save();

                    context.translate(object.x, object.y);

                    context.translate(0.5, 0.5);
                    context.rotate((object.angle * Math.PI) / 2);
                    context.translate(-0.5, -0.5);

                    context.translate(0.5, 1);
                    context.rotate(
                        (object.clockwise ? 1 : -1) *
                            (typeof object.spinState === 'number'
                                ? (object.spinState * Math.PI) / 4
                                : object.spinState
                                  ? Math.PI / 4
                                  : 0),
                    );
                    context.translate(-0.5, -1);

                    context.fillStyle = SPINNER_COLOR;
                    context.strokeStyle = SPINNER_BORDER_COLOR;
                    context.lineWidth = SPINNER_BORDER_WIDTH;
                    context.beginPath();
                    context.rect(0.4, -0.2, 0.2, 2.4);
                    context.fill();
                    context.stroke();
                    context.beginPath();
                    context.arc(0.5, 1, 0.25, 0, 2 * Math.PI);
                    context.fill();
                    context.stroke();
                    context.restore();

                    break;
                case 'ball':
                    const x =
                        object.x +
                        0.5 +
                        (object.moveState === undefined
                            ? 0
                            : DIRECTIONS[object.moveState.direction][0] * object.moveState.progress);
                    const y =
                        object.y +
                        0.5 +
                        (object.moveState === undefined
                            ? 0
                            : DIRECTIONS[object.moveState.direction][1] * object.moveState.progress);

                    context.fillStyle = BALL_COLOR;
                    context.strokeStyle = BALL_BORDER_COLOR;
                    context.lineWidth = BALL_BORDER_WIDTH;
                    context.beginPath();
                    context.arc(x, y, 0.3, 0, 2 * Math.PI);
                    context.fill();
                    context.stroke();
                    break;
                case 'wall':
                    context.fillStyle = WALL_COLOR;
                    context.strokeStyle = WALL_BORDER_COLOR;
                    context.lineWidth = WALL_BORDER_WIDTH;

                    context.save();
                    context.translate(object.x + 0.5, object.y + 0.5);
                    context.rotate(Math.PI + (object.angle * Math.PI) / 2);
                    context.translate(-object.x - 0.5, -object.y - 0.5);
                    context.fillRect(object.x, object.y, WALL_WIDTH, 1);
                    context.strokeRect(object.x, object.y, WALL_WIDTH, 1);
                    context.restore();
                    break;
                case 'text':
                    // Firefox has trouble rendering font sizes below ~0.55px
                    // As a workaround, scale back to normal size before drawing the text
                    context.save();
                    context.translate(object.x + 0.5, object.y + 0.5);
                    context.scale(1 / state.scale, 1 / state.scale);
                    context.fillStyle = UI_WHITE;
                    context.font = `24px ${FONT}`;
                    context.fillText(object.text, 0, 0);
                    context.restore();
                    break;
            }
        }

        context.resetTransform();

        requestAnimationFrame(draw);
    }

    function onPointerDown(event: PointerEvent) {
        if (state.type !== 'play') return;

        const x = Math.round((event.offsetX - canvas.width / 2) / state.scale);
        const y = Math.round((event.offsetY - canvas.height / 2) / state.scale);

        for (const object of state.level) {
            if (object.type === 'piston' && object.extendState === false && x === object.x && y === object.y) {
                hissAudio.play();
                object.extendState = 0;
                return;
            }
        }
    }

    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineCap = 'round';

    mainMenu();

    document.addEventListener('pointerdown', onPointerDown);
    musicAudio.play();
    return () => {
        done = true;
        document.removeEventListener('pointerdown', onPointerDown);
        musicAudio.pause();
    };
}

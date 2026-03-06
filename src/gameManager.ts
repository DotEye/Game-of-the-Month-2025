import {startStatic} from './static.ts';
import {clearOverlay, context, monthSpan, nextButton, prevButton} from './dom.ts';
import {january} from './games/january';
import {february} from './games/february';
import {march} from './games/march';
import {april} from './games/april';
import {may} from './games/may';
import {june} from './games/june';
import {july} from './games/july';
import {august} from './games/august';
import {september} from './games/september';
import {october} from './games/october';
import {november} from './games/november';
import {december} from './games/december';
import GameWorker from './shared/worker.ts?worker';
import {audioContext} from './audio.ts';
import {next} from './next.ts';

const games = [january, february, march, april, may, june, july, august, september, october, november, december, next];

const defaultMonthIndex = 0;

const worker = new GameWorker();

let monthIndex: number;
let callback: (() => void) | undefined = undefined;

function updateMonthFromHash() {
    if (location.hash === '') {
        monthIndex = defaultMonthIndex;
        return;
    }

    if (location.hash === '#Next?') {
        monthIndex = 12;
        return;
    }

    const hashMonth = new Date(`${location.hash.slice(1)} 1 2025`).getMonth();
    monthIndex = isNaN(hashMonth) || hashMonth < 0 || hashMonth > 11 ? defaultMonthIndex : hashMonth;
}

function getMonthString() {
    if (monthIndex === games.length - 1) return 'Next?';
    return new Date(2025, monthIndex).toLocaleString('en-US', {month: 'long'});
}

export function openPage(runner: (worker: Worker) => () => void) {
    if (callback !== undefined) {
        callback();
        callback = undefined;
    }
    clearOverlay();
    context.reset();
    audioContext.resume();
    startStatic(() => (callback = runner(worker)));
}

export function loadGame() {
    monthSpan.textContent = getMonthString();

    prevButton.disabled = monthIndex === 0;
    nextButton.disabled = monthIndex === games.length - 1;
    nextButton.textContent = monthIndex === games.length - 2 ? 'Next?' : 'Next';

    openPage(games[monthIndex]);
}

prevButton.addEventListener('click', () => {
    --monthIndex;
    location.hash = getMonthString();
});

nextButton.addEventListener('click', () => {
    ++monthIndex;
    if (monthIndex === games.length - 1) location.hash = 'Next?';
    else location.hash = getMonthString();
});

window.addEventListener('hashchange', () => {
    updateMonthFromHash();
    loadGame();
});

updateMonthFromHash();

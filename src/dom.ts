export const prevButton = document.getElementById('prev-button') as HTMLButtonElement;
export const nextButton = document.getElementById('next-button') as HTMLButtonElement;
export const monthSpan = document.getElementById('month-span') as HTMLSpanElement;
export const canvas = document.querySelector('canvas') as HTMLCanvasElement;
export const settings = document.getElementById('settings') as HTMLDivElement;
export const settingsButton = document.getElementById('settings-button') as HTMLButtonElement;
export const settingsDoneButton = document.getElementById('settings-done-button') as HTMLButtonElement;
export const settingsMusicVolumeInput = document.getElementById('settings-music-volume') as HTMLInputElement;
export const settingsSoundEffectsVolumeInput = document.getElementById(
    'settings-sound-effects-volume',
) as HTMLInputElement;
export const settingsResetButton = document.getElementById('settings-reset-button') as HTMLButtonElement;
export const settingsThemeSelect = document.getElementById('settings-theme') as HTMLSelectElement;
export const overlay = document.getElementById('overlay') as HTMLDivElement;

export const context = canvas.getContext('2d')!;

export function setOverlay(content: string, pointerEvents = true) {
    overlay.innerHTML = content;
    overlay.style.pointerEvents = pointerEvents ? 'all' : 'none';
}

export function clearOverlay() {
    overlay.innerHTML = '';
    overlay.style.pointerEvents = 'none';
}

function emptySelection() {
    window.getSelection()?.empty();
}

function onResize() {
    const {height, width} = canvas.getBoundingClientRect();
    overlay.style.scale = (width / 600).toString();
    overlay.style.top = `${(height - 600) / 2}px`;
    overlay.style.left = `${(width - 600) / 2}px`;
}

// In games that require dragging, prevent HTML elements from being dragged along
canvas.addEventListener('pointerdown', emptySelection);
overlay.addEventListener('pointerdown', emptySelection);

window.addEventListener('resize', onResize);
onResize();

// TODO: Temporary hack to fix page size on safari mobile. This should be replaced by a mutation observer.
setTimeout(onResize, 1000);

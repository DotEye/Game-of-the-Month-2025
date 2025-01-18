import {openPage, loadGame} from './gameManager.ts';
import {
    canvas,
    settings,
    settingsButton,
    settingsDoneButton,
    settingsMusicVolumeInput,
    settingsResetButton,
    settingsSoundEffectsVolumeInput,
} from './dom.ts';
import {audioContext, musicGain, setupMusic, setupSoundEffect, soundEffectsGain} from './audio.ts';
import music from './games/january/music.mp3';
import click from './assets/click.wav';

export function initSettings() {
    const RESET_BUTTON_DEFAULT_TEXT = 'Reset';
    const RESET_CONFIRMATION_TEXT = 'Are you sure?';
    const RESET_CONFIRMATION_TIMEOUT = 3000;

    const SOUND_EFFECT_PREVIEW_COOLDOWN = 250;

    const musicAudio = setupMusic(music);
    const clickAudio = setupSoundEffect(click);

    let soundEffectPreviewInterval: number | undefined = undefined;
    let resetConfirmationTimeout: number | undefined = undefined;

    settings.addEventListener('pointerdown', () => window.getSelection()?.removeAllRanges());

    settingsButton.addEventListener('click', () => {
        openPage(() => {
            settings.className = '';
            canvas.className = 'removed';
            musicAudio.play();
            return () => {
                settings.className = 'removed';
                canvas.className = '';
                musicAudio.pause();
                if (resetConfirmationTimeout !== undefined) {
                    clearInterval(resetConfirmationTimeout);
                    resetConfirmationTimeout = undefined;
                    settingsResetButton.textContent = RESET_BUTTON_DEFAULT_TEXT;
                }
            };
        });
    });

    function onSettingsMusicVolumeInput() {
        musicGain.gain.setValueAtTime(+settingsMusicVolumeInput.value, audioContext.currentTime);
        localStorage.setItem('music-volume', settingsMusicVolumeInput.value);
    }

    settingsMusicVolumeInput.addEventListener('input', onSettingsMusicVolumeInput);

    function onSettingsSoundEffectsVolumeInput() {
        soundEffectsGain.gain.setValueAtTime(+settingsSoundEffectsVolumeInput.value, audioContext.currentTime);
        localStorage.setItem('sound-effects-volume', settingsSoundEffectsVolumeInput.value);
    }

    settingsSoundEffectsVolumeInput.addEventListener('input', onSettingsSoundEffectsVolumeInput);
    settingsSoundEffectsVolumeInput.addEventListener('pointerdown', () => {
        soundEffectPreviewInterval = setInterval(() => clickAudio.play(), SOUND_EFFECT_PREVIEW_COOLDOWN);
    });

    settingsSoundEffectsVolumeInput.addEventListener('pointerup', () => {
        if (soundEffectPreviewInterval !== undefined) {
            clearInterval(soundEffectPreviewInterval);
            soundEffectPreviewInterval = undefined;
        }
    });

    settingsMusicVolumeInput.value = localStorage.getItem('music-volume') ?? '0.75';
    onSettingsMusicVolumeInput();
    settingsSoundEffectsVolumeInput.value = localStorage.getItem('sound-effects-volume') ?? '0.75';
    onSettingsSoundEffectsVolumeInput();

    settingsResetButton.addEventListener('click', () => {
        if (resetConfirmationTimeout === undefined) {
            settingsResetButton.textContent = RESET_CONFIRMATION_TEXT;

            resetConfirmationTimeout = setTimeout(() => {
                settingsResetButton.textContent = RESET_BUTTON_DEFAULT_TEXT;
                resetConfirmationTimeout = undefined;
            }, RESET_CONFIRMATION_TIMEOUT);
            return;
        }

        localStorage.clear();
        location.reload();
    });

    settingsDoneButton.addEventListener('click', loadGame);
}

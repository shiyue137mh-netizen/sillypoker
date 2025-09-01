/**
 * AI Card Table Extension - Audio Manager (ES6 Module)
 * @description Manages preloading and playback of game sound effects and BGM.
 */
import { Logger } from './logger.js';
import { AIGame_State } from './state.js';

let audioContext;
let parentWin;
const audioBuffers = {};
let extensionBasePath = ''; // This will hold the correct base path, e.g., /extensions/sillypoker/

const sounds = {
    click1: { path: 'assets/Sfx/click1.mp3', volume: 0.35 },
    click2: { path: 'assets/Sfx/click2.mp3', volume: 0.35 },
    deal: { path: 'assets/Sfx/dealing_cards1.mp3', volume: 0.8 },
    chip: { path: 'assets/Sfx/chips.mp3', volume: 0.8 },
    dice: { path: 'assets/Sfx/dice2.mp3', volume: 1.0 },
    choose: { path: 'assets/Sfx/choose.mp3', volume: 0.4 },
    boss_win: { path: 'assets/Sfx/win.mp3', volume: 1.0 },
    elevator_ding: { path: 'assets/Sfx/elevator-ding.mp3', volume: 0.6 }
};

const bgmTracks = [
    { name: 'Boss Blind', path: 'assets/BGM/Boss Blind.mp3' },
    { name: 'Main Theme', path: 'assets/BGM/Main Theme.mp3' }
];
let bgmAudioElement = null;

let isInitialized = false;
let soundLoadingPromises = {}; 

/**
 * Prepends the extension's base path to a relative URL.
 * @param {string} relativePath The path relative to the extension's root.
 * @returns {string} The full, correct path for fetching.
 */
function getFullPath(relativePath) {
    if (!extensionBasePath || relativePath.startsWith('/') || relativePath.startsWith('http')) {
        return relativePath;
    }
    return `${extensionBasePath}${relativePath}`;
}

function _ensureContext() {
    if (audioContext && audioContext.state === 'running') return Promise.resolve();
    
    if (!audioContext) {
        const ParentAudioContext = parentWin.AudioContext || parentWin.webkitAudioContext;
        if (ParentAudioContext) {
            audioContext = new ParentAudioContext();
            Logger.log('AudioContext created.');
        } else {
            Logger.error('Web Audio API is not supported.');
            return Promise.reject('Web Audio API not supported.');
        }
    }
    
    if (audioContext.state === 'suspended') {
        Logger.log('AudioContext is suspended, attempting to resume...');
        return audioContext.resume();
    }
    
    return Promise.resolve();
}

async function loadSound(name, url) {
    if (audioBuffers[name]) return audioBuffers[name];
    if (soundLoadingPromises[name]) return soundLoadingPromises[name];
    if (!audioContext) {
        Logger.warn('Cannot load sound, AudioContext not ready.');
        return null;
    }
    const fullUrl = getFullPath(url);
    const loadPromise = (async () => {
        try {
            const response = await fetch(fullUrl);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status} for ${fullUrl}`);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            audioBuffers[name] = audioBuffer;
            Logger.log(`Sound loaded and decoded: ${name}`);
            delete soundLoadingPromises[name];
            return audioBuffer;
        } catch (error) {
            Logger.error(`Could not load sound: ${name} from ${fullUrl}`, error);
            delete soundLoadingPromises[name];
            return null;
        }
    })();
    
    soundLoadingPromises[name] = loadPromise;
    return loadPromise;
}

function _initBGM() {
    if (bgmAudioElement) return;
    bgmAudioElement = new parentWin.Audio();
    
    bgmAudioElement.volume = AIGame_State.bgmVolume;

    // FIX: This event listener is the key to playlist looping. When one track ends,
    // it calls the `nextTrack` function, which will handle playing the next song
    // in the list, effectively creating a playlist loop.
    bgmAudioElement.addEventListener('ended', () => {
        Logger.log('BGM track ended, playing next in playlist.');
        AudioManager.nextTrack(true); // Auto-play the next track
    });

    bgmAudioElement.addEventListener('error', (e) => {
        Logger.error('BGM Audio Element Error:', e.target.error, `for track ${e.target.src}`);
    });
}

function _playTrack(index) {
    if (!bgmAudioElement) _initBGM();
    if (index < 0 || index >= bgmTracks.length) {
        Logger.warn(`Invalid track index: ${index}`);
        return;
    }
    
    AIGame_State.currentBgmTrackIndex = index;
    const track = bgmTracks[index];
    const fullTrackPath = getFullPath(track.path);
    bgmAudioElement.src = fullTrackPath;
    bgmAudioElement.volume = AIGame_State.isMuted ? 0 : AIGame_State.bgmVolume;
    
    const playPromise = bgmAudioElement.play();
    if (playPromise !== undefined) {
        playPromise.then(() => {
            AIGame_State.isBgmPlaying = true;
            Logger.log(`Playing BGM: ${track.name}`);
        }).catch(error => {
            AIGame_State.isBgmPlaying = false;
            Logger.warn(`BGM play failed for "${fullTrackPath}", likely requires user interaction.`, error);
        }).finally(() => {
            // Need to get UI from parent, so can't call directly
            parentWin.jQuery(parentWin.document.body).find('#sillypoker-panel').trigger('sillypoker:rerender');
        });
    }
}


export const AudioManager = {
    init: function(deps) {
        if (isInitialized) return;
        parentWin = deps.win;

        // Dynamically determine the extension's base path using import.meta.url
        try {
            const scriptUrl = new URL(import.meta.url);
            // Go up from /modules/ to the extension root
            extensionBasePath = scriptUrl.pathname.substring(0, scriptUrl.pathname.lastIndexOf('/modules') + 1);
        } catch(e) {
            Logger.error("Failed to dynamically determine extension base path. Using fallback.", e);
            // Fallback for older environments that might not support import.meta.url
            extensionBasePath = '/extensions/sillypoker/';
        }

        isInitialized = true;
        Logger.success(`AudioManager initialized with base path: ${extensionBasePath}`);
    },

    getBgmTracks: () => bgmTracks,

    play: async function(name) {
        if (AIGame_State.isMuted) return;
        if (!isInitialized) this.init({ win: window.parent });
        const sound = sounds[name];
        if (!sound) {
            Logger.warn(`Sound "${name}" is not defined.`);
            return;
        }

        try {
            await _ensureContext();
            const buffer = await loadSound(name, sound.path);
            if (buffer) {
                const source = audioContext.createBufferSource();
                const gainNode = audioContext.createGain();
                source.buffer = buffer;
                source.connect(gainNode);
                gainNode.connect(audioContext.destination);
                gainNode.gain.value = sound.volume;
                source.start(0);
            } else {
                 Logger.warn(`Could not play sound "${name}", buffer not available.`);
            }
        } catch (error) {
            Logger.error(`Error playing sound "${name}":`, error);
        }
    },

    playStaggered: async function(name, count = 1, delay = 80) {
        if (AIGame_State.isMuted || count <= 0) return;
        await _ensureContext();
        const sound = sounds[name];
        if (!sound) {
            Logger.warn(`Staggered sound "${name}" not defined.`);
            return;
        }

        const buffer = await loadSound(name, sound.path);
        if (!buffer) {
            Logger.warn(`Cannot play staggered sound "${name}", buffer not available.`);
            return;
        }
    
        const playInstance = (i) => {
            setTimeout(() => {
                if (AIGame_State.isMuted) return;
                const source = audioContext.createBufferSource();
                const gainNode = audioContext.createGain();
                source.buffer = buffer;
                gainNode.gain.value = sound.volume;
                source.connect(gainNode);
                gainNode.connect(audioContext.destination);
                source.start(0);
            }, i * delay);
        };
    
        for (let i = 0; i < count; i++) {
            playInstance(i);
        }
    },
    
    setMute: function(isMuted) {
        AIGame_State.isMuted = isMuted;
        if (bgmAudioElement) {
            bgmAudioElement.volume = isMuted ? 0 : AIGame_State.bgmVolume;
        }
        Logger.log(`Global audio mute set to: ${isMuted}`);
    },
    
    startBGMPlaylist: function() {
        if (!isInitialized) this.init({ win: window.parent });
        Logger.log('BGM playlist start requested.');
        if (bgmTracks.length > 0 && !AIGame_State.isBgmPlaying) {
             _playTrack(AIGame_State.currentBgmTrackIndex);
        }
    },

    toggleBGM: function() {
        if (!bgmAudioElement) _initBGM();

        if (AIGame_State.isBgmPlaying) {
            bgmAudioElement.pause();
            AIGame_State.isBgmPlaying = false;
            Logger.log('BGM paused.');
        } else {
            _playTrack(AIGame_State.currentBgmTrackIndex);
        }
        // Trigger a re-render
        parentWin.jQuery(parentWin.document.body).find('#sillypoker-panel').trigger('sillypoker:rerender');
    },

    nextTrack: function(autoplay = false) {
        let newIndex = (AIGame_State.currentBgmTrackIndex + 1) % bgmTracks.length;
        _playTrack(newIndex);
        if (!autoplay) {
            parentWin.jQuery(parentWin.document.body).find('#sillypoker-panel').trigger('sillypoker:rerender');
        }
    },

    prevTrack: function() {
        let newIndex = (AIGame_State.currentBgmTrackIndex - 1 + bgmTracks.length) % bgmTracks.length;
        _playTrack(newIndex);
        parentWin.jQuery(parentWin.document.body).find('#sillypoker-panel').trigger('sillypoker:rerender');
    },

    setVolume: function(volume) {
        AIGame_State.bgmVolume = volume;
        if (bgmAudioElement) {
            bgmAudioElement.volume = AIGame_State.isMuted ? 0 : volume;
        }
    }
};

// Add a custom event listener to the panel to allow re-rendering from the audio manager
// This needs to be robust enough to handle being called before the panel exists.
jQuery(document).ready(function() {
    if (parentWin && parentWin.jQuery) {
        parentWin.jQuery(parentWin.document.body).on('sillypoker:rerender', '#sillypoker-panel', function() {
            const parentUI = parentWin.AIGame_UI;
            if (parentUI && typeof parentUI.renderPanelContent === 'function') {
                parentUI.renderPanelContent();
            }
        });
    }
});
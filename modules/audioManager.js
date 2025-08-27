/**
 * AI Card Table Extension - Audio Manager (ES6 Module)
 * @description Manages preloading and playback of game sound effects using Web Audio API.
 */
import { Logger } from './logger.js';

let audioContext;
const audioBuffers = {};
const sounds = {
    click: '/sounds/click.wav',
    deal: '/sounds/card_deal.wav',
    chip: '/sounds/chips.wav'
};
let isInitialized = false;
let soundLoadingPromises = {}; // To track loading promises

/**
 * Ensures AudioContext is created and in a running state.
 * This must be called from within a user-initiated event handler (e.g., a click).
 * @returns {Promise<void>}
 */
function _ensureContext() {
    // If context is already running, we're good.
    if (audioContext && audioContext.state === 'running') {
        return Promise.resolve();
    }
    
    // Create context if it doesn't exist.
    if (!audioContext) {
        const ParentAudioContext = window.parent.AudioContext || window.parent.webkitAudioContext;
        if (ParentAudioContext) {
            audioContext = new ParentAudioContext();
            Logger.log('AudioContext created.');
        } else {
            Logger.error('Web Audio API is not supported.');
            return Promise.reject('Web Audio API not supported.');
        }
    }
    
    // If it exists but is suspended, try to resume it.
    if (audioContext.state === 'suspended') {
        Logger.log('AudioContext is suspended, attempting to resume...');
        return audioContext.resume();
    }
    
    // If it's in any other state (like 'closed'), it's an issue, but for now, we just resolve.
    return Promise.resolve();
}

/**
 * Loads a sound file via fetch, decodes it, and caches the buffer.
 * Returns a promise that resolves with the AudioBuffer.
 * @param {string} name - The name of the sound (e.g., 'click').
 * @param {string} url - The path to the sound file.
 * @returns {Promise<AudioBuffer|null>}
 */
async function loadSound(name, url) {
    // If buffer is already cached, return it immediately.
    if (audioBuffers[name]) {
        return audioBuffers[name];
    }
    
    // If a load is already in progress for this sound, return the existing promise.
    if (soundLoadingPromises[name]) {
        return soundLoadingPromises[name];
    }

    if (!audioContext) {
        Logger.warn('Cannot load sound, AudioContext not ready.');
        return null;
    }

    // Start the loading process and store the promise.
    const loadPromise = (async () => {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            audioBuffers[name] = audioBuffer; // Cache the buffer.
            Logger.log(`Sound loaded and decoded: ${name}`);
            delete soundLoadingPromises[name]; // Clean up the promise tracker.
            return audioBuffer;
        } catch (error) {
            Logger.warn(`Could not load sound: ${name}`, error);
            delete soundLoadingPromises[name]; // Allow retrying on failure.
            return null;
        }
    })();
    
    soundLoadingPromises[name] = loadPromise;
    return loadPromise;
}

export const AudioManager = {
    init: function() {
        if (isInitialized) return;
        // The init is now very lightweight. It just sets a flag.
        // The real initialization (AudioContext creation) happens on the first play() call.
        isInitialized = true;
        Logger.success('AudioManager initialized (lazy setup).');
    },

    /**
     * Plays a sound by name. This is an async function.
     * It handles AudioContext creation/resuming and on-demand sound loading.
     * @param {string} name - The name of the sound to play (e.g., 'click').
     */
    play: async function(name) {
        if (!isInitialized) this.init(); // Ensure module is flagged as initialized.
        
        if (!sounds[name]) {
            Logger.warn(`Sound "${name}" is not defined in the sound list.`);
            return;
        }

        try {
            // This is the key part. It must be called by a user gesture.
            await _ensureContext();
            
            // Get the buffer, which will be loaded and cached if it's the first time.
            const buffer = await loadSound(name, sounds[name]);
            
            if (buffer) {
                const source = audioContext.createBufferSource();
                source.buffer = buffer;
                source.connect(audioContext.destination);
                source.start(0);
            } else {
                 Logger.warn(`Could not play sound "${name}" because the buffer is not available.`);
            }
        } catch (error) {
            Logger.error(`Error playing sound "${name}":`, error);
        }
    }
};

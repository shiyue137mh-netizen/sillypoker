/**
 * AI Card Table Extension - State Management
 * @description A simple, centralized object to hold the application's state.
 */
import { AIGame_Config } from '../config.js';

let parentWindow;

export const AIGame_State = {
    isPanelVisible: false,
    panelPos: null,
    baseFontSize: 20, // NEW: Added base font size
    hasGameBook: false,
    runInProgress: false, // NEW: Tracks if a Rogelike run is active
    currentActiveTab: 'map', // Default to map view
    isInventoryVisible: false,
    isMuted: false, // Tracks SFX mute state

    // BGM State
    isBgmPlaying: false,
    currentBgmTrackIndex: 0,
    bgmVolume: 0.3,

    // Tutorial Hint
    currentHint: null,

    // Game-specific state
    playerData: null,
    enemyData: null,
    playerCards: null,
    currentGameState: null, // Holds the public state of the current game
    privateGameData: null, // Holds the private state like the deck
    stagedPlayerActions: [], // Holds player actions before committing
    isDealing: false, // NEW: Tracks if cards are currently being dealt to trigger animations

    // Map-specific state
    mapData: null, // Holds the generated or loaded map data object
    selectedMapNodeId: null,
    mapPan: { x: 0, y: 0 },
    mapZoom: 1.0,
    mapTransformInitialized: false, // Tracks if the initial map view has been set

    /**
     * Initializes the state module with a reference to the parent window.
     * @param {Window} win The main SillyTavern window object.
     */
    init: function(win) {
        parentWindow = win;
        this.loadUiState(); // Load persisted UI state on initialization
    },

    // MODIFIED: Load UI state from localStorage, now includes font size
    loadUiState: function() {
        try {
            const s = JSON.parse(parentWindow.localStorage.getItem(AIGame_Config.STORAGE_KEY_UI) || '{}');
            if (s.isPanelVisible !== undefined) this.isPanelVisible = s.isPanelVisible;
            if (s.panelPos) this.panelPos = s.panelPos;
            if (s.baseFontSize) this.baseFontSize = s.baseFontSize;
        } catch (e) {
            console.error('[SillyPoker] Failed to load UI state from localStorage:', e);
        }
    },
    
    // MODIFIED: Save UI state to localStorage, now includes font size
    saveUiState: function() {
        try {
            const stateToSave = { 
                isPanelVisible: this.isPanelVisible, 
                panelPos: this.panelPos,
                baseFontSize: this.baseFontSize,
            };
            parentWindow.localStorage.setItem(AIGame_Config.STORAGE_KEY_UI, JSON.stringify(stateToSave));
        } catch (e) {
            console.error('[SillyPoker] Failed to save UI state to localStorage:', e);
        }
    }
};
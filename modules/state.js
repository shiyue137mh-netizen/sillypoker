/**
 * AI Card Table Extension - State Management
 * @description A simple, centralized object to hold the application's state.
 */
let parentWindow;

export const AIGame_State = {
    isPanelVisible: false,
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
    },
};
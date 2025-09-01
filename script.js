/**
 * AI Card Table Extension for SillyTavern - Main Entry Point
 * @version 8.6.1
 * This script now uses ES6 modules, mirroring the phone simulator's architecture.
 */
'use strict';

import { AIGame_UI } from './modules/ui.js';
import { AIGame_DataHandler } from './modules/dataHandler.js';
import { AIGame_State } from './modules/state.js';
import { AIGame_Events } from './modules/events.js';
import { Logger } from './modules/logger.js';
import { AudioManager } from './modules/audioManager.js';
import { initRenderer } from './modules/gameRenderer.js';
import { AIGame_History } from './modules/gameHistory.js';
import { UpdateChecker } from './modules/updateChecker.js';

// NEW: Import all the new view modules
import { ModeSelectionView } from './modules/views/ModeSelectionView.js';
import { DifficultyView } from './modules/views/DifficultyView.js';
import { SettingsView } from './modules/views/SettingsView.js';
import { StoryView } from './modules/views/StoryView.js';
import { LogView } from './modules/views/LogView.js';
import { MapView } from './modules/views/MapView.js';
import { HallOfFameView } from './modules/views/HallOfFameView.js'; // NEW: Import HallOfFameView


// --- Top-level module scope variables ---
const parentWin = window.parent;
let SillyTavern, TavernHelper, toastr, jQuery, SillyTavernContext;
let mainProcessorTimeout;

/**
 * Checks if all required SillyTavern APIs are available and assigns them.
 */
function areApisReady() {
    SillyTavern = parentWin.SillyTavern;
    TavernHelper = parentWin.TavernHelper;
    toastr = parentWin.toastr;
    jQuery = parentWin.jQuery;
    SillyTavernContext = SillyTavern && SillyTavern.getContext ? SillyTavern.getContext() : null;

    return !!(SillyTavern && TavernHelper && toastr && jQuery && SillyTavernContext && SillyTavernContext.eventSource);
}


const debouncedMainProcessor = (msgId) => {
    clearTimeout(mainProcessorTimeout);
    mainProcessorTimeout = setTimeout(() => {
        Logger.log(`[Processor] Debounced processor is running for message ID: ${msgId}.`);
        const messages = TavernHelper.getChatMessages(msgId);
        if (messages && messages.length > 0) {
            Logger.log(`[Processor] Fetched message content, length: ${messages[0].message.length}.`);
            AIGame_DataHandler.mainProcessor(messages[0].message);
        } else {
            Logger.warn(`[Processor] Could not fetch message content for ID: ${msgId}.`);
        }
    }, 250);
};

/**
 * The main initialization function for the extension.
 */
async function mainInitialize() {
    
    const dependencies = {
        st: SillyTavern,
        st_context: SillyTavernContext,
        th: TavernHelper,
        toastr: toastr,
        jq: jQuery,
        win: parentWin
    };
    
    Logger.init(dependencies);
    Logger.log('--- SillyPoker Initializing (v8.6.1) ---');
    Logger.log('[Init] Logger initialized.');

    AIGame_State.init(parentWin);
    Logger.log('[Init] State initialized.');

    AIGame_History.init(dependencies);
    Logger.log('[Init] History initialized.');

    AudioManager.init(dependencies);
    Logger.log('[Init] AudioManager initialized.');

    initRenderer(dependencies);
    Logger.log('[Init] Renderer initialized.');
    
    const viewModules = {
        ModeSelectionView, DifficultyView, SettingsView, StoryView, LogView, MapView, HallOfFameView
    };
    Object.values(viewModules).forEach(view => view.init(dependencies, AIGame_DataHandler));
    Logger.log('[Init] All View modules initialized.');

    AIGame_DataHandler.init(dependencies, AIGame_UI, AudioManager, AIGame_History);
    Logger.log('[Init] DataHandler initialized.');

    AIGame_UI.init(dependencies, AIGame_DataHandler, AIGame_History, viewModules);
    Logger.log('[Init] UI Controller initialized.');

    AIGame_Events.init(dependencies, AIGame_DataHandler, AIGame_UI);
    Logger.log('[Init] Events initialized.');
    
    const uiInitialized = await AIGame_UI.initializeUI();
    if (!uiInitialized) {
        Logger.error("[Init] UI failed to initialize DOM. Halting extension load.");
        return;
    }
    Logger.log('[Init] UI DOM elements are ready.');
    
    await UpdateChecker.check();
    Logger.log('[Init] Update check completed.');

    AIGame_UI.applyFontSize();
    Logger.log('[Init] Persisted font size applied.');

    // Bind global SillyTavern events
    Logger.log('[Init] Binding SillyTavern event listeners...');
    const e = SillyTavernContext.eventTypes;

    // CRITICAL FIX: Create a single handler and listen for both new messages and edits.
    const messageHandler = (eventType, id) => {
        Logger.log(`[Event] ${eventType} captured for message ID: ${id}. Debouncing processor...`);
        debouncedMainProcessor(id);
    };

    SillyTavernContext.eventSource.on(e.MESSAGE_RECEIVED, (id) => messageHandler('MESSAGE_RECEIVED', id));
    SillyTavernContext.eventSource.on(e.MESSAGE_EDITED, (id) => messageHandler('MESSAGE_EDITED', id));

    SillyTavernContext.eventSource.on(e.CHAT_CHANGED, () => {
        Logger.log(`[Event] CHAT_CHANGED event triggered. Character: ${SillyTavernContext.name2}`);
        Logger.log('[CHAT_CHANGED] Resetting plugin state for new character context...');
        
        AIGame_DataHandler.clearLorebookCache(); 
        AIGame_State.hasGameBook = false; 
        AIGame_State.runInProgress = false;
        AIGame_State.mapTransformInitialized = false;
        AIGame_State.isModeSelected = false;
        AIGame_State.gameMode = null;
        Logger.log('[CHAT_CHANGED] Plugin state has been fully reset.');

        if (AIGame_State.isPanelVisible) {
            Logger.log('[CHAT_CHANGED] Panel is visible, calling loadInitialState directly.');
            AIGame_DataHandler.loadInitialState();
        } else {
            Logger.log('[CHAT_CHANGED] Panel is closed. State check will occur on panel open.');
        }
    });
    Logger.log('[Init] All event listeners bound.');
    
    Logger.success('AI Card Table extension initialized successfully.');
}

// Poll until the APIs are ready
const apiReadyInterval = setInterval(() => {
    if (areApisReady()) {
        clearInterval(apiReadyInterval);
        mainInitialize();
    }
}, 100);

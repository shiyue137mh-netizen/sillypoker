/**
 * AI Card Table Extension for SillyTavern - Main Entry Point
 * @version 8.0.0
 * This script now uses ES6 modules, mirroring the phone simulator's architecture.
 */
'use strict';

import { AIGame_UI } from './modules/ui.js';
import { AIGame_DataHandler } from './modules/dataHandler.js';
import { AIGame_State } from './modules/state.js';
import { AIGame_Events } from './modules/events.js';
import { Logger } from './modules/logger.js';

// --- Top-level module scope variables ---
const parentWin = window.parent;
let SillyTavern, TavernHelper, toastr, jQuery, SillyTavernContext;
let mainProcessorTimeout;

/**
 * Checks if all required SillyTavern APIs are available and assigns them.
 * @returns {boolean} True if all APIs are ready.
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
        // Fetch the full message content using the ID
        const messages = TavernHelper.getChatMessages(msgId);
        if (messages && messages.length > 0) {
            AIGame_DataHandler.mainProcessor(messages[0].message);
        }
    }, 250);
};

/**
 * The main initialization function for the extension.
 */
async function mainInitialize() {
    Logger.log('正在初始化 AI 卡牌桌面...');
    
    const dependencies = {
        st: SillyTavern,
        st_context: SillyTavernContext,
        th: TavernHelper,
        toastr: toastr,
        jq: jQuery,
        win: parentWin
    };
    
    // Initialize modules, injecting dependencies
    AIGame_State.init(parentWin);
    AIGame_DataHandler.init(dependencies, AIGame_UI);
    AIGame_UI.init(dependencies, AIGame_DataHandler);
    AIGame_Events.init(dependencies, AIGame_DataHandler, AIGame_UI);
    
    // Asynchronously initialize the UI by fetching and injecting the panel.
    const uiInitialized = await AIGame_UI.initializeUI();
    if (!uiInitialized) {
        Logger.error("UI 初始化失败，扩展无法启动。");
        return;
    }

    // Bind global SillyTavern events now that the UI is guaranteed to exist
    const e = SillyTavernContext.eventTypes;
    SillyTavernContext.eventSource.on(e.MESSAGE_EDITED, (id) => debouncedMainProcessor(id));
    SillyTavernContext.eventSource.on(e.MESSAGE_RECEIVED, (id) => debouncedMainProcessor(id));
    SillyTavernContext.eventSource.on(e.CHAT_CHANGED, () => {
         Logger.log('检测到聊天/角色切换，正在刷新游戏书状态...');
         AIGame_DataHandler.clearLorebookCache();
         AIGame_State.mapTransformInitialized = false;
         if(AIGame_State.isPanelVisible) AIGame_DataHandler.checkGameBookExists();
    });
    
    Logger.success('AI 卡牌桌面扩展已成功初始化。');
}

// Poll until the APIs are ready
const apiReadyInterval = setInterval(() => {
    if (areApisReady()) {
        clearInterval(apiReadyInterval);
        mainInitialize();
    }
}, 100);
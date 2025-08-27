

/**
 * AI Card Table Extension for SillyTavern - Main Entry Point
 * @version 8.3.0
 * This script now uses ES6 modules, mirroring the phone simulator's architecture.
 */
'use strict';

import { AIGame_UI } from './modules/ui.js';
import { AIGame_DataHandler } from './modules/dataHandler.js';
import { AIGame_State } from './modules/state.js';
import { AIGame_Events } from './modules/events.js';
import { Logger } from './modules/logger.js';
import { AudioManager } from './modules/audioManager.js';

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
        Logger.log(`[调试] Debounced processor 正在为消息 ID: ${msgId} 运行。`);
        // Fetch the full message content using the ID
        const messages = TavernHelper.getChatMessages(msgId);
        if (messages && messages.length > 0) {
            Logger.log(`[调试] 已获取消息内容，长度: ${messages[0].message.length}`);
            AIGame_DataHandler.mainProcessor(messages[0].message);
        } else {
            Logger.warn(`[调试] 无法为 ID: ${msgId} 获取消息内容。`);
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
    
    // Initialize modules, injecting dependencies. Logger must be first.
    Logger.init(dependencies);
    Logger.log('正在初始化 AI 卡牌桌面...');

    AIGame_State.init(parentWin);
    AudioManager.init(dependencies); // Initialize AudioManager
    AIGame_DataHandler.init(dependencies, AIGame_UI);
    AIGame_UI.init(dependencies, AIGame_DataHandler);
    AIGame_Events.init(dependencies, AIGame_DataHandler, AIGame_UI);
    
    const uiInitialized = await AIGame_UI.initializeUI();
    if (!uiInitialized) {
        Logger.error("UI 初始化失败，扩展无法启动。");
        return;
    }

    // Bind global SillyTavern events
    const e = SillyTavernContext.eventTypes;
    SillyTavernContext.eventSource.on(e.MESSAGE_EDITED, (id) => debouncedMainProcessor(id));
    SillyTavernContext.eventSource.on(e.MESSAGE_RECEIVED, (id) => debouncedMainProcessor(id));

    // This robustly handles character switches.
    SillyTavernContext.eventSource.on(e.CHAT_CHANGED, () => {
        Logger.log(`CHAT_CHANGED 事件触发。当前角色: ${SillyTavernContext.name2}`);
        Logger.log('正在重置插件状态...');
        
        // Reset all relevant state because the character context has changed.
        AIGame_DataHandler.clearLorebookCache(); 
        AIGame_State.hasGameBook = false; 
        AIGame_State.runInProgress = false; // This must be re-evaluated
        AIGame_State.mapTransformInitialized = false;

        // If the panel is open during the chat change, we need to immediately
        // re-evaluate the state for the new character.
        if (AIGame_State.isPanelVisible) {
            Logger.log('面板在切换时已打开，立即为新角色运行世界书检查。');
            AIGame_DataHandler.checkGameBookExists(); // This function will fetch data and re-render.
        } else {
            // If panel is closed, we don't need to do anything else.
            // The check will happen when the user opens it next time.
            Logger.log('面板在切换时关闭。状态已重置，检查将在下次打开面板时进行。');
        }
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
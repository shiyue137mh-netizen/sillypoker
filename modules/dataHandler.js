/**
 * AI Card Table Extension - Data Handler & Orchestrator (ES6 Module)
 * @description Manages all interactions with SillyTavern's world book and orchestrates command processing.
 */
import { AIGame_Config } from '../config.js';
import { AIGame_State } from './state.js';
import { Logger } from './logger.js';
import { AIGame_CommandParser } from './commandParser.js';
import { generateMapData } from './mapGenerator.js';

// Import the new specialized handlers
import { AIGame_GameHandler } from './gameHandler.js';
import { AIGame_EntityHandler } from './entityHandler.js';
import { AIGame_MapHandler } from './mapHandler.js';
import { AIGame_ItemHandler } from './itemHandler.js';


let SillyTavern_Context_API, TavernHelper_API, toastr_API, UI, parentWin;

// Sub-handler instances
let GameHandler, EntityHandler, MapHandler, ItemHandler;

// Cache for the character-specific lorebook name
let currentCharacterLorebookName = null;
let currentCharacterName = null;

const DIFFICULTY_SETTINGS = {
    baby:   { health: 5, max_health: 5, chips: 2000, name: '宝宝' },
    easy:   { health: 4, max_health: 4, chips: 1500, name: '简单' },
    normal: { health: 3, max_health: 3, chips: 1000, name: '普通' },
    hard:   { health: 2, max_health: 2, chips: 500,  name: '困难' },
    hell:   { health: 1, max_health: 1, chips: 100,  name: '地狱' }
};

const KEY_TO_STATE_MAP = {
    'sp_enemy_data': 'enemyData',
    'sp_player_cards': 'playerCards',
    'sp_player_data': 'playerData',
    'sp_map_data': 'mapData',
    'sp_game_state': 'currentGameState',
    'sp_private_data': 'privateGameData',
};


// This is the CORE of the bugfix for state persistence.
async function getOrCreateGameLorebook() {
    const characterName = SillyTavern_Context_API.name2;
    if (currentCharacterName === characterName && currentCharacterLorebookName) {
        return currentCharacterLorebookName;
    }

    Logger.log(`[getOrCreate] Resolving world book for character: "${characterName}"`);
    currentCharacterName = characterName;
    const lorebookName = `${AIGame_Config.LOREBOOK_PREFIX}${characterName}`;

    try {
        const allLorebooks = TavernHelper_API.getWorldbookNames();

        if (!allLorebooks.includes(lorebookName)) {
            Logger.log(`[getOrCreate] World book "${lorebookName}" not found. Creating it for the first time...`);
            const created = await TavernHelper_API.createOrReplaceWorldbook(lorebookName, AIGame_Config.INITIAL_LOREBOOK_ENTRIES);
            if (created) {
                Logger.success(`[getOrCreate] World book "${lorebookName}" created successfully.`);
            } else {
                Logger.warn(`[getOrCreate] createOrReplaceWorldbook returned false, even though the book was not found initially.`);
            }
        } else {
             Logger.log(`[getOrCreate] World book "${lorebookName}" already exists. Proceeding with existing data.`);
        }
        
        // Always ensure the book is bound to the character. This is a safe, idempotent check.
        const charLorebooks = await TavernHelper_API.getCharWorldbookNames('current');
        if (charLorebooks && !charLorebooks.additional.includes(lorebookName)) {
            const updatedAdditional = [...charLorebooks.additional, lorebookName];
            await TavernHelper_API.rebindCharWorldbooks('current', {
                primary: charLorebooks.primary,
                additional: updatedAdditional
            });
            Logger.log(`[getOrCreate] Ensured world book "${lorebookName}" is bound to the current character.`);
        }
        
        currentCharacterLorebookName = lorebookName;
        return lorebookName;
    } catch (err) {
        Logger.error(`[getOrCreate] CRITICAL FAILURE while resolving world book "${lorebookName}"`, err);
        toastr_API.error(`Failed to initialize game data for ${characterName}. Check console for details.`);
        return null;
    }
}

async function updateWorldbook(entryName, updaterFn) {
    const lorebookName = await getOrCreateGameLorebook();
    if (!lorebookName) {
        Logger.error(`Cannot update entry "${entryName}": world book not available.`);
        return;
    }
    await TavernHelper_API.updateWorldbookWith(lorebookName, (entries) => {
        const entryIndex = entries.findIndex(e => e.name === entryName);
        if (entryIndex === -1) {
            Logger.error(`Entry "${entryName}" not found in lorebook "${lorebookName}".`);
            return entries;
        }
        let content;
        try {
            content = JSON.parse(entries[entryIndex].content || '{}');
        } catch (e) {
            Logger.warn(`Failed to parse JSON for entry "${entryName}", using empty object.`, e);
            content = {};
        }
        const newContent = updaterFn(content);
        entries[entryIndex].content = JSON.stringify(newContent, null, 2);
        return entries;
    });
}

async function fetchAllGameData() {
    const lorebookName = await getOrCreateGameLorebook();
    if (!lorebookName) return;
    try {
        const entries = await TavernHelper_API.getWorldbook(lorebookName);
        let runInProgress = false;
        for (const key of AIGame_Config.LOREBOOK_ENTRY_KEYS) {
            const stateKey = KEY_TO_STATE_MAP[key];
            if (!stateKey) continue; 

            const entry = entries.find(e => e.name === key);
            if (entry && entry.content) {
                try {
                    const data = JSON.parse(entry.content);
                    AIGame_State[stateKey] = data;
                    if (key === 'sp_map_data' && data && data.nodes && data.nodes.length > 0) {
                        runInProgress = true;
                    }
                } catch { AIGame_State[stateKey] = {}; }
            } else { AIGame_State[stateKey] = {}; }
        }
        AIGame_State.runInProgress = runInProgress;
    } catch (e) {
        Logger.error("Failed to fetch all game data:", e);
    }
    UI.renderPanelContent();
}

async function mainProcessor(text) {
    Logger.log('--- [mainProcessor START] ---');
    const commands = AIGame_CommandParser.parseCommands(text);
    if (commands.length === 0) {
        Logger.log('--- [mainProcessor END] ---');
        return;
    }
    Logger.success(`Parsed ${commands.length} commands.`);
    for (const command of commands) {
        try {
            switch (command.category) {
                case 'Game':
                case 'Action':
                    await GameHandler.handleCommand(command);
                    break;
                case 'Event':
                    await EntityHandler.handleCommand(command);
                    break;
                case 'Item':
                    await ItemHandler.handleCommand(command);
                    break;
                default:
                    Logger.warn(`Unknown command category: "${command.category}"`);
            }
        } catch (error) {
            Logger.error(`Error processing command:`, { command, error });
        }
    }
    Logger.log('--- [mainProcessor END] ---');
}

export const AIGame_DataHandler = {
    init: function(deps, uiHandler) {
        SillyTavern_Context_API = deps.st_context;
        TavernHelper_API = deps.th;
        toastr_API = deps.toastr;
        UI = uiHandler;
        parentWin = deps.win;

        const handlerContext = {
            updateWorldbook,
            fetchAllGameData,
            toastr_API,
            TavernHelper_API,
            SillyTavern_Context_API,
            getOrCreateGameLorebook,
            UI,
            parentWin,
        };
        
        GameHandler = AIGame_GameHandler;
        EntityHandler = AIGame_EntityHandler;
        MapHandler = AIGame_MapHandler;
        ItemHandler = AIGame_ItemHandler;

        GameHandler.init(handlerContext);
        EntityHandler.init(handlerContext);
        MapHandler.init(handlerContext);
        ItemHandler.init(handlerContext);
    },

    mainProcessor,
    fetchAllGameData,
    
    clearLorebookCache() {
        currentCharacterLorebookName = null;
        currentCharacterName = null;
    },

    getGameLorebookName: () => getOrCreateGameLorebook(),
    
    async checkGameBookExists() {
        Logger.log('[checkGameBookExists] Starting world book check...');
        const lorebookName = await getOrCreateGameLorebook();
        if (lorebookName) {
            AIGame_State.hasGameBook = true;
            Logger.success(`[checkGameBookExists] World book is ready. Fetching game data...`);
            await fetchAllGameData();
        } else {
            AIGame_State.hasGameBook = false;
            Logger.error("[checkGameBookExists] World book check failed.");
            UI.renderPanelContent();
        }
    },
    
    async createGameBookEntries() {
        await getOrCreateGameLorebook();
        await this.checkGameBookExists();
    },

    async startNewRun(difficulty) {
        Logger.log(`Starting new run with difficulty: ${difficulty}`);
        const settings = DIFFICULTY_SETTINGS[difficulty];
        if (!settings) {
            Logger.error(`Invalid difficulty selected: ${difficulty}`);
            return;
        }
        await updateWorldbook('sp_player_data', data => ({
            ...data,
            health: settings.health,
            max_health: settings.max_health,
            chips: settings.chips,
            inventory: [],
            status_effects: []
        }));
        await updateWorldbook('sp_map_data', () => generateMapData(0));
        
        toastr_API.success(`新的挑战已开始！难度：${settings.name}`);
        AIGame_State.currentActiveTab = 'map';
        await fetchAllGameData();
    },

    async resetAllGameData() {
        Logger.log('Resetting all game data for new run...');
        AIGame_State.mapData = null;
        AIGame_State.runInProgress = false;
        AIGame_State.mapTransformInitialized = false;
        AIGame_State.currentActiveTab = 'map';
        await updateWorldbook('sp_player_data', () => ({}));
        await updateWorldbook('sp_map_data', () => ({}));
        await updateWorldbook('sp_enemy_data', () => ({}));
        await updateWorldbook('sp_game_state', () => ({}));
        await updateWorldbook('sp_player_cards', () => ({ "current_hand": [] }));
        await updateWorldbook('sp_private_data', () => ({}));
        
        toastr_API.info("挑战已重置。");
        await fetchAllGameData();
    },
    
    async advanceToNextFloor() {
        const currentLayer = AIGame_State.mapData?.mapLayer ?? 0;
        const nextLayer = currentLayer + 1;
        Logger.log(`Advancing to next floor: ${nextLayer}`);

        const newMap = generateMapData(nextLayer);
        await updateWorldbook('sp_map_data', () => newMap);

        const prompt = `(系统提示：{{user}}已前往下一层。)`;
        await TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(prompt)}`);

        toastr_API.success(`已成功前往第 ${nextLayer + 1} 层！`);
        AIGame_State.selectedMapNodeId = null;
        AIGame_State.mapTransformInitialized = false;
        await fetchAllGameData();
    },
    
    // Delegate to sub-handlers
    saveMapData: () => MapHandler.saveMapData(),
    travelToNode: (nodeId, nodeType) => MapHandler.travelToNode(nodeId, nodeType),
    useItem: (itemIndex) => ItemHandler.useItem(itemIndex),
    stagePlayerAction: (action) => GameHandler.stagePlayerAction(action),
    commitStagedActions: () => GameHandler.commitStagedActions(),
    attemptEscape: () => GameHandler.attemptEscape(),
};
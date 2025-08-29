/**
 * AI Card Table Extension - Data Handler & Orchestrator (ES6 Module)
 * @description Manages all interactions with SillyTavern's world book and orchestrates command processing.
 */
import { AIGame_Config } from '../config.js';
import { AIGame_State } from './state.js';
import { Logger } from './logger.js';
import { AIGame_CommandParser } from './commandParser.js';
import { generateMapData } from './mapGenerator.js';
import { createDeck, shuffle } from './utils.js';

// Import the new specialized handlers
import { AIGame_GameHandler } from './gameHandler.js';
import { AIGame_EntityHandler } from './entityHandler.js';
import { AIGame_MapHandler } from './mapHandler.js';
import { AIGame_ItemHandler } from './itemHandler.js';


let SillyTavern_API, TavernHelper_API, toastr_API, UI, parentWin, AudioManager_API;

// Sub-handler instances
let GameHandler, EntityHandler, MapHandler, ItemHandler;

// Cache for the character-specific lorebook name
let currentCharacterLorebookName = null;
let currentCharacterNameCache = null;

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


/**
 * Replaces all polling/waiting mechanisms with a direct-read approach, mirroring
 * the successful and robust strategy of the phone simulator plugin. It trusts
 * SillyTavern's event flow (CHAT_CHANGED) to provide the correct context eventually,
 * avoiding timeout failures during initial app load.
 */
async function getOrCreateGameLorebook() {
    // CRITICAL FIX: Always get the fresh context from the main API.
    // Do not use a cached context object from initialization.
    const context = SillyTavern_API.getContext();
    const charName = context?.name2;

    if (!charName) {
        // This is a fatal error, but should be rare.
        const errorMsg = "[getOrCreate] Fatal: Could not get character name, context is null or name2 is missing.";
        Logger.error(errorMsg);
        toastr_API.error('无法确定当前角色，请刷新或重试。');
        return null;
    }
    
    // **CRITICAL FIX**: Accept "SillyTavern System" initially. The system relies on
    // the CHAT_CHANGED event to clear the cache and self-correct to the *real*
    // character name once the chat is fully loaded. Blocking here is what causes timeouts.
    if (charName === 'SillyTavern System') {
        Logger.warn(`[getOrCreate] Context is not fully ready. Proceeding with temporary name: "${charName}". Awaiting CHAT_CHANGED to finalize.`);
    }

    // 2. Use a cache to avoid re-checking the same character repeatedly.
    // This cache is cleared by `clearLorebookCache` on CHAT_CHANGED event.
    if (currentCharacterNameCache === charName && currentCharacterLorebookName) {
        return currentCharacterLorebookName;
    }
    
    Logger.log(`[getOrCreate] Resolving world book for character: "${charName}"`);
    currentCharacterNameCache = charName;
    const lorebookName = `${AIGame_Config.LOREBOOK_PREFIX}${charName}`;
    
    // 3. Check if the book exists. If not, create it.
    const allLorebooks = await TavernHelper_API.getWorldbookNames();
    if (!allLorebooks.includes(lorebookName)) {
        Logger.log(`[getOrCreate] World book "${lorebookName}" not found. Creating...`);
        // Using createOrReplaceWorldbook is safer.
        await TavernHelper_API.createOrReplaceWorldbook(lorebookName, AIGame_Config.INITIAL_LOREBOOK_ENTRIES);
        Logger.success(`[getOrCreate] World book "${lorebookName}" created successfully.`);
    } else {
         Logger.log(`[getOrCreate] World book "${lorebookName}" already exists.`);
    }
    
    // 4. Check if the book is bound to the character. If not, bind it.
    // This is an important step to ensure the AI sees the data.
    const charLorebooks = await TavernHelper_API.getCharWorldbookNames('current');
    if (charLorebooks && !charLorebooks.additional.includes(lorebookName)) {
        // Safely add our book to the list of additional books without removing others.
        const updatedAdditional = [...charLorebooks.additional, lorebookName];
        await TavernHelper_API.rebindCharWorldbooks('current', {
            primary: charLorebooks.primary,
            additional: updatedAdditional
        });
        Logger.log(`[getOrCreate] Ensured world book "${lorebookName}" is bound to the current character.`);
    }
    
    // 5. Cache the result and return.
    currentCharacterLorebookName = lorebookName;
    return lorebookName;
}


async function updateWorldbook(entryName, updaterFn) {
    const lorebookName = await getOrCreateGameLorebook();
    if (!lorebookName) {
        Logger.error(`无法更新条目 "${entryName}": 世界书不可用。`);
        return;
    }

    await TavernHelper_API.updateWorldbookWith(lorebookName, (entries) => {
        const entryIndex = entries.findIndex(e => e.name === entryName);
        if (entryIndex === -1) {
            Logger.error(`在世界书 "${lorebookName}" 中未找到条目 "${entryName}"。`);
            return entries; // Return original array on error
        }
        
        // Find the original template to ensure fields like 'comment' are preserved.
        const templateEntry = AIGame_Config.INITIAL_LOREBOOK_ENTRIES.find(e => e.name === entryName);
        const templateContent = templateEntry ? JSON.parse(templateEntry.content || '{}') : {};

        const originalEntry = entries[entryIndex];
        let currentContent;
        try {
            currentContent = JSON.parse(originalEntry.content || '{}');
        } catch (e) {
            Logger.warn(`为条目 "${entryName}" 解析当前JSON失败，将使用空对象。`, e, `内容为: "${originalEntry.content}"`);
            currentContent = {};
        }

        // Merge template with current content to ensure no fields are lost.
        const mergedContent = { ...templateContent, ...currentContent };
        
        const newContent = updaterFn(mergedContent);

        // Update only the 'content' field of the entry.
        entries[entryIndex].content = JSON.stringify(newContent, null, 2);

        return entries;
    });
}


async function fetchAllGameData() {
    const lorebookName = await getOrCreateGameLorebook();
    if (!lorebookName || lorebookName.endsWith('SillyTavern System')) {
        // Do not fetch data if we are using the placeholder book. Wait for self-correction.
        return;
    }
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
        Logger.error("获取所有游戏数据失败:", e);
    }
    
    // FIX: Only render if the panel is actually visible to the user.
    // This prevents animations (like dealing cards) from running on hidden elements.
    if (AIGame_State.isPanelVisible) {
        UI.renderPanelContent();
    }
}

async function mainProcessor(text) {
    Logger.log('--- [mainProcessor START] ---');
    const commands = AIGame_CommandParser.parseCommands(text);
    if (commands.length === 0) {
        Logger.log('--- [mainProcessor END] ---');
        return;
    }
    Logger.success(`已解析 ${commands.length} 条指令。`);
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
                    Logger.warn(`未知指令类别: "${command.category}"`);
            }
        } catch (error) {
            Logger.error(`处理指令时出错:`, { command, error });
        }
    }
    Logger.log('--- [mainProcessor END] ---');
}

async function deleteCardFromUI({ location, enemyName, cardIndex }) {
    Logger.log(`管理员请求从UI删除卡牌:`, { location, enemyName, cardIndex });

    let fileToUpdate;
    let updaterFn;
    let cardIdentifier = '';

    switch (location) {
        case 'player_hand':
            fileToUpdate = 'sp_player_cards';
            updaterFn = data => {
                if (data?.current_hand?.[cardIndex]) {
                    const removed = data.current_hand.splice(cardIndex, 1);
                    cardIdentifier = `[${removed[0].suit}${removed[0].rank}] 来自玩家手牌`;
                }
                return data;
            };
            break;
        
        case 'enemy_hand':
            if (!enemyName) {
                Logger.error('没有敌人名称，无法删除敌人卡牌。');
                toastr_API.error("删除失败：未指定敌人名称。");
                return;
            }
            fileToUpdate = 'sp_enemy_data';
            updaterFn = data => {
                const enemy = data.enemies?.find(e => e.name === enemyName);
                if (enemy?.hand?.[cardIndex]) {
                    const removed = enemy.hand.splice(cardIndex, 1);
                    cardIdentifier = `[${removed[0].suit}${removed[0].rank}] 来自 ${enemyName} 的手牌`;
                }
                return data;
            };
            break;

        case 'board':
            fileToUpdate = 'sp_game_state';
            updaterFn = data => {
                if (data?.board_cards?.[cardIndex]) {
                    const removed = data.board_cards.splice(cardIndex, 1);
                    cardIdentifier = `[${removed[0].suit}${removed[0].rank}] 来自桌面`;
                }
                return data;
            };
            break;

        default:
            Logger.error(`未知的卡牌删除位置: ${location}`);
            toastr_API.error(`删除失败：未知的位置 "${location}"。`);
            return;
    }

    await updateWorldbook(fileToUpdate, updaterFn);

    if (cardIdentifier) {
        Logger.success(`卡牌已从状态中移除: ${cardIdentifier}`);
        toastr_API.success(`卡牌 ${cardIdentifier} 已被删除。`);
    } else {
        Logger.warn(`无法在指定位置找到要删除的卡牌:`, { location, enemyName, cardIndex });
        toastr_API.error("无法删除卡牌，请重试。");
    }

    await fetchAllGameData();
}

async function surrender() {
    Logger.log('玩家放弃...');
    const prompt = `(系统提示：{{user}}决定放弃当前的挑战。)`;
    toastr_API.info("你选择了放弃...等待对手的回应。");
    await TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(prompt)}`);
    SillyTavern_API.getContext().generate();
}

async function begForMercy() {
    Logger.log('玩家求饶...');
    const prompt = `(系统提示：{{user}}向对手求饶，希望能保留一些颜面。)`;
    toastr_API.info("你开始求饶...你的命运掌握在对手手中。");
    await TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(prompt)}`);
    SillyTavern_API.getContext().generate();
}

async function processPendingDealActions() {
    const actions = AIGame_State.currentGameState?.pending_deal_actions;
    if (!actions || actions.length === 0) return;

    toastr_API.info("荷官正在发牌...", "发牌", { timeOut: 1500, closeButton: false, progressBar: false, positionClass: "toast-top-left", preventDuplicates: true });
    Logger.log('正在处理待处理的发牌动作...');

    const totalCardsNeeded = actions.reduce((sum, action) => sum + (action.count || 0), 0);
    if (totalCardsNeeded === 0) return;

    AudioManager_API.playStaggered('deal', totalCardsNeeded, 120);

    let drawnCards = [];
    let deckSizeBeforeDeal = 0; 

    await updateWorldbook('sp_private_data', (privateData) => {
        let deck = privateData.deck || [];
        deckSizeBeforeDeal = deck.length;

        if (deck.length < totalCardsNeeded) {
            Logger.error(`牌堆中的牌不够。需要 ${totalCardsNeeded}, 现有 ${deck.length}。`);
            drawnCards = [];
            return privateData;
        }
        drawnCards = deck.splice(0, totalCardsNeeded);
        privateData.deck = deck;
        return privateData;
    });

    if (drawnCards.length < totalCardsNeeded) {
        toastr_API.error(`牌堆中的牌不够。需要 ${totalCardsNeeded}, 现有 ${deckSizeBeforeDeal}。`, "发牌失败");
        return;
    }

    const distribution = { player: [], board: [], enemies: {} };
    (AIGame_State.enemyData?.enemies || []).forEach(enemy => {
        distribution.enemies[enemy.name] = [];
    });

    for (const action of actions) {
        if (!action.count || action.count <= 0) continue;
        const cardsToDistribute = drawnCards.splice(0, action.count);
        cardsToDistribute.forEach(card => { card.visibility = action.visibility || 'owner'; });

        if (action.target === 'player') distribution.player.push(...cardsToDistribute);
        else if (action.target === 'enemy' && action.name && distribution.enemies[action.name]) distribution.enemies[action.name].push(...cardsToDistribute);
        else if (action.target === 'board') distribution.board.push(...cardsToDistribute);
    }

    if (distribution.player.length > 0) await updateWorldbook('sp_player_cards', data => ({ ...data, current_hand: [...(data.current_hand || []), ...distribution.player] }));
    if (Object.values(distribution.enemies).some(c => c.length > 0)) {
        await updateWorldbook('sp_enemy_data', data => {
            if (!data.enemies) data.enemies = [];
            data.enemies.forEach(enemy => {
                if (distribution.enemies[enemy.name]?.length > 0) {
                    enemy.hand = [...(enemy.hand || []), ...distribution.enemies[enemy.name]];
                }
            });
            return data;
        });
    }
    if (distribution.board.length > 0) {
        await updateWorldbook('sp_game_state', data => ({ 
            ...data, 
            board_cards: [...(data.board_cards || []), ...distribution.board],
            last_bet_amount: 0
        }));
    }

    // Clear the pending actions
    await updateWorldbook('sp_game_state', data => {
        delete data.pending_deal_actions;
        return data;
    });
    
    // Set flag to trigger animation on next render
    AIGame_State.isDealing = true;

    // Finally, refresh the state and UI
    await fetchAllGameData();
}


export const AIGame_DataHandler = {
    init: function(deps, uiHandler, audioManager) {
        SillyTavern_API = deps.st; // Store the main SillyTavern API object
        TavernHelper_API = deps.th;
        toastr_API = deps.toastr;
        UI = uiHandler;
        parentWin = deps.win;
        AudioManager_API = audioManager;

        const handlerContext = {
            updateWorldbook,
            fetchAllGameData,
            toastr_API,
            TavernHelper_API,
            SillyTavern_API, // Pass the main API object, not the stale context
            getOrCreateGameLorebook,
            UI,
            parentWin,
            AudioManager_API,
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
    deleteCardFromUI,
    surrender,
    begForMercy,
    processPendingDealActions,
    
    clearLorebookCache() {
        currentCharacterLorebookName = null;
        currentCharacterNameCache = null;
    },

    getGameLorebookName: () => getOrCreateGameLorebook(),
    
    async checkGameBookExists() {
        Logger.log('[checkGameBookExists] 正在开始世界书检查...');
        const lorebookName = await getOrCreateGameLorebook();
        // The key change: We no longer treat "SillyTavern System" as a fatal error.
        // We only proceed to fetch data if we have a *real* character book.
        if (lorebookName && !lorebookName.endsWith('SillyTavern System')) {
            AIGame_State.hasGameBook = true;
            Logger.success(`[checkGameBookExists] 世界书已准备好。正在获取游戏数据...`);
            await fetchAllGameData();
        } else {
            AIGame_State.hasGameBook = false;
            Logger.warn("[checkGameBookExists] 仍在等待有效的角色上下文，或世界书不可用。");
            UI.renderPanelContent(); // This will show the "Create/Fix" button or loading state
        }
    },
    
    async createGameBookEntries() {
        await getOrCreateGameLorebook();
        await this.checkGameBookExists();
    },

    async startNewRun(difficulty) {
        Logger.log(`正在以难度开始新一轮游戏: ${difficulty}`);
        const settings = DIFFICULTY_SETTINGS[difficulty];
        if (!settings) {
            Logger.error(`选择了无效的难度: ${difficulty}`);
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
        
        AudioManager_API.startBGMPlaylist(); // Start BGM when run begins
        
        await fetchAllGameData();
    },

    async resetAllGameData() {
        Logger.log('正在为新一轮游戏重置所有游戏数据...');
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
        AudioManager_API.play('elevator_ding');
        const currentLayer = AIGame_State.mapData?.mapLayer ?? 0;
        const nextLayer = currentLayer + 1;
        Logger.log(`正在前往下一层: ${nextLayer}`);

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
    findSecretRoom: () => MapHandler.findSecretRoom(),
    useItem: (itemIndex) => ItemHandler.useItem(itemIndex),
    stagePlayerAction: (action) => GameHandler.stagePlayerAction(action),
    undoStagedAction: (actionId) => GameHandler.undoStagedAction(actionId),
    undoAllStagedActions: () => GameHandler.undoAllStagedActions(),
    commitStagedActions: () => GameHandler.commitStagedActions(),
    playerGoesAllIn: () => GameHandler.playerGoesAllIn(),
    attemptEscape: () => GameHandler.attemptEscape(),
};
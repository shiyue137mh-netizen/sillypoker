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


let SillyTavern_API, TavernHelper_API, toastr_API, UI, parentWin, AudioManager_API, History_API;

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

        // Store previous health for animation triggers
        AIGame_State.previousPlayerData = { ...AIGame_State.playerData };

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
    } else {
        // If panel is closed, still update the toggle button's state
        UI.updateToggleButtonState();
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
                case 'Map':
                    await MapHandler.handleCommand(command);
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
    if (totalCardsNeeded === 0) {
        await updateWorldbook('sp_game_state', s => { delete s.pending_deal_actions; return s; });
        await fetchAllGameData();
        return;
    }

    // FIX: Play sound effect before animating
    AudioManager_API.playStaggered('deal', totalCardsNeeded, 80);

    // RESTORED: The animation call was missing. This is the crucial fix.
    await UI.animateDeal(actions);

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
        else if (action.target === 'enemy' && action.name) {
            if (distribution.enemies[action.name]) {
                distribution.enemies[action.name].push(...cardsToDistribute);
            } else {
                Logger.warn(`发牌目标敌人 "${action.name}" 不存在。`);
            }
        }
        else if (action.target === 'board') distribution.board.push(...cardsToDistribute);
    }
    
    if (distribution.player.length > 0) {
        await updateWorldbook('sp_player_cards', data => {
            data.current_hand.push(...distribution.player);
            return data;
        });
    }
    if (Object.values(distribution.enemies).some(arr => arr.length > 0)) {
        await updateWorldbook('sp_enemy_data', data => {
            Object.keys(distribution.enemies).forEach(name => {
                const enemy = data.enemies.find(e => e.name === name);
                if (enemy) {
                    enemy.hand.push(...distribution.enemies[name]);
                }
            });
            return data;
        });
    }
    if (distribution.board.length > 0) {
        await updateWorldbook('sp_game_state', data => {
            data.board_cards.push(...distribution.board);
            return data;
        });
    }

    await updateWorldbook('sp_game_state', s => {
        delete s.pending_deal_actions;
        return s;
    });

    await fetchAllGameData();
    Logger.success('发牌动作处理完毕。');
}

/**
 * Stages a player action for later commit.
 * @param {object} action - The action object, e.g., { type: 'bet', amount: 100 }
 */
async function stagePlayerAction(action) {
    const playerChips = AIGame_State.playerData.chips;
    let soundToPlay = 'click1';

    // Validation
    if (action.type === 'bet' || action.type === 'call') {
        if (action.amount > playerChips) {
            toastr_API.warning('你的筹码不足！');
            return;
        }
        soundToPlay = 'chip';
    }

    // Add a unique ID for removal
    action.id = Date.now() + Math.random();
    AIGame_State.stagedPlayerActions.push(action);

    await AudioManager_API.play(soundToPlay);
    UI.renderActiveTabContent(); // Re-render to show staged action and update UI
}

async function undoStagedAction(actionId) {
    const actionIndex = AIGame_State.stagedPlayerActions.findIndex(a => a.id === actionId);
    if (actionIndex > -1) {
        AIGame_State.stagedPlayerActions.splice(actionIndex, 1);
        await AudioManager_API.play('click2');
        UI.renderActiveTabContent();
    }
}

async function undoAllStagedActions() {
    if (AIGame_State.stagedPlayerActions.length > 0) {
        AIGame_State.stagedPlayerActions = [];
        await AudioManager_API.play('click2');
        UI.renderActiveTabContent();
    }
}

/**
 * Commits all staged player actions, updates world state, and sends a prompt to the AI.
 */
async function commitStagedActions() {
    if (AIGame_State.stagedPlayerActions.length === 0) {
        toastr_API.info('你还没有执行任何操作。');
        return;
    }

    let promptLines = [];
    const actionsToCommit = [...AIGame_State.stagedPlayerActions];
    AIGame_State.stagedPlayerActions = [];

    // First, apply all state changes from the actions
    for (const action of actionsToCommit) {
        // Here we would apply the state changes for real
        if (action.type === 'bet') {
            await GameHandler.handleCommand({ category: 'Action', type: 'Bet', data: { player_name: '{{user}}', amount: action.amount } });
            promptLines.push(`- 下注 ${action.amount} 筹码。`);
        } else if (action.type === 'call') {
            await GameHandler.handleCommand({ category: 'Action', type: 'Call', data: { player_name: '{{user}}', amount: action.amount } });
            promptLines.push(`- 跟注 ${action.amount} 筹码。`);
        } else if (action.type === 'check') {
            promptLines.push('- 过牌。');
        } else if (action.type === 'fold') {
            promptLines.push('- 弃牌。');
        } else if (action.type === 'hit') {
            promptLines.push('- 要牌。');
        } else if (action.type === 'stand') {
            promptLines.push('- 停牌。');
        } else if (action.type === 'emote') {
            promptLines.push(`- 说了台词: "${action.text}"`);
        } else if (action.type === 'custom') {
            let actionText = `执行了自定义动作: "${action.text}"`;
            if (action.cards && action.cards.length > 0) {
                actionText += ` 并选择了卡牌 [${action.cards.map(c => c.suit+c.rank).join(', ')}]`;
            }
            promptLines.push(`- ${actionText}。`);
        } else if (action.type === 'play_cards') {
            let actionText = `打出了卡牌 [${action.cards.map(c => c.suit+c.rank).join(', ')}]`;
            promptLines.push(`- ${actionText}。`);
        }
        // Add more action handlers as needed
    }

    const { currentGameState, enemyData, playerData } = AIGame_State;
    const enemy = enemyData.enemies?.[0]; // Assuming single enemy for now

    const nextTurnIndex = (currentGameState.players.indexOf(currentGameState.current_turn) + 1) % currentGameState.players.length;
    const nextTurnPlayer = currentGameState.players[nextTurnIndex];
    

    // Construct the context block
    let contextLines = [];
    if(currentGameState) {
        contextLines.push(`game_type: ${currentGameState.game_type}`);
        contextLines.push(`current_turn: ${currentGameState.current_turn}`);
        contextLines.push(`next_turn: ${nextTurnPlayer}`);
        contextLines.push(`pot_amount: ${currentGameState.pot_amount}`);
        contextLines.push(`board_cards: ${currentGameState.board_cards?.map(c => c.suit + c.rank).join(', ') || ''}`);
    }
    if (playerData) {
        contextLines.push(`player_chips: ${playerData.chips}`);
    }
    if (enemy) {
        contextLines.push(`enemy_name: ${enemy.name}`);
        contextLines.push(`enemy_chips: ${enemy.chips}`);
    }

    const contextBlock = `{{newline}}<context>{{newline}}${contextLines.join('{{newline}}')}{{newline}}</context>`;
    const finalPrompt = `(系统提示：{{user}}执行了以下操作：\n${promptLines.join('\n')}\n)${contextBlock}`;

    await TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(finalPrompt)}`);
    SillyTavern_API.getContext().generate();

    await fetchAllGameData();
}

/**
 * Resets all game data and returns the user to the difficulty selection screen.
 */
async function resetAllGameData() {
    Logger.log('重置所有游戏数据...');
    AIGame_State.runInProgress = false;
    AIGame_State.mapData = null;
    AIGame_State.playerData = null;
    AIGame_State.stagedPlayerActions = []; // Clear any pending actions
    
    await updateWorldbook('sp_map_data', () => ({})); // Clear map data
    
    // Use the template from the config to reset player data
    const playerTemplate = JSON.parse(AIGame_Config.INITIAL_LOREBOOK_ENTRIES.find(e => e.name === 'sp_player_data').content);
    await updateWorldbook('sp_player_data', () => playerTemplate);
    
    await updateWorldbook('sp_game_state', () => ({}));
    await updateWorldbook('sp_enemy_data', () => ({ enemies: [] }));

    await fetchAllGameData(); // This will re-render the UI to the difficulty screen
    toastr_API.success("挑战已重置。");
}

async function advanceToNextFloor() {
    Logger.log('Advancing to the next floor...');
    AudioManager_API.play('elevator_ding');
    const newLayer = (AIGame_State.mapData?.mapLayer || 0) + 1;
    const newMap = generateMapData(newLayer);
    
    await updateWorldbook('sp_map_data', () => newMap);
    toastr_API.success(`你已到达赌场第 ${newLayer + 1} 层！`);
    
    AIGame_State.selectedMapNodeId = null; 
    AIGame_State.mapTransformInitialized = false; // Force re-centering on the new map
    await fetchAllGameData();
}

/**
 * Sends a purely narrative message from the player to the AI.
 * @param {string} text The narrative text from the player.
 */
async function sendNarrativeMessage(text) {
    if (!text) return;
    Logger.log(`Sending narrative message: "${text}"`);

    const { currentGameState } = AIGame_State;
    const isPlayerTurn = currentGameState?.current_turn === (await SillyTavern_API.getContext().substituteParamsExtended('{{user}}'));
    
    let finalPrompt;
    if (isPlayerTurn) {
        finalPrompt = `(系统提示：在他们的回合中，{{user}}没有执行任何游戏动作，而是选择说或做：\n\n${text}\n\n现在轮到你了。)`;
    } else {
        finalPrompt = `(系统提示：在你的回合中，{{user}}打断并说或做：\n\n${text}\n\n现在仍然是你的回合，请继续行动。)`;
    }
    
    await TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(finalPrompt)}`);
    SillyTavern_API.getContext().generate();
}


export const AIGame_DataHandler = {
    init: function(deps, uiHandler, audioManager, historyApi) {
        SillyTavern_API = deps.st;
        TavernHelper_API = deps.th;
        toastr_API = deps.toastr;
        UI = uiHandler;
        parentWin = deps.win;
        AudioManager_API = audioManager;
        History_API = historyApi;

        // Initialize sub-handlers
        const handlerContext = {
            SillyTavern_API,
            TavernHelper_API,
            toastr_API,
            UI,
            parentWin,
            AudioManager_API,
            AIGame_History: History_API,
            fetchAllGameData,
            updateWorldbook,
            resetAllGameData
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
    
    checkGameBookExists: async function() {
        const lorebookName = await getOrCreateGameLorebook();
        AIGame_State.hasGameBook = !!lorebookName;
        await fetchAllGameData();
    },

    createGameBookEntries: async function() {
        const lorebookName = await getOrCreateGameLorebook();
        if (lorebookName) {
            toastr_API.success("游戏世界书已成功创建/验证！");
            AIGame_State.hasGameBook = true;
            await fetchAllGameData();
        } else {
            toastr_API.error("创建游戏世界书失败。");
        }
    },

    clearLorebookCache: function() {
        currentCharacterLorebookName = null;
        currentCharacterNameCache = null;
    },

    startNewRun: async function(difficulty) {
        const settings = DIFFICULTY_SETTINGS[difficulty];
        Logger.log(`Starting new run with difficulty: ${difficulty}`);
        UI.flashToggleButton(); // NEW: Flash toggle button on run start
        
        // Reset player data based on difficulty
        await updateWorldbook('sp_player_data', (p) => {
            p.health = settings.health;
            p.max_health = settings.max_health;
            p.chips = settings.chips;
            p.inventory = [];
            p.status_effects = [];
            return p;
        });

        // Generate a new map for layer 0
        const newMap = generateMapData(0);
        await updateWorldbook('sp_map_data', () => newMap);

        // Clear any lingering game/enemy state
        await updateWorldbook('sp_game_state', () => ({}));
        await updateWorldbook('sp_enemy_data', () => ({ enemies: [] }));

        AIGame_State.currentActiveTab = 'map';
        AIGame_State.selectedMapNodeId = null;
        AIGame_State.mapTransformInitialized = false;

        await fetchAllGameData();
    },

    // Functions that don't depend on sub-handlers can be passed directly
    advanceToNextFloor,
    resetAllGameData,
    mainProcessor,
    deleteCardFromUI,
    surrender,
    begForMercy,
    stagePlayerAction,
    undoStagedAction,
    undoAllStagedActions,
    commitStagedActions,
    processPendingDealActions,
    sendNarrativeMessage,

    // WRAPPED functions that depend on initialized sub-handlers
    useItem: async function(itemIndex) {
        return await ItemHandler.useItem(itemIndex);
    },
    attemptEscape: async function() {
        return await GameHandler.attemptEscape();
    },
    playerGoesAllIn: async function() {
        return await GameHandler.playerGoesAllIn();
    },
    
    // MapHandler Pass-throughs (wrapped)
    travelToNode: async function(nodeId, nodeType) {
        return await MapHandler.travelToNode(nodeId, nodeType);
    },
    findSecretRoom: async function() {
        return await MapHandler.findSecretRoom();
    },
    saveMapData: async function() {
        return await MapHandler.saveMapData();
    },
};

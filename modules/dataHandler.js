/**
 * AI Card Table Extension - Data Handler (ES6 Module)
 * @description Manages all interactions with SillyTavern's world book.
 */
import { AIGame_Config } from '../config.js';
import { AIGame_State } from './state.js';
import { Logger } from './logger.js';
import { AIGame_CommandParser } from './commandParser.js';
import { createDeck, shuffle } from './utils.js';
import { generateMapData } from './mapGenerator.js';

let SillyTavern_Context_API, TavernHelper_API, toastr_API, UI;

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

// Helper to update a worldbook entry atomically using the recommended API
async function _updateWorldbook(entryName, updaterFn) {
    const lorebookName = await AIGame_DataHandler.getOrCreateGameLorebook();
    if (!lorebookName) {
        Logger.error(`Cannot update worldbook entry "${entryName}": Lorebook not found.`);
        return;
    }
    try {
        await TavernHelper_API.updateWorldbookWith(lorebookName, (entries) => {
            const entryIndex = entries.findIndex(e => e.name === entryName);
            if (entryIndex === -1) {
                Logger.error(`Entry "${entryName}" not found in lorebook "${lorebookName}". This should not happen.`);
                return entries;
            }
            try {
                const currentData = JSON.parse(entries[entryIndex].content || '{}');
                const newData = updaterFn(currentData);
                entries[entryIndex].content = JSON.stringify(newData, null, 2);
            } catch (jsonError) {
                Logger.error(`Error processing JSON for entry "${entryName}":`, jsonError, `Content was: ${entries[entryIndex].content}`);
            }
            return entries;
        });
    } catch (apiError) {
        Logger.error(`TavernHelper API error while updating "${entryName}":`, apiError);
    }
}


async function _fetchAllGameData() {
    try {
        const lorebookName = await AIGame_DataHandler.getOrCreateGameLorebook();
        if (!lorebookName) return;
        
        const entries = await TavernHelper_API.getWorldbook(lorebookName);
        for (const key of AIGame_Config.LOREBOOK_ENTRY_KEYS) {
            const stateKey = key.replace('sillypoker_', '').replace(/_(\w)/g, (match, p1) => p1.toUpperCase());
            const entry = entries.find(e => e.name === key);
            if (entry && entry.content) {
                try {
                    AIGame_State[stateKey] = JSON.parse(entry.content);
                } catch {
                    AIGame_State[stateKey] = {};
                }
            } else {
                AIGame_State[stateKey] = {};
            }
        }
        
        // Determine if a run is in progress based on map data after fetching
        AIGame_State.runInProgress = !!(AIGame_State.mapData && AIGame_State.mapData.nodes && AIGame_State.mapData.nodes.length > 0);

    } catch (e) {
        Logger.error("Failed to fetch all game data:", e);
    }
    UI.renderPanelContent();
}

async function _handleGameSetupDeck(command) {
    Logger.log("Setting up custom deck...", command.data);
    const customDeck = createDeck(command.data);
    const shuffledDeck = shuffle(customDeck);
    
    await _updateWorldbook('sillypoker_private_game_data', () => ({
        deck: shuffledDeck
    }));

    Logger.success(`Custom deck with ${shuffledDeck.length} cards created and shuffled.`);
}

async function _handleGameStart(command) {
    const { game_type, players, initial_state } = command.data;

    // Defensive programming: If initial_state is missing, log an error but create a fallback to prevent a crash.
    const enemyState = initial_state || {};
    if (!initial_state) {
        Logger.error('Missing "initial_state" in [Game:Start] command. Using a fallback. AI should be prompted to include this.', command.data);
        // Try to find an enemy name from the players list
        const enemyName = players ? players.find(p => p !== '{{user}}' && p !== AIGame_State.playerData.name) : 'Opponent';
        enemyState.name = enemyName;
        enemyState.play_style = "Unknown";
        enemyState.chips = 1000;
    }

    // 1. Update enemy data (always clear hand from previous games)
    enemyState.hand = [];
    await _updateWorldbook('sillypoker_enemy_data', () => enemyState);

    // 2. Update current game state
    await _updateWorldbook('sillypoker_current_game_state', () => ({
        game_type,
        players,
        current_turn: players[0],
        pot_amount: 0,
        board_cards: []
    }));
    
    // 3. Clear player's old hand
    await _updateWorldbook('sillypoker_player_cards', (data) => {
        data.current_hand = [];
        return data;
    });

    // 4. IMPORTANT: Check if a deck was pre-configured. If not, create a default one.
    const lorebookName = await AIGame_DataHandler.getOrCreateGameLorebook();
    const entries = await TavernHelper_API.getWorldbook(lorebookName);
    const privateDataEntry = entries.find(e => e.name === 'sillypoker_private_game_data');
    let privateData = {};
    try { privateData = JSON.parse(privateDataEntry.content); } catch {}

    if (!privateData.deck || privateData.deck.length === 0) {
        Logger.warn("No deck found from [Game:SetupDeck]. Creating a default 52-card deck.");
        await _updateWorldbook('sillypoker_private_game_data', () => ({
            deck: shuffle(createDeck())
        }));
    }


    Logger.success(`Game started: ${game_type}`);
    await _fetchAllGameData();
}


async function _dealCards(actions) {
    const totalCardsNeeded = actions.reduce((sum, action) => sum + (action.count || 0), 0);
    if (totalCardsNeeded === 0) return;

    // Step 1: Atomically draw all necessary cards from the deck first.
    let drawnCards = [];
    await _updateWorldbook('sillypoker_private_game_data', (privateData) => {
        const deck = privateData.deck || [];
        if (deck.length < totalCardsNeeded) {
            Logger.error(`Not enough cards in deck to deal. Need ${totalCardsNeeded}, have ${deck.length}.`);
            drawnCards = []; // Ensure drawnCards is empty on failure
            return privateData;
        }
        drawnCards = deck.splice(0, totalCardsNeeded);
        privateData.deck = deck;
        return privateData;
    });

    if (drawnCards.length < totalCardsNeeded) {
        toastr_API.error("牌堆里的牌不够！");
        return; // Draw failed, so we stop here.
    }

    // Step 2: Prepare card distributions based on actions
    const distribution = { player: [], enemy: [], board: [] };
    for (const action of actions) {
        if (!action.count || action.count <= 0) continue;
        const cardsToDistribute = drawnCards.splice(0, action.count);

        // Assign the visibility property as specified by the AI command.
        cardsToDistribute.forEach(card => {
            card.visibility = action.visibility || 'owner'; // Default to 'owner' if not specified
        });

        if (action.target === 'player') {
            distribution.player.push(...cardsToDistribute);
        } else if (action.target === 'enemy') {
            distribution.enemy.push(...cardsToDistribute);
        } else if (action.target === 'board') {
            distribution.board.push(...cardsToDistribute);
        }
    }
    
    // Step 3: Update respective lorebooks with the dealt cards.
    if (distribution.player.length > 0) {
        await _updateWorldbook('sillypoker_player_cards', data => {
            data.current_hand = [...(data.current_hand || []), ...distribution.player];
            return data;
        });
    }
    if (distribution.enemy.length > 0) {
        await _updateWorldbook('sillypoker_enemy_data', data => {
            data.hand = [...(data.hand || []), ...distribution.enemy];
            return data;
        });
    }
    if (distribution.board.length > 0) {
        await _updateWorldbook('sillypoker_current_game_state', data => {
            data.board_cards = [...(data.board_cards || []), ...distribution.board];
            return data;
        });
    }
    
    await _fetchAllGameData();
}

async function _handleGameFunction(command) {
    const functionData = command.data;
    if (!functionData || !functionData.type) {
        Logger.error('Invalid or incomplete game function data received:', functionData);
        return;
    }

    const functionType = functionData.type;

    if (functionType === '发牌') {
        const { actions } = command.data;
        if (actions && Array.isArray(actions)) {
            await _dealCards(actions);
        } else {
            Logger.error('Invalid 发牌 command data, missing "actions" array:', command.data);
        }
    } else {
        Logger.warn(`Unknown game function type: "${functionType}"`);
    }
}

async function _handleGameUpdateState(command) {
    await _updateWorldbook('sillypoker_current_game_state', (currentState) => {
        // Merge the new state data into the current state
        return { ...currentState, ...command.data };
    });
    await _fetchAllGameData();
}

async function _handleGameEnd(command) {
    const { result, reason } = command.data;
    let playerDied = false;

    // Step 1: Handle settlement and user feedback based on result
    if (result === 'win') {
        toastr_API.success(reason, "胜利！");
        // Get pot amount from the current game state before it's cleared
        const potAmount = AIGame_State.currentGameState?.pot_amount || 0;
        if (potAmount > 0) {
            // Add pot to player chips
            await _updateWorldbook('sillypoker_player_data', (playerData) => {
                playerData.chips = (playerData.chips || 0) + potAmount;
                return playerData;
            });
        }
    } else if (result === 'lose') {
        toastr_API.warning(reason, "失败...");
        await _updateWorldbook('sillypoker_player_data', (playerData) => {
            playerData.health = Math.max(0, (playerData.health || 0) - 1);
            if (playerData.health === 0) {
                 playerDied = true;
            }
            return playerData;
        });
        
        if (playerDied) {
            toastr_API.error("你的生命值已耗尽！挑战结束。", "游戏结束");
            await AIGame_DataHandler.resetAllGameData();
            return; // Exit early, resetAllGameData will handle the UI refresh.
        }
    } else {
        toastr_API.info(reason, "牌局结束");
    }

    // Step 2: Clear all temporary game state for the next round
    await _updateWorldbook('sillypoker_enemy_data', () => ({}));
    await _updateWorldbook('sillypoker_current_game_state', () => ({}));
    await _updateWorldbook('sillypoker_player_cards', () => ({ "current_hand": [] }));

    // Step 3: Switch UI back to map view and refresh data from worldbooks
    AIGame_State.currentActiveTab = 'map';
    await _fetchAllGameData(); // This refreshes state and triggers a UI rerender which will show the map
}


async function _handleAction(command) {
    const { player_name, amount } = command.data;
    
    await _updateWorldbook('sillypoker_current_game_state', (state) => {
        if(amount) {
            state.pot_amount = (state.pot_amount || 0) + parseInt(amount, 10);
        }
        // It's the AI's responsibility to update the turn via UpdateState
        return state;
    });

    // Update the chips for the correct character
    if (player_name === AIGame_State.playerData.name) {
        await _updateWorldbook('sillypoker_player_data', (data) => {
             if (amount) data.chips -= parseInt(amount, 10);
             return data;
        });
    } else {
        await _updateWorldbook('sillypoker_enemy_data', (data) => {
            if (amount) data.chips -= parseInt(amount, 10);
            return data;
        });
    }

    await _fetchAllGameData();
}

async function _handleActionShowdown(command) {
    const cardsToShow = command.data?.cards;

    await _updateWorldbook('sillypoker_enemy_data', (enemyData) => {
        if (!enemyData.hand) return enemyData;

        if (cardsToShow && Array.isArray(cardsToShow) && cardsToShow.length > 0) {
            // Selective showdown
            Logger.log(`Selective showdown by AI for ${cardsToShow.length} cards.`);
            enemyData.hand.forEach(card => {
                if (cardsToShow.some(showCard => showCard.rank === card.rank && showCard.suit === card.suit)) {
                    card.visibility = 'public';
                }
            });
        } else {
            // Full showdown (default behavior)
            Logger.log("Full showdown by AI.");
            enemyData.hand.forEach(card => {
                card.visibility = 'public';
            });
        }
        return enemyData;
    });
    
    await _fetchAllGameData(); // Refresh UI to show cards
}


export const AIGame_DataHandler = {
    init: function(deps, uiHandler) {
        SillyTavern_Context_API = deps.st_context;
        TavernHelper_API = deps.th;
        toastr_API = deps.toastr;
        UI = uiHandler;
    },

    clearLorebookCache() {
        currentCharacterLorebookName = null;
        currentCharacterName = null;
    },

    async getOrCreateGameLorebook() {
        const characterName = SillyTavern_Context_API.name2;
        if (currentCharacterName === characterName && currentCharacterLorebookName) {
            return currentCharacterLorebookName;
        }

        currentCharacterName = characterName;
        const lorebookName = `${AIGame_Config.LOREBOOK_PREFIX}${characterName}`;

        const allLorebooks = await TavernHelper_API.getWorldbookNames();
        if (!allLorebooks.includes(lorebookName)) {
            await TavernHelper_API.createOrReplaceWorldbook(lorebookName, AIGame_Config.INITIAL_LOREBOOK_ENTRIES);
            Logger.success(`为角色 "${characterName}" 创建了新的游戏世界书: ${lorebookName}`);
        }

        const charLorebooks = await TavernHelper_API.getCharWorldbookNames('current');
        if (charLorebooks && !charLorebooks.additional.includes(lorebookName)) {
            const updatedAdditional = [...charLorebooks.additional, lorebookName];
            await TavernHelper_API.rebindCharWorldbooks('current', {
                primary: charLorebooks.primary,
                additional: updatedAdditional
            });
            Logger.log(`已将游戏世界书 "${lorebookName}" 绑定到角色。`);
        }

        currentCharacterLorebookName = lorebookName;
        return lorebookName;
    },

    async checkGameBookExists() {
        const lorebookName = await this.getOrCreateGameLorebook();
        if (!lorebookName) {
            AIGame_State.hasGameBook = false;
            UI.renderPanelContent();
            return;
        }
        
        try {
            const entries = await TavernHelper_API.getWorldbook(lorebookName);
            const hasAllKeys = AIGame_Config.LOREBOOK_ENTRY_KEYS.every(key => 
                entries.some(entry => entry.name === key)
            );

            if (hasAllKeys) {
                AIGame_State.hasGameBook = true;
                Logger.log("游戏世界书验证通过。");
                await _fetchAllGameData();
            } else {
                AIGame_State.hasGameBook = false;
                Logger.warn("游戏世界书不完整，请修复。");
                UI.renderPanelContent();
            }
        } catch (error) {
            AIGame_State.hasGameBook = false;
            Logger.error("检查游戏世界书时出错:", error);
            UI.renderPanelContent();
        }
    },
    
    async createGameBookEntries() {
        const lorebookName = await this.getOrCreateGameLorebook();
        if(!lorebookName) {
            toastr_API.error("无法创建游戏世界书，因为无法获取角色信息。");
            return;
        }
        try {
            await TavernHelper_API.createOrReplaceWorldbook(lorebookName, AIGame_Config.INITIAL_LOREBOOK_ENTRIES);
            toastr_API.success("游戏世界书已成功创建/修复！");
            await this.checkGameBookExists();
        } catch(e) {
            toastr_API.error("创建/修复游戏世界书失败。");
            Logger.error("创建游戏世界书失败:", e);
        }
    },
    
    async mainProcessor(messageText) {
        const commands = AIGame_CommandParser.parseCommands(messageText);
        if (commands.length > 0) Logger.log(`Processing ${commands.length} command(s)...`, commands);
        
        for (const command of commands) {
            switch(command.category) {
                case 'Game':
                    if (command.type === 'SetupDeck') await _handleGameSetupDeck(command);
                    else if (command.type === 'Start') await _handleGameStart(command);
                    else if (command.type === 'Function') await _handleGameFunction(command);
                    else if (command.type === 'UpdateState') await _handleGameUpdateState(command);
                    else if (command.type === 'End') await _handleGameEnd(command);
                    break;
                case 'Action':
                    if (command.type === 'Showdown') {
                        await _handleActionShowdown(command);
                    } else {
                        await _handleAction(command);
                    }
                    break;
                default:
                    Logger.warn(`Unknown command category: ${command.category}`);
            }
        }
    },
    
    async saveMapData() {
        if (!AIGame_State.mapData) {
            toastr_API.error("没有地图数据可保存。");
            return;
        }
        await _updateWorldbook('sillypoker_map_data', () => AIGame_State.mapData);
        toastr_API.success("地图数据已保存！");
    },
    
    stagePlayerAction(action) {
        AIGame_State.stagedPlayerActions.push(action);
        UI.updateCommitButton();
        
        // Immediate UI feedback for betting
        if (action.type === 'bet') {
            AIGame_State.playerData.chips -= action.amount;
            AIGame_State.currentGameState.pot_amount = (AIGame_State.currentGameState.pot_amount || 0) + action.amount;
            UI.renderActiveTabContent();
        }
        // Immediate UI feedback for folding (can be more complex)
        if (action.type === 'fold' && action.cards) {
            // Logic to visually disable or remove cards can go here if needed.
            // For now, the prompt is the main thing.
        }
    },

    async commitStagedActions() {
        if (AIGame_State.stagedPlayerActions.length === 0) return;

        const actionsToCommit = [...AIGame_State.stagedPlayerActions];
        AIGame_State.stagedPlayerActions = [];
        UI.updateCommitButton();

        let prompt = `(系统提示：{{user}}执行了以下操作：\n`;
        
        for (const action of actionsToCommit) {
            let cardString = '';
            if (action.cards && action.cards.length > 0) {
                cardString = `[${action.cards.map(c => `${c.suit}${c.rank}`).join(', ')}]`;
            }

            switch(action.type) {
                case 'bet':
                    prompt += `- 选择了下注，金额为 ${action.amount}。\n`;
                    // State update is now done instantly in stagePlayerAction, just need to persist it.
                    await _updateWorldbook('sillypoker_player_data', (playerData) => {
                        playerData.chips = AIGame_State.playerData.chips; // Use the already-updated value
                        return playerData;
                    });
                    await _updateWorldbook('sillypoker_current_game_state', (gameState) => {
                        gameState.pot_amount = AIGame_State.currentGameState.pot_amount; // Use the already-updated value
                        return gameState;
                    });
                    break;
                case 'check':
                    prompt += `- 选择了过牌。\n`;
                    break;
                case 'fold':
                    prompt += `- 选择了弃牌${cardString}。\n`;
                    // Logic to remove cards from player hand
                    if (action.cards && action.cards.length > 0) {
                         await _updateWorldbook('sillypoker_player_cards', (data) => {
                            if (!data.current_hand) return data;
                            data.current_hand = data.current_hand.filter(handCard => 
                                !action.cards.some(foldedCard => foldedCard.rank === handCard.rank && foldedCard.suit === handCard.suit)
                            );
                            return data;
                        });
                    }
                    break;
                case 'showdown':
                     prompt += `- 选择了摊牌${cardString}。\n`;
                     if (action.cards && action.cards.length > 0) {
                        await _updateWorldbook('sillypoker_player_cards', (data) => {
                            if (!data.current_hand) return data;
                            data.current_hand.forEach(handCard => {
                                if (action.cards.some(showCard => showCard.rank === handCard.rank && showCard.suit === handCard.suit)) {
                                    handCard.visibility = 'public';
                                }
                            });
                            return data;
                        });
                     }
                     break;
            }
        }
        prompt += `请根据这些操作继续游戏。)`;

        await _fetchAllGameData();

        await TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(prompt)}`);
        SillyTavern_Context_API.generate();
    },

    async travelToNode(nodeId, nodeType) {
        // 1. Update map data in worldbook
        await _updateWorldbook('sillypoker_map_data', (mapData) => {
            mapData.player_position = nodeId;
            if (!mapData.path_taken) mapData.path_taken = [];
            mapData.path_taken.push(nodeId);
            return mapData;
        });

        // 2. Format prompt
        const nodeTypeTranslations = {
            enemy: '普通敌人',
            elite: '精英敌人',
            shop: '商店',
            rest: '休息处',
            boss: '首领',
            event: '随机事件'
        };
        const translatedType = nodeTypeTranslations[nodeType] || nodeType;
        const prompt = `(系统提示：{{user}}移动到了一个 ${translatedType} 节点。)`;

        // 3. Send to AI
        await TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(prompt)}`);
        SillyTavern_Context_API.generate();

        // 4. Update UI: Fetch data, switch view
        AIGame_State.currentActiveTab = 'game-ui';
        AIGame_State.selectedMapNodeId = null; // Clear selection after moving
        await _fetchAllGameData(); // This will trigger a re-render of the correct tab
    },
    
    async startNewRun(difficulty) {
        Logger.log(`Starting new run with difficulty: ${difficulty}`);
        const settings = DIFFICULTY_SETTINGS[difficulty];
        if (!settings) {
            Logger.error(`Invalid difficulty selected: ${difficulty}`);
            return;
        }

        // 1. Reset all existing game data to ensure a clean slate.
        await this.resetAllGameData(false); // Reset without refreshing UI yet

        // 2. Fetch the player data template and apply difficulty settings
        const uiJsUrl = new URL(import.meta.url);
        const basePath = uiJsUrl.pathname.substring(0, uiJsUrl.pathname.lastIndexOf('/modules'));
        const templateUrl = `${basePath}/templates/player_data.json`;
        
        try {
            const response = await fetch(templateUrl);
            const playerDataTemplate = await response.json();
            
            playerDataTemplate.health = settings.health;
            playerDataTemplate.max_health = settings.max_health;
            playerDataTemplate.chips = settings.chips;
            
            // 3. Write the new player data
            await _updateWorldbook('sillypoker_player_data', () => playerDataTemplate);
        
        } catch (e) {
            Logger.error('Failed to load player data template:', e);
            toastr_API.error('无法加载玩家数据模板，无法开始新游戏。');
            return;
        }

        // 4. Generate and save a new map
        const newMap = generateMapData();
        await _updateWorldbook('sillypoker_map_data', () => newMap);

        // 5. Update in-memory state and send prompt to AI
        AIGame_State.runInProgress = true;
        const prompt = `(系统提示：{{user}}选择了 [${settings.name}] 难度开始了新的挑战。)`;
        await TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(prompt)}`);
        // We don't trigger generation here, as starting a run is a setup step. The user will initiate the first move.
        
        toastr_API.success(`已开始 [${settings.name}] 难度的挑战！`);
        
        // 6. Finally, fetch all data and refresh the UI
        await _fetchAllGameData();
    },

    async resetAllGameData(refreshUI = true) {
        Logger.log('Resetting all game data...');

        // Clear all world book entries related to the game state
        await _updateWorldbook('sillypoker_enemy_data', () => ({}));
        await _updateWorldbook('sillypoker_player_cards', () => ({ "current_hand": [] }));
        await _updateWorldbook('sillypoker_map_data', () => ({}));
        await _updateWorldbook('sillypoker_current_game_state', () => ({}));
        await _updateWorldbook('sillypoker_private_game_data', () => ({}));

        // Reset in-memory state
        AIGame_State.enemyData = {};
        AIGame_State.playerCards = { current_hand: [] };
        AIGame_State.mapData = {};
        AIGame_State.currentGameState = {};
        AIGame_State.privateGameData = {};
        AIGame_State.stagedPlayerActions = [];
        AIGame_State.selectedMapNodeId = null;
        AIGame_State.runInProgress = false;
        // BUG FIX: Reset the active tab so the UI knows to show the difficulty selection screen
        AIGame_State.currentActiveTab = 'map'; 
        
        if (refreshUI) {
            toastr_API.info("挑战已重置。");
            await _fetchAllGameData(); // This will re-render and show the difficulty screen
        }
    },
    
    async attemptEscape() {
        if (!AIGame_State.runInProgress) {
            toastr_API.info('当前没有正在进行的挑战。');
            return;
        }
        if (Object.keys(AIGame_State.currentGameState).length === 0) {
            toastr_API.warning('你不在一场牌局中，无法逃跑。');
            return;
        }

        const prompt = `(系统提示：{{user}}正在逃跑...)`;
        await TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(prompt)}`);
        SillyTavern_Context_API.generate();
        const toastMsg = await SillyTavern_Context_API.substituteParamsExtended("{{user}}正在逃跑...");
        toastr_API.info(toastMsg);
    }
};
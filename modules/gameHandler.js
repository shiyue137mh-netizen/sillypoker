/**
 * AI Card Table Extension - Game Logic Handler
 * @description Handles all commands related to game flow, such as starting games, dealing cards, and player/AI actions.
 */
import { Logger } from './logger.js';
import { AIGame_State } from './state.js';
import { createDeck, shuffle } from './utils.js';
import { AudioManager } from './audioManager.js';

let context; // To hold shared functions and dependencies from dataHandler

const _selectCards = (cardArray, filter) => {
    if (!cardArray || cardArray.length === 0) return [];
    let candidates = [...cardArray];

    if (filter.suit) {
        candidates = candidates.filter(c => c.suit === filter.suit);
    }
    if (filter.rank) {
        candidates = candidates.filter(c => c.rank === filter.rank);
    }

    if (filter.index === 'all' || typeof filter.index === 'undefined') {
        return candidates;
    }
    if (filter.index === 'random') {
        if (candidates.length === 0) return [];
        const randomIndex = Math.floor(Math.random() * candidates.length);
        return [candidates[randomIndex]];
    }
    if (typeof filter.index === 'number') {
        const targetCard = candidates[filter.index];
        return targetCard ? [targetCard] : [];
    }
    return [];
};


async function _handleGameFunctionModifyCard(command) {
    const { targets } = command.data;
    if (!targets || !Array.isArray(targets)) {
        Logger.error('Invalid ModifyCard command: missing targets array.', command.data);
        return;
    }

    const rankToValue = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
    const valueToRank = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: '10', 9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4', 3: '3', 2: '2' };
    const minRankValue = 2;
    const maxRankValue = 14;

    const applyModification = (card, mod) => {
        const { field, operation, value } = mod;
        if (!card) return;

        switch (field) {
            case 'rank': {
                const currentRankValue = rankToValue[card.rank] || parseInt(card.rank, 10);
                if (isNaN(currentRankValue)) break;

                let newRankValue;
                if (operation === 'set') {
                    newRankValue = rankToValue[value] || parseInt(value, 10);
                } else {
                    const operand = Number(value);
                    if (isNaN(operand)) break;

                    if (operation === 'add') newRankValue = currentRankValue + operand;
                    else if (operation === 'subtract') newRankValue = currentRankValue - operand;
                    else if (operation === 'multiply') newRankValue = currentRankValue * operand;
                    else break;
                }
                
                if (typeof newRankValue !== 'number' || isNaN(newRankValue)) break;

                newRankValue = Math.round(Math.max(minRankValue, Math.min(maxRankValue, newRankValue)));
                card.rank = valueToRank[newRankValue] || String(newRankValue);
                break;
            }
            case 'suit':
            case 'visibility':
            case 'name':
            case 'is_special':
                if (operation === 'set') {
                    card[field] = value;
                }
                break;
        }
    };

    const processTarget = async (targetInfo) => {
        const { location, enemy_name, card_filter, modifications } = targetInfo;
        
        let fileToUpdate;
        let dataUpdater;

        switch (location) {
            case 'player_hand':
                fileToUpdate = 'sp_player_cards';
                dataUpdater = (data) => {
                    const cardsToModify = _selectCards(data.current_hand, card_filter);
                    cardsToModify.forEach(card => modifications.forEach(mod => applyModification(card, mod)));
                    return data;
                };
                break;
            case 'enemy_hand':
                fileToUpdate = 'sp_enemy_data';
                dataUpdater = (data) => {
                    const enemy = data.enemies?.find(e => e.name === enemy_name);
                    if (enemy && enemy.hand) {
                        const cardsToModify = _selectCards(enemy.hand, card_filter);
                        cardsToModify.forEach(card => modifications.forEach(mod => applyModification(card, mod)));
                    }
                    return data;
                };
                break;
            case 'board':
                fileToUpdate = 'sp_game_state';
                dataUpdater = (data) => {
                    if (data.board_cards) {
                         const cardsToModify = _selectCards(data.board_cards, card_filter);
                         cardsToModify.forEach(card => modifications.forEach(mod => applyModification(card, mod)));
                    }
                    return data;
                };
                break;
            case 'deck':
                fileToUpdate = 'sp_private_data';
                 dataUpdater = (data) => {
                    if (data.deck) {
                         const cardsToModify = _selectCards(data.deck, card_filter);
                         cardsToModify.forEach(card => modifications.forEach(mod => applyModification(card, mod)));
                    }
                    return data;
                };
                break;
        }

        if (fileToUpdate && dataUpdater) {
            await context.updateWorldbook(fileToUpdate, dataUpdater);
        }
    };

    for (const target of targets) {
        await processTarget(target);
    }
    
    await context.fetchAllGameData();
    Logger.success(`[Game:Function, type:ModifyCard] processed successfully.`);
}

// Private command handler functions
async function _handleGameSetupDeck(command) {
    Logger.log("Setting up custom deck...", command.data);
    const customDeck = createDeck(command.data);
    const shuffledDeck = shuffle(customDeck);
    
    await context.updateWorldbook('sp_private_data', () => ({
        deck: shuffledDeck
    }));

    Logger.success(`Custom deck with ${shuffledDeck.length} cards created and shuffled.`);
}

async function _handleGameStart(command) {
    const { game_type, players, initial_state } = command.data;
    const enemyStateTemplate = initial_state || {};

    if (!initial_state) {
        Logger.error('Missing "initial_state" in [Game:Start] command. Using a fallback. The character should be prompted to include this.', command.data);
    }

    const userPlayerName = await context.SillyTavern_Context_API.substituteParamsExtended('{{user}}');
    const enemyNames = players.filter(p => p !== '{{user}}' && p !== userPlayerName);
    
    const enemies = enemyNames.map(name => ({
        ...enemyStateTemplate,
        name: name,
        hand: [] 
    }));

    await context.updateWorldbook('sp_enemy_data', () => ({ enemies }));
    await context.updateWorldbook('sp_game_state', () => ({
        game_type,
        players,
        current_turn: players[0],
        pot_amount: 0,
        board_cards: [],
        custom_wagers: [],
        last_bet_amount: 0, // Initialize betting state for the round
    }));
    await context.updateWorldbook('sp_player_cards', data => ({ ...data, current_hand: [] }));

    const lorebookName = await context.getOrCreateGameLorebook();
    const entries = await context.TavernHelper_API.getWorldbook(lorebookName);
    const privateDataEntry = entries.find(e => e.name === 'sp_private_data');
    let privateData = {};
    try { privateData = JSON.parse(privateDataEntry.content); } catch {}

    if (!privateData.deck || privateData.deck.length === 0) {
        Logger.warn("No deck found from [Game:SetupDeck]. Creating a default 52-card deck.");
        await context.updateWorldbook('sp_private_data', () => ({
            deck: shuffle(createDeck())
        }));
    }

    Logger.success(`Game started: ${game_type}`);
    await context.fetchAllGameData();
}

async function _dealCards(actions) {
    const totalCardsNeeded = actions.reduce((sum, action) => sum + (action.count || 0), 0);
    if (totalCardsNeeded === 0) return;

    await AudioManager.play('deal');

    let drawnCards = [];
    await context.updateWorldbook('sp_private_data', (privateData) => {
        const deck = privateData.deck || [];
        if (deck.length < totalCardsNeeded) {
            Logger.error(`Not enough cards in deck. Need ${totalCardsNeeded}, have ${deck.length}.`);
            drawnCards = [];
            return privateData;
        }
        drawnCards = deck.splice(0, totalCardsNeeded);
        privateData.deck = deck;
        return privateData;
    });

    if (drawnCards.length < totalCardsNeeded) {
        context.toastr_API.error("牌堆里的牌不够！");
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

    if (distribution.player.length > 0) await context.updateWorldbook('sp_player_cards', data => ({ ...data, current_hand: [...(data.current_hand || []), ...distribution.player] }));
    if (Object.values(distribution.enemies).some(c => c.length > 0)) {
        await context.updateWorldbook('sp_enemy_data', data => {
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
        await context.updateWorldbook('sp_game_state', data => ({ 
            ...data, 
            board_cards: [...(data.board_cards || []), ...distribution.board],
            last_bet_amount: 0 // Reset betting for the new round (flop, turn, river)
        }));
    }
    
    await context.fetchAllGameData();
}

async function _handleGameFunction(command) {
    if (command.data.type === '发牌') {
        await _dealCards(command.data.actions || []);
    } else if (command.data.type === 'ModifyCard') {
        await _handleGameFunctionModifyCard(command);
    } else {
        Logger.warn(`Unknown game function type: "${command.data.type}"`);
    }
}

async function _handleGameUpdateState(command) {
    await context.updateWorldbook('sp_game_state', (currentState) => ({ ...currentState, ...command.data }));
    await context.fetchAllGameData();
}

async function _handleGameEnd(command) {
    const { result, reason } = command.data;
    let playerDied = false;
    
    if (result === 'win') {
        context.toastr_API.success(reason, "胜利！");
    } else if (result === 'lose') {
        context.toastr_API.warning(reason, "失败...");
        await context.updateWorldbook('sp_player_data', p => {
            p.health = Math.max(0, (p.health || 0) - 1);
            if (p.health === 0) playerDied = true;
            return p;
        });
        
        if (playerDied) {
            context.toastr_API.error("你的生命值已耗尽！挑战结束。", "游戏结束");
            AIGame_State.runInProgress = false; // Manually update state
        }
    } else if (result === 'boss_win') {
        context.toastr_API.success(reason, "首领已被击败！");
        await context.updateWorldbook('sp_map_data', m => {
            if (m) m.bossDefeated = true;
            return m;
        });
    } else if (result === 'escape') {
        context.toastr_API.info(reason, "逃跑成功！");
    } else {
        context.toastr_API.info(reason, "牌局结束");
    }

    // Clean up game state regardless of result
    await context.updateWorldbook('sp_enemy_data', () => ({ enemies: [] }));
    await context.updateWorldbook('sp_game_state', () => ({}));
    await context.updateWorldbook('sp_player_cards', () => ({ "current_hand": [] }));

    if (playerDied) {
        AIGame_State.currentActiveTab = 'settings';
    } else {
        AIGame_State.currentActiveTab = 'map';
    }
    await context.fetchAllGameData();
}

async function _handleActionBet(command) {
    await AudioManager.play('chip');
    const { player_name, amount, things } = command.data;
    const userPlayerName = await context.SillyTavern_Context_API.substituteParamsExtended('{{user}}');
    
    if (amount) {
        const numericAmount = parseInt(amount, 10);
        await context.updateWorldbook('sp_game_state', s => ({ 
            ...s, 
            pot_amount: (s.pot_amount || 0) + numericAmount,
            last_bet_amount: numericAmount // This is the new amount to be called
        }));
        if (player_name === userPlayerName) {
            await context.updateWorldbook('sp_player_data', p => ({ ...p, chips: p.chips - numericAmount }));
        } else {
            await context.updateWorldbook('sp_enemy_data', d => {
                const enemy = d.enemies?.find(e => e.name === player_name);
                if (enemy) enemy.chips -= numericAmount;
                return d;
            });
        }
    }

    if (things) {
        await context.updateWorldbook('sp_game_state', s => {
            if (!s.custom_wagers) s.custom_wagers = [];
            s.custom_wagers.push({ player: player_name, item: things });
            return s;
        });
    }

    await context.fetchAllGameData();
}

async function _handleActionCall(command) {
    await AudioManager.play('chip');
    const { player_name } = command.data;
    const userPlayerName = await context.SillyTavern_Context_API.substituteParamsExtended('{{user}}');
    const amountToCall = AIGame_State.currentGameState.last_bet_amount || 0;

    if (amountToCall <= 0) {
        Logger.warn(`Call action received, but there is no bet to call. Ignoring.`);
        return; // Nothing to call
    }
    
    await context.updateWorldbook('sp_game_state', s => ({ ...s, pot_amount: (s.pot_amount || 0) + amountToCall }));

    if (player_name === userPlayerName) {
        await context.updateWorldbook('sp_player_data', p => ({ ...p, chips: p.chips - amountToCall }));
    } else {
        await context.updateWorldbook('sp_enemy_data', d => {
            const enemy = d.enemies?.find(e => e.name === player_name);
            if (enemy) enemy.chips -= amountToCall;
            return d;
        });
    }
    
    await context.fetchAllGameData();
}

async function _handleActionCheck(command) {
    Logger.log(`Player ${command.data.player_name} checks.`);
    await context.fetchAllGameData();
}

async function _handleActionFold(command) {
    Logger.log(`Player ${command.data.player_name} folds.`);
    // Future: could add a status to the player/enemy object.
    await context.fetchAllGameData();
}

async function _handleActionShowdown(command) {
    const playerName = command.data?.player_name;
    if (!playerName) return;

    await context.updateWorldbook('sp_enemy_data', enemyData => {
        const enemy = enemyData.enemies?.find(e => e.name === playerName);
        if (enemy && enemy.hand) {
            enemy.hand.forEach(card => card.visibility = 'public');
        }
        return enemyData;
    });

    await context.fetchAllGameData();
}

export const AIGame_GameHandler = {
    init: function(ctx) {
        context = ctx;
    },

    async handleCommand(command) {
        const handlerMap = {
            'Game:SetupDeck': _handleGameSetupDeck,
            'Game:Start': _handleGameStart,
            'Game:End': _handleGameEnd,
            'Game:Function': _handleGameFunction,
            'Game:UpdateState': _handleGameUpdateState,
            'Action:Bet': _handleActionBet,
            'Action:Call': _handleActionCall,
            'Action:Check': _handleActionCheck,
            'Action:Fold': _handleActionFold,
            'Action:Showdown': _handleActionShowdown
        };
        const key = `${command.category}:${command.type}`;
        if (handlerMap[key]) {
            await handlerMap[key](command);
        } else {
            Logger.warn(`Unhandled game command: ${key}`);
        }
    },

    stagePlayerAction(action) {
        AIGame_State.stagedPlayerActions.push(action);
        context.UI.updateCommitButton();
        Logger.log('Player action staged:', action);
    },

    async commitStagedActions() {
        if (AIGame_State.stagedPlayerActions.length === 0) return;

        const actionsToCommit = [...AIGame_State.stagedPlayerActions];
        AIGame_State.stagedPlayerActions = [];
        context.UI.updateCommitButton();

        const userPlayerName = await context.SillyTavern_Context_API.substituteParamsExtended('{{user}}');
        let prompt = `(系统提示：{{user}}执行了以下操作：\n`;

        for (const action of actionsToCommit) {
            const command = {
                category: 'Action',
                type: action.type.charAt(0).toUpperCase() + action.type.slice(1),
                data: { ...action, player_name: userPlayerName }
            };
            
            // Execute the action's logic immediately
            await this.handleCommand(command);

            // Build the prompt string for the character
            switch(action.type) {
                case 'bet': prompt += `- 下注 ${action.amount} 筹码。\n`; break;
                case 'call': prompt += `- 跟注。\n`; break;
                case 'check': prompt += `- 过牌。\n`; break;
                case 'fold': prompt += `- 弃牌。\n`; break;
                case 'play_cards': prompt += `- 打出了 ${action.cards.map(c => c.rank+c.suit).join(', ')}。\n`; break;
                case 'custom': prompt += `- 执行了自定义动作: "${action.text}"\n`; break;
            }
        }
        prompt += `轮到你了。)`;

        await context.TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(prompt)}`);
        context.SillyTavern_Context_API.generate();
    },
    
    async attemptEscape() {
        Logger.log('Player attempts to escape...');
        const prompt = `(系统提示：{{user}}尝试从当前的遭遇中逃跑。请根据当前情况（例如对手是谁，当前是否在牌局中）来决定逃跑是否成功，并输出对应的 [Game:End] 或 [Event:Modify] 指令。)`;
        context.toastr_API.info("你的对手正在决定是否让你逃跑...");
        await context.TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(prompt)}`);
        context.SillyTavern_Context_API.generate();
    }
};

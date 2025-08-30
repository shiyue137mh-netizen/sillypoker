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

// --- Helper functions for complex actions like Swap ---
const _getCardsFromLocation = (locationObj) => {
    const { location, enemy_name } = locationObj;
    switch (location) {
        case 'player_hand':
            return [...(AIGame_State.playerCards?.current_hand || [])];
        case 'enemy_hand':
            const enemy = AIGame_State.enemyData?.enemies?.find(e => e.name === enemy_name);
            return [...(enemy?.hand || [])];
        case 'board':
            return [...(AIGame_State.currentGameState?.board_cards || [])];
        default:
            Logger.warn(`Cannot get cards from unsupported location: ${location}`);
            return null;
    }
};

const _updateCardsAtLocation = async (locationObj, newCards) => {
    const { location, enemy_name } = locationObj;
    let fileToUpdate;
    let dataUpdater;

    switch (location) {
        case 'player_hand':
            fileToUpdate = 'sp_player_cards';
            dataUpdater = data => { data.current_hand = newCards; return data; };
            break;
        case 'enemy_hand':
            fileToUpdate = 'sp_enemy_data';
            dataUpdater = data => {
                const enemy = data.enemies?.find(e => e.name === enemy_name);
                if (enemy) enemy.hand = newCards;
                return data;
            };
            break;
        case 'board':
            fileToUpdate = 'sp_game_state';
            dataUpdater = data => { data.board_cards = newCards; return data; };
            break;
        default:
            Logger.warn(`Cannot update cards at unsupported location: ${location}`);
            return;
    }
    await context.updateWorldbook(fileToUpdate, dataUpdater);
};


async function _handleGameFunctionModify(command) {
    const { targets } = command.data;
    if (!targets || !Array.isArray(targets)) {
        Logger.error('Invalid Modify command: missing targets array.', command.data);
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
                    else break;
                }
                
                if (typeof newRankValue !== 'number' || isNaN(newRankValue)) break;

                newRankValue = Math.round(Math.max(minRankValue, Math.min(maxRankValue, newRankValue)));
                card.rank = valueToRank[newRankValue] || String(newRankValue);
                break;
            }
            case 'suit':
            case 'visibility':
                if (operation === 'set') {
                    card[field] = value;
                }
                break;
        }
    };
    
    const processTarget = async (targetInfo) => {
        const { location, enemy_name, operation, card_filter, modifications, cards_to_add } = targetInfo;
        
        const getLocationFile = (loc) => {
            switch (loc) {
                case 'player_hand': return 'sp_player_cards';
                case 'enemy_hand': return 'sp_enemy_data';
                case 'board': return 'sp_game_state';
                case 'deck': return 'sp_private_data';
                default: return null;
            }
        };

        const fileToUpdate = getLocationFile(location);
        if (!fileToUpdate) {
            Logger.warn(`Invalid location in Modify command: ${location}`);
            return;
        }

        const dataUpdater = (data) => {
            let cardArray;
            switch (location) {
                case 'player_hand': cardArray = data.current_hand; break;
                case 'enemy_hand': cardArray = data.enemies?.find(e => e.name === enemy_name)?.hand; break;
                case 'board': cardArray = data.board_cards; break;
                case 'deck': cardArray = data.deck; break;
            }
            if (!cardArray) return data;

            switch (operation) {
                case 'update':
                    const cardsToModify = _selectCards(cardArray, card_filter);
                    cardsToModify.forEach(card => modifications.forEach(mod => applyModification(card, mod)));
                    break;
                case 'add':
                    if (cards_to_add && Array.isArray(cards_to_add)) {
                        cardArray.push(...cards_to_add);
                    }
                    break;
                case 'remove':
                    const cardsToRemove = _selectCards(cardArray, card_filter);
                    const cardsToRemoveSet = new Set(cardsToRemove);
                    const newArray = cardArray.filter(card => !cardsToRemoveSet.has(card));
                    switch (location) {
                        case 'player_hand': data.current_hand = newArray; break;
                        case 'enemy_hand': data.enemies.find(e => e.name === enemy_name).hand = newArray; break;
                        case 'board': data.board_cards = newArray; break;
                        case 'deck': data.deck = newArray; break;
                    }
                    break;
            }
            return data;
        };

        await context.updateWorldbook(fileToUpdate, dataUpdater);
    };

    for (const target of targets) {
        await processTarget(target);
    }
    
    await context.fetchAllGameData();
    Logger.success(`[Game:Function, type:Modify] processed successfully.`);
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
    context.AIGame_History.addGameStatusEntry({ text: `设置了 ${shuffledDeck.length} 张牌的牌堆。` });
}

async function _handleGameStart(command) {
    AIGame_State.currentHint = null; // Clear any previous hints
    const { game_type, players, initial_state } = command.data;
    context.toastr_API.info(`新牌局已开始: ${game_type}`, "游戏开始");
    context.AIGame_History.addGameStatusEntry({ text: `牌局开始: ${game_type}` });
    const enemyStateTemplate = initial_state || {};

    if (!initial_state) {
        Logger.error('Missing "initial_state" in [Game:Start] command. Using a fallback. The character should be prompted to include this.', command.data);
    }

    const userPlayerName = await context.SillyTavern_API.getContext().substituteParamsExtended('{{user}}');
    const enemyNames = players.filter(p => p !== '{{user}}' && p !== userPlayerName);
    
    const enemies = enemyNames.map(name => ({
        ...enemyStateTemplate,
        name: name,
        hand: [] 
    }));
    
    const defaultDeck = shuffle(createDeck());
    await context.updateWorldbook('sp_private_data', () => ({
        deck: defaultDeck
    }));
    Logger.log('Game started, default 52-card deck created.');

    await context.updateWorldbook('sp_enemy_data', () => ({ enemies }));
    await context.updateWorldbook('sp_game_state', (s) => {
        s.game_type = game_type;
        s.players = players;
        s.current_turn = players[0];
        s.pot_amount = 0;
        s.board_cards = [];
        s.custom_wagers = [];
        s.last_bet_amount = 0;
        delete s.pending_deal_actions; // CRITICAL FIX: Clear any pending deals from a previous game
        return s;
    });
    await context.updateWorldbook('sp_player_cards', data => ({ ...data, "current_hand": [] }));

    Logger.success(`Game started: ${game_type}`);
    await context.fetchAllGameData();
}

async function _dealCards(actions) {
    Logger.log("Staging deal actions, waiting for UI to trigger.", actions);
    await context.updateWorldbook('sp_game_state', (s) => {
        s.pending_deal_actions = actions;
        return s;
    });
    actions.forEach(action => {
        context.AIGame_History.addDealEntry(action);
    });
    await context.fetchAllGameData();
}

async function _handleGameFunction(command) {
    // Keep ModifyCard for backward compatibility with older AI prompts
    if (command.data.type === 'ModifyCard' || command.data.type === 'Modify') {
        await _handleGameFunctionModify(command);
    } else if (command.data.type === '发牌') {
        await _dealCards(command.data.actions || []);
    } else {
        Logger.warn(`Unknown game function type: "${command.data.type}"`);
    }
}

async function _handleGameUpdateState(command) {
    await context.updateWorldbook('sp_game_state', (currentState) => ({ ...currentState, ...command.data }));
    await context.fetchAllGameData();
}

async function _handleGameEnd(command) {
    AIGame_State.currentHint = null; // Clear any hint when game ends
    const { result, reason } = command.data;
    let playerDied = false;
    context.AIGame_History.addGameStatusEntry({ text: `牌局结束: ${reason}` });
    
    context.UI.showEndGameAnimation(result); // NEW: Trigger win/loss animation

    const potAmount = AIGame_State.currentGameState?.pot_amount || 0;
    const isWin = result === 'win' || result === 'boss_win';
    
    if (isWin && potAmount > 0) {
        const winnerSelector = '#player-area-bottom';
        context.UI.animateChips({ from: '#pot-area', to: winnerSelector, count: Math.min(20, Math.floor(potAmount / 100)), mode: 'burst' });
    } else if (result === 'lose' && potAmount > 0) {
        const opponentSelector = '#opponent-area-top-0'; // Fallback to first opponent
        context.UI.animateChips({ from: '#pot-area', to: opponentSelector, count: Math.min(20, Math.floor(potAmount / 100)), mode: 'burst' });
    }


    if (result === 'win') {
        context.toastr_API.success(reason, "胜利！");
    } else if (result === 'lose') {
        context.toastr_API.warning(reason, "失败...");
        context.AudioManager_API.play('dice');
        const panelElement = context.parentWin.jQuery('#sillypoker-panel');
        if (panelElement.length) {
            panelElement.addClass('shake-flash');
            setTimeout(() => panelElement.removeClass('shake-flash'), 800);
        }
        await context.updateWorldbook('sp_player_data', p => {
            p.health = Math.max(0, (p.health || 0) - 1);
            if (p.health === 0) playerDied = true;
            return p;
        });
        
        if (playerDied) {
            context.toastr_API.error("你的生命值已耗尽！挑战结束。", "游戏结束");
            AIGame_State.runInProgress = false; // Manually update state
        }
    } else if (result === 'dead') {
        context.toastr_API.error(reason, "你已死亡");
        await context.resetAllGameData(); // This handles a full reset and UI update
        return; // Stop further processing in this function
    } else if (result === 'boss_win') {
        context.AudioManager_API.play('boss_win');
        context.toastr_API.success(reason, "首领已被击败！");
        await context.updateWorldbook('sp_map_data', m => {
            if (m) {
                m.bossDefeated = true;
                const bossNode = m.nodes.find(n => n.type === 'boss');
                if (bossNode) {
                    const angelNode = {
                        id: `L${m.mapLayer}-ANGEL`,
                        row: bossNode.row + 1,
                        x: bossNode.x - 100,
                        y: bossNode.y - 100,
                        type: 'angel',
                        connections: []
                    };
                    const devilNode = {
                        id: `L${m.mapLayer}-DEVIL`,
                        row: bossNode.row + 1,
                        x: bossNode.x + 100,
                        y: bossNode.y - 100,
                        type: 'devil',
                        connections: []
                    };
                    
                    if (!m.nodes.find(n => n.id === angelNode.id)) m.nodes.push(angelNode);
                    if (!m.nodes.find(n => n.id === devilNode.id)) m.nodes.push(devilNode);
                    
                    if (!m.paths.some(p => p.from === bossNode.id && p.to === angelNode.id)) {
                        m.paths.push({ from: bossNode.id, to: angelNode.id });
                    }
                     if (!m.paths.some(p => p.from === bossNode.id && p.to === devilNode.id)) {
                        m.paths.push({ from: bossNode.id, to: devilNode.id });
                    }
                    
                    if (!bossNode.connections.includes(angelNode.id)) bossNode.connections.push(angelNode.id);
                    if (!bossNode.connections.includes(devilNode.id)) bossNode.connections.push(devilNode.id);
                }
            }
            return m;
        });
    } else if (result === 'escape') {
        context.toastr_API.info(reason, "逃跑成功！");
    } else {
        context.toastr_API.info(reason, "牌局结束");
    }

    // Clean up game state
    await context.updateWorldbook('sp_enemy_data', () => ({ enemies: [] }));
    await context.updateWorldbook('sp_game_state', () => ({}));
    await context.updateWorldbook('sp_player_cards', (data) => ({ ...data, "current_hand": [] }));

    if (playerDied) {
        AIGame_State.currentActiveTab = 'settings';
    } else {
        AIGame_State.currentActiveTab = 'map';
    }
    await context.fetchAllGameData();
}

async function _handleGameHint(command) {
    const text = command.data?.text;
    if (text) {
        AIGame_State.currentHint = text;
        Logger.log(`Received hint: "${text}"`);
        // This is a lightweight UI update that doesn't require fetching all data again.
        context.UI.renderActiveTabContent();
    }
}

async function _handleActionBet(command) {
    const { player_name, amount, things } = command.data;
    
    const userPlayerName = await context.SillyTavern_API.getContext().substituteParamsExtended('{{user}}');
    if (player_name !== userPlayerName) {
        const enemy = AIGame_State.enemyData.enemies.find(e => e.name === player_name);
        if (enemy) {
            const enemyId = context.parentWin.jQuery(`[data-enemy-name="${enemy.name}"]`).closest('.player-position-container').attr('id');
            if (enemyId) context.UI.animateChips({ from: `#${enemyId}`, to: '#pot-area' });
        }
    }
    await AudioManager.play('chip');
    context.AIGame_History.addGameActionEntry({ actor: player_name, action: '下注了', amount: amount, things: things });

    if (amount) {
        const numericAmount = parseInt(amount, 10);
        await context.updateWorldbook('sp_game_state', s => ({ 
            ...s, 
            pot_amount: (s.pot_amount || 0) + numericAmount,
            last_bet_amount: numericAmount
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
    const { player_name } = command.data;
    const amountToCall = AIGame_State.currentGameState.last_bet_amount || 0;

    if (amountToCall <= 0) {
        Logger.warn(`Call action received, but there is no bet to call. Ignoring.`);
        return;
    }
    
    const userPlayerName = await context.SillyTavern_API.getContext().substituteParamsExtended('{{user}}');
    if (player_name !== userPlayerName) {
        const enemy = AIGame_State.enemyData.enemies.find(e => e.name === player_name);
        if (enemy) {
            const enemyId = context.parentWin.jQuery(`[data-enemy-name="${enemy.name}"]`).closest('.player-position-container').attr('id');
            if (enemyId) context.UI.animateChips({ from: `#${enemyId}`, to: '#pot-area' });
        }
    }
    await AudioManager.play('chip');
    context.AIGame_History.addGameActionEntry({ actor: player_name, action: '跟注了', amount: amountToCall });

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
    context.AIGame_History.addGameActionEntry({ actor: command.data.player_name, action: '过牌' });
    await context.fetchAllGameData();
}

async function _handleActionFold(command) {
    Logger.log(`Player ${command.data.player_name} folds.`);
    context.AIGame_History.addGameActionEntry({ actor: command.data.player_name, action: '弃牌' });
    // Future: could add a status to the player/enemy object.
    await context.fetchAllGameData();
}

async function _handleActionHit(command) {
    await AudioManager.play('deal');
    const { player_name } = command.data;
    context.AIGame_History.addGameActionEntry({ actor: player_name, action: '要牌' });
    const userPlayerName = await context.SillyTavern_API.getContext().substituteParamsExtended('{{user}}');
    
    // A hit card is dealt face up for all to see. It's added to the player's hand array.
    const dealAction = {
        target: player_name === userPlayerName ? 'player' : 'enemy',
        name: player_name === userPlayerName ? undefined : player_name,
        count: 1,
        visibility: 'public' 
    };

    await _dealCards([dealAction]);
    Logger.log(`Player ${player_name} hits.`);
}


async function _handleActionShowdown(command) {
    const playerName = command.data?.player_name;
    if (!playerName) return;

    context.AIGame_History.addGameActionEntry({ actor: playerName, action: '摊牌' });

    await context.updateWorldbook('sp_enemy_data', enemyData => {
        const enemy = enemyData.enemies?.find(e => e.name === playerName);
        if (enemy && enemy.hand) {
            enemy.hand.forEach(card => card.visibility = 'public');
        }
        return enemyData;
    });

    await context.fetchAllGameData();
}

async function _handleActionSwapCards(command) {
    const { swap_type, source, destination, count, card_one, card_two } = command.data;

    if (swap_type === 'random') {
        if (!source || !destination || !count) {
            Logger.error('Invalid random swap command: missing source, destination, or count.');
            return;
        }

        let sourceCards = _getCardsFromLocation(source);
        let destCards = _getCardsFromLocation(destination);

        if (!sourceCards || !destCards) return;

        const cardsToSwapFromSource = [];
        const cardsToSwapFromDest = [];

        for (let i = 0; i < count; i++) {
            if (sourceCards.length > 0) {
                const randIndex = Math.floor(Math.random() * sourceCards.length);
                cardsToSwapFromSource.push(sourceCards.splice(randIndex, 1)[0]);
            }
            if (destCards.length > 0) {
                const randIndex = Math.floor(Math.random() * destCards.length);
                cardsToSwapFromDest.push(destCards.splice(randIndex, 1)[0]);
            }
        }
        
        sourceCards.push(...cardsToSwapFromDest);
        destCards.push(...cardsToSwapFromSource);

        await _updateCardsAtLocation(source, sourceCards);
        await _updateCardsAtLocation(destination, destCards);

    } else if (swap_type === 'specific') {
        if (!card_one || !card_two) {
            Logger.error('Invalid specific swap command: missing card_one or card_two definitions.');
            return;
        }

        let cards1 = _getCardsFromLocation(card_one);
        let cards2 = _getCardsFromLocation(card_two);

        if (!cards1 || !cards2) return;

        const cardToSwap1 = _selectCards(cards1, card_one.card_filter)[0];
        const cardToSwap2 = _selectCards(cards2, card_two.card_filter)[0];
        
        if (!cardToSwap1 || !cardToSwap2) {
            Logger.error('Could not find one or both cards for specific swap.', {card_one, card_two});
            return;
        }

        const card1Index = cards1.findIndex(c => c === cardToSwap1);
        if (card1Index > -1) cards1.splice(card1Index, 1);
        
        const card2Index = cards2.findIndex(c => c === cardToSwap2);
        if (card2Index > -1) cards2.splice(card2Index, 1);
        
        cards1.push(cardToSwap2);
        cards2.push(cardToSwap1);

        await _updateCardsAtLocation(card_one, cards1);
        await _updateCardsAtLocation(card_two, cards2);
        
    } else {
        Logger.warn(`Unknown swap_type: ${swap_type}`);
    }

    await context.fetchAllGameData();
    Logger.success(`[Action:SwapCards] processed successfully.`);
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
            'Game:Hint': _handleGameHint,
            'Action:Bet': _handleActionBet,
            'Action:Call': _handleActionCall,
            'Action:Check': _handleActionCheck,
            'Action:Fold': _handleActionFold,
            'Action:Hit': _handleActionHit,
            'Action:Showdown': _handleActionShowdown,
            'Action:SwapCards': _handleActionSwapCards
        };
        const key = `${command.category}:${command.type}`;
        if (handlerMap[key]) {
            await handlerMap[key](command);
        } else {
            Logger.warn(`Unhandled game command: ${key}`);
        }
    },
    
    async playerGoesAllIn() {
        const allInAmount = AIGame_State.playerData.chips;
        if (allInAmount <= 0) {
            Logger.log("Player tried to go all-in with 0 chips. No action taken.");
            context.toastr_API.info("你已经没有筹码了！");
            return;
        }

        Logger.log(`Player goes all-in with ${allInAmount} chips.`);

        // Atomically update world books for player chips and game pot
        await context.updateWorldbook('sp_player_data', p => {
            p.chips = 0;
            return p;
        });
        await context.updateWorldbook('sp_game_state', s => {
            s.pot_amount = (s.pot_amount || 0) + allInAmount;
            s.last_bet_amount = allInAmount; // The all-in amount is now the bet to call
            return s;
        });

        // Construct an objective prompt for the AI
        const prompt = `(系统提示：{{user}}选择了 All In，将所有筹码都推向了彩池中央。)`;
        
        // Immediately send the prompt to the AI to continue the game loop
        await context.TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(prompt)}`);
        context.SillyTavern_API.getContext().generate();
        
        // Refresh the entire game state to reflect the all-in action on the UI
        await context.fetchAllGameData();
    },

    async attemptEscape() {
        Logger.log('Player attempts to escape...');
        const prompt = `(系统提示：{{user}}尝试从当前的遭遇中逃跑。请根据当前情况（例如对手是谁，当前是否在牌局中）来决定逃跑是否成功，并输出对应的 [Game:End] 或 [Event:Modify] 指令。)`;
        context.toastr_API.info("你的对手正在决定是否让你逃跑...");
        await context.TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(prompt)}`);
        context.SillyTavern_API.getContext().generate();
    }
};
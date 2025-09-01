/**
 * AI Card Table Extension - Game Logic Handler (Refactored for "Data First" Model)
 * @description This version strictly adheres to the "Data First, Animation Follows" principle.
 * Deal commands are processed atomically, preparing all data and an animation queue for the UI.
 */
import { Logger } from '../logger.js';
import { AIGame_State } from '../state.js';
import { createDeck, shuffle } from '../utils.js';

let context;

// NEW HELPER: Updates the visible deck for the AI if the feature is enabled.
async function _updateVisibleDeck(deck) {
    if (!AIGame_State.isDeckVisibleToAI) return;
    Logger.log('Updating visible deck for AI...');
    // Create a compact string representation of the deck for the AI to read.
    const deckString = `[${deck.map(c => c.suit + c.rank).join(',')}]`;
    await context.LorebookManager.updateWorldbook('sp_visible_deck', (data) => {
        if (!data) data = {};
        data.deck = deckString;
        // The comment helps the AI understand what this data is for.
        data.comment = "此牌堆对AI可见，用于确保发牌顺序。AI必须严格遵循此顺序。";
        return data;
    });
    Logger.success('Visible deck updated for AI.');
}

// Helper functions (no changes needed)
const _selectCards = (cardArray, filter) => {
    if (!cardArray || cardArray.length === 0) return [];
    let candidates = [...cardArray];
    if (filter.suit) candidates = candidates.filter(c => c.suit === filter.suit);
    if (filter.rank) candidates = candidates.filter(c => c.rank === filter.rank);
    if (filter.index === 'all' || typeof filter.index === 'undefined') return candidates;
    if (filter.index === 'random') return candidates.length === 0 ? [] : [candidates[Math.floor(Math.random() * candidates.length)]];
    if (typeof filter.index === 'number') return candidates[filter.index] ? [candidates[filter.index]] : [];
    return [];
};
const _getCardsFromLocation = (locationObj) => {
    const { location, enemy_name } = locationObj;
    switch (location) {
        case 'player_hand': return [...(AIGame_State.playerCards?.current_hand || [])];
        case 'enemy_hand': return [...(AIGame_State.enemyData?.enemies?.find(e => e.name === enemy_name)?.hand || [])];
        case 'board': return [...(AIGame_State.currentGameState?.board_cards || [])];
        default: Logger.warn(`Cannot get cards from unsupported location: ${location}`); return null;
    }
};
const _updateCardsAtLocation = async (locationObj, newCards) => {
    const { location, enemy_name } = locationObj;
    let fileToUpdate, dataUpdater;
    switch (location) {
        case 'player_hand': fileToUpdate = 'sp_player_cards'; dataUpdater = d => { d.current_hand = newCards; return d; }; break;
        case 'enemy_hand': fileToUpdate = 'sp_enemy_data'; dataUpdater = d => { const e = d.enemies?.find(en => en.name === enemy_name); if (e) e.hand = newCards; return d; }; break;
        case 'board': fileToUpdate = 'sp_game_state'; dataUpdater = d => { d.board_cards = newCards; return d; }; break;
        default: Logger.warn(`Cannot update cards at unsupported location: ${location}`); return;
    }
    await context.LorebookManager.updateWorldbook(fileToUpdate, dataUpdater);
};


/**
 * MODIFIED: Queues deal actions for the UI layer to process.
 * This decouples data processing from UI animation, ensuring the player sees the animation.
 * @param {Array<object>} actions - The array of deal actions from the AI command.
 */
async function _queueDealForUI(actions) {
    Logger.log("Queueing deal actions for UI processing in 'unprocessed_deal_actions'.", actions);
    await context.LorebookManager.updateWorldbook('sp_game_state', (s) => {
        if (!s) s = {};
        // Use a new property to avoid triggering any old immediate processing logic.
        s.unprocessed_deal_actions = actions;
        return s;
    });
    // Fetch data, but the UI won't start animations yet.
    await context.LorebookManager.fetchAllGameData();
}


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
        if (!card) return;
        const newCard = { ...card };
        const { field, operation, value } = mod;
        switch (field) {
            case 'rank': {
                const currentRankValue = rankToValue[newCard.rank] || parseInt(newCard.rank, 10);
                if (isNaN(currentRankValue)) break;
                let newRankValue;
                if (operation === 'set') newRankValue = rankToValue[value] || parseInt(value, 10);
                else {
                    const operand = Number(value);
                    if (isNaN(operand)) break;
                    if (operation === 'add') newRankValue = currentRankValue + operand;
                    else if (operation === 'subtract') newRankValue = currentRankValue - operand;
                    else break;
                }
                if (typeof newRankValue !== 'number' || isNaN(newRankValue)) break;
                newRankValue = Math.round(Math.max(minRankValue, Math.min(maxRankValue, newRankValue)));
                newCard.rank = valueToRank[newRankValue] || String(newRankValue);
                break;
            }
            case 'suit': case 'visibility':
                if (operation === 'set') newCard[field] = value;
                break;
        }
        return newCard;
    };
    for (const target of targets) {
        const { location, enemy_name, operation, card_filter, modifications, cards_to_add } = target;
        const getLocationFile = loc => ({ 'player_hand': 'sp_player_cards', 'enemy_hand': 'sp_enemy_data', 'board': 'sp_game_state', 'deck': 'sp_private_data' })[loc] || null;
        const fileToUpdate = getLocationFile(location);
        if (!fileToUpdate) { Logger.warn(`Invalid location in Modify command: ${location}`); continue; }
        const dataUpdater = data => {
            let cardArray;
            switch (location) {
                case 'player_hand': cardArray = data.current_hand; break;
                case 'enemy_hand': cardArray = data.enemies?.find(e => e.name === enemy_name)?.hand; break;
                case 'board': cardArray = data.board_cards; break;
                case 'deck': cardArray = data.deck; break;
            }
            if (!cardArray) return data;
            
            let newArray = [...cardArray];

            switch (operation) {
                case 'update': {
                    const cardsToUpdate = _selectCards(newArray, card_filter);
                    const cardsToUpdateSet = new Set(cardsToUpdate);
                    newArray = newArray.map(card => {
                        if (cardsToUpdateSet.has(card)) {
                            return modifications.reduce((accCard, mod) => applyModification(accCard, mod), card);
                        }
                        return card;
                    });
                    break;
                }
                case 'add': 
                    if (cards_to_add && Array.isArray(cards_to_add)) newArray.push(...cards_to_add); 
                    break;
                case 'remove': {
                    const cardsToRemoveSet = new Set(_selectCards(newArray, card_filter));
                    newArray = newArray.filter(card => !cardsToRemoveSet.has(card));
                    break;
                }
            }

            switch (location) {
                case 'player_hand': data.current_hand = newArray; break;
                case 'enemy_hand': data.enemies.find(e => e.name === enemy_name).hand = newArray; break;
                case 'board': data.board_cards = newArray; break;
                case 'deck': data.deck = newArray; break;
            }
            return data;
        };
        await context.LorebookManager.updateWorldbook(fileToUpdate, dataUpdater);
    }
    await context.LorebookManager.fetchAllGameData();
    Logger.success(`[Game:Function, type:Modify] processed successfully.`);
}

async function _handleGameSetupDeck(command) {
    Logger.log("Setting up custom deck...", command.data);
    const customDeck = createDeck(command.data);
    const shuffledDeck = shuffle(customDeck);
    await context.LorebookManager.updateWorldbook('sp_private_data', () => ({ deck: shuffledDeck }));
    await _updateVisibleDeck(shuffledDeck);
    Logger.success(`Custom deck with ${shuffledDeck.length} cards created and shuffled.`);
    context.AIGame_History.addGameStatusEntry({ text: `设置了 ${shuffledDeck.length} 张牌的牌堆。` });
}

async function _handleGameStart(command) {
    AIGame_State.currentHint = null;
    const { game_type, players, initial_state } = command.data;

    if (!Array.isArray(players)) {
        Logger.error('Invalid [Game:Start] command: "players" field is missing or not an array.', command.data);
        context.toastr_API.error('无法开始游戏：AI发出的指令缺少玩家信息。', '指令错误');
        return;
    }
    
    context.toastr_API.info(`新牌局已开始: ${game_type}`, "游戏开始");
    context.AIGame_History.addGameStatusEntry({ text: `牌局开始: ${game_type}` });

    const userPlayerName = await context.SillyTavern_API.getContext().substituteParamsExtended('{{user}}');
    const enemyNames = players.filter(p => p !== '{{user}}' && p !== userPlayerName);

    let enemies = [];
    if (Array.isArray(initial_state)) {
        enemies = enemyNames.map(name => {
            const stateForEnemy = initial_state.find(s => s.name === name) || {};
            return { ...stateForEnemy, name, hand: [] };
        });
    } else if (typeof initial_state === 'object' && initial_state !== null) {
        enemies = enemyNames.map(name => {
            const baseState = initial_state.name === name ? initial_state : (initial_state || {});
            return { ...baseState, name, hand: [] };
        });
    } else {
        enemies = enemyNames.map(name => ({ name, play_style: 'Unknown', chips: 1000, hand: [] }));
    }

    const defaultShuffledDeck = shuffle(createDeck());
    await context.LorebookManager.updateWorldbook('sp_private_data', () => ({ deck: defaultShuffledDeck }));
    await _updateVisibleDeck(defaultShuffledDeck);
    await context.LorebookManager.updateWorldbook('sp_enemy_data', () => ({ enemies }));
    await context.LorebookManager.updateWorldbook('sp_game_state', s => ({ ...s, game_type, players, current_turn: players[0], pot_amount: 0, board_cards: [], custom_wagers: [], last_bet_amount: 0, last_deal_animation_queue: undefined }));
    await context.LorebookManager.updateWorldbook('sp_player_cards', data => ({ ...data, "current_hand": [] }));
    
    Logger.success(`Game started: ${game_type}`);
    await context.LorebookManager.fetchAllGameData();
}


async function _handleGameFunction(command) {
    if (command.data.type === 'ModifyCard' || command.data.type === 'Modify') {
        await _handleGameFunctionModify(command);
    } else if (command.data.type === '发牌') {
        await _queueDealForUI(command.data.actions || []);
    } else {
        Logger.warn(`Unknown game function type: "${command.data.type}"`);
    }
}

async function _handleGameEnd(command) {
    AIGame_State.currentHint = null;
    const { result, reason } = command.data;
    context.AIGame_History.addGameStatusEntry({ text: `牌局结束: ${reason}` });
    context.UI.showEndGameAnimation(result);
    const potAmount = AIGame_State.currentGameState?.pot_amount || 0;
    const isWin = result === 'win' || result === 'boss_win';

    if (isWin) {
        if (potAmount > 0) {
            await context.LorebookManager.updateWorldbook('sp_player_data', p => {
                p.claimable_pot = (p.claimable_pot || 0) + potAmount;
                return p;
            });
        }
    } else if (result === 'lose' && potAmount > 0) {
        const enemyId = context.parentWin.jQuery(`[data-enemy-name]`).first().closest('.player-position-container').attr('id');
        if (enemyId) context.UI.animateChips({ from: '#pot-area', to: `#${enemyId}`, count: Math.min(20, Math.floor(potAmount / 100)), mode: 'burst' });
    }

    if (result === 'lose') {
        context.toastr_API.warning(reason, "失败...");
        const panelElement = context.parentWin.jQuery('#sillypoker-panel');
        if (panelElement.length) { panelElement.addClass('shake-flash'); setTimeout(() => panelElement.removeClass('shake-flash'), 800); }
        await context.RunManager.checkPlayerVitals();
    } else if (result === 'dead') {
        context.toastr_API.error(reason, "你已死亡");
        await context.RunManager.resetAllGameData(false);
        return;
    } else if (result === 'boss_win') {
        context.toastr_API.success(reason, "首领已被击败！");
        await context.LorebookManager.updateWorldbook('sp_map_data', m => {
            if (m) {
                m.bossDefeated = true;
                const bossNode = m.nodes.find(n => n.type === 'boss');
                if (bossNode) {
                    const angelNode = { id: `L${m.mapLayer}-ANGEL`, row: bossNode.row + 1, x: bossNode.x - 100, y: bossNode.y - 100, type: 'angel', connections: [] };
                    const devilNode = { id: `L${m.mapLayer}-DEVIL`, row: bossNode.row + 1, x: bossNode.x + 100, y: bossNode.y - 100, type: 'devil', connections: [] };
                    if (!m.nodes.find(n => n.id === angelNode.id)) m.nodes.push(angelNode);
                    if (!m.nodes.find(n => n.id === devilNode.id)) m.nodes.push(devilNode);
                    if (!m.paths.some(p => p.from === bossNode.id && p.to === angelNode.id)) m.paths.push({ from: bossNode.id, to: angelNode.id });
                    if (!m.paths.some(p => p.from === bossNode.id && p.to === devilNode.id)) m.paths.push({ from: bossNode.id, to: devilNode.id });
                    if (!bossNode.connections.includes(angelNode.id)) bossNode.connections.push(angelNode.id);
                    if (!bossNode.connections.includes(devilNode.id)) bossNode.connections.push(devilNode.id);
                }
            }
            return m;
        });
    } else if (result === 'win') context.toastr_API.success(reason, "胜利！");
    else if (result === 'escape') context.toastr_API.info(reason, "逃跑成功！");
    else context.toastr_API.info(reason, "牌局结束");

    await context.LorebookManager.updateWorldbook('sp_enemy_data', () => ({ enemies: [] }));
    await context.LorebookManager.updateWorldbook('sp_game_state', () => ({}));
    await context.LorebookManager.updateWorldbook('sp_player_cards', data => ({ ...data, "current_hand": [] }));

    AIGame_State.currentActiveTab = AIGame_State.gameMode === 'roguelike' ? 'map' : 'game-ui';
    await context.LorebookManager.fetchAllGameData();
}

async function _handleGameHint(command) {
    const text = command.data?.text;
    if (text) {
        AIGame_State.currentHint = text;
        Logger.log(`Received hint: "${text}"`);
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
    await context.AudioManager_API.play('chip');
    context.AIGame_History.addGameActionEntry({ actor: player_name, action: '下注了', amount: amount, things: things });

    if (amount) {
        const numericAmount = parseInt(amount, 10);
        await context.LorebookManager.updateWorldbook('sp_game_state', s => ({ ...s, pot_amount: (s.pot_amount || 0) + numericAmount, last_bet_amount: numericAmount }));
        if (player_name === userPlayerName) await context.LorebookManager.updateWorldbook('sp_player_data', p => ({ ...p, chips: p.chips - numericAmount }));
        else await context.LorebookManager.updateWorldbook('sp_enemy_data', d => { const e = d.enemies?.find(en => en.name === player_name); if (e) e.chips -= numericAmount; return d; });
    }
    if (things) await context.LorebookManager.updateWorldbook('sp_game_state', s => { if (!s.custom_wagers) s.custom_wagers = []; s.custom_wagers.push({ player: player_name, item: things }); return s; });
    await context.LorebookManager.fetchAllGameData();
}

async function _handleActionCall(command) {
    const { player_name } = command.data;
    const amountToCall = AIGame_State.currentGameState.last_bet_amount || 0;
    if (amountToCall <= 0) { Logger.warn(`Call action received, but there is no bet to call. Ignoring.`); return; }
    const userPlayerName = await context.SillyTavern_API.getContext().substituteParamsExtended('{{user}}');
    if (player_name !== userPlayerName) {
        const enemy = AIGame_State.enemyData.enemies.find(e => e.name === player_name);
        if (enemy) {
            const enemyId = context.parentWin.jQuery(`[data-enemy-name="${enemy.name}"]`).closest('.player-position-container').attr('id');
            if (enemyId) context.UI.animateChips({ from: `#${enemyId}`, to: '#pot-area' });
        }
    }
    await context.AudioManager_API.play('chip');
    context.AIGame_History.addGameActionEntry({ actor: player_name, action: '跟注了', amount: amountToCall });
    await context.LorebookManager.updateWorldbook('sp_game_state', s => ({ ...s, pot_amount: (s.pot_amount || 0) + amountToCall }));
    if (player_name === userPlayerName) await context.LorebookManager.updateWorldbook('sp_player_data', p => ({ ...p, chips: p.chips - amountToCall }));
    else await context.LorebookManager.updateWorldbook('sp_enemy_data', d => { const e = d.enemies?.find(en => en.name === player_name); if (e) e.chips -= amountToCall; return d; });
    await context.LorebookManager.fetchAllGameData();
}

async function _handleActionCheck(command) {
    Logger.log(`Player ${command.data.player_name} checks.`);
    context.AIGame_History.addGameActionEntry({ actor: command.data.player_name, action: '过牌' });
    await context.LorebookManager.fetchAllGameData();
}

async function _handleActionFold(command) {
    Logger.log(`Player ${command.data.player_name} folds.`);
    context.AIGame_History.addGameActionEntry({ actor: command.data.player_name, action: '弃牌' });
    await context.LorebookManager.fetchAllGameData();
}

async function _handleActionHit(command) {
    const { player_name } = command.data;
    context.AIGame_History.addGameActionEntry({ actor: player_name, action: '要牌' });
    const userPlayerName = await context.SillyTavern_API.getContext().substituteParamsExtended('{{user}}');
    const dealAction = { target: player_name === userPlayerName ? 'player' : 'enemy', name: player_name === userPlayerName ? undefined : player_name, count: 1, visibility: 'public' };
    await _handleGameFunction({ data: { type: '发牌', actions: [dealAction] } });
    Logger.log(`Player ${player_name} hits.`);
}

async function _handleActionShowdown(command) {
    const playerName = command.data?.player_name;
    if (!playerName) return;
    context.AIGame_History.addGameActionEntry({ actor: playerName, action: '摊牌' });
    await context.LorebookManager.updateWorldbook('sp_enemy_data', d => { const e = d.enemies?.find(en => en.name === playerName); if (e?.hand) e.hand.forEach(c => c.visibility = 'public'); return d; });
    await context.LorebookManager.fetchAllGameData();
}

async function _handleActionSwapCards(command) {
    const { swap_type, source, destination, count, card_one, card_two } = command.data;
    if (swap_type === 'random') {
        if (!source || !destination || !count) { Logger.error('Invalid random swap command: missing source, destination, or count.'); return; }
        let sourceCards = _getCardsFromLocation(source);
        let destCards = _getCardsFromLocation(destination);
        if (!sourceCards || !destCards) return;
        const cardsToSwapFromSource = [];
        const cardsToSwapFromDest = [];
        for (let i = 0; i < count; i++) {
            if (sourceCards.length > 0) cardsToSwapFromSource.push(sourceCards.splice(Math.floor(Math.random() * sourceCards.length), 1)[0]);
            if (destCards.length > 0) cardsToSwapFromDest.push(destCards.splice(Math.floor(Math.random() * destCards.length), 1)[0]);
        }
        sourceCards.push(...cardsToSwapFromDest);
        destCards.push(...cardsToSwapFromSource);
        await _updateCardsAtLocation(source, sourceCards);
        await _updateCardsAtLocation(destination, destCards);
    } else if (swap_type === 'specific') {
        if (!card_one || !card_two) { Logger.error('Invalid specific swap command: missing card_one or card_two definitions.'); return; }
        let cards1 = _getCardsFromLocation(card_one);
        let cards2 = _getCardsFromLocation(card_two);
        if (!cards1 || !cards2) return;
        const cardToSwap1 = _selectCards(cards1, card_one.card_filter)[0];
        const cardToSwap2 = _selectCards(cards2, card_two.card_filter)[0];
        if (!cardToSwap1 || !cardToSwap2) { Logger.error('Could not find one or both cards for specific swap.', { card_one, card_two }); return; }
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
    await context.LorebookManager.fetchAllGameData();
    Logger.success(`[Action:SwapCards] processed successfully.`);
}

async function _handleGameUpdateState(command) {
    await context.LorebookManager.updateWorldbook('sp_game_state', (currentState) => ({ ...currentState, ...command.data }));
    await context.LorebookManager.fetchAllGameData();
}

export const AIGame_GameHandler = {
    init: function(ctx) {
        context = ctx;
    },
    
    handleCommand: async function(command) {
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
    gmDrawCards: async function({ target, quantity, visibility, notification = null }) {
        if (!AIGame_State.currentGameState || Object.keys(AIGame_State.currentGameState).length === 0) {
            context.toastr_API.warning("必须在牌局开始后才能使用GM抽牌功能。");
            return;
        }
        if (isNaN(quantity) || quantity <= 0) {
            context.toastr_API.warning("抽牌数量必须是正整数。");
            return;
        }
    
        const actions = [];
        if (target === 'player') {
            actions.push({ target: 'player', count: quantity, visibility });
        } else if (target === 'board') {
            actions.push({ target: 'board', count: quantity, visibility: 'public' });
        } else if (target === 'all_players') {
            actions.push({ target: 'player', count: quantity, visibility });
            (AIGame_State.enemyData.enemies || []).forEach(enemy => {
                actions.push({ target: 'enemy', name: enemy.name, count: quantity, visibility });
            });
        } else { // It's a specific enemy name
            actions.push({ target: 'enemy', name: target, count: quantity, visibility });
        }
    
        await _queueDealForUI(actions);

        if (typeof notification !== 'string' || notification.trim() === '') {
            Logger.log(`GM draw cards executed without AI notification.`);
            return;
        }
        
        const contextBlock = await context.PlayerActionHandler.generateContextBlock(false);
        const prompt = `${notification}${contextBlock}`;
    
        await context.TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(prompt)}`);
        context.SillyTavern_API.getContext().generate();
        Logger.success(`GM draw cards executed with notification: "${notification}"`);
    },
    async playerGoesAllIn() {
        const allInAmount = AIGame_State.playerData.chips;
        if (allInAmount <= 0) {
            context.toastr_API.info("你已经没有筹码了！");
            return;
        }
        await context.PlayerActionHandler.stagePlayerAction({ type: 'bet', amount: allInAmount });
    },
    async attemptEscape() {
        Logger.log('Player attempts to escape...');
        const prompt = `(系统提示：{{user}}尝试从当前的遭遇中逃跑。请根据当前情况（例如对手是谁，当前是否在牌局中）来决定逃跑是否成功，并输出对应的 [Game:End] 或 [Event:Modify] 指令。)`;
        context.toastr_API.info("你的对手正在决定是否让你逃跑...");
        await context.TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(prompt)}`);
        context.SillyTavern_API.getContext().generate();
    },
    async deleteCardFromUI({ location, enemyName, cardIndex }) {
        Logger.log(`GM deleting card at: ${location} [${enemyName || ''}], index ${cardIndex}`);
        const fileToUpdateMap = {
            'player_hand': 'sp_player_cards',
            'enemy_hand': 'sp_enemy_data',
            'board': 'sp_game_state'
        };
    
        const fileToUpdate = fileToUpdateMap[location];
        if (!fileToUpdate) {
            Logger.error(`Invalid location for card deletion: ${location}`);
            return;
        }
    
        const dataUpdater = (data) => {
            let cardArray;
            switch (location) {
                case 'player_hand':
                    cardArray = data.current_hand;
                    break;
                case 'enemy_hand':
                    const enemy = data.enemies?.find(e => e.name === enemyName);
                    if (enemy) cardArray = enemy.hand;
                    break;
                case 'board':
                    cardArray = data.board_cards;
                    break;
            }
    
            if (cardArray && cardArray[cardIndex] !== undefined) {
                cardArray.splice(cardIndex, 1);
            } else {
                Logger.warn(`Card not found for deletion at index ${cardIndex} in ${location}`);
            }
            return data;
        };
    
        await context.LorebookManager.updateWorldbook(fileToUpdate, dataUpdater);
        await context.LorebookManager.fetchAllGameData(); // Refresh UI
        context.toastr_API.success("卡牌已删除。");
    },
};
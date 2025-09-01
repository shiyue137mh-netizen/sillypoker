/**
 * AI Card Table Extension - Game Table Renderer (ES6 Module)
 * @description Generates the HTML string for the casino game table.
 */
import { AIGame_State } from './state.js';
import { AIGame_Config } from '../config.js'; // Import config for emotes
import { Logger } from './logger.js';
import { getChipTier } from '../utils.js';

// No longer needs dependencies after finding the root cause.
export function initRenderer(deps) {
    // This function is now empty but kept to avoid breaking the import in script.js.
}

/**
 * Creates the HTML for a single card, handling different visibility states and adding admin controls.
 * This version now uses a pure CSS approach to render card faces.
 * @param {object} card - Card data, e.g., { suit: '♥', rank: 'A', visibility: 'owner', isNew: true }
 * @param {object} locationInfo - Describes where the card is, e.g., { location: 'player_hand', index: 0, enemyName: '...' }
 * @returns {string} HTML string for the card.
 */
function getCardHTML(card, locationInfo = {}) {
    if (!card) return '';

    const { location, enemyName, index } = locationInfo;

    const isPlayerCard = location === 'player_hand';
    const showFace = (card.visibility === 'public') || (isPlayerCard && card.visibility === 'owner');
    
    const dataAttrs = `
        data-location="${location || ''}" 
        data-index="${index !== undefined ? index : ''}" 
        data-suit="${card.suit || ''}"
        data-rank="${card.rank || ''}"
        ${enemyName ? `data-enemy-name="${enemyName}"` : ''}
    `.trim();

    const deleteButtonHTML = `<div class="card-delete-btn" title="删除这张牌"><i class="fas fa-trash-alt"></i></div>`;
    
    let baseClasses = 'card';
    if (card.isNew) {
        baseClasses += ' newly-dealt';
    }

    if (!showFace) {
        return `<div class="${baseClasses} card-back" ${dataAttrs}>${deleteButtonHTML}</div>`;
    }

    const suitSymbol = { '♥': '♥', '♦': '♦', '♣': '♣', '♠': '♠' }[card.suit] || card.suit;
    const suitColorClass = (card.suit === '♥' || card.suit === '♦') ? 'suit-red' : 'suit-black';
    
    let cardClasses = `${baseClasses} ${suitColorClass}`;
    if (card.is_special) cardClasses += ' special';
    if (card.visibility === 'public') cardClasses += ' revealed';

    if (card.is_special) {
         const jokerText = card.rank === 'Big Joker' ? 'JOKER' : 'JOKER';
         const jokerColorClass = card.rank === 'Big Joker' ? 'suit-red' : 'suit-black';
         return `
            <div class="${baseClasses} ${jokerColorClass}" ${dataAttrs}>
                 ${deleteButtonHTML}
                 <div class="joker-text top-left">${jokerText}</div>
                 <div class="joker-icon">${suitSymbol}</div>
                 <div class="joker-text bottom-right">${jokerText}</div>
            </div>
         `;
    }

    const rankText = card.rank === '10' ? '10' : (card.rank ? card.rank : '?');

    const centralContentHTML = `
        <div class="card-corner top-left">
            <span class="card-corner-rank">${rankText}</span>
            <span class="card-corner-suit">${suitSymbol}</span>
        </div>
        <div class="card-center-suit">${suitSymbol}</div>
        <div class="card-corner bottom-right">
            <span class="card-corner-rank">${rankText}</span>
            <span class="card-corner-suit">${suitSymbol}</span>
        </div>
    `;

    return `
        <div class="${cardClasses}" ${dataAttrs}>
            ${deleteButtonHTML}
            ${centralContentHTML}
        </div>
    `;
}


/**
 * Generates HTML for the list of staged player actions.
 * @param {Array<object>} stagedActions - Array of staged action objects from AIGame_State.
 * @returns {string} The HTML for the staged actions display.
 */
export function getStagedActionsHTML(stagedActions) {
    if (!stagedActions || stagedActions.length === 0) return '';

    const actionsHTML = stagedActions.map(action => {
        let text = '';
        let cardText = (action.cards && action.cards.length > 0) 
            ? ` ${action.cards.map(c => c.suit + c.rank).join(' ')}` 
            : '';

        switch(action.type) {
            case 'bet': text = `下注: ${action.amount}`; break;
            case 'call': text = `跟注: ${action.amount}`; break;
            case 'check': text = '过牌'; break;
            case 'fold': text = `弃牌${cardText}`; break;
            case 'play_cards': text = `出牌${cardText}`; break;
            case 'custom': text = `动作: ${action.text}${cardText}`; break;
            case 'hit': text = '要牌'; break;
            case 'stand': text = '停牌'; break;
            case 'emote': text = `台词: "${action.text.substring(0, 10)}..."`; break;
            case 'narrative': text = `叙述: "${action.text.substring(0, 10)}..."`; break; // NEW
            default: text = action.type;
        }
        return `
            <div class="staged-action-item">
                <span>${text}</span>
                <button class="undo-action-btn" data-action-id="${action.id}" title="撤销此操作">&times;</button>
            </div>
        `;
    }).join('');

    return `${actionsHTML}`; // No surrounding container, it's already in the main template
}

function getActionButtonsHTML(gameState, player) {
    const gameType = gameState?.game_type;
    const isPlayerTurn = gameState?.current_turn === (AIGame_State.currentPlayerName || player?.name);
    const turnStateClass = isPlayerTurn ? 'active-turn' : '';


    // Specific UI for Blackjack
    if (gameType === 'Blackjack') {
        return `
            <div class="action-buttons-wrapper ${turnStateClass}">
                 <div class="action-button-group">
                    <button data-action="bet">下注</button>
                </div>
                <div class="action-button-group">
                    <button data-action="hit">要牌</button>
                    <button data-action="stand">停牌</button>
                </div>
                 <div class="action-button-group">
                    <button data-action="custom">自定义...</button>
                </div>
            </div>
        `;
    }

    // Default layout for Poker-like games
    const allInButtonHTML = `
        <button id="all-in-btn" title="将你所有的筹码全部下注！">
            <span>All In</span>
        </button>
    `;

    // Updated Layout: Betting on the left, Cards/Other on the right
    return `
        <div class="action-buttons-wrapper ${turnStateClass}">
            <div class="action-button-group"> <!-- Betting Actions -->
                ${allInButtonHTML}
                <button data-action="bet">下注</button>
                <button data-action="call">跟注</button>
                <button data-action="check">过牌</button>
            </div>
            <div class="action-button-group"> <!-- Card & Custom Actions -->
                <button data-action="play_cards">出牌</button>
                <button data-action="fold">弃牌</button>
                <button data-action="custom">自定义...</button>
            </div>
        </div>
    `;
}

// New: Function to generate the emote wheel HTML
function getEmoteWheelHTML() {
    const menuItemsHTML = AIGame_Config.EMOTE_LABELS.map((label, index) => `
        <button class="emote-wheel-item" data-index="${index}" title="${AIGame_Config.EMOTE_TEXTS[index]}">
            ${label}
        </button>
    `).join('');

    return `
        <div class="emote-wheel-container">
            <div class="emote-wheel-menu">
                ${menuItemsHTML}
            </div>
            <button class="emote-wheel-button" title="发送表情/台词">
                <i class="fas fa-comment-dots"></i>
            </button>
        </div>
    `;
}


/**
 * Generates the complete HTML for the poker table UI based on game state.
 * @param {object} playerData - The player's public data.
 * @param {object} enemyData - The enemy's public data, contains an 'enemies' array.
 * @param {object | null} gameState - The public state of the current game.
 * @returns {string} The full HTML content for the game table.
 */
export function getGameTableHTML(playerData, enemyData, gameState) {
    const hint = AIGame_State.currentHint;
    const hintHTML = hint ? `<div class="game-hint-bubble">${hint}</div>` : '';

    const playerHand = AIGame_State.playerCards?.current_hand || [];
    const enemies = enemyData?.enemies || [];
    const potAmount = gameState?.pot_amount ?? 0;
    const turnActiveClass = gameState?.current_turn ? 'turn-active' : '';
    const isPlayerTurn = gameState?.current_turn === (AIGame_State.currentPlayerName || playerData?.name);
    const dealerName = gameState?.players?.[gameState.players.length - 1];
    
    // DYNAMIC LAYOUT: Add classes based on hand size.
    let playerHandSizeClass = '';
    if (playerHand.length > 10) playerHandSizeClass = 'xl-hand';
    else if (playerHand.length > 5) playerHandSizeClass = 'large-hand';

    const playerHandClasses = `hand horizontal-hand ${playerHandSizeClass}`;
    const playerHandHTML = playerHand.map((card, i) => getCardHTML(card, { location: 'player_hand', index: i })).join('');

    const playerAreaHTML = `
        <div id="player-area-bottom" class="player-position-container position-bottom ${isPlayerTurn ? 'active-turn' : ''}">
            <div class="player-hand-actions">
                <div class="${playerHandClasses}">${playerHandHTML}</div>
                <div class="staged-actions-container"></div>
                ${getActionButtonsHTML(gameState, playerData)}
                <div class="sillypoker-commit-area hidden" id="sillypoker-commit-area">
                    <button id="sillypoker-undo-all-btn" class="sillypoker-commit-btn-secondary" title="撤销所有操作">
                        <i class="fas fa-undo"></i>
                    </button>
                    <button id="sillypoker-commit-btn" class="sillypoker-commit-btn-primary" title="结束回合">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
            </div>
        </div>
    `;

    const enemyCount = enemies.length;
    let opponentsHTML = '';
    
    const createOpponentHTML = (enemy, positionClass, handLayoutClass, areaId) => {
        const isEnemyTurn = gameState?.current_turn === enemy.name;
        const enemyHand = enemy.hand || [];
        
        let enemyHandSizeClass = '';
        if (enemyHand.length > 10) enemyHandSizeClass = 'xl-hand';
        else if (enemyHand.length > 5) enemyHandSizeClass = 'large-hand';
        
        const enemyHandClasses = `hand ${handLayoutClass} ${enemyHandSizeClass}`;
        const enemyHandHTML = enemyHand.map((card, i) => getCardHTML(card, { location: 'enemy_hand', enemyName: enemy.name, index: i })).join('');
        
        const thinkingIndicator = isEnemyTurn ? '<span class="thinking-indicator"></span>' : '';

        return `
            <div id="${areaId}" class="player-position-container ${positionClass} ${isEnemyTurn ? 'active-turn' : ''}" data-enemy-name="${enemy.name}">
                <div class="opponent-container">
                    <div class="opponent-info">
                        <div class="opponent-name">${dealerName === enemy.name ? '👑' : ''} ${enemy.name}${thinkingIndicator}</div>
                        <div class="opponent-style">${enemy.play_style || '...'}</div>
                        <div class="opponent-chips" data-chip-tier="${getChipTier(enemy.chips)}"><i class="fas fa-coins"></i><span>${(enemy.chips || 0).toLocaleString()}</span></div>
                    </div>
                    <div class="${enemyHandClasses}">${enemyHandHTML}</div>
                </div>
            </div>
        `;
    };
    
    // REFACTORED: Specific logic for opponent counts
    if (enemyCount === 1) {
        opponentsHTML = createOpponentHTML(enemies[0], 'position-top-center', 'horizontal-hand', 'opponent-area-top-center');
    } else if (enemyCount === 2) {
        const opponentGroupHTML = enemies.map((enemy, index) => createOpponentHTML(enemy, '', 'horizontal-hand', `opponent-area-top-${index}`)).join('');
        opponentsHTML = `<div class="opponent-area-container position-top">${opponentGroupHTML}</div>`;
    } else if (enemyCount >= 3) { // Handles 3 and 4 players for now
        opponentsHTML = enemies.slice(0, 3).map((enemy, index) => { // Use slice(0,3) to gracefully handle more than 3 enemies
            let posClass = '', layoutClass = '', areaId = '';
            if (index === 0) { posClass = 'position-left'; layoutClass = 'vertical-hand'; areaId = 'opponent-area-left'; }
            else if (index === 1) { posClass = 'position-top-center'; layoutClass = 'horizontal-hand'; areaId = 'opponent-area-top-center'; }
            else { posClass = 'position-right'; layoutClass = 'vertical-hand'; areaId = 'opponent-area-right'; }
            return createOpponentHTML(enemy, posClass, layoutClass, areaId);
        }).join('');
    }

    const boardCards = gameState?.board_cards || [];
    const boardCardsHTML = boardCards.map((card, i) => getCardHTML(card, { location: 'board', index: i })).join('');
    
    const customWagersHTML = (gameState?.custom_wagers || []).map(wager => `<div class="custom-wager-item">${wager.player}赌上了: <strong>${wager.item}</strong></div>`).join('');
    
    return `
        <div class="game-table-container">
            ${hintHTML}
            <div class="game-table ${turnActiveClass}">
                <div class="felt-surface"></div>
                <div class="deck-placeholder"><i class="fas fa-dice-d20"></i></div>
                <div class="board-area-container">
                    <div id="pot-area" class="pot">
                        <div>彩池</div>
                        <div class="pot-amount" data-chip-tier="${getChipTier(potAmount)}">$${potAmount.toLocaleString()}</div>
                        <div class="custom-wagers-area">${customWagersHTML}</div>
                    </div>
                    <div class="community-cards hand horizontal-hand">${boardCardsHTML}</div>
                </div>
                ${playerAreaHTML}
                ${opponentsHTML}
            </div>
            ${getEmoteWheelHTML()}
            <div class="game-history-container">
                <button class="game-history-button" title="查看游戏历史"><i class="fas fa-history"></i></button>
                <div class="history-panel-overlay"><div class="history-log-list"></div></div>
            </div>
        </div>
    `;
}
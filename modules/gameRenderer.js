/**
 * AI Card Table Extension - Game Table Renderer (ES6 Module)
 * @description Generates the HTML string for the casino game table.
 */
import { AIGame_State } from './state.js';
import { AIGame_Config } from '../config.js'; // Import config for emotes
import { Logger } from './logger.js';

// No longer needs dependencies after finding the root cause.
export function initRenderer(deps) {
    // This function is now empty but kept to avoid breaking the import in script.js.
}

/**
 * Creates the HTML for a single card, handling different visibility states and adding admin controls.
 * This version now uses a pure CSS approach to render card faces.
 * @param {object} card - Card data, e.g., { suit: '♥', rank: 'A', visibility: 'owner' }
 * @param {object} locationInfo - Describes where the card is, e.g., { location: 'player_hand', index: 0, enemyName: '...' }
 * @param {number} animationIndex - The index of the card for animation delay.
 * @returns {string} HTML string for the card.
 */
function getCardHTML(card, locationInfo = {}, animationIndex = 0) {
    if (!card) return '';

    const animationDelay = `${animationIndex * 120}ms`;
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

    // The delete button is now defined once, to be used for both card faces.
    const deleteButtonHTML = `<div class="card-delete-btn" title="删除这张牌"><i class="fas fa-trash-alt"></i></div>`;

    if (!showFace) {
        // BUG FIX: The delete button is now included in the card back's HTML.
        return `<div class="card card-back" style="--animation-delay: ${animationDelay};" ${dataAttrs}>${deleteButtonHTML}</div>`;
    }

    const suitSymbol = { '♥': '♥', '♦': '♦', '♣': '♣', '♠': '♠' }[card.suit] || card.suit;
    const suitColorClass = (card.suit === '♥' || card.suit === '♦') ? 'suit-red' : 'suit-black';
    
    let cardClasses = `card ${suitColorClass}`;
    if (card.is_special) cardClasses += ' special';
    if (card.visibility === 'public') cardClasses += ' revealed';

    // Joker card special handling
    if (card.is_special) {
         const jokerText = card.rank === 'Big Joker' ? 'JOKER' : 'JOKER';
         const jokerColorClass = card.rank === 'Big Joker' ? 'suit-red' : 'suit-black';
         return `
            <div class="card ${jokerColorClass}" style="--animation-delay: ${animationDelay};" ${dataAttrs}>
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
        <div class="${cardClasses}" style="--animation-delay: ${animationDelay};" ${dataAttrs}>
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
            default: text = action.type;
        }
        return `
            <div class="staged-action-item">
                <span>${text}</span>
                <button class="undo-action-btn" data-action-id="${action.id}" title="撤销此操作">&times;</button>
            </div>
        `;
    }).join('');

    return `<div class="staged-actions-container">${actionsHTML}</div>`;
}


function getActionButtonsHTML(gameState) {
    const gameType = gameState?.game_type;

    // Specific UI for Blackjack
    if (gameType === 'Blackjack') {
        return `
            <div class="action-buttons-wrapper">
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
        <div class="action-buttons-wrapper">
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
    Logger.log('Rendering Game Table with multi-opponent support.', { enemyData });
    
    const hint = AIGame_State.currentHint;
    const hintHTML = hint ? `<div class="game-hint-bubble">${hint}</div>` : '';

    const playerHand = AIGame_State.playerCards?.current_hand || [];
    const enemies = enemyData?.enemies || [];
    const userPlayerName = playerData?.name || '{{user}}';
    const potAmount = gameState?.pot_amount ?? 0;
    const turnActiveClass = gameState?.current_turn ? 'turn-active' : '';
    
    let cardAnimationIndex = 0;

    // --- Player Area (always at the bottom) ---
    const isPlayerTurn = gameState?.current_turn === userPlayerName;
    const playerHandClasses = `hand horizontal-hand ${playerHand.length > 5 ? 'large-hand' : ''}`;
    const playerHandHTML = playerHand.map((card, i) => getCardHTML(card, { location: 'player_hand', index: i }, cardAnimationIndex++)).join('');
    const playerAreaHTML = `
        <div id="player-area-bottom" class="player-position-container position-bottom ${isPlayerTurn ? 'active-turn' : ''}">
            <div class="player-hand-actions">
                <div class="${playerHandClasses}">${playerHandHTML}</div>
                <div class="staged-actions-container"></div>
                ${getActionButtonsHTML(gameState)}
            </div>
        </div>
    `;

    // --- Opponent Areas (dynamically positioned) ---
    const enemyCount = enemies.length;
    let opponentsHTML = '';

    const createOpponentHTML = (enemy, positionClass, handLayoutClass, areaId, index) => {
        const isEnemyTurn = gameState?.current_turn === enemy.name;
        const enemyHand = enemy.hand || [];
        const enemyHandClasses = `hand ${handLayoutClass} ${enemyHand.length > 5 ? 'large-hand' : ''}`;
        const enemyHandHTML = enemyHand.map((card, i) => getCardHTML(card, { location: 'enemy_hand', enemyName: enemy.name, index: i }, cardAnimationIndex++)).join('');
        const thinkingIndicator = isEnemyTurn ? '<span class="thinking-indicator"></span>' : '';

        return `
            <div id="${areaId}" class="player-position-container ${positionClass} ${isEnemyTurn ? 'active-turn' : ''}" data-enemy-name="${enemy.name}">
                <div class="opponent-container">
                    <div class="opponent-info">
                        <div class="opponent-name">${enemy.name || 'Opponent'}${thinkingIndicator}</div>
                        <div class="opponent-style">${enemy.play_style || '...'}</div>
                        <div class="opponent-chips">
                            <i class="fas fa-coins"></i>
                            <span>${enemy.chips?.toLocaleString() || '0'}</span>
                        </div>
                    </div>
                    <div class="${enemyHandClasses}">${enemyHandHTML}</div>
                </div>
            </div>
        `;
    };

    if (enemyCount > 0 && enemyCount <= 2) {
        const opponentGroupHTML = enemies.map((enemy, index) => {
             return createOpponentHTML(enemy, '', 'horizontal-hand', `opponent-area-top-${index}`, index);
        }).join('');
        opponentsHTML = `<div class="opponent-area-container position-top">${opponentGroupHTML}</div>`;
    
    } else if (enemyCount >= 3) {
        opponentsHTML = enemies.map((enemy, index) => {
            let positionClass = '', handLayoutClass = '', areaId = '';
            switch(index) {
                case 0: 
                    positionClass = 'position-left'; handLayoutClass = 'vertical-hand'; areaId = 'opponent-area-left'; break;
                case 1:
                    positionClass = 'position-top-center'; handLayoutClass = 'horizontal-hand'; areaId = 'opponent-area-top-center'; break;
                default:
                case 2:
                    positionClass = 'position-right'; handLayoutClass = 'vertical-hand'; areaId = 'opponent-area-right'; break;
            }
             return createOpponentHTML(enemy, positionClass, handLayoutClass, areaId, index);
        }).join('');
    }


    // --- Central Board Area ---
    const boardCards = gameState?.board_cards || [];
    const boardCardsHTML = boardCards.map((card, i) => getCardHTML(card, { location: 'board', index: i }, cardAnimationIndex++)).join('');
    const customWagers = gameState?.custom_wagers || [];
    const customWagersHTML = customWagers.map(wager => `
        <div class="custom-wager-item">${wager.player} 赌上了: <strong>${wager.item}</strong></div>
    `).join('');
    
    // --- Final Assembly ---
    return `
        <div class="game-table-container">
            ${hintHTML}
            <div class="game-table ${turnActiveClass}">
                <div class="felt-surface"></div>
                <div class="deck-placeholder"><i class="fas fa-dice-d20"></i></div>
                
                <div class="board-area-container">
                    <div id="pot-area" class="pot">
                        <div>彩池</div>
                        <div class="pot-amount">$${potAmount.toLocaleString()}</div>
                        <div class="custom-wagers-area">${customWagersHTML}</div>
                    </div>
                    <div class="community-cards hand horizontal-hand">${boardCardsHTML}</div>
                </div>

                ${playerAreaHTML}
                ${opponentsHTML}
            </div>
            ${getEmoteWheelHTML()}
        </div>
    `;
}
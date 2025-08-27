/**
 * AI Card Table Extension - Game Table Renderer (ES6 Module)
 * @description Generates the HTML string for the casino game table.
 */
import { getPlayerInventoryHTML } from './components/PlayerStatus.js';
import { AIGame_State } from './state.js';
import { Logger } from './logger.js';

/**
 * Creates the HTML for a single card, handling different visibility states based on context.
 * @param {object} card - Card data, e.g., { suit: '♥', rank: 'A', visibility: 'owner' }
 * @param {boolean} isPlayerCard - Flag to indicate if the card belongs to the player (the viewer).
 * @param {number} index - The index of the card in its container, used for animation delay.
 * @returns {string} HTML string for the card.
 */
function getCardHTML(card, isPlayerCard = false, index = 0) {
    if (!card) return '';
    
    const animationDelay = `${index * 60}ms`; // Staggered animation delay

    const showFace = (card.visibility === 'public') || (isPlayerCard && card.visibility === 'owner');

    if (!showFace) {
        return `<div class="card card-back" style="--animation-delay: ${animationDelay};"></div>`;
    }

    const suitSymbol = { '♥': '♥', '♦': '♦', '♣': '♣', '♠': '♠' }[card.suit] || card.suit;
    let cardClasses = 'card';
    if (card.is_special) cardClasses += ' special';
    if (card.visibility === 'public') cardClasses += ' revealed';

    return `
        <div class="${cardClasses}" data-suit="${suitSymbol}" style="--animation-delay: ${animationDelay};">
            <span class="card-rank">${card.rank}</span>
            <span class="card-suit">${suitSymbol}</span>
        </div>
    `;
}

function getActionButtonsHTML(gameState) {
    const gameType = gameState?.game_type;

    if (gameType === 'Blackjack') {
        return `
            <button data-action="hit">要牌</button>
            <button data-action="stand">停牌</button>
            <button data-action="custom">自定义...</button>
        `;
    }

    // Default buttons for TexasHoldem and other games
    return `
        <button data-action="bet">下注</button>
        <button data-action="check">过牌</button>
        <button data-action="fold">弃牌</button>
        <button data-action="play_cards">出牌</button>
        <button data-action="custom">自定义...</button>
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
    
    const playerHand = AIGame_State.playerCards?.current_hand || [];
    const enemies = enemyData?.enemies || [];
    const userPlayerName = playerData?.name || '{{user}}';
    const inventoryVisibleClass = AIGame_State.isInventoryVisible ? 'inventory-visible' : '';
    const potAmount = gameState?.pot_amount ?? 0;

    let cardAnimationIndex = 0;

    // --- Player Area (always at the bottom) ---
    const isPlayerTurn = gameState?.current_turn === userPlayerName;
    const playerHandClasses = `hand horizontal-hand ${playerHand.length > 5 ? 'large-hand' : ''}`;
    const playerHandHTML = playerHand.map((card, i) => getCardHTML(card, true, cardAnimationIndex++)).join('');
    const playerAreaHTML = `
        <div class="player-position-container position-bottom ${isPlayerTurn ? 'active-turn' : ''}">
            <div class="player-hand-actions">
                <div class="${playerHandClasses}">${playerHandHTML}</div>
                <div class="action-buttons">${getActionButtonsHTML(gameState)}</div>
            </div>
        </div>
    `;

    // --- Opponent Areas (dynamically positioned) ---
    const enemyCount = enemies.length;
    let opponentsHTML;

    if (enemyCount > 0 && enemyCount <= 2) {
        const opponentGroupHTML = enemies.map(enemy => {
            const isEnemyTurn = gameState?.current_turn === enemy.name;
            const enemyHand = enemy.hand || [];
            const enemyHandClasses = `hand horizontal-hand ${enemyHand.length > 5 ? 'large-hand' : ''}`;
            const enemyHandHTML = enemyHand.map((card, i) => getCardHTML(card, false, cardAnimationIndex++)).join('');

            return `
                <div class="player-position-container ${isEnemyTurn ? 'active-turn' : ''}">
                    <div class="opponent-container">
                        <div class="opponent-info">
                            <div class="opponent-name">${enemy.name || 'Opponent'}</div>
                            <div class="opponent-style">${enemy.play_style || '...'}</div>
                        </div>
                        <div class="${enemyHandClasses}">${enemyHandHTML}</div>
                    </div>
                </div>
            `;
        }).join('');
        opponentsHTML = `<div class="opponent-area-container position-top">${opponentGroupHTML}</div>`;
    
    } else if (enemyCount >= 3) {
        opponentsHTML = enemies.map((enemy, index) => {
            let positionClass = '';
            let handLayoutClass = 'horizontal-hand';

            switch(index) {
                case 0: 
                    positionClass = 'position-left';
                    handLayoutClass = 'vertical-hand';
                    break;
                case 1:
                    positionClass = 'position-top-center';
                    break;
                default:
                case 2:
                    positionClass = 'position-right';
                    handLayoutClass = 'vertical-hand';
                    break;
            }

            const isEnemyTurn = gameState?.current_turn === enemy.name;
            const enemyHand = enemy.hand || [];
            const enemyHandClasses = `hand ${handLayoutClass} ${enemyHand.length > 5 ? 'large-hand' : ''}`;
            const enemyHandHTML = enemyHand.map((card, i) => getCardHTML(card, false, cardAnimationIndex++)).join('');

            return `
                <div class="player-position-container ${positionClass} ${isEnemyTurn ? 'active-turn' : ''}">
                    <div class="opponent-container">
                        <div class="opponent-info">
                            <div class="opponent-name">${enemy.name || 'Opponent'}</div>
                            <div class="opponent-style">${enemy.play_style || '...'}</div>
                        </div>
                        <div class="${enemyHandClasses}">${enemyHandHTML}</div>
                    </div>
                </div>
            `;
        }).join('');
    }


    // --- Central Board Area ---
    const boardCards = gameState?.board_cards || [];
    const boardCardsHTML = boardCards.map((card, i) => getCardHTML(card, false, cardAnimationIndex++)).join('');
    const customWagers = gameState?.custom_wagers || [];
    const customWagersHTML = customWagers.map(wager => `
        <div class="custom-wager-item">${wager.player} 赌上了: <strong>${wager.item}</strong></div>
    `).join('');
    
    // --- Final Assembly ---
    return `
        <div class="game-table-container ${inventoryVisibleClass}">
            <div class="game-table">
                <div class="felt-surface"></div>
                <div class="deck-placeholder"><i class="fas fa-dice-d20"></i></div>
                
                <div class="board-area-container">
                    <div class="pot">
                        <div>彩池</div>
                        <div class="pot-amount">$${potAmount.toLocaleString()}</div>
                        <div class="custom-wagers-area">${customWagersHTML}</div>
                    </div>
                    <div class="community-cards hand horizontal-hand">${boardCardsHTML}</div>
                </div>

                ${playerAreaHTML}
                ${opponentsHTML}
            </div>
            ${getPlayerInventoryHTML(playerData.inventory || [])}
            <button class="inventory-toggle-btn" title="切换道具栏"><i class="fas fa-chevron-left"></i></button>
        </div>
    `;
}
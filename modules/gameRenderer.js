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
 * @returns {string} HTML string for the card.
 */
function getCardHTML(card, isPlayerCard = false) {
    if (!card) return '';

    // Determine if the card's face should be shown to the current viewer.
    // A card's face is shown if:
    // 1. Its visibility is 'public' (e.g., community cards).
    // 2. The viewer is the owner (`isPlayerCard` is true) AND its visibility is 'owner'.
    const showFace = (card.visibility === 'public') || (isPlayerCard && card.visibility === 'owner');

    if (!showFace) {
        // For all other cases (e.g., opponent's 'owner' card, anyone's 'hidden' card), show the card back.
        return '<div class="card card-back"></div>';
    }

    // --- Render the face-up card ---
    const suitSymbol = { '♥': '♥', '♦': '♦', '♣': '♣', '♠': '♠' }[card.suit] || card.suit;
    let cardClasses = 'card';
    if (card.is_special) cardClasses += ' special';
    
    // Add a 'revealed' class for special styling if the card is public (e.g., turned over in a showdown).
    if (card.visibility === 'public') {
        cardClasses += ' revealed';
    }

    return `
        <div class="${cardClasses}" data-suit="${suitSymbol}">
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

    const opponentsHTML = enemies.map(enemy => {
        const isEnemyTurn = gameState?.current_turn === enemy.name;
        const enemyHandHTML = (enemy.hand || []).map(card => getCardHTML(card, false)).join('');

        return `
            <div class="opponent-container ${isEnemyTurn ? 'active-turn' : ''}">
                <div class="opponent-info">
                    <div class="opponent-name">${enemy.name || 'Opponent'}</div>
                    <div class="opponent-style">${enemy.play_style || '...'}</div>
                </div>
                <div class="hand opponent-hand">
                    ${enemyHandHTML}
                </div>
            </div>
        `;
    }).join('');

    const playerHandHTML = playerHand.map(card => getCardHTML(card, true)).join('');
    const boardCardsHTML = (gameState?.board_cards || []).map(card => getCardHTML(card, false)).join('');
    const customWagers = gameState?.custom_wagers || [];
    const customWagersHTML = customWagers.map(wager => `
        <div class="custom-wager-item">${wager.player} 赌上了: <strong>${wager.item}</strong></div>
    `).join('');


    const inventoryVisibleClass = AIGame_State.isInventoryVisible ? 'inventory-visible' : '';
    
    const potAmount = gameState?.pot_amount ?? 0;
    const isPlayerTurn = gameState?.current_turn === userPlayerName;

    return `
        <div class="game-table-container ${inventoryVisibleClass}">
            <div class="game-table">
                <div class="felt-surface"></div>
                
                <div class="game-area opponent-area">
                    ${opponentsHTML}
                </div>

                <div class="game-area board-area">
                    <div class="pot">
                        <div>彩池</div>
                        <div class="pot-amount">$${potAmount.toLocaleString()}</div>
                    </div>
                    <div class="custom-wagers-area">
                        ${customWagersHTML}
                    </div>
                    <div class="community-cards">
                        ${boardCardsHTML}
                    </div>
                </div>

                <div class="game-area player-area ${isPlayerTurn ? 'active-turn' : ''}">
                    <div class="player-hand-actions">
                        <div class="hand">
                            ${playerHandHTML}
                        </div>
                        <div class="action-buttons">
                            ${getActionButtonsHTML(gameState)}
                        </div>
                    </div>
                </div>
            </div>
            ${getPlayerInventoryHTML(playerData.inventory || [])}
            <button class="inventory-toggle-btn" title="切换道具栏"><i class="fas fa-chevron-left"></i></button>
        </div>
    `;
}
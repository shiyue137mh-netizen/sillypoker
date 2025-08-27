/**
 * AI Card Table Extension - Player Status UI Component
 * @description Generates the HTML for the player's status displays (HUD and Inventory).
 */

function getHealthHTML(health, max_health) {
    let hearts = '';
    for (let i = 0; i < max_health; i++) {
        const isFilled = i < health;
        hearts += `
            <svg class="heart-icon ${isFilled ? 'filled' : 'empty'}" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
        `;
    }
    return `<div class="health-display" title="生命值: ${health}/${max_health}">${hearts}</div>`;
}

function getChipsHTML(chips) {
    return `
        <div class="chips-display" title="筹码">
            <i class="fas fa-coins"></i>
            <span>${chips.toLocaleString()}</span>
        </div>
    `;
}

/**
 * Generates the HTML for the player's inventory panel.
 * @param {Array} inventory - The player's inventory items.
 * @returns {string} HTML for the inventory.
 */
export function getPlayerInventoryHTML(inventory) {
    let itemsHTML = '';
    for (let i = 0; i < 6; i++) { // Assuming 6 inventory slots for now
        const item = inventory[i];
        if (item) {
            itemsHTML += `
                <div class="inventory-item" title="${item.name}: ${item.description}">
                    <i class="fas fa-question"></i> <!-- Placeholder icon -->
                </div>
            `;
        } else {
            itemsHTML += '<div class="inventory-item empty"></div>';
        }
    }

    return `
        <div class="inventory-panel">
            <div class="inventory-header">道具</div>
            <div class="inventory-grid">${itemsHTML}</div>
        </div>
    `;
}

/**
 * Generates the HTML for the player's heads-up display (health and chips).
 * @param {object} playerData - The player's public data object.
 * @returns {string} HTML for the HUD.
 */
export function getPlayerHUDHTML(playerData) {
    return `
        <div class="player-hud">
            ${getHealthHTML(playerData.health, playerData.max_health)}
            ${getChipsHTML(playerData.chips)}
        </div>
    `;
}

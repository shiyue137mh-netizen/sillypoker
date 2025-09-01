/**
 * AI Card Table Extension - Player Status UI Component
 * @description Generates the HTML for the player's status displays (HUD and Inventory).
 */
import { getChipTier } from '../utils.js';

function getHealthHTML(health, max_health) {
    let hearts = '';
    for (let i = 0; i < max_health; i++) {
        const type = i < health ? 'filled' : 'empty';
        hearts += `
            <svg class="heart-icon ${type}" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
        `;
    }
    return `<div class="health-display">${hearts}</div>`;
}

function getStatusEffectsHTML(statusEffects) {
    if (!statusEffects || statusEffects.length === 0) return '';
    const effectsHTML = statusEffects.map(effect => {
        const title = `${effect.name}\n\n${effect.description}\n\n剩余回合: ${effect.duration}`;
        const icon = effect.icon || '❓';
        return `<div class="status-effect-icon" title="${title}">${icon}</div>`;
    }).join('');
    return `<div class="status-effects-display">${effectsHTML}</div>`;
}


export function getPlayerHUDHTML(playerData, gameState) {
    if (!playerData) return '';
    const health = playerData.health ?? 0;
    const max_health = playerData.max_health ?? 0;
    const chips = playerData.chips ?? 0;
    const claimablePot = playerData.claimable_pot || 0;
    const statusEffects = playerData.status_effects || [];
    const chipTier = getChipTier(chips);

    const gameTypeHTML = gameState?.game_type ? `<div class="game-type-display">${gameState.game_type}</div>` : '';

    let claimPotHTML = '';
    if (claimablePot > 0) {
        claimPotHTML = `
            <button id="claim-pot-btn" class="claim-pot-btn" title="点击领取 ${claimablePot.toLocaleString()} 筹码">
                <i class="fas fa-treasure-chest"></i>
                <span>+${claimablePot.toLocaleString()}</span>
            </button>
        `;
    }

    return `
        <div class="player-hud">
            ${gameTypeHTML}
            ${getHealthHTML(health, max_health)}
            <div class="chips-display" data-chip-tier="${chipTier}">
                <i class="fas fa-coins"></i>
                <span>${chips.toLocaleString()}</span>
            </div>
            ${claimPotHTML}
            ${getStatusEffectsHTML(statusEffects)}
        </div>
    `;
}

export function getPlayerInventoryHTML(inventory) {
    let itemsHTML = '';
    if (inventory && inventory.length > 0) {
        inventory.forEach((item, i) => {
            const title = `${item.name}\n\n${item.description}\n\n类型: ${item.type === 'active' ? '主动' : '被动'}`;
            itemsHTML += `<div class="inventory-item" data-index="${i}" title="${title}">${item.icon || '？'}</div>`;
        });
    } else {
        itemsHTML = '<div class="inventory-item empty">无道具</div>';
    }
    return `<div class="inventory-panel">${itemsHTML}</div>`;
}
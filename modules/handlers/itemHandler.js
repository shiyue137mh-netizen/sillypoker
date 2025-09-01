/**
 * AI Card Table Extension - Item Handler
 * @description Handles all logic related to creating and using items.
 */
import { Logger } from '../logger.js';
import { AIGame_State } from '../state.js';

let context; // To hold shared functions and dependencies

async function _removeItemFromInventory(itemIndex) {
    await context.LorebookManager.updateWorldbook('sp_player_data', p => {
        if (p.inventory && p.inventory[itemIndex]) {
            p.inventory.splice(itemIndex, 1);
        }
        return p;
    });
}

export const AIGame_ItemHandler = {
    init: function(ctx) {
        context = ctx;
        Logger.log('ItemHandler initialized.');
    },

    async handleCommand(command) {
        // AI-driven item commands are handled via [Event:Modify], this function is for potential future use.
        Logger.warn(`ItemHandler received command, but this path is deprecated:`, command);
        context.toastr_API.info("道具系统已更新，请通过[Event:Modify]管理道具。");
    },

    /**
     * Handles the logic when a player clicks to use an item from their inventory.
     * @param {number} itemIndex The index of the item in the player's inventory.
     */
    async useItem(itemIndex) {
        const item = AIGame_State.playerData?.inventory?.[itemIndex];
        if (!item) {
            Logger.error(`Attempted to use an invalid item at index ${itemIndex}.`);
            return;
        }

        // NEW: If a passive item is clicked, send a reminder prompt to the AI.
        if (item.type === 'passive') {
            const prompt = `(系统提示：玩家点击了被动道具 [名称: ${item.name}, 描述: ${item.description}]，提醒AI其效果正在生效。)`;
            await context.TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(prompt)}`);
            context.SillyTavern_API.getContext().generate();
            context.toastr_API.info(`已提醒AI [${item.name}] 的被动效果。`);
            Logger.log(`Reminded AI of passive item:`, item);
            return; // End the function here for passive items.
        }

        // Original logic for 'active' items continues below.
        const confirmResult = await context.SillyTavern_API.getContext().callGenericPopup(
            `你确定要使用 **${item.name}** 吗？\n\n*效果: ${item.description}*`,
            context.SillyTavern_API.getContext().POPUP_TYPE.CONFIRM,
            '', 
            { title: '使用道具' }
        );

        if (!confirmResult) {
            Logger.log(`Player cancelled using item "${item.name}".`);
            return;
        }

        Logger.log(`Player confirmed using item:`, item);

        // V2 Architecture: Check for the legacy `function` field for complex, client-side interactions.
        // Most items will not have this and will instead prompt the AI.
        if (item.function) {
            // Reserved for future, complex client-side functions (e.g., targeting a card)
            Logger.warn(`Item effect "${item.function.effect}" is not yet implemented.`);
            context.toastr_API.info(`道具效果 "${item.function.effect}" 尚未实现。`);
        } 
        else {
            // New standard flow: Prompt the AI to resolve the item's effect.
            const prompt = `(系统提示：{{user}}使用了道具 [名称: ${item.name}, 描述: ${item.description}])`;
            await context.TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(prompt)}`);
            context.SillyTavern_API.getContext().generate();
            context.toastr_API.info(`你使用了 [${item.name}]... AI正在处理效果。`);
        }

        // Active items are single-use, so remove after prompting/executing.
        if (item.type === 'active') {
            await _removeItemFromInventory(itemIndex);
        }

        // Refresh the entire game state to ensure UI is consistent.
        await context.LorebookManager.fetchAllGameData();
    }
};
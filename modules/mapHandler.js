

/**
 * AI Card Table Extension - Map Handler
 * @description Handles all logic related to the game map, like navigation and saving.
 */
import { Logger } from './logger.js';
import { AIGame_State } from './state.js';

let context; // To hold shared functions and dependencies

export const AIGame_MapHandler = {
    init: function(ctx) {
        context = ctx;
    },

    async saveMapData() {
        if (!AIGame_State.mapData) {
            context.toastr_API.error("没有地图数据可保存。");
            return;
        }
        AIGame_State.mapData.is_saved = true;
        await context.updateWorldbook('sp_map_data', () => AIGame_State.mapData);
        context.toastr_API.success("地图数据已保存！");
        context.UI.renderActiveTabContent();
    },

    async travelToNode(nodeId, nodeType) {
        // 1. Update map data in worldbook
        await context.updateWorldbook('sp_map_data', (mapData) => {
            mapData.player_position = nodeId;
            if (!mapData.path_taken) mapData.path_taken = [];
            mapData.path_taken.push(nodeId);
            return mapData;
        });

        // 2. Format prompt
        const nodeTypeTranslations = {
            enemy: '普通敌人',
            elite: '精英敌人',
            shop: '商店',
            rest: '休息处',
            boss: '首领',
            event: '随机事件'
        };
        const translatedType = nodeTypeTranslations[nodeType] || nodeType;
        const prompt = `(系统提示：{{user}}移动到了一个 ${translatedType} 节点。)`;

        // 3. Send to AI
        await context.TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(prompt)}`);
        context.SillyTavern_Context_API.generate();

        // 4. Update UI: Fetch data, switch view
        AIGame_State.currentActiveTab = 'game-ui';
        AIGame_State.selectedMapNodeId = null; // Clear selection after moving
        await context.fetchAllGameData(); // This will trigger a re-render of the correct tab
    }
};
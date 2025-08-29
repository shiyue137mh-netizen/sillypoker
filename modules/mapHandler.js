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
        context.AudioManager_API.play('click1');
        // 1. Update map data in worldbook
        await context.updateWorldbook('sp_map_data', (mapData) => {
            mapData.player_position = nodeId;
            if (!mapData.path_taken) mapData.path_taken = [];
            mapData.path_taken.push(nodeId);
            return mapData;
        });

        // 2. Format prompt with translation
        const nodeTypeTranslations = {
            enemy: '普通敌人',
            elite: '精英敌人',
            shop: '商店',
            rest: '休息处',
            boss: '首领',
            event: '随机事件',
            treasure: '宝箱',
            'card-sharp': '千术师的牌桌',
            angel: '天使房',
            devil: '恶魔房'
        };
        const translatedType = nodeTypeTranslations[nodeType] || nodeType;
        const prompt = `({{user}}移动到了一个 ${translatedType} 节点。)`;

        // 3. Send to AI
        await context.TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(prompt)}`);
        context.SillyTavern_API.getContext().generate();

        // 4. Update UI: Fetch data, switch view
        AIGame_State.currentActiveTab = 'game-ui';
        AIGame_State.selectedMapNodeId = null; // Clear selection after moving
        await context.fetchAllGameData(); // This will trigger a re-render of the correct tab
    },

    async findSecretRoom() {
        const CHIP_COST = 200;
        const mapData = AIGame_State.mapData;
        const currentPositionId = mapData?.player_position;

        if (!currentPositionId) {
            Logger.warn("Cannot find secret room, player position is unknown.");
            return;
        }

        // Check if this node has already been searched
        if (mapData.searched_nodes?.includes(currentPositionId)) {
            context.toastr_API.info("你已经在这个地方寻找过了。");
            return;
        }
        
        if (AIGame_State.playerData.chips < CHIP_COST) {
            context.toastr_API.warning(`筹码不足，需要 ${CHIP_COST} 才能寻找密室。`);
            return;
        }

        // Deduct chips and update worldbook
        await context.updateWorldbook('sp_player_data', p => {
            p.chips -= CHIP_COST;
            return p;
        });
        // Also update local state for immediate UI feedback
        AIGame_State.playerData.chips -= CHIP_COST;
        context.UI.rerenderPlayerHUD();

        // Mark the current node as searched and update worldbook
        await context.updateWorldbook('sp_map_data', m => {
            if (!m.searched_nodes) m.searched_nodes = [];
            m.searched_nodes.push(currentPositionId);
            return m;
        });
        // Update local state for immediate UI feedback (disabling the button)
        if (!AIGame_State.mapData.searched_nodes) AIGame_State.mapData.searched_nodes = [];
        AIGame_State.mapData.searched_nodes.push(currentPositionId);
        context.UI.renderActiveTabContent();


        const secretNode = AIGame_State.mapData?.secret_nodes?.find(
            sn => sn.attached_to_node_id === currentPositionId
        );
        
        let prompt;
        if (secretNode) {
            const roomType = secretNode.type === 'super_hidden' ? '一个超级隐藏房' : '一个隐藏房';
            prompt = `({{user}}花费200筹码寻找密室... {{user}}发现了一个隐藏的入口！这是一个${roomType}。)`;
            context.toastr_API.success("你发现了一个秘密！");
        } else {
            prompt = `({{user}}花费200筹码寻找密室... 但什么也没发现。)`;
            context.toastr_API.info("这里似乎什么都没有...");
        }

        await context.TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(prompt)}`);
        context.SillyTavern_API.getContext().generate();
    }
};
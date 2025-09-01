/**
 * AI Card Table Extension - Map Handler (NEW MODULE)
 * @description Handles all logic related to map modification commands like [Map:Modify].
 */
import { Logger } from '../logger.js';
import { AIGame_State } from '../state.js';

let context; // To hold shared functions and dependencies from dataHandler

async function travelToNode(nodeId, nodeType) {
    if (!nodeId) return;

    Logger.log(`Player traveling to node: ${nodeId} (Type: ${nodeType})`);
    context.AIGame_History.addMapEntry({ destination: nodeType });


    // Update map data in world book
    await context.LorebookManager.updateWorldbook('sp_map_data', (mapData) => {
        if (!mapData) return {};
        mapData.player_position = nodeId;
        if (!mapData.path_taken) mapData.path_taken = [];
        if (!mapData.path_taken.includes(nodeId)) {
            mapData.path_taken.push(nodeId);
        }
        return mapData;
    });

    // REBUILT: Now sends a full context block to the AI for better encounters.
    const { mapData, playerData } = AIGame_State;
    let contextLines = [];
    if (mapData && mapData.nodes) {
        const playerNode = mapData.nodes.find(n => n.id === nodeId);
        contextLines.push(`map_floor: ${mapData.mapLayer + 1}`);
        contextLines.push(`map_node_type: ${nodeType}`);
        
        if (playerNode) {
            contextLines.push(`map_node_id: ${playerNode.id}`);
            if (playerNode.properties && playerNode.properties.length > 0) {
                contextLines.push(`room_properties: [${playerNode.properties.join(', ')}]`);
            }
            // FIX: Correctly filter nodes before mapping to get rows, preventing the ReferenceError.
            const relevantNodes = mapData.nodes.filter(n => n.row !== undefined && n.type !== 'boss');
            const totalRows = relevantNodes.length > 0 ? Math.max(...relevantNodes.map(n => n.row)) : 0;
            
            if (totalRows > 0 && playerNode.row !== undefined) {
                 contextLines.push(`map_progress: ${Math.round((playerNode.row / totalRows) * 100)}%`);
            }
        }
    }
    if (playerData) {
        contextLines.push(`player_health: ${playerData.health}`);
        contextLines.push(`player_chips: ${playerData.chips}`);
    }

    const contextBlock = contextLines.length > 0 ? `{{newline}}<context>{{newline}}${contextLines.join('{{newline}}')}{{newline}}</context>` : '';
    const prompt = `({{user}}移动到了一个 ${nodeType} 节点。)${contextBlock}`;


    await context.TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(prompt)}`);
    context.SillyTavern_API.getContext().generate();

    // Update local state and UI
    AIGame_State.currentActiveTab = 'game-ui';
    await context.LorebookManager.fetchAllGameData();
}

async function findSecretRoom() {
    const searchCost = 200;
    if (AIGame_State.playerData.chips < searchCost) {
        context.toastr_API.warning(`筹码不足，需要 ${searchCost} 才能查找。`);
        return;
    }

    const currentPlayerNodeId = AIGame_State.mapData?.player_position;
    if (!currentPlayerNodeId) {
        Logger.warn('Cannot find secret room, player position is unknown.');
        return;
    }

    if (AIGame_State.mapData.searched_nodes?.includes(currentPlayerNodeId)) {
        context.toastr_API.info('你已经在这个房间里搜索过了。');
        return;
    }

    // Deduct chips and mark node as searched
    await context.LorebookManager.updateWorldbook('sp_player_data', p => {
        p.chips -= searchCost;
        return p;
    });
    await context.LorebookManager.updateWorldbook('sp_map_data', m => {
        if (!m.searched_nodes) m.searched_nodes = [];
        m.searched_nodes.push(currentPlayerNodeId);
        return m;
    });
    
    context.toastr_API.info(`花费了 ${searchCost} 筹码进行搜索...`);

    const undiscoveredSecretNode = AIGame_State.mapData.secret_nodes.find(
        sn => sn.attached_to_node_id === currentPlayerNodeId && !sn.discovered
    );
    
    let prompt;

    if (undiscoveredSecretNode) {
        Logger.success('Secret room found!', undiscoveredSecretNode);
        await context.LorebookManager.updateWorldbook('sp_map_data', m => {
            const secret = m.secret_nodes.find(sn => sn.id === undiscoveredSecretNode.id);
            if (secret) {
                secret.discovered = true;
            }
            return m;
        });
        
        const parentNode = AIGame_State.mapData.nodes.find(n => n.id === currentPlayerNodeId);
        context.UI.animateNodeReveal(undiscoveredSecretNode, parentNode);

        prompt = `(系统提示：{{user}}在当前房间发现了一个隐藏的门！AI需要根据发现的房间类型（${undiscoveredSecretNode.type}）生成相应的遭遇或奖励。)`;
    } else {
        Logger.log('No secret room found at this location.');
        prompt = `(系统提示：{{user}}仔细搜索了当前房间，但什么也没发现。)`;
    }
    
    await context.TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(prompt)}`);
    context.SillyTavern_API.getContext().generate();
    await context.LorebookManager.fetchAllGameData();
}

async function saveMapData() {
    await context.LorebookManager.updateWorldbook('sp_map_data', (mapData) => {
        if (mapData) mapData.is_saved = true;
        return mapData;
    });
    context.toastr_API.success("当前地图布局已保存。");
    await context.LorebookManager.fetchAllGameData();
}


/**
 * Handles the [Map:Modify] command with complex filtering and selection logic.
 * @param {object} command - The parsed command object.
 */
async function _handleMapModify(command) {
    const { target_filter, modification, effect_description } = command.data;
    if (!target_filter || !modification || !effect_description) {
        Logger.error('Invalid [Map:Modify] command: missing required data fields.', command.data);
        return;
    }

    let modificationApplied = false;

    await context.LorebookManager.updateWorldbook('sp_map_data', (mapData) => {
        if (!mapData || !mapData.nodes) {
            Logger.warn('Cannot modify map, no map data found.');
            return mapData;
        }

        const { nodes, player_position, path_taken } = mapData;
        const playerNode = nodes.find(n => n.id === player_position);
        const pathTakenSet = new Set(path_taken || []);

        // 1. Initial Filtering (Type and visited status)
        const filterTypes = Array.isArray(target_filter.type) ? target_filter.type : [target_filter.type];
        let candidates = nodes.filter(node =>
            filterTypes.includes(node.type) && !pathTakenSet.has(node.id) && node.id !== player_position
        );

        // 2. Scope Filtering
        const reachableNodeIds = new Set(playerNode?.connections || []);
        switch (target_filter.scope) {
            case 'reachable':
                candidates = candidates.filter(node => reachableNodeIds.has(node.id));
                break;
            case 'future':
                candidates = candidates.filter(node => !reachableNodeIds.has(node.id));
                break;
            case 'any_unvisited':
                // Initial filtering already handles this.
                break;
            default:
                Logger.warn(`Unknown scope: ${target_filter.scope}. Defaulting to 'any_unvisited'.`);
                break;
        }

        if (candidates.length === 0) {
            Logger.log('No candidate nodes found after filtering.');
            return mapData;
        }

        // 3. Selection Priority (Sorting)
        const priority = target_filter.selection_priority || {};
        candidates.sort((a, b) => {
            // Row priority
            if (priority.row === 'closest') {
                if (a.row !== b.row) return a.row - b.row;
            } else if (priority.row === 'furthest') {
                if (a.row !== b.row) return b.row - a.row;
            }

            // Density priority
            const aDensity = a.connections.length;
            const bDensity = b.connections.length;
            if (priority.density === 'densest') {
                if (aDensity !== bDensity) return bDensity - aDensity;
            } else if (priority.density === 'sparsest') {
                if (aDensity !== bDensity) return aDensity - bDensity;
            }
            
            return 0; // Default: keep original order if priorities are equal
        });

        // Add randomness if specified
        if (priority.row === 'random' || priority.density === 'random') {
            context.parentWin._.shuffle(candidates);
        }

        // 4. Apply Modification
        const targetNode = candidates[0];
        if (targetNode) {
            const { field, value } = modification;
            if (targetNode.hasOwnProperty(field)) {
                Logger.success(`Modifying node ${targetNode.id}: changing ${field} from ${targetNode[field]} to ${value}.`);
                targetNode[field] = value;
                modificationApplied = true;
            } else {
                Logger.warn(`Node ${targetNode.id} does not have field ${field} to modify.`);
            }
        }
        
        return mapData;
    });

    if (modificationApplied) {
        context.toastr_API.success(effect_description, "地图变化！");
        await context.LorebookManager.fetchAllGameData(); // This will trigger a re-render
    } else {
        Logger.log('Map modification command was processed, but no suitable node was found to modify.');
    }
}


export const AIGame_MapHandler = {
    init: function(ctx) {
        context = ctx;
    },
    
    // RESTORED: Public-facing methods for events.js to call
    travelToNode,
    findSecretRoom,
    saveMapData,

    async handleCommand(command) {
        switch (command.type) {
            case 'Modify':
                await _handleMapModify(command);
                break;
            default:
                Logger.warn(`MapHandler received unknown command type: ${command.type}`);
        }
    }
};
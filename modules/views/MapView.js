/**
 * AI Card Table Extension - Map View
 * @description Renders and handles interactions for the roguelike map.
 */
import { AIGame_State } from '../state.js';
import { AIGame_Events } from '../events.js';
import { Logger } from '../logger.js';
import { generateMapData } from '../mapGenerator.js';

let jQuery_API, parentWin, DataHandler;

const NODE_INFO = {
    enemy: { icon: 'fas fa-user', name: '神秘对手', desc: '一场标准的牌局挑战。战胜他们以获得奖励。' },
    elite: { icon: 'fas fa-user-tie', name: '精英敌人', desc: '一个强大的对手，拥有特殊能力。风险与回报并存。' },
    rest: { icon: 'fas fa-martini-glass', name: '酒吧', desc: '在吧台喝一杯，放松一下。你可以选择恢复生命或...发生点别的事？' },
    shop: { icon: 'fas fa-gift', name: '礼品店', desc: '使用你在牌局中赢得的筹码，为自己换购一些强大的“礼物”。' },
    event: { icon: 'fas fa-question-circle', name: '未知事件', desc: '前方充满了未知。机遇还是陷阱？只有去了才知道。' },
    boss: { icon: 'fas fa-skull-crossbones', name: '首领', desc: '这一层的最终挑战。你需要运用所有的智慧和力量来战胜它。' },
    treasure: { icon: 'fas fa-box-open', name: '宝箱', desc: '无需战斗，直接获得奖励。' },
    'card-sharp': { icon: 'fas fa-hand-sparkles', name: '千术师的牌桌', desc: '一个向高手学习“技巧”的机会，可以强化你的卡牌。' },
    angel: { icon: '👼', name: '天使房', desc: '一个神圣的地方，或许能获得强大的祝福。' },
    devil: { icon: '😈', name: '恶魔房', desc: '与恶魔交易，获取力量，但可能需要付出代价。' },
    hidden: { icon: 'fas fa-dungeon', name: '隐藏房间', desc: '一个被发现的秘密房间！' },
    super_hidden: { icon: 'fas fa-dungeon', name: '超级隐藏房间', desc: '一个藏有巨大秘密的房间！' }
};

function _getMapNodeDetailsHTML(node, isReachable) {
    const instructionText = isReachable ? '点击按钮或双击节点以前往。' : '你无法从当前位置前往此节点。';
    if (!node) {
        return `<div class="details-main-content"><div class="details-placeholder"><p>单击一个可到达的节点<br>以查看其详情。</p></div></div><div class="details-instructions"></div>`;
    }
    const info = NODE_INFO[node.type] || { icon: 'fas fa-question', name: `未知 (${node.type})`, desc: '这是一个神秘的地方。' };
    const travelButtonHTML = isReachable ? `<div class="details-actions"><button class="map-travel-btn">前往此节点</button></div>` : '';
    return `
        <div class="details-main-content">
            <div class="details-icon">${info.icon.startsWith('fas') ? `<i class="${info.icon}"></i>` : info.icon}</div>
            <h4 class="details-title">${info.name}</h4>
            <p class="details-description">${info.desc}</p>
            ${travelButtonHTML}
        </div>
        <div class="details-instructions">${instructionText}</div>
    `;
}

function _getHiddenNodeHTML(node) {
    if (!node) return '';
    const info = NODE_INFO[node.type] || { icon: 'fas fa-question' };
    const iconContent = info.icon.startsWith('fas') ? `<i class="node-icon ${info.icon}"></i>` : `<span class="node-icon">${info.icon}</span>`;
    const radius = 15;
    const nodeClasses = `map-node node-${node.type.replace('_', '-')}`;
    return `<div class="${nodeClasses}" style="left:${node.x}px; top:${node.y}px; width:${radius*2}px; height:${radius*2}px;" data-node-id="${node.id}" data-node-type="${node.type}"><svg class="node-bg" width="${radius*2}" height="${radius*2}" viewBox="0 0 ${radius*2} ${radius*2}"><circle cx="${radius}" cy="${radius}" r="${radius-2}"/></svg>${iconContent}</div>`;
}

export const MapView = {
    init(deps, dataHandler) {
        jQuery_API = deps.jq;
        parentWin = deps.win;
        DataHandler = dataHandler;
    },
    render(container) {
        let mapData = AIGame_State.mapData;
        if (!mapData || !mapData.nodes || mapData.nodes.length === 0) {
            mapData = generateMapData();
            AIGame_State.mapData = mapData;
        }

        const { nodes, paths, player_position, path_taken, secret_nodes } = mapData;
        const playerNode = nodes.find(n => n.id === player_position);
        const path_taken_set = new Set(path_taken || []);
        if (player_position) path_taken_set.add(player_position);

        const pathsSvg = paths.map(path => {
            const fromNode = nodes.find(n => n.id === path.from);
            const toNode = nodes.find(n => n.id === path.to);
            if (!fromNode || !toNode) return '';
            const isTraveled = path_taken_set.has(path.from) && path_taken_set.has(path.to);
            return `<line class="map-path ${isTraveled ? 'traveled' : ''}" x1="${fromNode.x}" y1="${fromNode.y}" x2="${toNode.x}" y2="${toNode.y}"></line>`;
        }).join('');
        
        const nodesHtml = nodes.map(node => {
            const info = NODE_INFO[node.type] || { icon: 'fas fa-question' };
            const iconContent = info.icon.startsWith('fas') ? `<i class="node-icon ${info.icon}"></i>` : `<span class="node-icon">${info.icon}</span>`;
            const isBig = node.properties?.includes('big');
            const radius = isBig ? (node.type === 'boss' ? 38 : 25) : (node.type === 'boss' ? 30 : 20);
            const isCurrent = node.id === player_position;
            const isVisited = !isCurrent && path_taken_set.has(node.id);
            const isReachable = !isCurrent && !isVisited && (player_position === null ? (node.row === 0) : (playerNode?.connections.includes(node.id)));
            const isSelected = node.id === AIGame_State.selectedMapNodeId;
            let nodeClasses = `map-node node-${node.type} ${isCurrent ? 'current-position' : ''} ${isVisited ? 'visited' : ''} ${isReachable ? 'reachable' : ''} ${isSelected ? 'selected' : ''} ${!isCurrent && !isVisited && !isReachable && player_position !== null ? 'unreachable' : ''} ${isBig ? 'big-room' : ''}`;
            if (node.type === 'boss' && (isCurrent || isReachable)) nodeClasses += ' boss-alert';

            // ADDED: Add classes for special properties
            const specialProp = node.properties?.find(p => p !== 'big' && p !== 'Trap' && p !== 'Illusion');
            if (specialProp) {
                nodeClasses += ` has-property property-${specialProp.toLowerCase()}`;
            }

            return `<div class="${nodeClasses.trim()}" style="left:${node.x}px; top:${node.y}px; width:${radius*2}px; height:${radius*2}px;" data-node-id="${node.id}" data-node-type="${node.type}"><svg class="node-bg" width="${radius*2}" height="${radius*2}" viewBox="0 0 ${radius*2} ${radius*2}"><circle cx="${radius}" cy="${radius}" r="${radius-2}"/></svg>${iconContent}</div>`;
        }).join('');
        
        const discoveredSecretNodes = (secret_nodes || []).filter(sn => sn.discovered);
        const discoveredNodesHtml = discoveredSecretNodes.map(node => _getHiddenNodeHTML(node)).join('');
        const discoveredPathsSvg = discoveredSecretNodes.map(sn => {
            const parentNode = nodes.find(n => n.id === sn.attached_to_node_id);
            if (!parentNode) return '';
            return `<line class="map-path traveled" x1="${parentNode.x}" y1="${parentNode.y}" x2="${sn.x}" y2="${sn.y}"></line>`;
        }).join('');

        const selectedNode = nodes.find(n => n.id === AIGame_State.selectedMapNodeId);
        const isSelectedNodeReachable = selectedNode && (player_position === null ? selectedNode.row === 0 : playerNode?.connections.includes(selectedNode.id));
        
        let mapButtonsHTML = '';
        if (mapData.bossDefeated) mapButtonsHTML = `<button class="map-action-btn next-floor-btn">前往下一层</button>`;
        else if (mapData.player_position) {
            const hasSearched = mapData.searched_nodes?.includes(mapData.player_position);
            mapButtonsHTML = `<button class="map-action-btn find-secret-btn" ${hasSearched ? 'disabled' : ''}>查找隐藏 (200筹码)</button>`;
        } else {
            mapButtonsHTML = `<button class="map-action-btn save-map-btn">保存地图</button><button class="map-action-btn reroll-map-btn" ${mapData.is_saved ? 'disabled' : ''}>重roll地图</button>`;
        }

        container.html(`
            <div class="map-view-wrapper">
                <div class="map-main-content">
                    <div class="map-header">
                        <h3 class="map-header-title">赌场地图 - 第 ${mapData.mapLayer + 1} 层</h3>
                        <div class="map-header-buttons">${mapButtonsHTML}<div class="map-zoom-controls"><button class="map-zoom-btn" id="map-zoom-out" title="缩小">-</button><button class="map-zoom-btn" id="map-zoom-in" title="放大">+</button></div></div>
                    </div>
                    <div class="map-pan-zoom-container">
                        <div class="map-canvas"><svg class="map-svg" width="600" height="800">${pathsSvg}${discoveredPathsSvg}</svg><div class="map-nodes-container">${nodesHtml}${discoveredNodesHtml}</div></div>
                    </div>
                </div>
                <div class="map-details-panel">${_getMapNodeDetailsHTML(selectedNode, isSelectedNodeReachable)}</div>
            </div>
        `);
        
        const mapCanvas = container.find('.map-canvas');
        mapCanvas.css('transform', `translate(${AIGame_State.mapPan.x}px, ${AIGame_State.mapPan.y}px) scale(${AIGame_State.mapZoom})`);
        AIGame_Events.addMapInteractionListeners(container);
        
        if (!AIGame_State.mapTransformInitialized && player_position === null) {
            setTimeout(() => {
                const mapContainer = container.find('.map-pan-zoom-container');
                if (mapContainer.length && mapContainer.height() > 0) {
                    const cHeight = mapContainer.height(), cWidth = mapContainer.width();
                    const canvasH = 800, canvasW = 600;
                    AIGame_State.mapPan = { x: (cWidth - canvasW) / 2, y: cHeight - canvasH + 20 };
                    AIGame_State.mapZoom = 1.0;
                    mapCanvas.css('transform', `translate(${AIGame_State.mapPan.x}px, ${AIGame_State.mapPan.y}px) scale(${AIGame_State.mapZoom})`);
                    AIGame_State.mapTransformInitialized = true;
                }
            }, 50);
        }
    }
};
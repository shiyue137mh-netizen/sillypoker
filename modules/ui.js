/**
 * AI Card Table Extension - UI Handler (ES6 Module)
 * @description Manages UI creation, rendering, and panel visibility.
 */
import { AIGame_Config } from '../config.js';
import { AIGame_State } from './state.js';
import { AIGame_Events } from './events.js';
import { Logger } from './logger.js';
import { generateMapData } from './mapGenerator.js';
import { getGameTableHTML, getStagedActionsHTML } from './gameRenderer.js';
import { getRulesViewHTML } from './components/RulesView.js';
import { getPlayerHUDHTML, getPlayerInventoryHTML } from './components/PlayerStatus.js';
import { AudioManager } from './audioManager.js';

let jQuery_API, parentWin, toastr_API, DataHandler, SillyTavern_Context_API;

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
    devil: { icon: '😈', name: '恶魔房', desc: '与恶魔交易，获取力量，但可能需要付出代价。' }
};


// MODIFIED: Restructured to use a main content wrapper for better centering
function _getMapNodeDetailsHTML(node, isReachable) {
    const instructionText = isReachable ? '点击按钮或双击节点以前往。' : '你无法从当前位置前往此节点。';

    if (!node) {
        return `
            <div class="details-main-content">
                <div class="details-placeholder">
                    <p>单击一个可到达的节点<br>以查看其详情。</p>
                </div>
            </div>
            <div class="details-instructions"></div>
        `;
    }
    
    const info = NODE_INFO[node.type] || { icon: 'fas fa-question', name: '未知', desc: '这是一个神秘的地方。' };
    const travelButtonHTML = isReachable ? `
        <div class="details-actions">
            <button class="map-travel-btn">前往此节点</button>
        </div>
    ` : '';

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

function _renderDifficultySelection(container) {
    container.html(`
        <div class="difficulty-selection-container">
            <h2 class="difficulty-title">新的挑战</h2>
            <p class="difficulty-subtitle">选择你的挑战难度，这将决定你的初始资源。</p>
            <div class="difficulty-options-grid">
                <button class="difficulty-option-btn" data-difficulty="baby">
                    <h4>宝宝模式</h4>
                    <div class="difficulty-option-details">
                        <span><i class="fas fa-heart"></i> 5 生命</span>
                        <span><i class="fas fa-coins"></i> 2000 筹码</span>
                    </div>
                </button>
                <button class="difficulty-option-btn" data-difficulty="easy">
                    <h4>简单</h4>
                    <div class="difficulty-option-details">
                        <span><i class="fas fa-heart"></i> 4 生命</span>
                        <span><i class="fas fa-coins"></i> 1500 筹码</span>
                    </div>
                </button>
                <button class="difficulty-option-btn" data-difficulty="normal">
                    <h4>普通</h4>
                    <div class="difficulty-option-details">
                        <span><i class="fas fa-heart"></i> 3 生命</span>
                        <span><i class="fas fa-coins"></i> 1000 筹码</span>
                    </div>
                </button>
                <button class="difficulty-option-btn" data-difficulty="hard">
                    <h4>困难</h4>
                    <div class="difficulty-option-details">
                        <span><i class="fas fa-heart"></i> 2 生命</span>
                        <span><i class="fas fa-coins"></i> 500 筹码</span>
                    </div>
                </button>
                <button class="difficulty-option-btn" data-difficulty="hell">
                    <h4>地狱</h4>
                    <div class="difficulty-option-details">
                        <span><i class="fas fa-heart"></i> 1 生命</span>
                        <span><i class="fas fa-coins"></i> 100 筹码</span>
                    </div>
                </button>
            </div>
        </div>
    `);
}

function _renderSettingsView(container) {
    const runInProgress = AIGame_State.runInProgress;
    const isMuted = AIGame_State.isMuted;
    const audioButtonClass = isMuted ? '' : 'active';
    const audioButtonText = isMuted ? '关闭' : '开启';

    const bgmTracks = AudioManager.getBgmTracks();
    const currentTrack = bgmTracks[AIGame_State.currentBgmTrackIndex];
    const trackName = AIGame_State.isBgmPlaying ? (currentTrack?.name || '未知曲目') : '已暂停';
    const playPauseIcon = AIGame_State.isBgmPlaying ? 'fa-pause' : 'fa-play';


    container.html(`
        <div class="settings-view-container">
            <h2 class="settings-title">设置</h2>
            <div class="settings-options-list">
                <div class="settings-option">
                    <div class="settings-option-text">
                        <h4>游戏音效</h4>
                        <p>开启或关闭点击、发牌等UI音效。</p>
                    </div>
                    <div class="settings-option-action">
                        <button class="sillypoker-btn-toggle ${audioButtonClass}" id="toggle-audio-btn">
                           ${audioButtonText}
                        </button>
                    </div>
                </div>

                <div class="settings-option">
                    <div class="settings-option-text">
                        <h4>背景音乐</h4>
                         <p>控制游戏过程中的背景音乐。</p>
                    </div>
                    <div class="bgm-player">
                        <div class="bgm-track-info" title="${trackName}">${trackName}</div>
                        <div class="bgm-controls">
                            <button id="bgm-prev-btn" class="sillypoker-header-btn" title="上一曲"><i class="fas fa-step-backward"></i></button>
                            <button id="bgm-toggle-btn" class="sillypoker-header-btn" title="播放/暂停"><i class="fas ${playPauseIcon}"></i></button>
                            <button id="bgm-next-btn" class="sillypoker-header-btn" title="下一曲"><i class="fas fa-step-forward"></i></button>
                        </div>
                        <div class="bgm-volume-control">
                            <i class="fas fa-volume-down"></i>
                            <input type="range" id="bgm-volume-slider" class="bgm-volume-slider" min="0" max="1" step="0.01" value="${AIGame_State.bgmVolume}">
                            <i class="fas fa-volume-up"></i>
                        </div>
                    </div>
                </div>

                <div class="settings-option">
                    <div class="settings-option-text">
                        <h4>重新开始挑战</h4>
                        <p>这将立即结束你当前的挑战，并让你返回难度选择界面。所有进度都将丢失。</p>
                    </div>
                    <div class="settings-option-action">
                        <button class="sillypoker-btn-danger restart-challenge-btn" ${!runInProgress ? 'disabled' : ''}>重新开始</button>
                    </div>
                </div>
            </div>
        </div>
    `);
}

function _renderPersistentUI(panel) {
    const hudContainer = panel.find('.header-left-icons');
    const inventoryWrapper = panel.find('#sillypoker-inventory-wrapper');

    hudContainer.find('.player-hud').remove();
    inventoryWrapper.empty();

    if (AIGame_State.runInProgress) {
        hudContainer.append(getPlayerHUDHTML(AIGame_State.playerData, AIGame_State.currentGameState));
        
        const inventory = AIGame_State.playerData?.inventory || [];
        const inventoryToggleIcon = AIGame_State.isInventoryVisible ? 'fa-chevron-right' : 'fa-chevron-left';
        inventoryWrapper.html(`
            ${getPlayerInventoryHTML(inventory)}
            <button class="inventory-toggle-btn" title="切换道具栏"><i class="fas ${inventoryToggleIcon}"></i></button>
        `);
        // Apply visibility class based on state
        panel.toggleClass('inventory-visible', AIGame_State.isInventoryVisible);
    }
}

export const AIGame_UI = {
    init: function(deps, dataHandler) {
        jQuery_API = deps.jq;
        parentWin = deps.win;
        toastr_API = deps.toastr;
        DataHandler = dataHandler;
        SillyTavern_Context_API = deps.st_context;

        SillyTavern_Context_API.eventSource.on(Logger.getUpdateEventName(), () => {
            if (AIGame_State.isPanelVisible && AIGame_State.currentActiveTab === 'log') {
                this.renderPanelContent();
            }
        });
    },

    async initializeUI() {
        try {
            const body = jQuery_API(parentWin.document.body);
            if (body.find(`#${AIGame_Config.PANEL_ID}`).length > 0) return true;

            const uiJsUrl = new URL(import.meta.url);
            const basePath = uiJsUrl.pathname.substring(0, uiJsUrl.pathname.lastIndexOf('/modules'));
            const panelUrl = `${basePath}/panel.html`;

            Logger.log(`正在从路径获取面板: ${panelUrl}`);
            const response = await fetch(panelUrl);
            if (!response.ok) throw new Error(`获取 panel.html 失败: ${response.status} ${response.statusText}`);
            
            const templateHtml = await response.text();
            if (!templateHtml) throw new Error("获取的 panel.html 为空。");

            body.append(templateHtml);
            
            this.createToggleButton();
            AIGame_Events.addGlobalEventListeners();
            AIGame_Events.addPanelEventListeners();
            
            return true;
        } catch (error) {
            Logger.error('CRITICAL UI Initialization Failure:', error);
            toastr_API.error("SillyPoker UI加载失败，请检查控制台。", "严重错误");
            return false;
        }
    },

    createToggleButton() {
        if (parentWin.document.getElementById(AIGame_Config.TOGGLE_BUTTON_ID)) return;
        const button = parentWin.document.createElement('button');
        button.id = AIGame_Config.TOGGLE_BUTTON_ID;
        button.title = "SillyPoker";
        button.innerHTML = '<i class="fas fa-dice-d20"></i>';
        parentWin.document.body.appendChild(button);
    },

    togglePanel(forceShow = null) {
        const panel = jQuery_API(parentWin.document.body).find(`#${AIGame_Config.PANEL_ID}`);
        const shouldShow = forceShow !== null ? forceShow : panel.hasClass('hidden');
        
        AIGame_State.isPanelVisible = shouldShow;
        panel.toggleClass('hidden', !shouldShow);

        if (shouldShow) {
            // FIX REMOVED: The setTimeout is no longer needed. DataHandler handles the wait.
            Logger.log('面板正在打开，立即检查世界书状态。');
            DataHandler.checkGameBookExists(); // Direct call
        } else {
            Logger.log('面板已关闭。');
        }
    },

    renderPanelContent() {
        const panel = jQuery_API(parentWin.document.body).find(`#${AIGame_Config.PANEL_ID}`);
        const contentDiv = panel.find('.sillypoker-content');
        const tabsContainer = panel.find('#sillypoker-tabs-container');
        const statusIndicator = panel.find('#sillypoker-status-indicator');
        
        contentDiv.empty();
        tabsContainer.empty();
        
        _renderPersistentUI(panel);

        if (!AIGame_State.hasGameBook) {
            statusIndicator.removeClass('active');
            contentDiv.html(`
                <div class="sillypoker-content-centerer">
                    <p>当前角色尚未绑定游戏世界书。</p>
                    <button class="sillypoker-create-book-btn">创建/修复游戏世界书</button>
                </div>
            `);
            return;
        }

        statusIndicator.addClass('active');
        
        let tabsHtml = '';
        if (AIGame_State.runInProgress) {
            tabsHtml += `<button class="sillypoker-tab ${AIGame_State.currentActiveTab === 'game-ui' ? 'active' : ''}" data-tab="game-ui">游戏界面</button>`;
            tabsHtml += `<button class="sillypoker-tab ${AIGame_State.currentActiveTab === 'map' ? 'active' : ''}" data-tab="map">地图界面</button>`;
        }
        tabsHtml += `<button class="sillypoker-tab ${AIGame_State.currentActiveTab === 'rules' ? 'active' : ''}" data-tab="rules">游戏规则</button>`;
        tabsHtml += `<button class="sillypoker-tab ${AIGame_State.currentActiveTab === 'settings' ? 'active' : ''}" data-tab="settings">设置</button>`;
        tabsHtml += `<button class="sillypoker-tab ${AIGame_State.currentActiveTab === 'log' ? 'active' : ''}" data-tab="log">日志</button>`;
        tabsContainer.html(`<div class="sillypoker-tabs">${tabsHtml}</div>`);

        if (AIGame_State.currentActiveTab === 'settings') {
            _renderSettingsView(contentDiv);
        } else if (AIGame_State.currentActiveTab === 'rules') {
            this._renderRulesView(contentDiv);
        } else if (AIGame_State.currentActiveTab === 'log') {
            this._renderLogView(contentDiv);
        } else if (AIGame_State.runInProgress) {
            contentDiv.html(`
                <div class="sillypoker-tab-content-wrapper">
                    <div class="sillypoker-tab-content ${AIGame_State.currentActiveTab === 'game-ui' ? 'active' : ''}" data-tab-content="game-ui"></div>
                    <div class="sillypoker-tab-content ${AIGame_State.currentActiveTab === 'map' ? 'active' : ''}" data-tab-content="map"></div>
                </div>
            `);
            this.renderActiveTabContent();
        } else {
            _renderDifficultySelection(contentDiv);
        }
    },
    
    renderActiveTabContent() {
        const activeTab = AIGame_State.currentActiveTab;
        const contentWrapper = jQuery_API(parentWin.document.body).find(`.sillypoker-tab-content[data-tab-content="${activeTab}"]`);
        
        if (activeTab === 'map') {
            this._renderMapView(contentWrapper);
        } else if (activeTab === 'game-ui') {
            this._renderGameView(contentWrapper);
        }
    },
    
    _renderMapView(container) {
        let mapData = AIGame_State.mapData;
        
        if (!mapData || !mapData.nodes || mapData.nodes.length === 0) {
            Logger.warn("地图数据无效或不存在，将生成新地图。");
            mapData = generateMapData();
            AIGame_State.mapData = mapData;
        }

        const { nodes, paths, player_position, path_taken } = mapData;
        const playerNode = nodes.find(n => n.id === player_position);
        
        const path_taken_set = new Set(path_taken || []);
        if (player_position) {
            path_taken_set.add(player_position);
        }

        const pathsSvg = paths.map(path => {
            const fromNode = nodes.find(n => n.id === path.from);
            const toNode = nodes.find(n => n.id === path.to);
            if (!fromNode || !toNode) return '';
            const isTraveled = path_taken_set.has(path.from) && path_taken_set.has(path.to);
            const pathClass = `map-path ${isTraveled ? 'traveled' : ''}`;
            return `<line class="${pathClass}" x1="${fromNode.x}" y1="${fromNode.y}" x2="${toNode.x}" y2="${toNode.y}"></line>`;
        }).join('');
        
        const nodesHtml = nodes.map(node => {
            const info = NODE_INFO[node.type] || { icon: 'fas fa-question' };
            const iconContent = info.icon.startsWith('fas') ? `<i class="node-icon ${info.icon}"></i>` : `<span class="node-icon">${info.icon}</span>`;
            const radius = node.type === 'boss' ? 30 : 20;
            
            const isCurrent = node.id === player_position;
            const isVisited = !isCurrent && path_taken_set.has(node.id);
            const isReachable = !isCurrent && !isVisited && (player_position === null ? (node.row === 0) : (playerNode?.connections.includes(node.id)));
            const isSelected = node.id === AIGame_State.selectedMapNodeId;

            let nodeClasses = `map-node node-${node.type}`;
            if (isCurrent) nodeClasses += ' current-position';
            else if (isVisited) nodeClasses += ' visited';
            else if (isReachable) {
                nodeClasses += ' reachable';
                if (isSelected) nodeClasses += ' selected';
            }
            else if (player_position !== null) nodeClasses += ' unreachable';

            return `
                <div class="${nodeClasses}" style="left:${node.x}px; top:${node.y}px; width:${radius*2}px; height:${radius*2}px;" data-node-id="${node.id}" data-node-type="${node.type}">
                    <svg class="node-bg" width="${radius*2}" height="${radius*2}" viewBox="0 0 ${radius*2} ${radius*2}"><circle cx="${radius}" cy="${radius}" r="${radius-2}"/></svg>
                    ${iconContent}
                </div>
            `;
        }).join('');
        
        const selectedNode = nodes.find(n => n.id === AIGame_State.selectedMapNodeId);
        let isSelectedNodeReachable = false;
        if (selectedNode) {
            if (player_position === null || player_position === undefined) {
                isSelectedNodeReachable = selectedNode.row === 0;
            } else {
                isSelectedNodeReachable = playerNode && playerNode.connections.includes(selectedNode.id);
            }
        }
        
        let mapButtonsHTML = '';
        if (mapData.bossDefeated) {
            mapButtonsHTML = `<button class="map-action-btn next-floor-btn">前往下一层</button>`;
        } else if (mapData.player_position) {
            const hasSearched = mapData.searched_nodes?.includes(mapData.player_position);
            mapButtonsHTML = `<button class="map-action-btn find-secret-btn" ${hasSearched ? 'disabled' : ''}>查找隐藏 (200筹码)</button>`;
        } else { // !mapData.player_position
            mapButtonsHTML = `
                <button class="map-action-btn save-map-btn">保存地图</button>
                <button class="map-action-btn reroll-map-btn" ${mapData.is_saved ? 'disabled' : ''}>重roll地图</button>
            `;
        }


        container.html(`
            <div class="map-view-wrapper">
                <div class="map-main-content">
                    <div class="map-header">
                        <h3 class="map-header-title">赌场地图 - 第 ${mapData.mapLayer + 1} 层</h3>
                        <div class="map-header-buttons">
                            ${mapButtonsHTML}
                            <div class="map-zoom-controls">
                                <button class="map-zoom-btn" id="map-zoom-out" title="缩小">-</button>
                                <button class="map-zoom-btn" id="map-zoom-in" title="放大">+</button>
                            </div>
                        </div>
                    </div>
                    <div class="map-pan-zoom-container">
                        <div class="map-canvas">
                            <svg class="map-svg" width="600" height="800">${pathsSvg}</svg>
                            <div class="map-nodes-container">${nodesHtml}</div>
                        </div>
                    </div>
                </div>
                <div class="map-details-panel">
                    ${_getMapNodeDetailsHTML(selectedNode, isSelectedNodeReachable)}
                </div>
            </div>
        `);
        
        const mapCanvas = container.find('.map-canvas');
        mapCanvas.css('transform', `translate(${AIGame_State.mapPan.x}px, ${AIGame_State.mapPan.y}px) scale(${AIGame_State.mapZoom})`);

        AIGame_Events.addMapInteractionListeners(container);
        
        if (!AIGame_State.mapTransformInitialized && player_position === null) {
            setTimeout(() => {
                const mapContainer = container.find('.map-pan-zoom-container');
                if (mapContainer.length && mapContainer.height() > 0) {
                    const cHeight = mapContainer.height();
                    const cWidth = mapContainer.width();
                    const canvasH = 800;
                    const canvasW = 600;
                    
                    AIGame_State.mapPan.x = (cWidth - canvasW) / 2;
                    AIGame_State.mapPan.y = cHeight - canvasH + 20;
                    AIGame_State.mapZoom = 1.0;

                    mapCanvas.css('transform', `translate(${AIGame_State.mapPan.x}px, ${AIGame_State.mapPan.y}px) scale(${AIGame_State.mapZoom})`);
                    AIGame_State.mapTransformInitialized = true;
                    Logger.log(`Map view initialized. Pan: {x: ${AIGame_State.mapPan.x}, y: ${AIGame_State.mapPan.y}}`);
                } else {
                    Logger.warn("Could not initialize map view: container has no dimensions yet.");
                }
            }, 50);
        }
    },

    async _renderGameView(container) {
        // NEW: Check for pending actions before rendering
        if (AIGame_State.currentGameState?.pending_deal_actions?.length > 0) {
            await DataHandler.processPendingDealActions();
            // The processPendingDealActions function will call fetchAllGameData, which in turn
            // calls renderPanelContent, so we can just return here to avoid a double render.
            return;
        }

        const { playerData, enemyData, currentGameState } = AIGame_State;
        if (!playerData || !currentGameState || !enemyData || !enemyData.enemies || enemyData.enemies.length === 0) {
             container.html(`
                <div class="sillypoker-content-centerer">
                    <p>荷官正在洗牌...</p>
                    <p style="font-size:12px; color:#888;">（你的对手需要发起一场对局）</p>
                </div>
            `);
            return;
        }
        container.html(getGameTableHTML(playerData, enemyData, currentGameState));
        
        if (AIGame_State.isDealing) {
            AIGame_State.isDealing = false; // Consume flag
            // Add class to trigger animation on newly rendered cards
            setTimeout(() => { // A tiny delay to ensure elements are in the DOM for animation
                 container.find('.card').addClass('animate-in');
            }, 10);
        }

        this.rerenderStagedActionsAndCommitButton();
    },

    _renderRulesView(container) {
        container.html(getRulesViewHTML());
        const firstRuleItem = container.find('.rules-list-item').first();
        if(firstRuleItem.length) {
            firstRuleItem.trigger('click');
        }
    },

    _renderLogView(container) {
        const logs = Logger.getLogs();
        const logHtml = logs.map(log => {
            const message = typeof log.message === 'object' ? JSON.stringify(log.message, null, 2) : log.message;
            const argsString = log.args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
            return `
                <div class="log-entry">
                    <span class="log-timestamp">${log.timestamp}</span>
                    <span class="log-level log-level-${log.level}">${log.level}</span>
                    <span class="log-message">${message} ${argsString}</span>
                </div>
            `;
        }).join('');
        container.html(`<div class="log-view-container">${logHtml}</div>`);
        
        const logContainer = container.find('.log-view-container');
        if (logContainer.length) {
            logContainer.scrollTop(logContainer[0].scrollHeight);
        }
    },

    rerenderStagedActionsAndCommitButton() {
        const panel = jQuery_API(parentWin.document.body).find(`#${AIGame_Config.PANEL_ID}`);
        // Render Staged Actions
        const stagedActionsContainer = panel.find('.staged-actions-container');
        if (stagedActionsContainer.length) {
            stagedActionsContainer.html(getStagedActionsHTML(AIGame_State.stagedPlayerActions));
        }
        // Update Commit Button Area
        const commitArea = panel.find('#sillypoker-commit-area');
        const commitBtn = commitArea.find('#sillypoker-commit-btn');
        const actionCount = AIGame_State.stagedPlayerActions.length;

        if (actionCount > 0) {
            commitArea.removeClass('hidden');
            commitBtn.attr('data-count', actionCount);
        } else {
            commitArea.addClass('hidden');
        }
    },

    rerenderPlayerHUD() {
        const panel = jQuery_API(parentWin.document.body).find(`#${AIGame_Config.PANEL_ID}`);
        const hudContainer = panel.find('.header-left-icons');
        
        hudContainer.find('.player-hud').remove(); // Remove old HUD
        
        if (AIGame_State.runInProgress) {
             hudContainer.append(getPlayerHUDHTML(AIGame_State.playerData, AIGame_State.currentGameState));
        }
    },
    
    panMap(dx, dy) {
        AIGame_State.mapPan.x += dx;
        AIGame_State.mapPan.y += dy;
        jQuery_API(parentWin.document.body).find('.map-canvas').css('transform', `translate(${AIGame_State.mapPan.x}px, ${AIGame_State.mapPan.y}px) scale(${AIGame_State.mapZoom})`);
    },
    
    zoomMap(factor, mouseX, mouseY) {
        const pan = AIGame_State.mapPan;
        const zoom = AIGame_State.mapZoom;
        
        const newZoom = Math.max(0.5, Math.min(2, zoom * factor));
        
        pan.x = mouseX - (mouseX - pan.x) * (newZoom / zoom);
        pan.y = mouseY - (mouseY - pan.y) * (newZoom / zoom);
        
        AIGame_State.mapZoom = newZoom;
        AIGame_State.mapPan = pan;
        
        jQuery_API(parentWin.document.body).find('.map-canvas').css('transform', `translate(${pan.x}px, ${pan.y}px) scale(${newZoom})`);
    },

    zoomMapByStep(direction) {
        const container = jQuery_API(parentWin.document.body).find('.map-pan-zoom-container');
        const rect = container[0].getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const zoomFactor = direction === 'in' ? 1.2 : 1 / 1.2;
        this.zoomMap(zoomFactor, centerX, centerY);
    },

    animateChips(sourceSelector, targetSelector) {
        const panel = jQuery_API(parentWin.document.body).find('#' + AIGame_Config.PANEL_ID);
        const sourceEl = panel.find(sourceSelector);
        const targetEl = panel.find(targetSelector);

        if (!sourceEl.length || !targetEl.length) {
            Logger.warn('Cannot animate chips, source or target not found.', { source: sourceSelector, target: targetSelector });
            return;
        }

        const panelOffset = panel.offset();
        const sourceOffset = sourceEl.offset();
        const targetOffset = targetEl.offset();

        const startX = sourceOffset.left - panelOffset.left + (sourceEl.width() / 2);
        const startY = sourceOffset.top - panelOffset.top + (sourceEl.height() / 2);

        const endX = targetOffset.left - panelOffset.left + (targetEl.width() / 2);
        const endY = targetOffset.top - panelOffset.top + (targetEl.height() / 2);

        const chip = jQuery_API('<div class="animated-chip"><i class="fas fa-coins"></i></div>');
        chip.css({
            left: `${startX}px`,
            top: `${startY}px`
        });
        panel.append(chip);
        
        setTimeout(() => {
            chip.css({
                left: `${endX}px`,
                top: `${endY}px`
            }).addClass('moving');
        }, 20);

        setTimeout(() => {
            chip.remove();
        }, 800);
    }
};
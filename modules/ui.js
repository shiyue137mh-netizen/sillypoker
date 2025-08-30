/**
 * AI Card Table Extension - UI Controller (ES6 Module)
 * @description Manages UI state, panel visibility, and orchestrates rendering of different views.
 */
import { AIGame_Config } from '../config.js';
import { AIGame_State } from './state.js';
import { AIGame_Events } from './events.js';
import { Logger } from './logger.js';
import { getGameTableHTML } from './gameRenderer.js';
import { getRulesViewHTML } from './components/RulesView.js';
import { getPlayerHUDHTML, getPlayerInventoryHTML } from './components/PlayerStatus.js';
import { AudioManager } from './audioManager.js';

// Dependencies
let jQuery_API, parentWin, toastr_API, DataHandler, SillyTavern_Context_API, History_API, TavernHelper_API;
// View Modules
let DifficultyView, SettingsView, StoryView, LogView, MapView;

let markdownConverter = null;

function getMarkdownConverter() {
    if (!markdownConverter) {
        if (parentWin.showdown && typeof parentWin.showdown.Converter === 'function') {
            markdownConverter = new parentWin.showdown.Converter({
                tables: true,
                strikethrough: true,
                tasklists: true,
                simpleLineBreaks: true
            });
        } else {
            Logger.error("Showdown markdown converter is not available on the parent window.");
            return null;
        }
    }
    return markdownConverter;
}

// Renders persistent UI elements like the HUD and inventory, which are always present when a run is in progress.
function _renderPersistentUI(panel) {
    const hudContainer = panel.find('.header-left-icons');
    const inventoryWrapper = panel.find('#sillypoker-inventory-wrapper');

    const statusIndicator = panel.find('#sillypoker-status-indicator');
    statusIndicator.toggleClass('pulsing', AIGame_State.runInProgress && (AIGame_State.currentGameState && Object.keys(AIGame_State.currentGameState).length > 0));

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
        panel.toggleClass('inventory-visible', AIGame_State.isInventoryVisible);
    }
}

// Renders the game history panel content.
function _renderGameHistoryPanel() {
    const container = jQuery_API(parentWin.document.body).find('.history-panel-overlay');
    if (!container.length) return;

    const list = container.find('.history-log-list').empty();
    const history = History_API.getHistory();

    if (history.length === 0) {
        list.html('<div class="history-log-item">游戏历史记录为空。</div>');
        return;
    }

    const iconMap = {
        bet: { class: 'type-bet', icon: 'fa-coins' },
        deal: { class: 'type-deal', icon: 'fa-spade' },
        event: { class: 'type-event', icon: 'fa-star' },
        map: { class: 'type-map', icon: 'fa-map-signs' },
        game: { class: 'type-game', icon: 'fa-flag-checkered' }
    };

    history.forEach(entry => {
        const iconInfo = iconMap[entry.type] || { class: 'type-game', icon: 'fa-info-circle' };
        let contentHtml = '';
        switch (entry.type) {
            case 'bet': contentHtml = `<span class="actor">${entry.actor}</span> ${entry.action} <span style="color:var(--history-action-bet)">${entry.amount || ''}</span> ${entry.things || ''}`; break;
            case 'deal': contentHtml = `向 <span class="actor">${entry.name || entry.target}</span> 发了 ${entry.count} 张牌 (${entry.visibility})。`; break;
            case 'event': case 'game': contentHtml = entry.text; break;
            case 'map': contentHtml = `玩家前往了 <span class="actor">${entry.destination}</span> 节点。`; break;
        }
        const itemHtml = `<div class="history-log-item"><div class="history-log-icon ${iconInfo.class}"><i class="fas ${iconInfo.icon}"></i></div><div class="history-log-content">${contentHtml}</div><div class="history-log-timestamp">${entry.timestamp}</div></div>`;
        list.append(itemHtml);
    });
}


export const AIGame_UI = {
    init: function(deps, dataHandler, historyApi, viewModules) {
        jQuery_API = deps.jq;
        parentWin = deps.win;
        toastr_API = deps.toastr;
        DataHandler = dataHandler;
        SillyTavern_Context_API = deps.st_context;
        TavernHelper_API = deps.th;
        History_API = historyApi;

        // Store references to the imported view modules
        DifficultyView = viewModules.DifficultyView;
        SettingsView = viewModules.SettingsView;
        StoryView = viewModules.StoryView;
        LogView = viewModules.LogView;
        MapView = viewModules.MapView;

        SillyTavern_Context_API.eventSource.on(Logger.getUpdateEventName(), () => {
            if (AIGame_State.isPanelVisible && AIGame_State.currentActiveTab === 'log') {
                this.renderPanelContent();
            }
        });
        SillyTavern_Context_API.eventSource.on(History_API.getUpdateEventName(), () => {
            if (AIGame_State.isPanelVisible && AIGame_State.isHistoryPanelVisible) {
                _renderGameHistoryPanel();
            }
        });
        SillyTavern_Context_API.eventSource.on(SillyTavern_Context_API.eventTypes.MESSAGE_RECEIVED, () => {
            if (AIGame_State.isPanelVisible && AIGame_State.currentActiveTab === 'story') {
                this.renderActiveTabContent();
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
        AIGame_State.saveUiState();
        panel.toggleClass('hidden', !shouldShow);
        if (shouldShow) {
            this.applyFontSize();
            this.updateScaleAndPosition();
            DataHandler.checkGameBookExists();
        }
    },

    updateToggleButtonState() {
        const toggleBtn = jQuery_API(parentWin.document.body).find(`#${AIGame_Config.TOGGLE_BUTTON_ID}`);
        if (!toggleBtn.length) return;
        toggleBtn.removeClass('in-progress game-starting');
        if (AIGame_State.runInProgress) toggleBtn.addClass('in-progress');
    },

    flashToggleButton() {
        const toggleBtn = jQuery_API(parentWin.document.body).find(`#${AIGame_Config.TOGGLE_BUTTON_ID}`);
        if (!toggleBtn.length) return;
        toggleBtn.removeClass('in-progress').addClass('game-starting');
        setTimeout(() => {
            toggleBtn.removeClass('game-starting');
            this.updateToggleButtonState();
        }, 2100);
    },

    renderPanelContent() {
        const panel = jQuery_API(parentWin.document.body).find(`#${AIGame_Config.PANEL_ID}`);
        const contentDiv = panel.find('.sillypoker-content');
        const tabsContainer = panel.find('#sillypoker-tabs-container');
        const statusIndicator = panel.find('#sillypoker-status-indicator');
        this.updateToggleButtonState();
        contentDiv.empty();
        tabsContainer.empty();
        _renderPersistentUI(panel);

        if (!AIGame_State.hasGameBook) {
            statusIndicator.removeClass('active');
            contentDiv.html(`<div class="sillypoker-content-centerer"><p>当前角色尚未绑定游戏世界书。</p><button class="sillypoker-create-book-btn">创建/修复游戏世界书</button></div>`);
            return;
        }

        statusIndicator.addClass('active');
        let tabs = [];
        if (AIGame_State.runInProgress) {
            tabs.push({ id: 'story', name: '剧情' });
            tabs.push({ id: 'game-ui', name: '游戏界面' });
            tabs.push({ id: 'map', name: '地图界面' });
        }
        tabs.push({ id: 'rules', name: '游戏规则' }, { id: 'settings', name: '设置' }, { id: 'log', name: '日志' });
        
        const tabsHtml = tabs.map(tab => `<button class="sillypoker-tab ${AIGame_State.currentActiveTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">${tab.name}</button>`).join('');
        tabsContainer.html(`<div class="sillypoker-tabs">${tabsHtml}</div>`);

        if (AIGame_State.currentActiveTab === 'settings') SettingsView.render(contentDiv);
        else if (AIGame_State.currentActiveTab === 'rules') this._renderRulesView(contentDiv);
        else if (AIGame_State.currentActiveTab === 'log') LogView.render(contentDiv);
        else if (AIGame_State.runInProgress) {
            const tabContentWrapper = jQuery_API('<div class="sillypoker-tab-content-wrapper"></div>');
            tabs.forEach(tab => {
                if (['story', 'game-ui', 'map'].includes(tab.id)) {
                    tabContentWrapper.append(`<div class="sillypoker-tab-content ${AIGame_State.currentActiveTab === tab.id ? 'active' : ''}" data-tab-content="${tab.id}"></div>`);
                }
            });
            contentDiv.html(tabContentWrapper);
            this.renderActiveTabContent();
        } else {
            DifficultyView.render(contentDiv);
        }
    },
    
    renderActiveTabContent() {
        const activeTab = AIGame_State.currentActiveTab;
        const contentWrapper = jQuery_API(parentWin.document.body).find(`.sillypoker-tab-content[data-tab-content="${activeTab}"]`);
        
        if (activeTab === 'story') StoryView.render(contentWrapper);
        else if (activeTab === 'map') MapView.render(contentWrapper);
        else if (activeTab === 'game-ui') this._renderGameView(contentWrapper);
    },
    
    async _renderGameView(container) {
        const pendingActions = AIGame_State.currentGameState?.pending_deal_actions;

        // ALWAYS render the current state of the table first. This provides the DOM for the animation.
        const { playerData, enemyData, currentGameState } = AIGame_State;
        if (!playerData || !currentGameState || !enemyData || !enemyData.enemies || enemyData.enemies.length === 0) {
            // Even if there's no game, show the waiting message.
            container.html(`<div class="sillypoker-content-centerer"><i class="fas fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 10px;"></i><p>荷官正在洗牌...</p><p style="font-size:12px; color:#888;">（你的对手需要发起一场对局）</p></div>`);
            
            // If there are somehow pending actions without a valid game state, try to process them anyway to clear them.
            if (pendingActions?.length > 0) {
                Logger.warn("Pending actions found without a valid game state. Attempting to process...");
                await DataHandler.processPendingDealActions();
            }
            return;
        }
    
        // Render the table HTML based on the state *before* the deal.
        container.html(getGameTableHTML(playerData, enemyData, currentGameState));
        _renderGameHistoryPanel();
    
        // NOW, if there are pending actions, process them over the just-rendered table.
        if (pendingActions?.length > 0) {
            await DataHandler.processPendingDealActions();
            // The processPending... function will trigger a complete re-render with the final card state via fetchAllGameData().
        }
    },

    _renderRulesView(container) {
        container.html(getRulesViewHTML());
        const firstRuleItem = container.find('.rules-list-item').first();
        if (firstRuleItem.length) this.handleRulesItemClick(firstRuleItem);
    },
    
    async handleRulesItemClick(itemElement) {
        const panel = jQuery_API(parentWin.document.body).find(`#${AIGame_Config.PANEL_ID}`);
        const ruleId = itemElement.data('rule-id');
        const contentPanel = panel.find('.rules-content-display');
        panel.find('.rules-list-item').removeClass('active');
        itemElement.addClass('active');
        try {
            const ruleJsUrl = new URL(import.meta.url);
            const basePath = ruleJsUrl.pathname.substring(0, ruleJsUrl.pathname.lastIndexOf('/modules'));
            const ruleFileUrl = `${basePath}/rules/${ruleId}.md`;
            const response = await fetch(ruleFileUrl);
            if (!response.ok) throw new Error('Rule file not found.');
            const markdown = await response.text();
            const converter = getMarkdownConverter();
            contentPanel.html(converter ? converter.makeHtml(markdown) : 'Markdown 渲染器加载失败。');
        } catch (err) {
            contentPanel.html('<p>无法加载该规则的说明。</p>');
            Logger.error(`加载规则文件失败: ${ruleId}.md`, err);
        }
    },
    
    updateScaleAndPosition(shouldSave = false) {
        const p = jQuery_API(parentWin.document.body).find(`#${AIGame_Config.PANEL_ID}`);
        if (!p.length) return;
        const baseWidth = 800, baseHeight = 600, padding = 20;
        const winWidth = parentWin.innerWidth, winHeight = parentWin.innerHeight;
        const scale = Math.min(1, (winWidth - padding) / baseWidth, (winHeight - padding) / baseHeight);
        p.css({ 'transform': `scale(${scale})`, 'transform-origin': 'top left' });
        const scaledWidth = baseWidth * scale, scaledHeight = baseHeight * scale;
        let currentPos = AIGame_State.panelPos || { top: `${(winHeight - scaledHeight) / 2}px`, left: `${(winWidth - scaledWidth) / 2}px` };
        let top = Math.max(padding / 2, Math.min(parseFloat(currentPos.top), winHeight - scaledHeight - (padding / 2)));
        let left = Math.max(padding / 2, Math.min(parseFloat(currentPos.left), winWidth - scaledWidth - (padding / 2)));
        const newPos = { top: `${top}px`, left: `${left}px` };
        p.css(newPos);
        AIGame_State.panelPos = newPos;
        if (shouldSave) AIGame_State.saveUiState();
    },

    resetUIPosition() {
        AIGame_State.panelPos = null;
        this.updateScaleAndPosition(true);
    },

    applyFontSize() {
        const panel = jQuery_API(parentWin.document.body).find(`#${AIGame_Config.PANEL_ID}`);
        if (panel.length) panel.css('font-size', `${AIGame_State.baseFontSize}px`);
    },

    animateDeal(dealActions) {
        const panel = jQuery_API(parentWin.document.body).find('#' + AIGame_Config.PANEL_ID);
        const gameTable = panel.find('.game-table');
        if (!gameTable.length) return Promise.resolve();
    
        const getTargetCoords = (target, name, index) => {
            let selector;
            if (target === 'player') {
                selector = '#player-area-bottom .hand';
            } else if (target === 'enemy') {
                // Find the specific enemy container by data attribute
                selector = `.player-position-container[data-enemy-name="${name}"] .hand`;
            } else {
                selector = '.community-cards';
            }
    
            const el = gameTable.find(selector);
            if (!el.length) return { x: 0, y: 0 };
    
            const panelOffset = panel.offset();
            const elOffset = el.offset();
            if (!panelOffset || !elOffset) return { x: 0, y: 0 };
    
            // Adjust coordinates to be relative to the panel, not the game table
            return {
                x: elOffset.left - panelOffset.left + (el.width() / 2) + (index * 20) - 40,
                y: elOffset.top - panelOffset.top + (el.height() / 2) - 56
            };
        };
    
        const deckEl = gameTable.find('.deck-placeholder');
        if (!deckEl.length) return Promise.resolve();
    
        const panelOffset = panel.offset();
        const deckOffset = deckEl.offset();
        if (!panelOffset || !deckOffset) return Promise.resolve();
    
        const startX = deckOffset.left - panelOffset.left + (deckEl.width() / 2) - 40;
        const startY = deckOffset.top - panelOffset.top + (deckEl.height() / 2) - 56;
    
        let animationPromises = [];
        let cardIndex = 0;
    
        dealActions.forEach(action => {
            for (let i = 0; i < action.count; i++) {
                animationPromises.push(new Promise(resolve => {
                    setTimeout(() => {
                        const card = jQuery_API('<div class="animated-deal-card"></div>').css({ left: `${startX}px`, top: `${startY}px` });
                        panel.append(card);
                        const targetCoords = getTargetCoords(action.target, action.name, i);
                        setTimeout(() => card.css({ left: `${targetCoords.x}px`, top: `${targetCoords.y}px`, transform: 'scale(1)', opacity: 0.5 }), 20);
                        setTimeout(() => { card.remove(); resolve(); }, 600);
                    }, cardIndex * 120);
                }));
                cardIndex++;
            }
        });
    
        return Promise.all(animationPromises);
    },
    
    animateChips({ from, to, count = 1, mode = 'stream' }) {
        const panel = jQuery_API(parentWin.document.body).find('#' + AIGame_Config.PANEL_ID);
        const sourceEl = panel.find(from), targetEl = panel.find(to);
        if (!sourceEl.length || !targetEl.length) return;
    
        const panelOffset = panel.offset();
        const sourceOffset = sourceEl.offset();
        const targetOffset = targetEl.offset();
        if (!panelOffset || !sourceOffset || !targetOffset) return;
    
        const baseStartX = sourceOffset.left - panelOffset.left + (sourceEl.width() / 2) - 12;
        const baseStartY = sourceOffset.top - panelOffset.top + (sourceEl.height() / 2) - 12;
        const baseEndX = targetOffset.left - panelOffset.left + (targetEl.width() / 2) - 12;
        const baseEndY = targetOffset.top - panelOffset.top + (targetEl.height() / 2) - 12;
    
        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                const startX = baseStartX + (mode === 'burst' ? (Math.random() - 0.5) * 40 : 0);
                const startY = baseStartY + (mode === 'burst' ? (Math.random() - 0.5) * 40 : 0);
                const chip = jQuery_API('<div class="animated-chip"><i class="fas fa-coins"></i></div>').css({ left: `${startX}px`, top: `${startY}px` });
                panel.append(chip);
                setTimeout(() => chip.css({ left: `${baseEndX}px`, top: `${baseEndY}px` }).addClass('moving'), 20);
                setTimeout(() => chip.remove(), 800);
            }, mode === 'burst' ? i * 20 : 0);
        }
    },
    
    showEndGameAnimation(result) {
        const panel = jQuery_API(parentWin.document.body).find(`#${AIGame_Config.PANEL_ID}`);
        const isWin = result === 'win' || result === 'boss_win';
        const overlayClass = isWin ? 'win-overlay' : 'loss-overlay';
        const text = isWin ? 'VICTORY' : 'DEFEAT';
        
        if (isWin) AudioManager.play('boss_win');
        else AudioManager.play('dice');

        const overlay = jQuery_API(`<div class="game-end-overlay ${overlayClass}"><div class="end-game-text-container"><span class="end-game-text">${text}</span></div></div>`);
        panel.append(overlay);
        
        setTimeout(() => {
            overlay.addClass('visible');
            if (!isWin) {
                overlay.find('.end-game-text').addClass('shattering');
            }
        }, 50);
    
        setTimeout(() => {
            overlay.removeClass('visible');
            setTimeout(() => overlay.remove(), 500);
        }, 2500);
    },

    panMap(dx, dy) {
        const mapCanvas = jQuery_API(parentWin.document.body).find('.map-canvas');
        if (!mapCanvas.length) return;
        AIGame_State.mapPan.x += dx;
        AIGame_State.mapPan.y += dy;
        mapCanvas.css('transform', `translate(${AIGame_State.mapPan.x}px, ${AIGame_State.mapPan.y}px) scale(${AIGame_State.mapZoom})`);
    },
    
    zoomMap(factor, mouseX, mouseY) {
        const mapCanvas = jQuery_API(parentWin.document.body).find('.map-canvas');
        if (!mapCanvas.length) return;
        const newZoom = Math.max(0.5, Math.min(2.5, AIGame_State.mapZoom * factor));
        const pan = AIGame_State.mapPan;
        const zoom = AIGame_State.mapZoom;
        
        pan.x = mouseX - (mouseX - pan.x) * (newZoom / zoom);
        pan.y = mouseY - (mouseY - pan.y) * (newZoom / zoom);
        
        AIGame_State.mapZoom = newZoom;
        mapCanvas.css('transform', `translate(${pan.x}px, ${pan.y}px) scale(${newZoom})`);
    },

    zoomMapByStep(direction) {
        const mapContainer = jQuery_API(parentWin.document.body).find('.map-pan-zoom-container');
        if (!mapContainer.length) return;
        const rect = mapContainer[0].getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const zoomFactor = direction === 'in' ? 1.2 : 1 / 1.2;
        this.zoomMap(zoomFactor, centerX, centerY);
    },

    animateNodeReveal(newNode, parentNode) {
        const mapNodesContainer = jQuery_API(parentWin.document.body).find('.map-nodes-container');
        const mapSvg = jQuery_API(parentWin.document.body).find('.map-svg');

        // This requires a separate, new component for the hidden node HTML
        const newNodeHtml = MapView.getHiddenNodeHTML(newNode); 
        const newNodeElement = jQuery_API(newNodeHtml).addClass('revealing-node').appendTo(mapNodesContainer);

        const newPathHtml = `<line class="map-path traveled revealing-path" x1="${parentNode.x}" y1="${parentNode.y}" x2="${newNode.x}" y2="${newNode.y}"></line>`;
        mapSvg.append(newPathHtml);
    }
};
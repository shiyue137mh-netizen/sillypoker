/**
 * AI Card Table Extension - UI Controller (ES6 Module)
 * @description Manages UI state, panel visibility, and orchestrates rendering of different views.
 */
import { AIGame_Config } from '../config.js';
import { AIGame_State } from './state.js';
import { AIGame_Events } from './events.js';
import { Logger } from './logger.js';
import { getGameTableHTML, getStagedActionsHTML } from './gameRenderer.js';
import { getRulesViewHTML } from './components/RulesView.js';
import { getPlayerHUDHTML, getPlayerInventoryHTML } from './components/PlayerStatus.js';
import { AudioManager } from './audioManager.js';

// Dependencies
let jQuery_API, parentWin, toastr_API, DataHandler, SillyTavern_Context_API, History_API, TavernHelper_API;
// View Modules
let ModeSelectionView, DifficultyView, SettingsView, StoryView, LogView, MapView, HallOfFameView;

let markdownConverter = null;

function getMarkdownConverter() {
    if (!markdownConverter) {
        if (parentWin.showdown && typeof parentWin.showdown.Converter === 'function') {
            markdownConverter = new parentWin.showdown.Converter({
                tables: true, strikethrough: true, tasklists: true, simpleLineBreaks: true
            });
        } else {
            Logger.error("Showdown markdown converter is not available on the parent window.");
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

    // Only show HUD elements in roguelike mode
    if (AIGame_State.gameMode === 'roguelike' && AIGame_State.runInProgress) {
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
        ModeSelectionView = viewModules.ModeSelectionView;
        DifficultyView = viewModules.DifficultyView;
        SettingsView = viewModules.SettingsView;
        StoryView = viewModules.StoryView;
        LogView = viewModules.LogView;
        MapView = viewModules.MapView;
        HallOfFameView = viewModules.HallOfFameView; // NEW

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
            DataHandler.loadInitialState();
        }
    },

    updateToggleButtonState() {
        const toggleBtn = jQuery_API(parentWin.document.body).find(`#${AIGame_Config.TOGGLE_BUTTON_ID}`);
        if (!toggleBtn.length) return;
        toggleBtn.removeClass('in-progress game-starting');
        if (AIGame_State.gameMode === 'roguelike' && AIGame_State.runInProgress) {
            toggleBtn.addClass('in-progress');
        }
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

        if (!AIGame_State.hasGameBook || !AIGame_State.isModeSelected) {
            statusIndicator.removeClass('active');
            ModeSelectionView.render(contentDiv);
            return;
        }

        statusIndicator.addClass('active');

        if (AIGame_State.gameMode === 'roguelike' && !AIGame_State.runInProgress) {
            let tabs = [
                { id: 'difficulty', name: '开始挑战' },
                { id: 'hall_of_fame', name: '殿堂' },
                { id: 'settings', name: '设置' }
            ];
            // FIX: If the active tab is not one of the pre-run tabs, default to 'difficulty'
            if (!tabs.some(tab => tab.id === AIGame_State.currentActiveTab)) {
                AIGame_State.currentActiveTab = 'difficulty';
            }
            const tabsHtml = tabs.map(tab => `<button class="sillypoker-tab ${AIGame_State.currentActiveTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">${tab.name}</button>`).join('');
            tabsContainer.html(`<div class="sillypoker-tabs">${tabsHtml}</div>`);
            
            if (AIGame_State.currentActiveTab === 'difficulty') DifficultyView.render(contentDiv);
            else if (AIGame_State.currentActiveTab === 'hall_of_fame') HallOfFameView.render(contentDiv);
            else if (AIGame_State.currentActiveTab === 'settings') SettingsView.render(contentDiv);
            return;
        }

        // --- At this point, we are in a game (either roguelike or origin) ---
        let tabs = [];
        tabs.push({ id: 'story', name: '剧情' });
        tabs.push({ id: 'game-ui', name: '游戏界面' });
        if (AIGame_State.gameMode === 'roguelike') {
            tabs.push({ id: 'map', name: '地图界面' });
        }
        tabs.push({ id: 'rules', name: '游戏规则' }, { id: 'settings', name: '设置' }, { id: 'log', name: '日志' });
        
        const tabsHtml = tabs.map(tab => `<button class="sillypoker-tab ${AIGame_State.currentActiveTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">${tab.name}</button>`).join('');
        tabsContainer.html(`<div class="sillypoker-tabs">${tabsHtml}</div>`);

        if (AIGame_State.isUpdateAvailable) {
            const settingsTab = tabsContainer.find('.sillypoker-tab[data-tab="settings"]');
            if (settingsTab.length && !settingsTab.find('.update-badge').length) {
                settingsTab.append('<span class="update-badge">NEW</span>');
            }
        }

        if (AIGame_State.currentActiveTab === 'settings') SettingsView.render(contentDiv);
        else if (AIGame_State.currentActiveTab === 'rules') this._renderRulesView(contentDiv);
        else if (AIGame_State.currentActiveTab === 'log') LogView.render(contentDiv);
        else {
            const tabContentWrapper = jQuery_API('<div class="sillypoker-tab-content-wrapper"></div>');
            const gameTabs = ['story', 'game-ui', 'map'];
            gameTabs.forEach(tabId => {
                if (tabs.some(t => t.id === tabId)) {
                     tabContentWrapper.append(`<div class="sillypoker-tab-content ${AIGame_State.currentActiveTab === tabId ? 'active' : ''}" data-tab-content="${tabId}"></div>`);
                }
            });
            contentDiv.html(tabContentWrapper);
            this.renderActiveTabContent();
        }
    },
    
    renderActiveTabContent() {
        const activeTab = AIGame_State.currentActiveTab;
        const contentWrapper = jQuery_API(parentWin.document.body).find(`.sillypoker-tab-content[data-tab-content="${activeTab}"]`);
        
        if (activeTab === 'story') StoryView.render(contentWrapper);
        else if (activeTab === 'map' && AIGame_State.gameMode === 'roguelike') MapView.render(contentWrapper);
        else if (activeTab === 'game-ui') this._renderGameView(contentWrapper);
    },
    
    async _renderGameView(container) {
        // CRITICAL FIX: This is the new, correct animation pipeline.
        // It only triggers when the user is on the game tab and there are unprocessed actions.
        if (AIGame_State.currentGameState?.unprocessed_deal_actions?.length > 0) {
            Logger.log('[UI] Detected unprocessed deal actions. Initiating animation sequence...');
            // Step 1: Tell the data handler to process actions and prepare the state for animation.
            // This function is now synchronous and only manipulates data.
            await DataHandler.initiateDealAnimationSequence();
            // Step 2: Now that data is ready, trigger a full data refetch and a clean re-render.
            // The new render will see `last_deal_animation_queue` and start the animation.
            await DataHandler.fetchAllGameData();
            // Step 3: Stop this current render cycle. The new one will take over.
            Logger.log('[UI] Data prepared for animation. A new render cycle will now start.');
            return; 
        }

        const { playerData, enemyData, currentGameState } = AIGame_State;
        
        if (currentGameState?.last_deal_animation_queue?.length > 0) {
            const actions = [...currentGameState.last_deal_animation_queue];
            container.html(getGameTableHTML(playerData, enemyData, currentGameState));
            _renderGameHistoryPanel();
            this.rerenderStagedActionsAndCommitButton();
            
            // Force a DOM reflow to ensure elements are in place before animation starts
            container[0].offsetHeight;
            
            await this.animateDeal(actions);
            Logger.log('[UI] Deal animation completed, calling cleanup...');
            await DataHandler.cleanupAfterDealAnimation();
            Logger.log('[UI] Cleanup completed, relying on state update to re-render.');
            return;
        }

        if (!playerData || !currentGameState || !enemyData || !enemyData.enemies || enemyData.enemies.length === 0) {
             container.html(`
                <div class="sillypoker-content-centerer">
                    <i class="fas fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 10px;"></i>
                    <p>荷官正在洗牌...</p>
                    <p style="font-size:12px; color:#888;">（你的对手需要发起一场对局）</p>
                </div>
            `);
            return;
        }
        container.html(getGameTableHTML(playerData, enemyData, currentGameState));
        _renderGameHistoryPanel();
        
        this.rerenderStagedActionsAndCommitButton();
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

    rerenderPlayerHUD() {
        const panel = jQuery_API(parentWin.document.body).find(`#${AIGame_Config.PANEL_ID}`);
        const hudContainer = panel.find('.header-left-icons');
        
        hudContainer.find('.player-hud').remove();
        if (AIGame_State.runInProgress) {
             hudContainer.append(getPlayerHUDHTML(AIGame_State.playerData, AIGame_State.currentGameState));
             if (AIGame_State.playerData.health === 1) {
                hudContainer.find('.health-display .heart-icon.filled').addClass('heart-beat');
             }
        }
    },

    rerenderStagedActionsAndCommitButton() {
        const panel = jQuery_API(parentWin.document.body).find(`#${AIGame_Config.PANEL_ID}`);
        const stagedActionsContainer = panel.find('.staged-actions-container');
        if (stagedActionsContainer.length) {
            stagedActionsContainer.html(getStagedActionsHTML(AIGame_State.stagedPlayerActions));
        }
        
        const commitArea = panel.find('.sillypoker-commit-area');
        const actionButtons = panel.find('.action-buttons-wrapper');
        const commitBtn = commitArea.find('#sillypoker-commit-btn');
        const actionCount = AIGame_State.stagedPlayerActions.length;

        if (actionCount > 0) {
            commitArea.removeClass('hidden');
            actionButtons.addClass('hidden');
            commitBtn.attr('data-count', actionCount);
        } else {
            commitArea.addClass('hidden');
            actionButtons.removeClass('hidden');
        }
    },
    
    updateScaleAndPosition(shouldSave = false) {
        const p = jQuery_API(parentWin.document.body).find(`#${AIGame_Config.PANEL_ID}`);
        if (!p.length) return;
        const baseWidth = 800, baseHeight = 600, padding = 20;
        const winWidth = parentWin.innerWidth, winHeight = parentWin.innerHeight;
        const scale = Math.min(1, (winWidth - padding) / baseWidth, (winHeight - padding) / baseHeight);
        
        const scaleCss = `scale(${scale})`;
        p.css({ 'transform': scaleCss, 'transform-origin': 'top left' });
        p.css('--panel-scale', scale); // Store scale in CSS variable for animations
        
        const scaledWidth = baseWidth * scale, scaledHeight = baseHeight * scale;
        let currentPos = AIGame_State.panelPos || { top: `${(winHeight - scaledHeight) / 2}px`, left: `${(winWidth - scaledWidth) / 2}px` };
        let top = Math.max(padding / 2, Math.min(parseFloat(currentPos.top), winHeight - scaledHeight - (padding / 2)));
        let left = Math.max(padding / 2, Math.min(parseFloat(currentPos.left), winWidth - scaledWidth - (padding / 2)));
        const newPos = { top: `${top}px`, left: `${left}px` };
        p.css(newPos);
        AIGame_State.panelPos = newPos;
        AIGame_State.panelScale = scale; // Save scale to state
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
            if (isWin) {
                const particleContainer = jQuery_API('<div class="particle-container"></div>').appendTo(overlay);
                for (let i = 0; i < 40; i++) {
                    const particle = jQuery_API('<div class="particle">💰</div>').appendTo(particleContainer);
                    particle.css({
                        left: `${Math.random() * 100}%`,
                        animationDelay: `${Math.random() * 2}s`,
                        fontSize: `${0.5 + Math.random() * 1}em`
                    });
                }
            } else {
                panel.addClass('panel-shake-effect');
                setTimeout(() => panel.removeClass('panel-shake-effect'), 500);
                overlay.find('.end-game-text').addClass('shattering');
            }
        }, 50);
    
        setTimeout(() => {
            overlay.removeClass('visible');
            setTimeout(() => overlay.remove(), 500);
        }, 2500);
    },

    async animateDeal(dealActions) {
        const panel = jQuery_API(parentWin.document.body).find(`#${AIGame_Config.PANEL_ID}`);
        const gameTable = panel.find('.game-table');
        if (!gameTable.length) return Promise.resolve();
    
        const getTargetEl = (targetType, name, cardIndex) => {
            let selector;
            if (targetType === 'player') {
                selector = `#player-area-bottom .hand .card.newly-dealt[data-index="${cardIndex}"]`;
            } else if (targetType === 'enemy') {
                selector = `[data-enemy-name="${name}"] .hand .card.newly-dealt[data-index="${cardIndex}"]`;
            } else if (targetType === 'board') {
                selector = `.community-cards .hand .card.newly-dealt[data-index="${cardIndex}"]`;
            }
            return gameTable.find(selector).first();
        };
    
        const deckEl = gameTable.find('.deck-placeholder');
        if (!deckEl.length || !deckEl.offset()) {
            Logger.error('Cannot start deal animation: deck placeholder not found or not rendered.');
            return Promise.resolve();
        }
    
        const deckOffset = deckEl.offset();
        const panelOffset = panel.offset();
        const scale = AIGame_State.panelScale || 1;
        const startX = (deckOffset.left - panelOffset.left) / scale + (deckEl.width() / 2) - 40;
        const startY = (deckOffset.top - panelOffset.top) / scale + (deckEl.height() / 2) - 56;
        
        await new Promise(resolve => setTimeout(resolve, 50));

        let animationPromises = [];
        let cardAnimationIndex = 0;
        
        let cardCounts = { 
            player: (AIGame_State.playerCards?.current_hand || []).filter(c => !c.isNew).length,
            board: (AIGame_State.currentGameState?.board_cards || []).filter(c => !c.isNew).length
        };
        (AIGame_State.enemyData?.enemies || []).forEach(e => {
            cardCounts[e.name] = (e.hand || []).filter(c => !c.isNew).length;
        });
        
        // NEW: Dynamic animation speed
        const totalCards = dealActions.reduce((sum, action) => sum + action.count, 0);
        let interval, flightDuration;
        if (totalCards <= 10) {
            interval = 250; // Slow and deliberate for poker/blackjack
            flightDuration = 650;
        } else if (totalCards <= 26) {
            interval = 120; // Faster for medium hands
            flightDuration = 500;
        } else {
            interval = 50; // Very fast for Dou Di Zhu
            flightDuration = 450;
        }

        for (const action of dealActions) {
            for (let i = 0; i < action.count; i++) {
                const promise = new Promise(resolve => {
                    setTimeout(async () => {
                        const targetNameKey = action.target === 'enemy' ? action.name : action.target;
                        const targetIndex = cardCounts[targetNameKey];
                        cardCounts[targetNameKey]++;
    
                        const targetEl = getTargetEl(action.target, action.name, targetIndex);
                        if (!targetEl.length) {
                            Logger.warn(`Could not find target DOM element for dealing animation`, { 
                                ...action, 
                                index: targetIndex, 
                                selector: `...[data-index="${targetIndex}"]`
                            });
                            resolve();
                            return;
                        }

                        const targetOffset = targetEl.offset();
                        const targetWidth = targetEl.width();
                        const targetHeight = targetEl.height();

                        if (!targetOffset) {
                             Logger.warn(`Could not get offset for target DOM element`, { ...action, index: targetIndex });
                             resolve();
                             return;
                        }

                        const targetX = (targetOffset.left - panelOffset.left) / scale;
                        const targetY = (targetOffset.top - panelOffset.top) / scale;
                        
                        const flyingCard = jQuery_API('<div class="animated-deal-card"></div>').css({
                            left: `${startX}px`,
                            top: `${startY}px`,
                            width: '80px',
                            height: '112px'
                        });
                        panel.append(flyingCard);
                        
                        // NEW: Conditional sound playback
                        if (totalCards <= 10 || cardAnimationIndex % 4 === 0) {
                             await AudioManager.play('deal');
                        }
                        
                        setTimeout(() => {
                             flyingCard.css({ 
                                left: `${targetX}px`, 
                                top: `${targetY}px`,
                                width: `${targetWidth}px`,
                                height: `${targetHeight}px`,
                            });
                        }, 20);
                        
                        setTimeout(() => {
                            flyingCard.remove();
                            targetEl.removeClass('newly-dealt');
                            resolve();
                        }, flightDuration);
                    }, cardAnimationIndex * interval);
                });
                animationPromises.push(promise);
                cardAnimationIndex++;
            }
        }
        return Promise.all(animationPromises);
    },

    async animateCardPlay(cardElements) {
        return new Promise(resolve => {
            const panel = jQuery_API(parentWin.document.body).find(`#${AIGame_Config.PANEL_ID}`);
            const pot = panel.find('#pot-area');
            if (!pot.length || !cardElements || cardElements.length === 0) {
                resolve();
                return;
            }
    
            const potRect = pot[0].getBoundingClientRect();
            const potCenterX = potRect.left + potRect.width / 2;
            const potCenterY = potRect.top + potRect.height / 2;
    
            let animationsCompleted = 0;
            const totalAnimations = cardElements.length;
    
            cardElements.each(function(index) {
                const cardEl = jQuery_API(this);
                const cardRect = this.getBoundingClientRect();
                const targetX = potCenterX - (cardRect.left + cardRect.width / 2);
                const targetY = potCenterY - (cardRect.top + cardRect.height / 2);
    
                cardEl.css({
                    '--target-x': `${targetX}px`,
                    '--target-y': `${targetY}px`,
                    'z-index': 100 + index
                });
    
                cardEl.addClass('card-play-animation');
    
                cardEl.on('animationend', function() {
                    jQuery_API(this).off('animationend');
                    animationsCompleted++;
                    if (animationsCompleted === totalAnimations) {
                        resolve();
                    }
                });
            });
        });
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

        const newNodeHtml = MapView.getHiddenNodeHTML(newNode); 
        const newNodeElement = jQuery_API(newNodeHtml).addClass('revealing-node').appendTo(mapNodesContainer);

        const newPathHtml = `<line class="map-path traveled revealing-path" x1="${parentNode.x}" y1="${parentNode.y}" x2="${newNode.x}" y2="${newNode.y}"></line>`;
        mapSvg.append(newPathHtml);
    }
};
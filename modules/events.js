/**
 * AI Card Table Extension - Event Handler (ES6 Module)
 * @description Centralizes all DOM event listeners for the extension.
 */
import { AIGame_Config } from '../config.js';
import { AIGame_State } from './state.js';
import { Logger } from './logger.js';
import { AudioManager } from './audioManager.js';

let jQuery_API, parentWin, DataHandler, UI, toastr_API, SillyTavern_Context_API;

// Lazy load showdown converter
let markdownConverter = null;

function getMarkdownConverter() {
    if (!markdownConverter) {
        if (parentWin.showdown && typeof parentWin.showdown.Converter === 'function') {
            markdownConverter = new parentWin.showdown.Converter();
        } else {
            Logger.error("Showdown markdown converter is not available on the parent window.");
            return null;
        }
    }
    return markdownConverter;
}


export const AIGame_Events = {
    init: function(deps, dataHandler, uiHandler) {
        jQuery_API = deps.jq;
        parentWin = deps.win;
        DataHandler = dataHandler;
        UI = uiHandler;
        toastr_API = deps.toastr;
        SillyTavern_Context_API = deps.st_context;
    },
    
    addGlobalEventListeners() {
        const body = jQuery_API(parentWin.document.body);
        body.off('click.sillypoker_global').on('click.sillypoker_global', `#${AIGame_Config.TOGGLE_BUTTON_ID}`, async () => {
            await AudioManager.play('click');
            UI.togglePanel();
        });
    },

    addPanelEventListeners() {
        const panel = jQuery_API(parentWin.document.body).find(`#${AIGame_Config.PANEL_ID}`);
        if (!panel.length) return;

        // Make panel draggable
        this.makePanelDraggable(panel);
        
        // General panel actions
        panel.off('click.sillypoker_actions').on('click.sillypoker_actions', async (e) => {
            const target = jQuery_API(e.target);
            const closest = (selector) => target.closest(selector);
            const targetId = target.attr('id');
            let isSoundWorthy = false;

            if (closest('.sillypoker-close-btn').length) {
                isSoundWorthy = true;
                UI.togglePanel(false);
            }
            else if (closest('.sillypoker-tab').length) {
                isSoundWorthy = true;
                const tabId = closest('.sillypoker-tab').data('tab');
                if (tabId !== AIGame_State.currentActiveTab) {
                    AIGame_State.currentActiveTab = tabId;
                    AIGame_State.selectedMapNodeId = null; // Clear selection when switching tabs
                    UI.renderPanelContent();
                }
            }
            else if (closest('.save-map-btn').length || closest('.reroll-map-btn').length || closest('.next-floor-btn').length) {
                isSoundWorthy = true;
                if (closest('.save-map-btn').length) DataHandler.saveMapData();
                if (closest('.reroll-map-btn').length) {
                    AIGame_State.mapData = null;
                    AIGame_State.selectedMapNodeId = null;
                    AIGame_State.mapTransformInitialized = false;
                    UI.renderActiveTabContent();
                }
                if (closest('.next-floor-btn').length) DataHandler.advanceToNextFloor();
            }
            else if (targetId === 'sillypoker-settings-icon' || targetId === 'sillypoker-escape-btn') {
                isSoundWorthy = true;
                if (targetId === 'sillypoker-settings-icon') {
                    AIGame_State.currentActiveTab = 'settings';
                    UI.renderPanelContent();
                }
                if (targetId === 'sillypoker-escape-btn') {
                    if (!AIGame_State.runInProgress) {
                        toastr_API.warning("你必须在一次挑战中才能尝试逃跑。");
                        return;
                    }
                    const confirmResult = await SillyTavern_Context_API.callGenericPopup(`你确定要尝试逃跑吗？这可能会导致你失去生命值。`, SillyTavern_Context_API.POPUP_TYPE.CONFIRM);
                    if (confirmResult) DataHandler.attemptEscape();
                }
            }
            else if (closest('.difficulty-option-btn').length) {
                isSoundWorthy = true;
                const difficulty = closest('.difficulty-option-btn').data('difficulty');
                DataHandler.startNewRun(difficulty);
            }
            else if (closest('.restart-challenge-btn').length) {
                isSoundWorthy = true;
                 const confirmResult = await SillyTavern_Context_API.callGenericPopup(`你确定要放弃当前的挑战吗？所有进度都将丢失。`, SillyTavern_Context_API.POPUP_TYPE.CONFIRM);
                 if (confirmResult) DataHandler.resetAllGameData();
            }
            else if (closest('.sillypoker-create-book-btn').length) {
                isSoundWorthy = true;
                DataHandler.createGameBookEntries();
            }
            else if (targetId === 'map-zoom-in' || targetId === 'map-zoom-out') {
                isSoundWorthy = true;
                UI.zoomMapByStep(targetId === 'map-zoom-in' ? 'in' : 'out');
            }
            else if (closest('.inventory-toggle-btn').length) {
                isSoundWorthy = true;
                AIGame_State.isInventoryVisible = !AIGame_State.isInventoryVisible;
                jQuery_API(parentWin.document.body).find('.game-table-container').toggleClass('inventory-visible', AIGame_State.isInventoryVisible);
                const icon = panel.find('.inventory-toggle-btn i');
                icon.toggleClass('fa-chevron-left fa-chevron-right');
            }
            else if (closest('.inventory-item:not(.empty)').length) {
                isSoundWorthy = true;
                const itemIndex = closest('.inventory-item').data('index');
                DataHandler.useItem(itemIndex);
            }
            else if (closest('#sillypoker-commit-btn').length) {
                isSoundWorthy = true;
                await DataHandler.commitStagedActions();
            }
            else if (closest('.action-buttons button').length) {
                isSoundWorthy = true;
                const actionButton = closest('.action-buttons button');
                const actionType = actionButton.data('action');
                let action = { type: actionType };

                const selectedCards = [];
                if (actionType === 'fold' || actionType === 'play_cards') {
                     panel.find('.player-position-container .hand .card.selected').each(function() {
                        const suit = jQuery_API(this).data('suit');
                        const rank = jQuery_API(this).find('.card-rank').text();
                        selectedCards.push({ suit, rank });
                    });
                    action.cards = selectedCards;
                }

                if (actionType === 'bet') {
                    const amountStr = await SillyTavern_Context_API.callGenericPopup('请输入下注金额:', SillyTavern_Context_API.POPUP_TYPE.INPUT, '100');
                    if (amountStr === false || amountStr === null || String(amountStr).trim() === '') return;
                    
                    const amount = parseInt(amountStr, 10);
                    if (isNaN(amount) || amount <= 0) {
                        toastr_API.warning('下注金额无效。');
                        return;
                    }
                    if (amount > AIGame_State.playerData.chips) {
                        toastr_API.warning('筹码不足！');
                        return;
                    }
                    action.amount = amount;
                }
                
                if (actionType === 'custom') {
                    const customActionText = await SillyTavern_Context_API.callGenericPopup('请输入你的自定义动作:', SillyTavern_Context_API.POPUP_TYPE.INPUT, '');
                    if (customActionText && String(customActionText).trim() !== '') {
                        action.text = String(customActionText).trim();
                        DataHandler.stagePlayerAction(action);
                    }
                    return;
                }
                
                DataHandler.stagePlayerAction(action);
            }
            else if (closest('.player-position-container .hand .card').length) {
                closest('.player-position-container .hand .card').toggleClass('selected');
            }
            else if (closest('.rules-list-item').length) {
                isSoundWorthy = true;
                const ruleId = closest('.rules-list-item').data('rule-id');
                const contentPanel = panel.find('.rules-content-display');
                const ruleItems = panel.find('.rules-list-item');

                ruleItems.removeClass('active');
                closest('.rules-list-item').addClass('active');

                try {
                    const ruleJsUrl = new URL(import.meta.url);
                    const basePath = ruleJsUrl.pathname.substring(0, ruleJsUrl.pathname.lastIndexOf('/modules'));
                    const ruleFileUrl = `${basePath}/rules/${ruleId}.md`;
                    const response = await fetch(ruleFileUrl);
                    if (!response.ok) throw new Error('Rule file not found.');
                    const markdown = await response.text();
                    const converter = getMarkdownConverter();
                    if(converter) {
                         contentPanel.html(converter.makeHtml(markdown));
                    } else {
                        contentPanel.text('Markdown 渲染器加载失败。');
                    }
                } catch (err) {
                    contentPanel.html('<p>无法加载该规则的说明。</p>');
                    Logger.error(`加载规则文件失败: ${ruleId}.md`, err);
                }
            }

            if(isSoundWorthy) await AudioManager.play('click');
        });
        
    },

    addMapInteractionListeners(container) {
        const mapContent = container; // The container is now the map view itself
        
        let isPanning = false;
        let lastMousePos = { x: 0, y: 0 };
        let dragStartPos = { x: 0, y: 0 };
        const CLICK_THRESHOLD = 5; // To differentiate pan from click

        // Cleanup old listeners to prevent multiple bindings
        const panZoomContainer = mapContent.find('.map-pan-zoom-container');
        panZoomContainer.off('.sillypoker_map_interaction');
        jQuery_API(parentWin.document).off('.sillypoker_map_pan');

        panZoomContainer.on('mousedown.sillypoker_map_interaction', function(e) {
            if (e.button !== 0) return;
            isPanning = true;
            lastMousePos = { x: e.clientX, y: e.clientY };
            dragStartPos = { x: e.clientX, y: e.clientY };
            jQuery_API(this).css('cursor', 'grabbing');
        });

        panZoomContainer.on('click.sillypoker_map_interaction', '.map-node.reachable', async function(e) {
             e.stopPropagation();
             await AudioManager.play('click');
             const node = jQuery_API(this);
             const nodeId = node.data('node-id');

             if (AIGame_State.selectedMapNodeId === nodeId) return; // Already selected

             AIGame_State.selectedMapNodeId = nodeId;
             UI.renderActiveTabContent(); // Re-render to show selection change
        });
        
        panZoomContainer.on('dblclick.sillypoker_map_interaction', '.map-node.reachable', function(e) {
            e.stopPropagation();
            const node = jQuery_API(this);
            const nodeId = node.data('node-id');
            const nodeType = node.data('node-type');
            DataHandler.travelToNode(nodeId, nodeType);
        });
        
        // This targets the travel button inside the details panel
        mapContent.closest('.map-view-wrapper').find('.map-details-panel').on('click.sillypoker_map_interaction', '.map-travel-btn', async function(e){
            e.stopPropagation();
            await AudioManager.play('click');
            if (AIGame_State.selectedMapNodeId) {
                const nodeElement = container.find(`.map-node[data-node-id="${AIGame_State.selectedMapNodeId}"]`);
                if (nodeElement.length) {
                    DataHandler.travelToNode(AIGame_State.selectedMapNodeId, nodeElement.data('node-type'));
                }
            }
        });


        jQuery_API(parentWin.document).on('mouseup.sillypoker_map_pan', (e) => {
            if (isPanning) {
                isPanning = false;
                panZoomContainer.css('cursor', 'grab');
                const dx = Math.abs(e.clientX - dragStartPos.x);
                const dy = Math.abs(e.clientY - dragStartPos.y);
                if (dx > CLICK_THRESHOLD || dy > CLICK_THRESHOLD) {
                    e.stopPropagation();
                }
            }
        });

        jQuery_API(parentWin.document).on('mousemove.sillypoker_map_pan', (e) => {
            if (isPanning) {
                const dx = e.clientX - lastMousePos.x;
                const dy = e.clientY - lastMousePos.y;
                lastMousePos = { x: e.clientX, y: e.clientY };
                UI.panMap(dx, dy);
            }
        });
        
        panZoomContainer.on('wheel.sillypoker_map_interaction', function(e) {
            e.preventDefault();
            const container = jQuery_API(this);
            const rect = container[0].getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const zoomFactor = e.originalEvent.deltaY < 0 ? 1.1 : 1 / 1.1;
            UI.zoomMap(zoomFactor, mouseX, mouseY);
        });
    },

    makePanelDraggable(panel) {
        let isDragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;

        panel.off('mousedown.sillypoker_drag_init').on('mousedown.sillypoker_drag_init', '.sillypoker-header', (e) => {
            if (jQuery_API(e.target).is('button, i, .map-action-btn, input, .map-zoom-btn, .sillypoker-header-btn')) return;
            isDragging = true;
            const panelRect = panel[0].getBoundingClientRect();
            dragOffsetX = e.clientX - panelRect.left;
            dragOffsetY = e.clientY - panelRect.top;
            
            jQuery_API(parentWin.document).on('mousemove.sillypoker_drag', (e_move) => {
                if (!isDragging) return;
                panel.css({ left: e_move.clientX - dragOffsetX, top: e_move.clientY - dragOffsetY });
            });

            jQuery_API(parentWin.document).one('mouseup.sillypoker_drag_end', () => {
                isDragging = false;
                jQuery_API(parentWin.document).off('.sillypoker_drag');
            });
        });
    }
};
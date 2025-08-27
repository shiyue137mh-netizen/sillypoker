/**
 * AI Card Table Extension - Event Handler (ES6 Module)
 * @description Centralizes all DOM event listeners for the extension.
 */
import { AIGame_Config } from '../config.js';
import { AIGame_State } from './state.js';
import { Logger } from './logger.js';

let jQuery_API, parentWin, DataHandler, UI, toastr_API, SillyTavern_Context_API;

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
        body.off('click.sillypoker_global').on('click.sillypoker_global', `#${AIGame_Config.TOGGLE_BUTTON_ID}`, () => {
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

            if (closest('.sillypoker-close-btn').length) {
                UI.togglePanel(false);
            }
            else if (closest('.sillypoker-create-book-btn').length) {
                DataHandler.createGameBookEntries();
            }
            else if (closest('.sillypoker-tab').length) {
                const tabId = closest('.sillypoker-tab').data('tab');
                if (!AIGame_State.runInProgress && (tabId === 'game-ui' || tabId === 'map')) {
                    toastr_API.info('请先开始一次新的挑战。');
                    return;
                }
                if (tabId !== AIGame_State.currentActiveTab) {
                    AIGame_State.currentActiveTab = tabId;
                    AIGame_State.selectedMapNodeId = null; // Clear selection when switching tabs
                    UI.renderPanelContent();
                }
            }
            else if (closest('.save-map-btn').length) {
                DataHandler.saveMapData();
            }
            else if (closest('.reroll-map-btn').length) {
                AIGame_State.mapData = null;
                AIGame_State.selectedMapNodeId = null;
                AIGame_State.mapTransformInitialized = false; // Reset transform for new map
                UI.renderActiveTabContent();
            }
            else if (targetId === 'sillypoker-settings-icon') {
                 AIGame_State.currentActiveTab = 'settings';
                 UI.renderPanelContent();
            }
            else if (targetId === 'sillypoker-escape-btn') {
                 DataHandler.attemptEscape();
            }
            else if (closest('.difficulty-option-btn').length) {
                const difficulty = closest('.difficulty-option-btn').data('difficulty');
                DataHandler.startNewRun(difficulty);
            }
             else if (closest('.restart-challenge-btn').length) {
                const confirmResult = await SillyTavern_Context_API.callGenericPopup(
                    '你确定要重新开始吗？所有进度都将丢失。',
                    SillyTavern_Context_API.POPUP_TYPE.CONFIRM,
                    '', {
                        title: '确认'
                    }
                );
                if (confirmResult) {
                    await DataHandler.resetAllGameData();
                }
            }
            else if (targetId === 'map-zoom-in') {
                UI.zoomMapByStep('in');
            }
            else if (targetId === 'map-zoom-out') {
                UI.zoomMapByStep('out');
            }
            else if (closest('.map-travel-btn').length) {
                if (AIGame_State.selectedMapNodeId) {
                    const selectedNode = AIGame_State.mapData.nodes.find(n => n.id === AIGame_State.selectedMapNodeId);
                    if (selectedNode) {
                        Logger.log(`Player clicked travel button for node ${selectedNode.id} (${selectedNode.type}).`);
                        DataHandler.travelToNode(selectedNode.id, selectedNode.type);
                    }
                }
            }
            else if (closest('.inventory-toggle-btn').length) {
                AIGame_State.isInventoryVisible = !AIGame_State.isInventoryVisible;
                jQuery_API(parentWin.document.body).find('.game-table-container').toggleClass('inventory-visible', AIGame_State.isInventoryVisible);
                const icon = panel.find('.inventory-toggle-btn i');
                icon.toggleClass('fa-chevron-left fa-chevron-right');
            }
            else if (closest('#sillypoker-commit-btn').length) {
                await DataHandler.commitStagedActions();
            }
            else if (closest('.action-buttons button').length) {
                const actionButton = closest('.action-buttons button');
                const actionType = actionButton.data('action');
                let action = { type: actionType };

                if (actionType === 'bet') {
                    const amountStr = await SillyTavern_Context_API.callGenericPopup('请输入下注金额', SillyTavern_Context_API.POPUP_TYPE.INPUT, '100');
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
                
                if (actionType === 'fold' || actionType === 'showdown') {
                    const selectedCards = [];
                    panel.find('.player-area .hand .card.selected').each(function() {
                        const cardEl = jQuery_API(this);
                        selectedCards.push({
                            suit: cardEl.data('suit'),
                            rank: cardEl.find('.card-rank').text()
                        });
                    });
                    
                    if (selectedCards.length > 0) {
                        action.cards = selectedCards;
                    } else if (actionType === 'showdown' && AIGame_State.playerCards.current_hand.length > 0) {
                        // If showdown is clicked with no specific cards selected, assume all cards are shown.
                        action.cards = AIGame_State.playerCards.current_hand;
                    }
                }
                
                DataHandler.stagePlayerAction(action);
            }
            else if (closest('.player-area .hand .card').length) {
                closest('.player-area .hand .card').toggleClass('selected');
            }
        });

        // Map-specific interactions are now added in ui.js after the map is rendered.
    },

    addMapInteractionListeners(mapContent) {
        // Cleanup previous listeners to prevent duplication
        mapContent.off('.sillypoker_map_interaction');
        jQuery_API(parentWin.document).off('.sillypoker_map_pan_move .sillypoker_map_pan_end');
    
        // Mousedown starts the process for either a click or a pan
        mapContent.on('mousedown.sillypoker_map_interaction', '.map-pan-zoom-container', function(e_down) {
            if (e_down.button !== 0) return; // Only left-click
    
            const container = jQuery_API(this);
            let hasDragged = false;
            let lastPos = { x: e_down.clientX, y: e_down.clientY };
            
            const targetNode = jQuery_API(e_down.target).closest('.map-node.reachable');
    
            jQuery_API(parentWin.document).on('mousemove.sillypoker_map_pan_move', function(e_move) {
                const dx = e_move.clientX - lastPos.x;
                const dy = e_move.clientY - lastPos.y;
    
                if (!hasDragged && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) { // Smaller drag threshold
                    hasDragged = true;
                    container.css('cursor', 'grabbing');
                }
    
                if (hasDragged) {
                    UI.panMap(dx, dy);
                }
                
                lastPos = { x: e_move.clientX, y: e_move.clientY };
            }).one('mouseup.sillypoker_map_pan_end', function() {
                jQuery_API(parentWin.document).off('.sillypoker_map_pan_move');
                container.css('cursor', 'grab');
    
                if (!hasDragged && targetNode.length > 0) {
                    // It was a click on a reachable node.
                    const nodeId = targetNode.data('node-id');
                    Logger.log(`Node ${nodeId} was clicked.`);
                    AIGame_State.selectedMapNodeId = nodeId;
                    UI.renderActiveTabContent();
                }
            });
    
            // Prevent default browser drag behavior
            e_down.preventDefault();
        });
        
        // Double click to travel, managed as a separate event
        mapContent.on('dblclick.sillypoker_map_interaction', '.map-node.reachable', function(e) {
            e.preventDefault();
            const node = jQuery_API(this);
            const nodeId = node.data('node-id');
            const nodeType = node.data('node-type');
            Logger.log(`Player double-clicked to travel to node ${nodeId} (${nodeType}).`);
            DataHandler.travelToNode(nodeId, nodeType);
        });
        
        // Wheel for zooming
        mapContent.on('wheel.sillypoker_map_interaction', '.map-pan-zoom-container', function(e) {
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
            if (jQuery_API(e.target).is('button, i, .map-action-btn, input, .map-zoom-btn, .map-travel-btn')) return;
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
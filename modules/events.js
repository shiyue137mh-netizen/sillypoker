/**
 * AI Card Table Extension - Event Handler (ES6 Module)
 * @description Centralizes all DOM event listeners for the extension.
 */
import { AIGame_Config } from '../config.js';
import { AIGame_State } from './state.js';
import { Logger } from './logger.js';
import { AudioManager } from './audioManager.js';

let jQuery_API, parentWin, DataHandler, UI, toastr_API, SillyTavern_Context_API, TavernHelper_API;

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
        TavernHelper_API = deps.th; // Added TavernHelper API
    },
    
    addGlobalEventListeners() {
        const body = jQuery_API(parentWin.document.body);
        body.off('click.sillypoker_global').on('click.sillypoker_global', `#${AIGame_Config.TOGGLE_BUTTON_ID}`, async () => {
            await AudioManager.play('click1');
            UI.togglePanel();
        });
    },

    addPanelEventListeners() {
        const panel = jQuery_API(parentWin.document.body).find(`#${AIGame_Config.PANEL_ID}`);
        if (!panel.length) return;

        this.makePanelDraggable(panel);
        
        panel.off('click.sillypoker_actions').on('click.sillypoker_actions', async (e) => {
            const target = jQuery_API(e.target);
            const closest = (selector) => target.closest(selector);
            const targetId = target.attr('id');
            let isSoundWorthy = true;

            // New: Close emote wheel if click is outside
            const emoteContainer = closest('.emote-wheel-container');
            if (!emoteContainer.length) {
                panel.find('.emote-wheel-menu').removeClass('visible');
            }

            if (closest('.sillypoker-close-btn').length) {
                UI.togglePanel(false);
            }
            else if (closest('.sillypoker-tab').length) {
                const tabId = closest('.sillypoker-tab').data('tab');
                if (tabId !== AIGame_State.currentActiveTab) {
                    AIGame_State.currentActiveTab = tabId;
                    AIGame_State.selectedMapNodeId = null; 
                    UI.renderPanelContent();
                }
            }
            else if (['sillypoker-escape-btn', 'sillypoker-surrender-btn', 'sillypoker-beg-btn'].includes(targetId)) {
                if (!AIGame_State.runInProgress) {
                    toastr_API.warning("你必须在一次挑战中才能执行此操作。");
                    return;
                }
                const actions = {
                    'sillypoker-escape-btn': {
                        prompt: '你确定要尝试逃跑吗？这可能会导致你失去生命值。',
                        handler: DataHandler.attemptEscape,
                    },
                    'sillypoker-surrender-btn': {
                        prompt: '你确定要放弃当前的挑战吗？这将直接计为一次失败。',
                        handler: DataHandler.surrender,
                    },
                    'sillypoker-beg-btn': {
                        prompt: '你确定要求饶吗？你的对手可能会（也可能不会）手下留情。',
                        handler: DataHandler.begForMercy,
                    },
                };
                const action = actions[targetId];
                if (action) {
                    const confirmResult = await SillyTavern_Context_API.callGenericPopup(action.prompt, SillyTavern_Context_API.POPUP_TYPE.CONFIRM);
                    if (confirmResult) action.handler();
                }
            }
            else if (closest('.difficulty-option-btn').length) {
                const difficulty = closest('.difficulty-option-btn').data('difficulty');
                DataHandler.startNewRun(difficulty);
            }
            else if (closest('#toggle-audio-btn').length) {
                AIGame_State.isMuted = !AIGame_State.isMuted;
                AudioManager.setMute(AIGame_State.isMuted);
                UI.renderPanelContent(); // Re-render to update button text/class
            }
            else if (closest('#bgm-toggle-btn').length) {
                AudioManager.toggleBGM();
                // UI is re-rendered inside toggleBGM's state update
            }
            else if (closest('#bgm-prev-btn').length) {
                AudioManager.prevTrack();
            }
            else if (closest('#bgm-next-btn').length) {
                AudioManager.nextTrack();
            }
            else if (closest('.restart-challenge-btn').length) {
                 const confirmResult = await SillyTavern_Context_API.callGenericPopup(`你确定要放弃当前的挑战吗？所有进度都将丢失。`, SillyTavern_Context_API.POPUP_TYPE.CONFIRM);
                 if (confirmResult) DataHandler.resetAllGameData();
            }
            else if (closest('.sillypoker-create-book-btn').length) {
                DataHandler.createGameBookEntries();
            }
            else if (closest('.inventory-toggle-btn').length) {
                AIGame_State.isInventoryVisible = !AIGame_State.isInventoryVisible;
                jQuery_API(parentWin.document.body).find(`#${AIGame_Config.PANEL_ID}`).toggleClass('inventory-visible', AIGame_State.isInventoryVisible);
                const icon = panel.find('.inventory-toggle-btn i');
                icon.toggleClass('fa-chevron-left fa-chevron-right');
            }
            else if (closest('.inventory-item:not(.empty)').length) {
                await AudioManager.play('choose');
                isSoundWorthy = false;
                const itemIndex = closest('.inventory-item').data('index');
                DataHandler.useItem(itemIndex);
            }
            else if (closest('#sillypoker-commit-btn').length) {
                await DataHandler.commitStagedActions();
            }
            else if (closest('#sillypoker-undo-all-btn').length) {
                await DataHandler.undoAllStagedActions();
            }
            else if (closest('.undo-action-btn').length) {
                const actionId = closest('.undo-action-btn').data('action-id');
                DataHandler.undoStagedAction(actionId);
            }
             // New: Emote Wheel Logic
            else if (emoteContainer.length) {
                isSoundWorthy = false; // Custom sounds handled inside
                if (closest('.emote-wheel-button').length) {
                    await AudioManager.play('click2');
                    panel.find('.emote-wheel-menu').toggleClass('visible');
                }
                else if (closest('.emote-wheel-item').length) {
                    await AudioManager.play('click1');
                    const item = closest('.emote-wheel-item');
                    const itemIndex = item.data('index');
                    let textTemplate = AIGame_Config.EMOTE_TEXTS[itemIndex];
                    
                    // We only need to substitute our custom placeholders.
                    // SillyTavern will handle {{user}} automatically when the text is sent for generation.
                    const playerChips = AIGame_State.playerData?.chips || 0;

                    let final_text = textTemplate
                        .replace(/\[现在筹码数\]/g, playerChips.toLocaleString());

                    // Close menu immediately for better UX
                    panel.find('.emote-wheel-menu').removeClass('visible');

                    // Use /setinput and generate() to send the message as a user and trigger an AI response.
                    await TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(final_text)}`);
                    SillyTavern_Context_API.generate();
                }
            }
            else if (closest('#all-in-btn').length) {
                isSoundWorthy = false;
                const allInButton = closest('#all-in-btn');
                const confirmResult = await SillyTavern_Context_API.callGenericPopup(`你确定要全下所有筹码吗？`, SillyTavern_Context_API.POPUP_TYPE.CONFIRM, '', { title: '终极抉择' });
                if (confirmResult) {
                    await AudioManager.play('dice');
                    allInButton.prop('disabled', true);
                    const textSpan = allInButton.find('span');
                    textSpan.addClass('shattering');
                    await DataHandler.playerGoesAllIn();
                }
            }
            else if (closest('.action-buttons-wrapper button').length) {
                isSoundWorthy = false; // Sound is handled by the staging logic
                const actionButton = closest('.action-buttons-wrapper button');
                const actionType = actionButton.data('action');
                let action = { type: actionType };

                // NEW: Handle card selection for relevant actions
                if (['fold', 'play_cards', 'custom'].includes(actionType)) {
                     const selectedCards = [];
                     panel.find('.player-position-container .hand .card.selected').each(function() {
                        const cardElement = jQuery_API(this);
                        const suit = cardElement.data('suit');
                        const rank = cardElement.data('rank');
                        if (suit && rank) {
                           selectedCards.push({ suit, rank });
                        }
                    });
                    if (selectedCards.length > 0) {
                        action.cards = selectedCards;
                    }
                }

                if (actionType === 'call') {
                    const amountToCall = AIGame_State.currentGameState?.last_bet_amount ?? 0;
                    const playerChips = AIGame_State.playerData?.chips ?? 0;
                    
                    if (amountToCall <= 0) {
                        toastr_API.info('当前没有需要跟注的下注。', "无效操作");
                        return;
                    }
            
                    const finalAmount = Math.min(playerChips, amountToCall);
                    if (playerChips < amountToCall) {
                         toastr_API.info(`你的筹码不足，将以 ${finalAmount} 筹码全下。`, "全下！");
                    }
                    action.amount = finalAmount;
                }

                if (actionType === 'bet') {
                    const defaultBet = String(AIGame_State.currentGameState?.last_bet_amount || 100);
                    const amountStr = await SillyTavern_Context_API.callGenericPopup('请输入下注金额:', SillyTavern_Context_API.POPUP_TYPE.INPUT, defaultBet);
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
            else if (closest('.card .card-delete-btn').length) {
                const cardElement = closest('.card');
                const location = cardElement.data('location');
                const enemyName = cardElement.data('enemy-name');
                const cardIndex = parseInt(cardElement.data('index'), 10);
                
                const suit = cardElement.data('suit');
                const rank = cardElement.find('.card-corner-rank').first().text();
                const cardName = `${suit}${rank}`;
            
                const confirmResult = await SillyTavern_Context_API.callGenericPopup(`你确定要删除这张 ${cardName} 吗？此操作无法撤销。`, SillyTavern_Context_API.POPUP_TYPE.CONFIRM);
            
                if (confirmResult) {
                    if (location && !isNaN(cardIndex)) {
                        DataHandler.deleteCardFromUI({ location, enemyName, cardIndex });
                    } else {
                        Logger.warn('Could not determine card location or index for deletion.', {
                            location: location,
                            enemyName: enemyName,
                            cardIndex: cardIndex
                        });
                    }
                }
            }
            else if (closest('.player-position-container .hand .card').length) {
                await AudioManager.play('choose');
                isSoundWorthy = false; // Sound handled, prevent generic click sound
                closest('.player-position-container .hand .card').toggleClass('selected');
            }
            else if (closest('.rules-list-item').length) {
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
            } else {
                isSoundWorthy = false;
            }

            if (isSoundWorthy) {
                let soundName = 'click1'; // Default sound for buttons and actions
                if (closest('.sillypoker-tab').length || closest('.rules-list-item').length) {
                    soundName = 'click2'; // Specific sound for UI navigation
                }
                await AudioManager.play(soundName);
            }
        });

        // BGM Volume Slider Event Listener
        panel.off('input.sillypoker_bgm_volume').on('input.sillypoker_bgm_volume', '#bgm-volume-slider', function() {
            const volume = parseFloat(jQuery_API(this).val());
            AudioManager.setVolume(volume);
        });
        
    },

    addMapInteractionListeners(mapViewContainer) {
        const panZoomContainer = mapViewContainer.find('.map-pan-zoom-container');
        
        let isPanning = false;
        let lastMousePos = { x: 0, y: 0 };

        panZoomContainer.off('.sillypoker_map_pan').on('mousedown.sillypoker_map_pan', function(e) {
            if (e.button !== 0) return;
            isPanning = true;
            lastMousePos = { x: e.clientX, y: e.clientY };
            jQuery_API(this).css('cursor', 'grabbing');
        });

        jQuery_API(parentWin.document).off('.sillypoker_map_pan_global').on('mouseup.sillypoker_map_pan_global', () => {
            if (isPanning) {
                isPanning = false;
                panZoomContainer.css('cursor', 'grab');
            }
        }).on('mousemove.sillypoker_map_pan_global', (e) => {
            if (isPanning) {
                const dx = e.clientX - lastMousePos.x;
                const dy = e.clientY - lastMousePos.y;
                lastMousePos = { x: e.clientX, y: e.clientY };
                UI.panMap(dx, dy);
            }
        });
        
        panZoomContainer.off('wheel.sillypoker_map_wheel').on('wheel.sillypoker_map_wheel', function(e) {
            e.preventDefault();
            const rect = this.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const zoomFactor = e.originalEvent.deltaY < 0 ? 1.1 : 1 / 1.1;
            UI.zoomMap(zoomFactor, mouseX, mouseY);
        });

        panZoomContainer.off('dblclick.sillypoker_map_dblclick').on('dblclick.sillypoker_map_dblclick', '.map-node.reachable', function(e) {
            e.stopPropagation();
            const node = jQuery_API(this);
            DataHandler.travelToNode(node.data('node-id'), node.data('node-type'));
        });

        // REFACTORED: Use a single delegated click listener on the main map container
        mapViewContainer.off('click.sillypoker_map_actions').on('click.sillypoker_map_actions', async function(e) {
            const target = jQuery_API(e.target);
            const closest = (selector) => target.closest(selector);
            let isSoundWorthy = true;

            if (closest('.map-node.reachable').length) {
                e.stopPropagation();
                const node = closest('.map-node.reachable');
                const nodeId = node.data('node-id');
                if (AIGame_State.selectedMapNodeId !== nodeId) {
                    AIGame_State.selectedMapNodeId = nodeId;
                    UI.renderActiveTabContent();
                }
            } 
            else if (closest('.map-travel-btn').length) {
                e.stopPropagation();
                if (AIGame_State.selectedMapNodeId) {
                    const nodeElement = mapViewContainer.find(`.map-node[data-node-id="${AIGame_State.selectedMapNodeId}"]`);
                    if (nodeElement.length) {
                        DataHandler.travelToNode(AIGame_State.selectedMapNodeId, nodeElement.data('node-type'));
                    }
                }
            }
            else if (closest('.map-zoom-btn').length) {
                 e.stopPropagation();
                 UI.zoomMapByStep(closest('.map-zoom-btn').attr('id') === 'map-zoom-in' ? 'in' : 'out');
            }
            else if (closest('.map-action-btn').length) {
                 e.stopPropagation();
                 if (closest('.save-map-btn').length) DataHandler.saveMapData();
                 if (closest('.reroll-map-btn').length) {
                    AIGame_State.mapData = null;
                    AIGame_State.selectedMapNodeId = null;
                    AIGame_State.mapTransformInitialized = false;
                    UI.renderActiveTabContent();
                 }
                 if (closest('.next-floor-btn').length) DataHandler.advanceToNextFloor();
                 if (closest('.find-secret-btn').length) DataHandler.findSecretRoom();
            } else {
                isSoundWorthy = false;
            }

            if (isSoundWorthy) await AudioManager.play('click1');
        });
    },

    makePanelDraggable(panel) {
        let isDragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;

        panel.off('mousedown.sillypoker_drag_init').on('mousedown.sillypoker_drag_init', '.sillypoker-header', (e) => {
            if (jQuery_API(e.target).is('button, i, input, .sillypoker-header-btn')) return;
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
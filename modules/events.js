/**
 * AI Card Table Extension - Event Handler (ES6 Module)
 * @description Centralizes all DOM event listeners for the extension.
 */
import { AIGame_Config } from '../config.js';
import { AIGame_State } from './state.js';
import { Logger } from './logger.js';
import { AudioManager } from './audioManager.js';
import { PlayerActionHandler } from './handlers/playerActionHandler.js';

let jQuery_API, parentWin, DataHandler, UI, toastr_API, SillyTavern_Context_API, TavernHelper_API;

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
        // ADDED: Listener for window resize to apply scaling
        jQuery_API(parentWin).off('resize.sillypoker').on('resize.sillypoker', () => UI.updateScaleAndPosition(true));
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

            // Close menus/panels if click is outside
            const emoteContainer = closest('.emote-wheel-container');
            if (!emoteContainer.length) {
                panel.find('.emote-wheel-menu').removeClass('visible');
            }
            const historyContainer = closest('.game-history-container');
            if (!historyContainer.length) {
                if(AIGame_State.isHistoryPanelVisible) {
                    AIGame_State.isHistoryPanelVisible = false;
                    panel.find('.history-panel-overlay').removeClass('visible');
                }
            }


            if (closest('.sillypoker-close-btn').length) {
                UI.togglePanel(false);
            }
            else if (closest('#go-to-github-btn').length) {
                parentWin.open('https://github.com/shiyue137mh-netizen/sillypoker.git', '_blank');
            }
            else if (closest('#gm-draw-card-btn').length) {
                if (!AIGame_State.currentGameState || Object.keys(AIGame_State.currentGameState).length === 0) {
                    toastr_API.warning("必须在牌局开始后才能使用GM抽牌功能。");
                    return;
                }
                const opponents = AIGame_State.enemyData?.enemies || [];
                const opponentOptions = opponents.map(enemy => `<option value="${enemy.name}">${enemy.name}</option>`).join('');

                const popupContent = `
                    <div style="display: flex; flex-direction: column; gap: 15px; font-size: 14px;">
                        <div style="display: grid; grid-template-columns: 100px 1fr; align-items: center; gap: 10px;">
                            <label for="draw-target">目标:</label>
                            <select id="draw-target" style="padding: 5px; border-radius: 4px; background-color: #374151; color: #e0e0e0; border: 1px solid #4a5a70;">
                                <option value="player">玩家</option>
                                <option value="board">公共牌</option>
                                <option value="all_players">所有角色</option>
                                ${opponentOptions}
                            </select>
                        </div>
                        <div style="display: grid; grid-template-columns: 100px 1fr; align-items: center; gap: 10px;">
                            <label for="draw-quantity">数量:</label>
                            <input type="number" id="draw-quantity" value="1" min="1" style="padding: 5px; border-radius: 4px; width: 60px; background-color: #374151; color: #e0e0e0; border: 1px solid #4a5a70;">
                        </div>
                        <div style="display: grid; grid-template-columns: 100px 1fr; align-items: center; gap: 10px;">
                            <label for="draw-visibility">可见性:</label>
                            <select id="draw-visibility" style="padding: 5px; border-radius: 4px; background-color: #374151; color: #e0e0e0; border: 1px solid #4a5a70;">
                                <option value="public">公开 (Public)</option>
                                <option value="owner">仅自己可见 (Owner)</option>
                                <option value="hidden">隐藏 (Hidden)</option>
                            </select>
                        </div>
                    </div>
                `;
                const result = await SillyTavern_Context_API.callGenericPopup(popupContent, 'text', '', { okButton: '确认', cancelButton: '取消', wide: true, title: 'GM 抽牌指令' });
            
                if (result) {
                    const popupDlg = parentWin.document.querySelector('dialog.popup.wide');
                    const target = popupDlg.querySelector('#draw-target').value;
                    const quantity = parseInt(popupDlg.querySelector('#draw-quantity').value, 10);
                    const visibility = popupDlg.querySelector('#draw-visibility').value;
                    
                    let targetText = '';
                    switch(target) {
                        case 'player': targetText = '玩家'; break;
                        case 'board': targetText = '公共牌区'; break;
                        case 'all_players': targetText = '所有角色'; break;
                        default: targetText = target; break;
                    }
                    let visibilityText = '';
                    switch(visibility) {
                        case 'public': visibilityText = '公开'; break;
                        case 'owner': visibilityText = '仅自己可见'; break;
                        case 'hidden': visibilityText = '隐藏'; break;
                    }

                    const notification = `(GM指令：为 ${targetText} 发了 ${quantity} 张 ${visibilityText} 的牌。)`;
                    DataHandler.gmDrawCards({ target, quantity, visibility, notification });
                }
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
                const btn = closest('.difficulty-option-btn');
                if (btn.data('difficulty')) {
                    const difficulty = btn.data('difficulty');
                    DataHandler.startNewRun(difficulty);
                } else if (btn.data('mode')) {
                    const mode = btn.data('mode');
                    DataHandler.selectGameMode(mode);
                }
            }
            else if (closest('#toggle-audio-btn').length) {
                AIGame_State.isMuted = !AIGame_State.isMuted;
                AudioManager.setMute(AIGame_State.isMuted);
                UI.renderPanelContent(); // Re-render to update button text/class
            }
            else if (closest('#toggle-visible-deck-btn').length) {
                AIGame_State.isDeckVisibleToAI = !AIGame_State.isDeckVisibleToAI;
                AIGame_State.saveUiState();
                await DataHandler.toggleVisibleDeckEntry(AIGame_State.isDeckVisibleToAI);
                toastr_API.success(`AI可见牌堆已${AIGame_State.isDeckVisibleToAI ? '开启' : '关闭'}`);
                UI.renderPanelContent();
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
            else if (closest('.reset-ui-position-btn').length) { // ADDED
                UI.resetUIPosition();
            }
             else if (closest('#claim-pot-btn').length) {
                DataHandler.claimPot();
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
             // Emote Wheel & History Logic
            else if (emoteContainer.length || historyContainer.length) {
                isSoundWorthy = false; 
                if (closest('.emote-wheel-button').length) {
                    await AudioManager.play('click2');
                    panel.find('.emote-wheel-menu').toggleClass('visible');
                }
                else if (closest('.game-history-button').length) {
                    await AudioManager.play('click2');
                    AIGame_State.isHistoryPanelVisible = !AIGame_State.isHistoryPanelVisible;
                    panel.find('.history-panel-overlay').toggleClass('visible', AIGame_State.isHistoryPanelVisible);
                }
                else if (closest('.emote-wheel-item').length) {
                    await AudioManager.play('click1');
                    const item = closest('.emote-wheel-item');
                    const itemIndex = item.data('index');
                    let textTemplate = AIGame_Config.EMOTE_TEXTS[itemIndex];
                    
                    const playerChips = AIGame_State.playerData?.chips || 0;
                    let final_text = textTemplate.replace(/\[现在筹码数\]/g, playerChips.toLocaleString());

                    panel.find('.emote-wheel-menu').removeClass('visible');
                    DataHandler.stagePlayerAction({ type: 'emote', text: final_text });
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

                // Blackjack "Hit" instant action fix
                if (actionType === 'hit' && AIGame_State.currentGameState?.game_type === 'Blackjack') {
                    Logger.log('Blackjack HIT action triggered directly.');
                    const notification = `(系统提示：{{user}}要了一张牌。)`;
                    await DataHandler.gmDrawCards({ 
                        target: 'player', 
                        quantity: 1, 
                        visibility: 'public', 
                        notification: notification 
                    });
                    return; // Bypass staging
                }

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
                UI.handleRulesItemClick(closest('.rules-list-item'));
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

        // NEW: Submit handler for the narrative input form (stages the narrative)
        panel.off('submit.sillypoker_story').on('submit.sillypoker_story', '#story-narrative-form', async (e) => {
            e.preventDefault();
            const input = panel.find('#story-narrative-input');
            const text = input.val();
            if (text && text.trim()) {
                await AudioManager.play('click1');
                DataHandler.stagePlayerAction({ type: 'narrative', text: text.trim() });
                input.val('');
            }
        });

        // REFACTORED: Dice Roller Handler (FAB version with context injection)
        panel.off('click.sillypoker_dice').on('click.sillypoker_dice', '#dice-roller-fab-btn', async (e) => {
            e.preventDefault();
            
            const diceInput = await SillyTavern_Context_API.callGenericPopup(
                '请输入掷骰指令 (例如: 1d10, 2d6):', 
                SillyTavern_Context_API.POPUP_TYPE.INPUT, 
                '1d10',
                { title: '命运之骰' }
            );
    
            if (!diceInput || typeof diceInput !== 'string') {
                return; // User cancelled
            }
    
            const match = diceInput.trim().match(/^(\d+)[dD](\d+)$/);
    
            if (!match) {
                toastr_API.warning('无效的格式。请输入 "xdx" 格式, 例如 "1d6"。');
                return;
            }
    
            const count = parseInt(match[1], 10);
            const sides = parseInt(match[2], 10);
    
            // Validation with feedback
            if (count < 1 || count > 10) {
                toastr_API.warning('骰子数量必须在 1 到 10 之间。');
                return;
            }
            if (sides < 2 || sides > 100) {
                toastr_API.warning('骰子面数必须在 2 到 100 之间。');
                return;
            }
    
            await AudioManager.play('dice');
    
            const results = [];
            for (let i = 0; i < count; i++) {
                results.push(Math.floor(Math.random() * sides) + 1);
            }
    
            const diceString = `${count}d${sides}`;
            const resultsString = `[${results.join(', ')}]`;
            const resultsStringForContext = `[${results.join(',')}]`;
            
            const systemMessage = `(系统提示：{{user}} 掷出了命运之骰 (${diceString})，结果为 ${resultsString}。)`;
            const extraContext = { last_dice_roll: `${diceString}=${resultsStringForContext}` };
            
            // Generate the context block with the dice roll injected
            const contextBlock = await PlayerActionHandler.generateContextBlock(false, extraContext);
            const finalPrompt = systemMessage + contextBlock;
            
            await TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(finalPrompt)}`);
            SillyTavern_Context_API.generate();
        });


        // BGM Volume Slider Event Listener
        panel.off('input.sillypoker_bgm_volume').on('input.sillypoker_bgm_volume', '#bgm-volume-slider', function() {
            const volume = parseFloat(jQuery_API(this).val());
            AudioManager.setVolume(volume);
        });
        
        // NEW: Font Size Slider Event Listeners
        panel.off('input.sillypoker_fontsize').on('input.sillypoker_fontsize', '#font-size-slider', function() {
            const newSize = jQuery_API(this).val();
            panel.css('font-size', `${newSize}px`);
            panel.find('#font-size-value').text(`${newSize}px`);
        });

        panel.off('change.sillypoker_fontsize_save').on('change.sillypoker_fontsize_save', '#font-size-slider', function() {
            const newSize = parseInt(jQuery_API(this).val(), 10);
            AIGame_State.baseFontSize = newSize;
            AIGame_State.saveUiState();
            Logger.log(`Font size saved: ${newSize}px`);
        });

        // NEW: Custom Tooltip Event Listeners
        const tooltip = panel.find('#sillypoker-custom-tooltip');
        if (tooltip.length) {
            panel.off('mouseenter.sillypoker_tooltip').on('mouseenter.sillypoker_tooltip', '.status-effect-icon, .inventory-item:not(.empty)', function(e) {
                const target = jQuery_API(this);
                const titleText = target.attr('title');
                if (!titleText) return;

                const parts = titleText.split('\n\n');
                const name = parts[0] || '未知';
                const description = parts[1] || '无描述。';
                const footer = parts[2] || '';

                const icon = target.html().trim();

                const tooltipHTML = `
                    <div class="tooltip-header">
                        <span class="tooltip-icon">${icon}</span>
                        <span class="tooltip-name">${name}</span>
                    </div>
                    <div class="tooltip-body">${description}</div>
                    ${footer ? `<div class="tooltip-footer">${footer}</div>` : ''}
                `;
                tooltip.html(tooltipHTML).removeClass('hidden');

                // Positioning logic
                const rect = this.getBoundingClientRect();
                const panelRect = panel[0].getBoundingClientRect();
                const scale = AIGame_State.panelScale || 1;

                let top = (rect.top - panelRect.top) / scale - tooltip.outerHeight() - 10;
                let left = (rect.left - panelRect.top) / scale + (rect.width / scale / 2) - (tooltip.outerWidth() / 2);

                if (top < 0) { top = (rect.bottom - panelRect.top) / scale + 10; }
                if (left < 5) { left = 5; }
                if (left + tooltip.outerWidth() > panel.width()) { left = panel.width() - tooltip.outerWidth() - 5; }
                
                tooltip.css({ top: `${top}px`, left: `${left}px` });
            });

            panel.off('mouseleave.sillypoker_tooltip').on('mouseleave.sillypoker_tooltip', '.status-effect-icon, .inventory-item:not(.empty)', function() {
                tooltip.addClass('hidden');
            });
        }
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
                 if (closest('.find-secret-btn').length) {
                    const playerNodeId = AIGame_State.mapData?.player_position;
                    if (playerNodeId) {
                        const nodeElement = jQuery_API(this).find(`.map-node[data-node-id="${playerNodeId}"]`);
                        if (nodeElement.length) {
                            nodeElement.addClass('shake-animation');
                            setTimeout(() => {
                                nodeElement.removeClass('shake-animation');
                            }, 800); // Duration matches CSS animation
                        }
                    }
                    DataHandler.findSecretRoom();
                 }
            } else {
                isSoundWorthy = false;
            }

            if (isSoundWorthy) await AudioManager.play('click1');
        });
    },

    makePanelDraggable(panel) {
        let isDragging = false;
        let dragStartPos = { x: 0, y: 0 };
        let panelStartPos = { left: 0, top: 0 };
    
        panel.off('mousedown.sillypoker_drag_init').on('mousedown.sillypoker_drag_init', '.sillypoker-header', (e) => {
            // Prevent dragging when clicking on interactive elements in the header
            if (jQuery_API(e.target).is('button, i, input, .sillypoker-header-btn, .player-hud, .bgm-player, .bgm-player *')) return;
            
            isDragging = false;
            let totalDeltaX = 0;
            let totalDeltaY = 0;

            dragStartPos = { x: e.clientX, y: e.clientY };
            // Use position() which is relative to the offset parent and not affected by CSS transforms (scale)
            panelStartPos = panel.position();
            
            jQuery_API(parentWin.document).on('mousemove.sillypoker_drag', (e_move) => {
                const deltaX = e_move.clientX - dragStartPos.x;
                const deltaY = e_move.clientY - dragStartPos.y;

                totalDeltaX += Math.abs(deltaX);
                totalDeltaY += Math.abs(deltaY);

                // Only start considering it a drag after moving a few pixels, to not interfere with clicks
                if (!isDragging && (totalDeltaX > 5 || totalDeltaY > 5)) {
                    isDragging = true;
                }
                
                if (isDragging) {
                    // Get scale from state to correctly adjust movement
                    const scale = AIGame_State.panelScale || 1; 
                    panel.css({ 
                        left: panelStartPos.left + (deltaX / scale) + 'px', 
                        top: panelStartPos.top + (deltaY / scale) + 'px' 
                    });
                }
            });
    
            jQuery_API(parentWin.document).one('mouseup.sillypoker_drag_end', () => {
                jQuery_API(parentWin.document).off('.sillypoker_drag');
                if (isDragging) {
                    const finalPos = { top: panel.css('top'), left: panel.css('left') };
                    AIGame_State.panelPos = finalPos;
                    // Call updateScaleAndPosition to clamp the new position and save it
                    UI.updateScaleAndPosition(true);
                }
                isDragging = false;
            });
        });
    }
};
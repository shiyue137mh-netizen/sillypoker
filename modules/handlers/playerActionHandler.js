/**
 * AI Card Table Extension - Player Action Handler
 * @description Handles player-initiated actions from the UI, using the stage-commit model.
 */
import { AIGame_State } from '../state.js';
import { Logger } from '../logger.js';

let context;

export const PlayerActionHandler = {
    init(sharedContext) {
        context = sharedContext;
    },

    async stagePlayerAction(action) {
        action.id = Date.now() + Math.random();
        
        if ((action.type === 'bet' || action.type === 'call') && action.amount) {
            // Provide immediate visual feedback by temporarily adjusting state
            context.UI.animateChips({ from: '#player-area-bottom', to: '#pot-area' });
            AIGame_State.playerData.chips -= action.amount;
            await context.AudioManager_API.play('chip');
        }
        
        AIGame_State.stagedPlayerActions.push(action);
        
        // Rerender UI elements that show temporary changes
        context.UI.rerenderPlayerHUD();
        context.UI.rerenderStagedActionsAndCommitButton();
        Logger.log('Player action staged:', action);
    },

    async undoStagedAction(actionId) {
        const actionIndex = AIGame_State.stagedPlayerActions.findIndex(a => a.id === actionId);
        if (actionIndex === -1) return;
    
        const actionToUndo = AIGame_State.stagedPlayerActions[actionIndex];
        
        if ((actionToUndo.type === 'bet' || actionToUndo.type === 'call') && actionToUndo.amount) {
            AIGame_State.playerData.chips += actionToUndo.amount;
        }
        
        AIGame_State.stagedPlayerActions.splice(actionIndex, 1);
        
        context.UI.rerenderPlayerHUD();
        context.UI.rerenderStagedActionsAndCommitButton();
        Logger.log('Player action undone:', actionToUndo);
    },

    async undoAllStagedActions() {
        if (AIGame_State.stagedPlayerActions.length === 0) return;
    
        for (const action of AIGame_State.stagedPlayerActions) {
            if ((action.type === 'bet' || action.type === 'call') && action.amount) {
                AIGame_State.playerData.chips += action.amount;
            }
        }
        
        AIGame_State.stagedPlayerActions = [];
        
        context.UI.rerenderPlayerHUD();
        context.UI.rerenderStagedActionsAndCommitButton();
        Logger.log('All staged player actions have been undone.');
    },

    async commitStagedActions() {
        if (AIGame_State.stagedPlayerActions.length === 0) return;
    
        const actionsToCommit = [...AIGame_State.stagedPlayerActions];
        const hasCardAction = actionsToCommit.some(action => action.cards && action.cards.length > 0);
        
        if (hasCardAction) {
            const selectedCards = context.parentWin.jQuery('#sillypoker-panel .player-position-container .hand .card.selected');
            if (selectedCards.length > 0) {
                await context.UI.animateCardPlay(selectedCards);
            }
        }

        AIGame_State.stagedPlayerActions = [];
        context.UI.rerenderStagedActionsAndCommitButton();
    
        // 1. Calculate final state changes from actions
        let potIncrease = 0;
        let newLastBet = AIGame_State.currentGameState.last_bet_amount;
        let playerChipsChanged = false;

        for (const action of actionsToCommit) {
            if ((action.type === 'bet' || action.type === 'call') && action.amount) {
                potIncrease += action.amount;
                playerChipsChanged = true;
            }
            if (action.type === 'bet') newLastBet = action.amount;
        }

        // 2. FIX: Apply state changes sequentially to prevent race conditions.
        if (playerChipsChanged) {
            await context.LorebookManager.updateWorldbook('sp_player_data', p => {
                p.chips = AIGame_State.playerData.chips;
                return p;
            });
        }
        if (potIncrease > 0 || newLastBet !== AIGame_State.currentGameState.last_bet_amount) {
            await context.LorebookManager.updateWorldbook('sp_game_state', s => {
                s.pot_amount = (s.pot_amount || 0) + potIncrease;
                s.last_bet_amount = newLastBet;
                return s;
            });
        }
        
        // 3. CRITICAL: Generate context block BEFORE advancing the turn
        const contextBlock = await this.generateContextBlock(true);
        
        // 4. Final state change: Advance the turn
        await context.LorebookManager.updateWorldbook('sp_game_state', s => {
            const userPlayerName = AIGame_State.playerData.name || '{{user}}';
            if (s.players && s.current_turn === userPlayerName) {
                const currentPlayerIndex = s.players.indexOf(userPlayerName);
                if (currentPlayerIndex !== -1) {
                    const nextTurnIndex = (currentPlayerIndex + 1) % s.players.length;
                    s.current_turn = s.players[nextTurnIndex];
                }
            }
            return s;
        });

        // 5. Build the prompt for the AI
        let gameActionsText = '', narrativeText = '';
        for (const action of actionsToCommit) {
            context.AIGame_History.addGameActionEntry({ actor: '{{user}}', ...action});
            if (action.type === 'narrative' || action.type === 'emote') {
                narrativeText += `“${action.text}” `;
                continue;
            }
            let cardText = (action.cards && action.cards.length > 0) ? ` [${action.cards.map(c => c.suit + c.rank).join(', ')}]` : '';
            switch(action.type) {
                case 'bet': gameActionsText += `- 下注 ${action.amount} 筹码。{{newline}}`; break;
                case 'call': gameActionsText += `- 跟注 ${action.amount} 筹码。{{newline}}`; break;
                case 'check': gameActionsText += `- 过牌。{{newline}}`; break;
                case 'fold': gameActionsText += `- 弃牌${cardText}。{{newline}}`; break;
                case 'play_cards': gameActionsText += `- 打出了${cardText}。{{newline}}`; break;
                case 'custom': gameActionsText += `- 执行了自定义动作：${action.text}${cardText}。{{newline}}`; break;
                case 'hit': gameActionsText += `- 要牌。{{newline}}`; break;
                case 'stand': gameActionsText += `- 停牌。{{newline}}`; break;
            }
        }
        
        let finalPrompt = '';
        if (narrativeText) finalPrompt += `${narrativeText.trim()} `;
        if (gameActionsText) {
            finalPrompt += `(系统提示：{{user}}执行了以下操作：{{newline}}${gameActionsText.trim()})`;
        } else if (!narrativeText) {
            finalPrompt += `(系统提示：{{user}}结束了他的回合。)`;
        }
        
        finalPrompt += contextBlock;

        // 6. Send to AI
        await context.TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(finalPrompt.trim())}`);
        context.SillyTavern_API.getContext().generate();
        
        // 7. Refresh UI
        await context.LorebookManager.fetchAllGameData();
        // Vitals are now checked in gameHandler on loss, so no check here.
    },
    
    async generateContextBlock(isTurnEndingAction = true, extraContext = null) {
        // Fetch the most up-to-date data for context generation
        await context.LorebookManager.fetchAllGameData();

        const { mapData, playerData, enemyData, currentGameState } = AIGame_State;
        const st_context = context.SillyTavern_API.getContext();
        const userPlayerName = await st_context.substituteParamsExtended('{{user}}');
        let contextLines = [];
        
        if (currentGameState?.game_type) {
            contextLines.push(`game_type: ${currentGameState.game_type}`);
            
            const currentTurnPlayer = currentGameState.current_turn || userPlayerName;
            contextLines.push(`current_turn: ${currentTurnPlayer}`);

            if (currentGameState.players) {
                const currentPlayerIndex = currentGameState.players.indexOf(currentTurnPlayer);
                if (currentPlayerIndex !== -1) {
                    const nextTurnIndex = (currentPlayerIndex + 1) % currentGameState.players.length;
                    contextLines.push(`next_turn: ${currentGameState.players[nextTurnIndex]}`);
                }
            }
            
            const boardCardsText = (currentGameState.board_cards || []).map(c=>c.suit+c.rank).join(', ');
            contextLines.push(`pot_amount: ${currentGameState.pot_amount || 0}`);
            contextLines.push(`board_cards: ${boardCardsText}`);
        }

        if (playerData) contextLines.push(`player_chips: ${playerData.chips}`);
        
        enemyData?.enemies?.forEach((enemy, index) => {
            contextLines.push(`enemy_${index}_name: ${enemy.name}`);
            contextLines.push(`enemy_${index}_chips: ${enemy.chips}`);
        });

        if (AIGame_State.gameMode === 'roguelike' && mapData) {
            const playerNode = mapData.nodes?.find(n => n.id === mapData.player_position);
            contextLines.push(`map_floor: ${mapData.mapLayer + 1}`);
            if(playerNode) {
                contextLines.push(`map_node_type: ${playerNode.type}`);
                 if (playerNode.properties?.length > 0) {
                    contextLines.push(`room_properties: [${playerNode.properties.map(p => `"${p}"`).join(', ')}]`);
                }
                const relevantNodes = mapData.nodes.filter(n => n.row !== undefined && n.type !== 'boss');
                const totalRows = relevantNodes.length > 0 ? Math.max(...relevantNodes.map(n => n.row)) : 0;
                if (totalRows > 0 && playerNode.row !== undefined) {
                    contextLines.push(`map_progress: ${Math.round((playerNode.row / totalRows) * 100)}%`);
                }
            }
        }
        
        if (extraContext) {
            if (extraContext.last_dice_roll) {
                contextLines.push(`last_dice_roll: ${extraContext.last_dice_roll}`);
            }
        }
        
        return contextLines.length > 0 ? `{{newline}}<context>{{newline}}${contextLines.join('{{newline}}')}{{newline}}</context>` : '';
    }
};
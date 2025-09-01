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

        // NEW: Animate cards being played *before* committing data.
        const playedCardElements = [];
        const hasCardAction = actionsToCommit.some(action => action.cards && action.cards.length > 0);
        if (hasCardAction) {
            const selectedCards = context.parentWin.jQuery('#sillypoker-panel .player-position-container .hand .card.selected');
            selectedCards.each(function() {
                playedCardElements.push(context.parentWin.jQuery(this));
            });
            if (playedCardElements.length > 0) {
                // This call will now work because `animateCardPlay` is implemented in ui.js
                await context.UI.animateCardPlay(playedCardElements);
            }
        }

        AIGame_State.stagedPlayerActions = [];
        context.UI.rerenderStagedActionsAndCommitButton(); // Hide commit button immediately
    
        // 1. Finalize state changes in the world book
        await context.LorebookManager.updateWorldbook('sp_player_data', p => {
            p.chips = AIGame_State.playerData.chips;
            return p;
        });
    
        let potIncrease = 0;
        let newLastBet = AIGame_State.currentGameState.last_bet_amount;
        for (const action of actionsToCommit) {
            if ((action.type === 'bet' || action.type === 'call') && action.amount) potIncrease += action.amount;
            if (action.type === 'bet') newLastBet = action.amount;
        }
        await context.LorebookManager.updateWorldbook('sp_game_state', s => {
            s.pot_amount = (s.pot_amount || 0) + potIncrease;
            s.last_bet_amount = newLastBet;
            return s;
        });
    
        // 2. Build the prompt for the AI
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
                case 'stand': gameActionsText += `- 停牌。{{newline}}`; break;
            }
        }
        
        const contextBlock = await this.generateContextBlock();
        let finalPrompt = '';
        if (narrativeText) finalPrompt += `${narrativeText.trim()} `;
        if (gameActionsText) finalPrompt += `(系统提示：{{user}}执行了以下操作：{{newline}}${gameActionsText.trim()})`;
        
        finalPrompt += contextBlock;

        // 3. Send to AI
        await context.TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(finalPrompt.trim())}`);
        context.SillyTavern_API.getContext().generate();
        
        // 4. Refresh UI from the now-committed world state
        await context.LorebookManager.fetchAllGameData();
    },
    
    async generateContextBlock(advanceTurn = true) {
        const { mapData, playerData, enemyData, currentGameState } = AIGame_State;
        const st_context = context.SillyTavern_API.getContext();
        const userPlayerName = await st_context.substituteParamsExtended('{{user}}');
        let contextLines = [];
        
        if (currentGameState?.game_type) {
            contextLines.push(`game_type: ${currentGameState.game_type}`);
            
            // *** CORE LOGIC FIX V2.0 ***
            // This block now correctly reports the state of the turn transition to the AI by adding a `next_turn` field.
            if (advanceTurn && currentGameState.players && currentGameState.current_turn === userPlayerName) {
                // This block executes when the player ends their turn.
                const currentPlayerIndex = currentGameState.players.indexOf(userPlayerName);
                if (currentPlayerIndex !== -1) {
                    const nextTurnIndex = (currentPlayerIndex + 1) % currentGameState.players.length;
                    // Report that the player (`userPlayerName`) is the one whose turn just ended.
                    contextLines.push(`current_turn: ${userPlayerName}`);
                    // Report who is next in line.
                    contextLines.push(`next_turn: ${currentGameState.players[nextTurnIndex]}`);
                }
            } else {
                // This block executes for non-turn-advancing actions (like GM commands) or when it's not the player's turn.
                // It simply reports the current turn state as is and determines who is next.
                contextLines.push(`current_turn: ${currentGameState.current_turn}`);
                if (currentGameState.players) {
                    const currentPlayerIndex = currentGameState.players.indexOf(currentGameState.current_turn);
                    if (currentPlayerIndex !== -1) {
                        const nextTurnIndex = (currentPlayerIndex + 1) % currentGameState.players.length;
                        contextLines.push(`next_turn: ${currentGameState.players[nextTurnIndex]}`);
                    }
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
        
        return contextLines.length > 0 ? `{{newline}}<context>{{newline}}${contextLines.join('{{newline}}')}{{newline}}</context>` : '';
    }
};
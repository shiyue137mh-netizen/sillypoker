/**
 * AI Card Table Extension - Data Handler & Orchestrator (Refac tored)
 * @description Initializes all sub-modules, processes AI commands, and delegates tasks.
 */
import { AIGame_State } from './state.js';
import { Logger } from './logger.js';
import { AIGame_CommandParser } from './commandParser.js';

// Import new specialized managers from the 'handlers' subdirectory
import { LorebookManager } from './handlers/lorebookManager.js';
import { RunManager } from './handlers/runManager.js';
import { PlayerActionHandler } from './handlers/playerActionHandler.js';
import { MetaHandler } from './handlers/metaHandler.js'; 

// Import command handlers from the 'handlers' subdirectory
import { AIGame_GameHandler } from './handlers/gameHandler.js';
import { AIGame_EntityHandler } from './handlers/entityHandler.js';
import { AIGame_MapHandler } from './handlers/mapHandler.js';
import { AIGame_ItemHandler } from './handlers/itemHandler.js';

let isInitialized = false;
let sharedContext; // Module-level context to be shared with all sub-modules

export const AIGame_DataHandler = {
    init: function(deps, ui, audioManager, historyApi) {
        if (isInitialized) {
            Logger.log('[DataHandler] Already initialized.');
            return;
        }
        Logger.log('[DataHandler] Initializing...');

        // Create a single context object to pass dependencies to all modules
        sharedContext = {
            SillyTavern_API: deps.st,
            TavernHelper_API: deps.th,
            toastr_API: deps.toastr,
            UI: ui,
            parentWin: deps.win,
            AudioManager_API: audioManager,
            AIGame_History: historyApi,
            
            // Expose managers to each other for inter-module communication
            LorebookManager,
            RunManager,
            PlayerActionHandler,
            MetaHandler,
            GameHandler: AIGame_GameHandler,
            EntityHandler: AIGame_EntityHandler,
            MapHandler: AIGame_MapHandler,
            ItemHandler: AIGame_ItemHandler,
            DataHandler: this
        };
        Logger.log('[DataHandler] Shared context created.');


        Logger.log('[DataHandler] Initializing LorebookManager...');
        LorebookManager.init(sharedContext);
        Logger.log('[DataHandler] LorebookManager initialized.');

        Logger.log('[DataHandler] Initializing MetaHandler...');
        MetaHandler.init(sharedContext); 
        Logger.log('[DataHandler] MetaHandler initialized.');

        Logger.log('[DataHandler] Initializing RunManager...');
        RunManager.init(sharedContext); 
        Logger.log('[DataHandler] RunManager initialized.');
        
        Logger.log('[DataHandler] Initializing PlayerActionHandler...');
        PlayerActionHandler.init(sharedContext);
        Logger.log('[DataHandler] PlayerActionHandler initialized.');
        
        Logger.log('[DataHandler] Initializing GameHandler...');
        AIGame_GameHandler.init(sharedContext);
        Logger.log('[DataHandler] GameHandler initialized.');
        
        Logger.log('[DataHandler] Initializing EntityHandler...');
        AIGame_EntityHandler.init(sharedContext);
        Logger.log('[DataHandler] EntityHandler initialized.');
        
        Logger.log('[DataHandler] Initializing MapHandler...');
        AIGame_MapHandler.init(sharedContext);
        Logger.log('[DataHandler] MapHandler initialized.');

        Logger.log('[DataHandler] Initializing ItemHandler...');
        AIGame_ItemHandler.init(sharedContext);
        Logger.log('[DataHandler] ItemHandler initialized.');
        
        isInitialized = true;
        Logger.success('[DataHandler] All sub-modules initialized successfully.');
    },

    /**
     * The main entry point for processing AI text. It parses for commands and delegates them.
     * @param {string} text - The incoming text from the AI.
     */
    mainProcessor: async function(text) {
        Logger.log(`[DataHandler] mainProcessor called for text of length ${text ? text.length : 0}.`);
        if (!AIGame_State.hasGameBook) {
            Logger.log('[DataHandler] mainProcessor aborted: no game book.');
            return;
        }
        const commands = AIGame_CommandParser.parseCommands(text);
        if (commands.length === 0) {
            Logger.log('[DataHandler] mainProcessor found no commands.');
            return;
        }
        
        Logger.success(`[DataHandler] mainProcessor found ${commands.length} commands to execute.`);
        for (const command of commands) {
            switch(command.category) {
                case 'Game':
                case 'Action':
                    await AIGame_GameHandler.handleCommand(command);
                    break;
                case 'Event':
                    await AIGame_EntityHandler.handleCommand(command);
                    break;
                case 'Map':
                    await AIGame_MapHandler.handleCommand(command);
                    break;
                case 'Item':
                    Logger.warn(`Received an Item command from AI, which is unusual.`, command);
                    break;
                default:
                    Logger.warn(`Unknown command category: ${command.category}`);
            }
        }
    },

    async initiateDealAnimationSequence() {
        const actions = AIGame_State.currentGameState?.unprocessed_deal_actions;
        if (!actions || actions.length === 0) return;

        sharedContext.toastr_API.info("荷官正在发牌...", "发牌", { timeOut: 1500, closeButton: false, progressBar: false, positionClass: "toast-top-left", preventDuplicates: true });
        Logger.log('正在处理待处理的发牌动作...');

        const totalCardsNeeded = actions.reduce((sum, action) => sum + (action.count || 0), 0);
        if (totalCardsNeeded === 0) return;

        let drawnCards = [];
        let deckSizeBeforeDeal = 0; 

        await sharedContext.LorebookManager.updateWorldbook('sp_private_data', (privateData) => {
            let deck = privateData.deck || [];
            deckSizeBeforeDeal = deck.length;

            if (deck.length < totalCardsNeeded) {
                Logger.error(`牌堆中的牌不够。需要 ${totalCardsNeeded}, 现有 ${deck.length}。`);
                drawnCards = [];
                return privateData;
            }
            drawnCards = deck.splice(0, totalCardsNeeded);
            privateData.deck = deck;
            return privateData;
        });

        if (drawnCards.length < totalCardsNeeded) {
            sharedContext.toastr_API.error(`牌堆中的牌不够。需要 ${totalCardsNeeded}, 现有 ${deckSizeBeforeDeal}。`, "发牌失败");
            return;
        }
        
        const distribution = { player: [], board: [], enemies: {} };
        (AIGame_State.enemyData?.enemies || []).forEach(enemy => {
            distribution.enemies[enemy.name] = [];
        });

        for (const action of actions) {
            if (!action.count || action.count <= 0) continue;
            const cardsToDistribute = drawnCards.splice(0, action.count);
            cardsToDistribute.forEach(card => { 
                card.visibility = action.visibility || 'owner';
                card.isNew = true; // Flag for animation
            });

            if (action.target === 'player') distribution.player.push(...cardsToDistribute);
            else if (action.target === 'enemy' && action.name && distribution.enemies[action.name]) distribution.enemies[action.name].push(...cardsToDistribute);
            else if (action.target === 'board') distribution.board.push(...cardsToDistribute);
        }

        if (distribution.player.length > 0) await sharedContext.LorebookManager.updateWorldbook('sp_player_cards', data => ({ ...data, current_hand: [...(data.current_hand || []), ...distribution.player] }));
        if (Object.values(distribution.enemies).some(c => c.length > 0)) {
            await sharedContext.LorebookManager.updateWorldbook('sp_enemy_data', data => {
                if (!data.enemies) data.enemies = [];
                data.enemies.forEach(enemy => {
                    if (distribution.enemies[enemy.name]?.length > 0) {
                        enemy.hand = [...(enemy.hand || []), ...distribution.enemies[enemy.name]];
                    }
                });
                return data;
            });
        }
        
        await sharedContext.LorebookManager.updateWorldbook('sp_game_state', data => {
            const newData = { ...data };
            delete newData.unprocessed_deal_actions;
            newData.last_deal_animation_queue = actions;
            
            if (distribution.board.length > 0) {
                newData.board_cards = [...(newData.board_cards || []), ...distribution.board];
                newData.last_bet_amount = 0;
            }
        
            return newData;
        });
        
        // CRITICAL FIX: Removed the fetchAllGameData call from here.
        // It's now the responsibility of the UI layer to call this *after*
        // this function completes, preventing the recursive render bug.
        Logger.log('Deal animation data prepared. Awaiting UI to trigger re-render.');
    },

    /**
     * BUG FIX V2: Replaced parallel updates with sequential awaits to fix a race condition
     * where `last_deal_animation_queue` was not cleared before `isNew` flags, causing an infinite loop.
     */
    async cleanupAfterDealAnimation() {
        Logger.log('[DataHandler] Starting post-animation data cleanup (Serialized)...');
        
        // Step 1: Atomically remove the animation queue and cleanup board cards. This is the most critical step.
        await sharedContext.LorebookManager.updateWorldbook('sp_game_state', data => {
            const newData = { ...data };
            delete newData.last_deal_animation_queue;
            if (newData.board_cards) {
                newData.board_cards = newData.board_cards.map(card => {
                    const { isNew, ...rest } = card;
                    return rest;
                });
            }
            return newData;
        });
    
        // Step 2: Cleanup player cards.
        await sharedContext.LorebookManager.updateWorldbook('sp_player_cards', data => {
            const newData = { ...data };
            if (newData.current_hand) {
                newData.current_hand = newData.current_hand.map(card => {
                    const { isNew, ...rest } = card;
                    return rest;
                });
            }
            return newData;
        });
    
        // Step 3: Cleanup enemy cards.
        await sharedContext.LorebookManager.updateWorldbook('sp_enemy_data', data => {
            const newData = { ...data };
            if (newData.enemies) {
                newData.enemies = newData.enemies.map(enemy => {
                    const newEnemy = { ...enemy };
                    if (newEnemy.hand) {
                        newEnemy.hand = newEnemy.hand.map(card => {
                            const { isNew, ...rest } = card;
                            return rest;
                        });
                    }
                    return newEnemy;
                });
            }
            return newData;
        });
        
        // Step 4: Fetch the final, clean state and trigger a re-render.
        await sharedContext.LorebookManager.fetchAllGameData();
        Logger.log('[DataHandler] Post-animation cleanup complete.');
    },
    
    // --- Delegated Methods ---
    fetchAllGameData: () => LorebookManager.fetchAllGameData(),
    clearLorebookCache: () => LorebookManager.clearLorebookCache(),
    loadInitialState: () => LorebookManager.loadInitialState(),
    createGameBookEntries: (mode) => LorebookManager.createGameBookEntries(mode),
    toggleVisibleDeckEntry: (isEnabled) => LorebookManager.toggleVisibleDeckEntry(isEnabled),
    
    startNewRun: (difficulty) => RunManager.startNewRun(difficulty),
    resetAllGameData: (awardShards = false) => RunManager.resetAllGameData(awardShards),
    selectGameMode: (mode) => RunManager.selectGameMode(mode),
    surrender: () => RunManager.surrender(),
    begForMercy: () => RunManager.begForMercy(),
    advanceToNextFloor: () => RunManager.advanceToNextFloor(),
    claimPot: () => RunManager.claimPot(),
    
    stagePlayerAction: (action) => PlayerActionHandler.stagePlayerAction(action),
    undoStagedAction: (id) => PlayerActionHandler.undoStagedAction(id),
    undoAllStagedActions: () => PlayerActionHandler.undoAllStagedActions(),
    commitStagedActions: () => PlayerActionHandler.commitStagedActions(),
    
    travelToNode: (...args) => AIGame_MapHandler.travelToNode(...args),
    findSecretRoom: (...args) => AIGame_MapHandler.findSecretRoom(...args),
    saveMapData: (...args) => AIGame_MapHandler.saveMapData(...args),
    useItem: (...args) => AIGame_ItemHandler.useItem(...args),
    playerGoesAllIn: (...args) => AIGame_GameHandler.playerGoesAllIn(...args),
    attemptEscape: (...args) => AIGame_GameHandler.attemptEscape(...args),
    gmDrawCards: (options) => AIGame_GameHandler.gmDrawCards(options),
    deleteCardFromUI: (...args) => AIGame_GameHandler.deleteCardFromUI(...args),
};
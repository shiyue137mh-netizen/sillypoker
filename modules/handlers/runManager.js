/**
 * AI Card Table Extension - Run Manager
 * @description Manages the lifecycle of a Roguelike run.
 */
import { AIGame_Config } from '../../config.js';
import { AIGame_State } from '../state.js';
import { Logger } from '../logger.js';
import { generateMapData } from '../mapGenerator.js';

let context;

const DIFFICULTY_SETTINGS = {
    baby:   { health: 5, max_health: 5, chips: 2000, name: '宝宝' },
    easy:   { health: 4, max_health: 4, chips: 1500, name: '简单' },
    normal: { health: 3, max_health: 3, chips: 1000, name: '普通' },
    hard:   { health: 2, max_health: 2, chips: 500,  name: '困难' },
    hell:   { health: 1, max_health: 1, chips: 100,  name: '地狱' }
};

export const RunManager = {
    init(sharedContext) {
        context = sharedContext;
    },

    async startNewRun(difficulty) {
        Logger.log(`Starting new run with difficulty: ${difficulty}`);
        const settings = DIFFICULTY_SETTINGS[difficulty];
        
        const playerData = {
            name: await context.SillyTavern_API.getContext().substituteParamsExtended('{{user}}'),
            health: settings.health,
            max_health: settings.max_health,
            chips: settings.chips,
            claimable_pot: 0,
            inventory: [],
            status_effects: []
        };
        
        const mapData = generateMapData();
        
        await context.LorebookManager.updateWorldbook('sp_player_data', () => playerData);
        await context.LorebookManager.updateWorldbook('sp_map_data', () => mapData);
        await context.LorebookManager.updateWorldbook('sp_game_state', () => ({}));
        await context.LorebookManager.updateWorldbook('sp_enemy_data', () => ({ enemies: [] }));

        AIGame_State.currentActiveTab = 'map';
        await context.LorebookManager.fetchAllGameData();
    },
    
    async resetAllGameData(awardShards = false) {
        Logger.log(`Resetting current roguelike run data. Award shards: ${awardShards}`);

        if (AIGame_State.gameMode !== 'roguelike') {
            Logger.warn('Attempted to reset a run, but not in roguelike mode. Aborting.');
            return;
        }
        
        if (awardShards) {
            // This is now only for special cases, as normal death/surrender sets this to false.
            // Currently, only beating the final boss of the entire run would trigger this.
            // We can add logic here later. For now, it's mostly unused.
        }

        // 1. Update world books to be empty
        await Promise.all([
            context.LorebookManager.updateWorldbook('sp_player_data', () => ({})),
            context.LorebookManager.updateWorldbook('sp_map_data', () => ({})),
            context.LorebookManager.updateWorldbook('sp_game_state', () => ({})),
            context.LorebookManager.updateWorldbook('sp_enemy_data', () => ({})),
            context.LorebookManager.updateWorldbook('sp_player_cards', () => JSON.parse(AIGame_Config.INITIAL_LOREBOOK_ENTRIES.find(e => e.name === 'sp_player_cards').content)),
            context.LorebookManager.updateWorldbook('sp_private_data', () => ({}))
        ]);
        
        // 2. Reset the in-memory state
        AIGame_State.playerData = null;
        AIGame_State.mapData = null;
        AIGame_State.currentGameState = {};
        AIGame_State.runInProgress = false;
        AIGame_State.stagedPlayerActions = [];
        AIGame_State.mapTransformInitialized = false;
        AIGame_State.currentActiveTab = 'difficulty';

        if (AIGame_State.isBgmPlaying) {
            context.AudioManager_API.toggleBGM();
        }

        context.toastr_API.success("挑战已重置。");
        
        // 3. Force UI to re-render with the new state
        context.UI.renderPanelContent();
    },
    
    async selectGameMode(mode) {
        // Create character-specific book if it doesn't exist
        if (!AIGame_State.hasGameBook) {
            const success = await context.LorebookManager.createGameBookEntries(mode);
            if (!success) return;
        }

        // BUG FIX: Removed the creation of the deprecated global meta book.
        if (mode === 'roguelike') {
            // await context.MetaHandler.createMetaLorebookIfNeeded(); // This line is removed.
        }

        Logger.log(`Game mode selected: ${mode}`);
        AIGame_State.gameMode = mode;
        AIGame_State.isModeSelected = true;
        
        if (mode === 'origin') {
            AIGame_State.currentActiveTab = 'game-ui';
            await context.LorebookManager.updateWorldbook('sp_player_data', () => {
                return JSON.parse(AIGame_Config.ORIGIN_MODE_LOREBOOK_ENTRIES.find(e => e.name === 'sp_player_data').content);
            });
            await context.LorebookManager.fetchAllGameData();
        } else {
             AIGame_State.currentActiveTab = 'difficulty';
             await context.MetaHandler.loadMetaState();
             context.UI.renderPanelContent();
        }
        
        AIGame_State.saveUiState();
    },

    async advanceToNextFloor() {
        if (!AIGame_State.mapData || !AIGame_State.mapData.bossDefeated) {
            context.toastr_API.warning("你必须先击败本层的首领！");
            return;
        }

        Logger.log("Advancing to the next floor...");

        await context.MetaHandler.updateMetaState(meta => {
            meta.legacy_shards = (meta.legacy_shards || 0) + 10;
            return meta;
        });
        context.toastr_API.success("你击败了首领，获得了 10 传承碎片！");

        context.AudioManager_API.play('elevator_ding');
        const nextLayer = AIGame_State.mapData.mapLayer + 1;
        const newMap = generateMapData(nextLayer);
        
        await context.LorebookManager.updateWorldbook('sp_map_data', () => newMap);
        Object.assign(AIGame_State, { selectedMapNodeId: null, mapTransformInitialized: false });

        context.toastr_API.success(`你已抵达第 ${nextLayer + 1} 层！`);
        await context.LorebookManager.fetchAllGameData();
    },

    async surrender() {
        Logger.log('Player surrenders the challenge.');
        await this.resetAllGameData(false); // No shards on surrender
        context.toastr_API.info("你放弃了挑战。");
    },
    
    async begForMercy() {
        Logger.log('Player begs for mercy.');
        const prompt = `(系统提示：{{user}}跪倒在地，痛哭流涕地向你求饶。请根据你的角色性格，决定是放他一马、变本加厉地羞辱他，还是直接结束他的痛苦。)`;
        context.toastr_API.info("你的命运现在掌握在对手手中...");
        await context.TavernHelper_API.triggerSlash(`/setinput ${JSON.stringify(prompt)}`);
        context.SillyTavern_API.getContext().generate();
    },
    
    async claimPot() {
        const potToClaim = AIGame_State.playerData?.claimable_pot || 0;
        if (potToClaim <= 0) return;

        Logger.log(`Player claiming pot of ${potToClaim} chips.`);
        
        await context.AudioManager_API.play('chip');
        context.UI.animateChips({
            from: '#claim-pot-btn',
            to: '.chips-display',
            count: Math.min(20, Math.floor(potToClaim / 50)),
            mode: 'burst'
        });

        await context.LorebookManager.updateWorldbook('sp_player_data', p => {
            p.chips = (p.chips || 0) + potToClaim;
            p.claimable_pot = 0;
            return p;
        });

        await context.LorebookManager.fetchAllGameData();
    },

    async checkPlayerVitals() {
        // This function is the single source of truth for handling "death" by bankruptcy.
        // It fetches the absolute latest data to make its decision.
        const lorebookName = await context.LorebookManager.getCharacterLorebookName();
        if (!lorebookName) return;

        const bookEntries = await context.TavernHelper_API.getWorldbook(lorebookName);
        const playerDataEntry = bookEntries.find(e => e.name === 'sp_player_data');
        if (!playerDataEntry || !playerDataEntry.content) return;
        
        const latestPlayerData = JSON.parse(playerDataEntry.content);

        if (latestPlayerData.chips <= 0 && AIGame_State.runInProgress) {
            Logger.warn('Player has run out of chips. Processing health penalty.');
            let playerDied = false;
            
            await context.LorebookManager.updateWorldbook('sp_player_data', p => {
                p.health = Math.max(0, (p.health || 0) - 1);
                if (p.health > 0) {
                    // Not dead yet, give them a stake for the next round.
                    p.chips = 1000;
                    context.toastr_API.warning("你的筹码输光了，失去1点生命值！系统为你补充了1000启动资金。", "破产！");
                } else {
                    playerDied = true;
                }
                return p;
            });

            if (playerDied) {
                context.toastr_API.error("你的生命值已耗尽！挑战结束。", "游戏结束");
                await this.resetAllGameData(false);
            } else {
                // Refresh state to show updated health and chips
                await context.LorebookManager.fetchAllGameData();
            }
        }
    },
};
/**
 * AI Card Table Extension - Lorebook Manager
 * @description Manages all interactions with SillyTavern's world book.
 */
import { AIGame_Config } from '../../config.js';
import { AIGame_State } from '../state.js';
import { Logger } from '../logger.js';

let context;
let currentCharacterLorebookName = null;
let currentCharacterNameCache = null;

const KEY_TO_STATE_MAP = {
    'sp_enemy_data': 'enemyData',
    'sp_player_cards': 'playerCards',
    'sp_player_data': 'playerData',
    'sp_map_data': 'mapData',
    'sp_game_state': 'currentGameState',
    'sp_private_data': 'privateGameData',
    'sp_visible_deck': 'visibleDeck' // Add mapping for the new entry
};

export const LorebookManager = {
    init(sharedContext) {
        context = sharedContext;
    },

    clearLorebookCache() {
        currentCharacterLorebookName = null;
        currentCharacterNameCache = null;
    },
    
    async getCharacterLorebookName() {
        const charName = context.SillyTavern_API.getContext()?.name2;
        if (!charName || charName === 'SillyTavern System') return null;
        
        if (currentCharacterNameCache === charName && currentCharacterLorebookName) {
            return currentCharacterLorebookName;
        }

        const lorebookName = `${AIGame_Config.LOREBOOK_PREFIX}${charName}`;
        const allLorebooks = await context.TavernHelper_API.getWorldbookNames();
        
        if (allLorebooks.includes(lorebookName)) {
            currentCharacterNameCache = charName;
            currentCharacterLorebookName = lorebookName;
            return lorebookName;
        }
        
        return null;
    },

    async getEntryData(entryKey) {
        const lorebookName = await this.getCharacterLorebookName();
        if (!lorebookName) {
            Logger.warn(`Cannot get entry data for "${entryKey}", no character lorebook found.`);
            return null;
        }

        const bookEntries = await context.TavernHelper_API.getWorldbook(lorebookName);
        if (!bookEntries) {
            Logger.warn(`Cannot get entry data for "${entryKey}", failed to fetch lorebook entries.`);
            return null;
        }

        const entry = bookEntries.find(e => e.name === entryKey);
        if (entry && entry.content) {
            try {
                return JSON.parse(entry.content);
            } catch (e) {
                Logger.error(`Failed to parse JSON for entry "${entryKey}".`, e);
                return null;
            }
        }
        
        Logger.warn(`Entry "${entryKey}" not found or has no content in lorebook "${lorebookName}".`);
        return null;
    },
    
    async updateWorldbook(entryKey, updater) {
        const lorebookName = await this.getCharacterLorebookName();
        if (!lorebookName) return;

        await context.TavernHelper_API.updateWorldbookWith(lorebookName, (entries) => {
            const entry = entries.find(e => e.name === entryKey);
            if (entry) {
                try {
                    let currentData = JSON.parse(entry.content || '{}');
                    const updatedData = updater(currentData);
                    entry.content = JSON.stringify(updatedData, null, 2);
                } catch (e) {
                    Logger.error(`Failed to parse/update JSON for ${entryKey}`, e);
                }
            } else {
                Logger.warn(`Entry key "${entryKey}" not found in lorebook "${lorebookName}".`);
            }
            return entries;
        }, { render: 'debounced' });
    },

    async toggleVisibleDeckEntry(isEnabled) {
        const lorebookName = await this.getCharacterLorebookName();
        if (!lorebookName) return;

        await context.TavernHelper_API.updateWorldbookWith(lorebookName, (entries) => {
            const entry = entries.find(e => e.name === 'sp_visible_deck');
            if (entry) {
                entry.enabled = isEnabled;
                Logger.log(`Toggled sp_visible_deck to: ${isEnabled}`);
            }
            return entries;
        }, { render: 'immediate' }); // Use immediate render to ensure AI context is updated quickly
    },

    async fetchAllGameData() {
        Logger.log('[LorebookManager] Starting fetchAllGameData...');
        const lorebookName = await this.getCharacterLorebookName();
        if (!lorebookName) {
            Logger.warn('[LorebookManager] fetchAllGameData aborted: could not get lorebook name.');
            return;
        }

        const bookEntries = await context.TavernHelper_API.getWorldbook(lorebookName);
        if (!bookEntries) {
            Logger.warn('[LorebookManager] fetchAllGameData aborted: getWorldbook returned null or undefined.');
            return;
        }
        Logger.log(`[LorebookManager] Fetched ${bookEntries.length} entries from "${lorebookName}".`);


        for (const key of AIGame_Config.LOREBOOK_ENTRY_KEYS) {
            const entry = bookEntries.find(e => e.name === key);
            if (entry && entry.content) {
                try {
                    AIGame_State[KEY_TO_STATE_MAP[key]] = JSON.parse(entry.content);
                } catch (e) {
                    Logger.error(`Failed to parse JSON for ${key}`, e);
                    AIGame_State[KEY_TO_STATE_MAP[key]] = {}; // Fallback to empty object
                }
            } else {
                 AIGame_State[KEY_TO_STATE_MAP[key]] = {}; // Fallback for missing entries
            }
        }
        Logger.log('[LorebookManager] Successfully parsed all game data entries.');
        
        const runWasInProgress = AIGame_State.runInProgress;
        
        const mapData = AIGame_State.mapData;
        if (mapData && Object.keys(mapData).length > 0 && mapData.nodes && mapData.nodes.length > 0) {
            AIGame_State.gameMode = 'roguelike';
            AIGame_State.isModeSelected = true;
            AIGame_State.runInProgress = !!(AIGame_State.playerData && AIGame_State.playerData.health > 0);
        } else if (AIGame_State.isModeSelected && AIGame_State.gameMode === 'origin') {
            AIGame_State.runInProgress = true; // Origin mode is always "in progress"
        } else {
            AIGame_State.runInProgress = false;
        }

        if (AIGame_State.runInProgress && !runWasInProgress) {
            context.UI.flashToggleButton();
            context.AudioManager_API.startBGMPlaylist();
        }
        
        if (!AIGame_State.runInProgress && runWasInProgress) {
            if (AIGame_State.isBgmPlaying) context.AudioManager_API.toggleBGM();
        }

        context.UI.renderPanelContent();
        Logger.log('[LorebookManager] fetchAllGameData complete, UI render triggered.');
    },
    
    async loadInitialState() {
        Logger.log('[LorebookManager] Starting loadInitialState...');
        const lorebookName = await this.getCharacterLorebookName();
        Logger.log(`[LorebookManager] Resolved lorebook name: "${lorebookName}"`);
        AIGame_State.hasGameBook = !!lorebookName;

        if (AIGame_State.hasGameBook) {
            Logger.log(`[LorebookManager] Game book found. Fetching all game data...`);
            await this.fetchAllGameData();
            Logger.log(`[LorebookManager] Finished fetching all game data.`);
        } else {
            Logger.log(`[LorebookManager] No game book found. Resetting mode and rendering selection view.`);
            // If no book, reset mode selection state and show the selection view
            AIGame_State.isModeSelected = false;
            AIGame_State.gameMode = null;
            context.UI.renderPanelContent();
        }
        Logger.log('[LorebookManager] loadInitialState complete.');
    },
    
    async createGameBookEntries(mode = 'roguelike') {
        const st_context = context.SillyTavern_API.getContext();
        const charName = st_context?.name2;
        if (!charName) {
            Logger.error("Cannot create game book, character name is missing.");
            return false;
        }

        const lorebookName = `${AIGame_Config.LOREBOOK_PREFIX}${charName}`;
        const entriesTemplate = mode === 'origin' 
            ? AIGame_Config.ORIGIN_MODE_LOREBOOK_ENTRIES
            : AIGame_Config.INITIAL_LOREBOOK_ENTRIES;

        Logger.log(`Creating new game book "${lorebookName}" for mode: ${mode}`);
        await context.TavernHelper_API.createOrReplaceWorldbook(lorebookName, entriesTemplate);

        const charBooks = context.TavernHelper_API.getCharWorldbookNames('current');
        if (!charBooks.additional.includes(lorebookName)) {
            // FIX: Use non-mutating array creation for safety
            const updatedAdditional = [...charBooks.additional, lorebookName];
            await context.TavernHelper_API.rebindCharWorldbooks('current', {
                primary: charBooks.primary,
                additional: updatedAdditional
            });
        }
        
        currentCharacterNameCache = charName;
        currentCharacterLorebookName = lorebookName;
        AIGame_State.hasGameBook = true;
        
        context.toastr_API.success("游戏世界书已成功创建。");
        return true;
    }
};
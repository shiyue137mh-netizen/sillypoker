/**
 * AI Card Table Extension - Meta Progression Handler
 * @description Manages all persistent, cross-run player data like talents and legends.
 * This version reads/writes to a specific entry in the character's lorebook.
 */
import { AIGame_State } from '../state.js';
import { Logger } from '../logger.js';

let context;
const META_ENTRY_KEY = 'sp_meta_data';

export const MetaHandler = {
    init(sharedContext) {
        context = sharedContext;
    },

    async getMetaState() {
        const lorebookName = await context.LorebookManager.getCharacterLorebookName();
        if (!lorebookName) {
            Logger.warn('Cannot get meta state, no character lorebook found.');
            return null;
        }

        const bookEntries = await context.TavernHelper_API.getWorldbook(lorebookName);
        const metaEntry = bookEntries?.find(e => e.name === META_ENTRY_KEY);
        
        if (metaEntry && metaEntry.content) {
            try {
                return JSON.parse(metaEntry.content);
            } catch (e) {
                Logger.error(`Failed to parse meta state from entry "${META_ENTRY_KEY}".`, e);
                return null;
            }
        }
        Logger.warn(`Meta entry "${META_ENTRY_KEY}" not found in lorebook.`);
        return null;
    },

    async updateMetaState(updater) {
        const lorebookName = await context.LorebookManager.getCharacterLorebookName();
        if (!lorebookName) {
            Logger.error('Cannot update meta state, no character lorebook found.');
            return;
        }
        // This relies on the LorebookManager's robust `updateWorldbook` function.
        await context.LorebookManager.updateWorldbook(META_ENTRY_KEY, updater);
    },

    async loadMetaState() {
        const metaState = await this.getMetaState();
        if (metaState) {
            AIGame_State.metaData = metaState;
        } else {
             // Default structure if not found or parse fails
             AIGame_State.metaData = { legacy_shards: 0, unlocked_legends: [], unlocked_talents: [] };
        }
        Logger.log('Character-specific meta state loaded:', AIGame_State.metaData);
    },

    // BUG FIX: This function is now deprecated and intentionally left blank
    // to prevent the creation of the old global meta lorebook.
    async createMetaLorebookIfNeeded() {
        // This function has been deprecated and its functionality removed.
        // All meta-data is now stored within the character's primary lorebook.
    }
};
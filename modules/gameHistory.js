/**
 * AI Card Table Extension - Player-Facing Game History
 * @description Manages a log of game events that are safe and understandable for the player to see.
 */
import { Logger } from './logger.js';

let _history = [];
const HISTORY_UPDATE_EVENT = 'sillypoker_history_updated';
let SillyTavern_Context_API;

function _addEntry(entry) {
    // Add a consistent timestamp to all entries
    entry.timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    _history.unshift(entry); // Add to the beginning for chronological order (newest first)

    // Limit history size
    if (_history.length > 100) {
        _history.pop();
    }

    if (SillyTavern_Context_API && SillyTavern_Context_API.eventSource) {
        SillyTavern_Context_API.eventSource.emit(HISTORY_UPDATE_EVENT);
    }
}

export const AIGame_History = {
    init: function(deps) {
        SillyTavern_Context_API = deps.st_context;
        _history = []; // Clear history on init
    },
    
    getHistory: () => [..._history], // Return a copy
    getUpdateEventName: () => HISTORY_UPDATE_EVENT,

    addGameActionEntry(data) {
        // e.g., { actor: 'Bandit', action: 'bets', amount: 100 }
        _addEntry({ type: 'bet', ...data });
    },
    
    addDealEntry(data) {
        // e.g., { target: 'player', count: 2, visibility: 'owner' }
        _addEntry({ type: 'deal', ...data });
    },
    
    addEventEntry(data) {
        // e.g., { text: 'Player gained 1 health.' }
        _addEntry({ type: 'event', ...data });
    },
    
    addMapEntry(data) {
        // e.g., { destination: 'Enemy Node' }
        _addEntry({ type: 'map', ...data });
    },
    
    addGameStatusEntry(data) {
        // e.g., { text: 'Game Started: Blackjack' }
        _addEntry({ type: 'game', ...data });
    }
};
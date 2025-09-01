/**
 * AI Card Table Extension - Centralized Logger
 * @description Provides console logging, stores logs for UI display, and emits update events.
 */

const prefix = '[SillyPoker]';
const styles = {
    log: 'color: #66d9ef;',
    success: 'color: #a6e22e; font-weight: bold;',
    warn: 'color: #f4bf75;',
    error: 'color: #f92672; font-weight: bold;',
};

let logEntries = [];
const LOG_UPDATE_EVENT = 'sillypoker_log_updated';
let SillyTavern_Context_API; // Will be injected

const _addLog = (level, message, ...args) => {
    const timestamp = new Date().toLocaleTimeString();
    logEntries.push({ level, timestamp, message, args });
    
    // Keep log history from growing indefinitely
    if (logEntries.length > 200) {
        logEntries.shift();
    }

    if (SillyTavern_Context_API && SillyTavern_Context_API.eventSource) {
        SillyTavern_Context_API.eventSource.emit(LOG_UPDATE_EVENT);
    }
};

export const Logger = {
    init: function(deps) {
        SillyTavern_Context_API = deps.st_context;
    },

    log: (message, ...args) => {
        console.log(`%c${prefix} ${message}`, styles.log, ...args);
        _addLog('LOG', message, ...args);
    },
    success: (message, ...args) => {
        console.log(`%c${prefix} ${message}`, styles.success, ...args);
        _addLog('SUCCESS', message, ...args);
    },
    warn: (message, ...args) => {
        console.warn(`%c${prefix} ${message}`, styles.warn, ...args);
        _addLog('WARN', message, ...args);
    },
    error: (message, ...args) => {
        console.error(`%c${prefix} ${message}`, styles.error, ...args);
        _addLog('ERROR', message, ...args);
    },

    getLogs: () => {
        return [...logEntries]; // Return a copy
    },
    
    getUpdateEventName: () => LOG_UPDATE_EVENT,
};

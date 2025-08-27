

/**
 * AI Card Table Extension - Logger Utility
 * @description Provides standardized, color-coded console logging for debugging.
 */
const prefix = '[SillyPoker]';
const styles = {
    log: 'color: #66d9ef;',
    success: 'color: #a6e22e; font-weight: bold;',
    warn: 'color: #f4bf75;',
    error: 'color: #f92672; font-weight: bold;',
};

export const Logger = {
    log: (message, ...args) => {
        console.log(`%c${prefix} ${message}`, styles.log, ...args);
    },
    success: (message, ...args) => {
        console.log(`%c${prefix} ${message}`, styles.success, ...args);
    },
    warn: (message, ...args) => {
        console.warn(`%c${prefix} ${message}`, styles.warn, ...args);
    },
    error: (message, ...args) => {
        console.error(`%c${prefix} ${message}`, styles.error, ...args);
    },
};
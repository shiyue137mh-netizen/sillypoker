/**
 * AI Card Table Extension - Log View
 * @description Renders the developer log view.
 */
import { Logger } from '../logger.js';

let jQuery_API;

export const LogView = {
    init(deps) {
        jQuery_API = deps.jq;
    },
    render(container) {
        const logs = Logger.getLogs();
        const logHtml = logs.map(log => {
            const message = typeof log.message === 'object' ? JSON.stringify(log.message, null, 2) : log.message;
            const argsString = log.args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
            return `
                <div class="log-entry">
                    <span class="log-timestamp">${log.timestamp}</span>
                    <span class="log-level log-level-${log.level}">${log.level}</span>
                    <span class="log-message">${message} ${argsString}</span>
                </div>
            `;
        }).join('');
        container.html(`<div class="log-view-container">${logHtml}</div>`);
        
        const logContainer = container.find('.log-view-container');
        if (logContainer.length) {
            logContainer.scrollTop(logContainer[0].scrollHeight);
        }
    }
};

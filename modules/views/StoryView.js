/**
 * AI Card Table Extension - Story View
 * @description Renders the narrative content from the AI and provides an input for the player.
 */
import { Logger } from '../logger.js';

let parentWin, TavernHelper_API, markdownConverter;

function getMarkdownConverter() {
    if (!markdownConverter) {
        if (parentWin.showdown && typeof parentWin.showdown.Converter === 'function') {
            markdownConverter = new parentWin.showdown.Converter({
                tables: true, strikethrough: true, tasklists: true, simpleLineBreaks: true
            });
        } else {
            Logger.error("Showdown markdown converter is not available on the parent window.");
        }
    }
    return markdownConverter;
}

export const StoryView = {
    init(deps) {
        parentWin = deps.win;
        TavernHelper_API = deps.th;
    },
    async render(container) {
        const converter = getMarkdownConverter();
        if (!converter) {
            container.html('<p>Markdown 渲染器加载失败。</p>');
            return;
        }

        const lastMessageRaw = await TavernHelper_API.substitudeMacros('{{lastCharMessage}}');
        let storyContent = '<i>AI尚未发送任何消息...</i>';
        if (lastMessageRaw) {
            storyContent = lastMessageRaw
                .replace(/<think>[\s\S]*?<\/think>/g, '')
                .replace(/<command>[\s\S]*?<\/command>/g, '')
                .replace(/<!--[\s\S]*?-->/g, '')
                .replace(/<WorldState>[\s\S]*?<\/WorldState>/g, '')
                .replace(/<Map>[\s\S]*?<\/Map>/g, '')
                .replace(/<StatusBlocks>[\s\S]*?<\/StatusBlocks>/g, '')
                .trim();
        }
        const lastMessageHtml = converter.makeHtml(storyContent);

        container.html(`
            <div class="story-view-container">
                <div class="story-message-display">${lastMessageHtml}</div>
                <form class="story-input-form" id="story-narrative-form">
                    <textarea id="story-narrative-input" rows="3" placeholder="在此输入你的叙事回应..."></textarea>
                    <button type="submit" class="story-send-btn">发送</button>
                </form>
            </div>
        `);
        
        const display = container.find('.story-message-display');
        if (display.length) display.scrollTop(display[0].scrollHeight);
        
        const input = container.find('#story-narrative-input');
        if (input.length) input.focus();
    }
};

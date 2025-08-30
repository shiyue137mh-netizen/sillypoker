/**
 * AI Card Table Extension - Command Parser
 * @description Parses text for standardized game commands from the AI.
 */
import { Logger } from './logger.js';

export const AIGame_CommandParser = {
    /**
     * Parses a block of text and extracts all valid game commands.
     * This version uses a robust bracket-counting method to handle nested brackets within commands.
     * @param {string} text The text content from the AI's message.
     * @returns {Array<object>} An array of parsed command objects.
     */
    parseCommands(text) {
        if (!text || typeof text !== 'string') return [];
        const commands = [];
        let searchIndex = 0;

        while (searchIndex < text.length) {
            const startIndex = text.indexOf('[', searchIndex);
            if (startIndex === -1) {
                break; // No more command starts found
            }

            let openBrackets = 1;
            let endIndex = -1;

            // Start searching for the matching closing bracket from the character after '['
            for (let i = startIndex + 1; i < text.length; i++) {
                if (text[i] === '[') {
                    openBrackets++;
                } else if (text[i] === ']') {
                    openBrackets--;
                }

                if (openBrackets === 0) {
                    endIndex = i;
                    break;
                }
            }

            if (endIndex !== -1) {
                // Extract the content *between* the outermost brackets
                const commandStr = text.substring(startIndex + 1, endIndex);
                const parsed = this.parseSingleCommand(commandStr);
                if (parsed) {
                    commands.push(parsed);
                }
                // Continue searching for the next command *after* this one ends
                searchIndex = endIndex + 1;
            } else {
                // This means an opening bracket was found but no matching closing one.
                // Log this as a warning and move past the opening bracket to avoid getting stuck.
                Logger.warn('解析指令失败: 在文本中找到一个未匹配的起始方括号 "["', { from: text.substring(startIndex) });
                searchIndex = startIndex + 1;
            }
        }

        return commands;
    },

    /**
     * Parses the content of a single command string, e.g., "Game:Start, data:{...}".
     * This new version robustly handles complex nested JSON.
     * @param {string} commandStr The content inside the brackets `[]`.
     * @returns {object|null} A parsed command object or null if parsing fails.
     */
    parseSingleCommand(commandStr) {
        const trimmedStr = commandStr.trim();
        // V2: Added verbose logging for deep debugging
        Logger.log('[Parser V2] Entry:', `"${trimmedStr}"`);

        const validCategories = ['Game:', 'Action:', 'Event:', 'Item:', 'Map:'];
        if (!validCategories.some(cat => trimmedStr.startsWith(cat))) {
            Logger.warn('[Parser V2] FAIL: String does not start with a valid category.');
            return null;
        }
        Logger.log('[Parser V2] OK: Category check passed.');

        let str = trimmedStr;
        let jsonData = {};

        const dataBlockStartIndex = str.indexOf('data:{');
        if (dataBlockStartIndex !== -1) {
            Logger.log('[Parser V2] Found "data:{" block.');
            const jsonStartIndex = dataBlockStartIndex + 'data:'.length;
            
            let openBraces = 0;
            let jsonEndIndex = -1;
            let firstBraceFound = false;
            for (let i = jsonStartIndex; i < str.length; i++) {
                if (str[i] === '{') {
                    if (!firstBraceFound) firstBraceFound = true;
                    openBraces++;
                } else if (str[i] === '}') {
                    openBraces--;
                }
                if (firstBraceFound && openBraces === 0) {
                    jsonEndIndex = i;
                    break;
                }
            }

            if (jsonEndIndex !== -1) {
                const jsonString = str.substring(jsonStartIndex, jsonEndIndex + 1);
                Logger.log('[Parser V2] Extracted potential JSON string:', `"${jsonString}"`);
                try {
                    jsonData = JSON.parse(jsonString);
                    Logger.log('[Parser V2] OK: JSON parsed successfully.');
                    
                    let blockStartForRemoval = dataBlockStartIndex;
                    for (let i = dataBlockStartIndex - 1; i >= 0; i--) {
                        const char = str[i];
                        if (char === ',') {
                            blockStartForRemoval = i;
                            break;
                        }
                        if (char !== ' ' && char !== '\n' && char !== '\r') {
                            break;
                        }
                    }

                    const stringToRemove = str.substring(blockStartForRemoval, jsonEndIndex + 1);
                    str = str.replace(stringToRemove, '').trim();
                    Logger.log('[Parser V2] String after removing data block:', `"${str}"`);

                } catch (e) {
                    Logger.error('[Parser V2] FAIL: JSON parse error.', e, `Content: "${jsonString}"`);
                    return null;
                }
            } else {
                 Logger.warn('[Parser V2] FAIL: Could not find matching closing brace for JSON object.', { original: commandStr });
                 return null;
            }
        }

        const parts = str.split(',').map(p => p.trim()).filter(Boolean);
        Logger.log('[Parser V2] Remaining parts for parsing:', parts);
        
        if (parts.length === 0) {
            Logger.warn('[Parser V2] FAIL: No parts left after processing data block.', { original: commandStr });
            return null;
        }

        const categoryTypePart = parts.shift();
        Logger.log('[Parser V2] Category/Type part:', `"${categoryTypePart}"`);
        const categoryTypeMatch = categoryTypePart.match(/^([^:]+):([\s\S]+)$/);
        if (!categoryTypeMatch) {
            Logger.warn('[Parser V2] FAIL: Could not match Category:Type format.', { part: categoryTypePart });
            return null;
        }

        const command = {
            category: categoryTypeMatch[1].trim(),
            type: categoryTypeMatch[2].trim(),
            data: jsonData
        };

        parts.forEach(part => {
            const separatorIndex = part.indexOf(':');
            if (separatorIndex > 0) {
                const key = part.substring(0, separatorIndex).trim();
                const value = part.substring(separatorIndex + 1).trim();
                command.data[key] = value;
            }
        });
        
        Logger.success('[Parser V2] SUCCESS: Command fully parsed.', JSON.parse(JSON.stringify(command)));
        return command;
    }
};

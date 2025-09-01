/**
 * AI Card Table Extension - Command Parser (Robust Version)
 * @description Parses text for standardized game commands from the AI, inspired by the robust logic of the original version.
 */
import { Logger } from './logger.js';

export const AIGame_CommandParser = {
    /**
     * Extracts all valid game commands from a block of text.
     * It uses a robust bracket-counting method to correctly handle nested brackets within JSON data.
     * @param {string} text The text content from the AI's message.
     * @returns {Array<object>} An array of parsed command objects.
     */
    parseCommands(text) {
        const commandBlockRegex = /<command>([\s\S]*?)<\/command>/g;
        let commandContent = '';
        
        const commandMatch = commandBlockRegex.exec(text);
        commandContent = (commandMatch && commandMatch[1]) ? commandMatch[1].trim() : text;

        if (!commandContent || typeof commandContent !== 'string') return [];
        
        const commands = [];
        let searchIndex = 0;

        while (searchIndex < commandContent.length) {
            const startIndex = commandContent.indexOf('[', searchIndex);
            if (startIndex === -1) break;

            let openBrackets = 1;
            let endIndex = -1;

            for (let i = startIndex + 1; i < commandContent.length; i++) {
                if (commandContent[i] === '[') openBrackets++;
                else if (commandContent[i] === ']') openBrackets--;
                
                if (openBrackets === 0) {
                    endIndex = i;
                    break;
                }
            }

            if (endIndex !== -1) {
                const commandStr = commandContent.substring(startIndex + 1, endIndex);
                const parsed = this.parseSingleCommand(commandStr);
                if (parsed) {
                    commands.push(parsed);
                }
                searchIndex = endIndex + 1;
            } else {
                Logger.warn('解析指令失败: 在文本中找到一个未匹配的起始方括号 "["', { from: commandContent.substring(startIndex) });
                searchIndex = startIndex + 1;
            }
        }
        return commands;
    },

    /**
     * Parses the content of a single command string, e.g., "Game:Start, data:{...}".
     * This version first extracts the JSON block, then any other key-value pairs, and finally merges them
     * with the JSON data taking precedence.
     * @param {string} commandStr The content inside the brackets `[]`.
     * @returns {object|null} A parsed command object or null if parsing fails.
     */
    parseSingleCommand(commandStr) {
        let str = commandStr.trim();
        let jsonData = {};

        // Step 1: Extract and parse the main JSON data block first.
        const dataBlockStartIndex = str.indexOf('data:{');
        if (dataBlockStartIndex !== -1) {
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
                try {
                    jsonData = JSON.parse(jsonString);
                    let blockStartForRemoval = dataBlockStartIndex;
                    if (blockStartForRemoval > 0 && str.substring(0, blockStartForRemoval).trim().endsWith(',')) {
                         blockStartForRemoval = str.lastIndexOf(',', dataBlockStartIndex);
                    }
                    str = str.substring(0, blockStartForRemoval).trim();
                } catch (e) {
                    Logger.error('[Parser] JSON解析失败:', e, { content: `"${jsonString}"` });
                    return null;
                }
            } else {
                Logger.warn('[Parser] 无法找到匹配的JSON结束花括号 "}"', { original: commandStr });
            }
        }

        // Step 2: Process the remaining string for category, type, and other key-value pairs.
        const parts = str.split(',').map(p => p.trim()).filter(Boolean);
        if (parts.length === 0) {
            Logger.warn('[Parser] 指令中没有有效的类别/类型部分', { original: commandStr });
            return null;
        }

        const categoryTypePart = parts.shift();
        const categoryTypeMatch = categoryTypePart.match(/^([^:]+):([\s\S]+)$/);

        if (!categoryTypeMatch) {
            Logger.warn(`[Parser] 无效的指令头格式: "${categoryTypePart}"`);
            return null;
        }

        // Step 3: Build the command object, merging simple K-V pairs first, then the JSON data.
        const command = {
            category: categoryTypeMatch[1].trim(),
            type: categoryTypeMatch[2].trim(),
            data: {} // Start with an empty data object.
        };

        parts.forEach(part => {
            const separatorIndex = part.indexOf(':');
            if (separatorIndex > 0) {
                const key = part.substring(0, separatorIndex).trim();
                const value = part.substring(separatorIndex + 1).trim();
                command.data[key] = value;
            }
        });

        // Merge the parsed JSON data. This ensures values from the `data:{...}` block
        // (like the 'players' array) take precedence over any simple key-value pairs.
        Object.assign(command.data, jsonData);

        Logger.success(`[Parser] 成功解析指令: ${command.category}:${command.type}`);
        return command;
    }
};

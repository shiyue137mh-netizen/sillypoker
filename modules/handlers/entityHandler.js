/**
 * AI Card Table Extension - Entity Data Handler
 * @description Handles commands that directly modify player or enemy data, like [Event:Modify].
 */
import { Logger } from '../logger.js';

let context; // To hold shared functions and dependencies

async function _handleEventModify(command) {
    const { target, modifications } = command.data;

    if (!target || !modifications || !Array.isArray(modifications)) {
        Logger.error('Invalid [Event:Modify] command: missing target or modifications array.', command.data);
        return;
    }

    // NEW: Handle global meta-data modifications
    if (target === 'global') {
        await context.MetaHandler.updateMetaState((metaData) => {
            modifications.forEach(mod => {
                const { field, operation, value } = mod;
                if (field === 'legacy_shards') {
                    if (operation === 'add') {
                        const amount = Number(value) || 0;
                        metaData.legacy_shards = (metaData.legacy_shards || 0) + amount;
                        context.toastr_API.success(`你获得了 ${amount} 传承碎片！`);
                    } else if (operation === 'set') {
                        metaData.legacy_shards = Number(value) || 0;
                    }
                }
            });
            return metaData;
        });
        await context.MetaHandler.loadMetaState(); // Refresh state after update
        return;
    }


    const userPlayerName = await context.SillyTavern_API.getContext().substituteParamsExtended('{{user}}');
    const isPlayerTarget = target === '{{user}}' || target === userPlayerName;
    const targetNameForHistory = isPlayerTarget ? '玩家' : target;
    let playerChipsWereModified = false;

    const updater = (data) => {
        modifications.forEach(mod => {
            const { field, operation, value } = mod;
            if (isPlayerTarget && field === 'chips') {
                playerChipsWereModified = true;
            }
            let currentVal = data[field];

            switch (operation) {
                case 'add':
                    if (typeof currentVal === 'number') data[field] += Number(value);
                    else if (Array.isArray(currentVal)) currentVal.push(value);
                    break;
                case 'set':
                    data[field] = value;
                    break;
                case 'remove':
                    if (Array.isArray(currentVal)) {
                        context.parentWin._.remove(currentVal, item => item.name === value || item.id === value);
                    }
                    break;
            }

            if (field === 'health') {
                data.health = Math.max(0, Math.min(data.health, data.max_health || 99));
            }
        });
        return data;
    };
    
    if (isPlayerTarget) {
        await context.LorebookManager.updateWorldbook('sp_player_data', updater);
    } else {
        await context.LorebookManager.updateWorldbook('sp_enemy_data', (enemyData) => {
            const enemy = enemyData.enemies?.find(e => e.name === target);
            if (enemy) updater(enemy);
            else Logger.warn(`[Event:Modify] could not find enemy target: "${target}"`);
            return enemyData;
        });
    }

    // Show notifications and add history entries after the data update
    modifications.forEach(mod => {
        const { field, operation, value } = mod;
        let amount;
        let historyText = '';
        
        switch (field) {
            case 'health':
                if (operation === 'add' && (amount = Number(value)) !== 0) {
                    const text = `${targetNameForHistory} ${amount > 0 ? '恢复了' : '失去了'} ${Math.abs(amount)} 点生命！`;
                    context.toastr_API[amount > 0 ? 'success' : 'warning'](text);
                    historyText = text;
                }
                break;
            case 'chips':
                if (operation === 'add' && (amount = Number(value)) !== 0) {
                    const text = `${targetNameForHistory} ${amount > 0 ? '获得了' : '失去了'} ${Math.abs(amount)} 筹码！`;
                    context.toastr_API[amount > 0 ? 'success' : 'warning'](text);
                    historyText = text;
                }
                break;
            case 'inventory':
                if (operation === 'add' && typeof value === 'object') {
                    const text = `${targetNameForHistory} 获得了道具：[${value.name}]！`;
                    context.toastr_API.success(text);
                    historyText = text;
                }
                break;
            case 'status_effects':
                if (operation === 'add' && typeof value === 'object') {
                    const text = `${targetNameForHistory} 获得了状态：[${value.name}]！`;
                    context.toastr_API.info(text);
                    historyText = text;
                } else if (operation === 'remove') {
                    const text = `状态 [${value}] 已从 ${targetNameForHistory} 身上移除。`;
                    context.toastr_API.info(text);
                    historyText = text;
                }
                break;
        }
        
        if (historyText) {
            context.AIGame_History.addEventEntry({ text: historyText });
        }
    });

    await context.LorebookManager.fetchAllGameData();

    // After all data is updated and fetched, check if the player went bankrupt
    if (playerChipsWereModified) {
        await context.RunManager.checkPlayerVitals();
    }

    Logger.success(`[Event:Modify] successfully applied to target "${target}".`);
}

export const AIGame_EntityHandler = {
    init: function(ctx) {
        context = ctx;
    },

    async handleCommand(command) {
        if (command.type === 'Modify') {
            await _handleEventModify(command);
        } else {
            Logger.warn(`EntityHandler received unknown command type: ${command.type}`);
        }
    }
};
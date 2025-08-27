

/**
 * AI Card Table Extension - Entity Data Handler
 * @description Handles commands that directly modify player or enemy data, like [Event:Modify].
 */
import { Logger } from './logger.js';

let context; // To hold shared functions and dependencies

async function _handleEventModify(command) {
    const { target, modifications } = command.data;

    if (!target || !modifications || !Array.isArray(modifications)) {
        Logger.error('Invalid [Event:Modify] command: missing target or modifications array.', command.data);
        return;
    }

    const userPlayerName = await context.SillyTavern_Context_API.substituteParamsExtended('{{user}}');
    const isPlayerTarget = target === '{{user}}' || target === userPlayerName;

    const updater = (data) => {
        modifications.forEach(mod => {
            const { field, operation, value } = mod;
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
        await context.updateWorldbook('sp_player_data', updater);
    } else {
        await context.updateWorldbook('sp_enemy_data', (enemyData) => {
            const enemy = enemyData.enemies?.find(e => e.name === target);
            if (enemy) updater(enemy);
            else Logger.warn(`[Event:Modify] could not find enemy target: "${target}"`);
            return enemyData;
        });
    }

    // Show notifications after the data update
    const targetNameForToast = isPlayerTarget ? '你' : target;
    modifications.forEach(mod => {
        const { field, operation, value } = mod;
        let amount;
        switch (field) {
            case 'health':
                if (operation === 'add' && (amount = Number(value)) < 0)
                    context.toastr_API.warning(`${targetNameForToast}失去了 ${-amount} 点生命！`);
                break;
            case 'chips':
                if (operation === 'add' && (amount = Number(value)) !== 0)
                    context.toastr_API[amount > 0 ? 'success' : 'warning'](`${targetNameForToast}${amount > 0 ? '获得了' : '失去了'} ${Math.abs(amount)} 筹码！`);
                break;
            case 'inventory':
                if (operation === 'add' && typeof value === 'object')
                    context.toastr_API.success(`${targetNameForToast}获得了道具：[${value.name}]！`);
                break;
            case 'status_effects':
                if (operation === 'add' && typeof value === 'object')
                    context.toastr_API.info(`${targetNameForToast}获得了状态：[${value.name}]！`);
                else if (operation === 'remove')
                    context.toastr_API.info(`状态 [${value}] 已从${targetNameForToast}身上移除。`);
                break;
        }
    });

    await context.fetchAllGameData();
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
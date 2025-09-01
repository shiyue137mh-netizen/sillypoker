/**
 * AI Card Table Extension - Hall of Fame View
 * @description Renders the UI for the meta-progression system (Talents and Legends).
 */
import { AIGame_State } from '../state.js';
import { talentTreeData } from '../meta/talentTreeData.js';
import { legendsData } from '../meta/legendsData.js';

let DataHandler;

export const HallOfFameView = {
    init(deps, dataHandler) {
        DataHandler = dataHandler;
    },
    render(container) {
        // This is a placeholder for the full UI implementation.
        // For now, it will just show the collected legacy shards.
        const metaData = AIGame_State.metaData || { legacy_shards: 0, unlocked_legends: [], unlocked_talents: [] };

        container.html(`
            <div class="difficulty-selection-container">
                <h2 class="difficulty-title">殿堂</h2>
                <p class="difficulty-subtitle">在这里查看你解锁的传说，并使用传承碎片解锁永久天赋。</p>
                <div style="margin-bottom: 20px; font-size: 1.2em;">
                    <strong>传承碎片:</strong> ${metaData.legacy_shards} <i class="fas fa-gem"></i>
                </div>
                <div>
                    <p><em>天赋树和传说系统正在紧张施工中...</em></p>
                </div>
            </div>
        `);
    }
};

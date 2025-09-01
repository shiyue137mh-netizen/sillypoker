/**
 * AI Card Table Extension - Legends Data
 * @description Defines the structure and data for all possible "Legends" (achievements) in the game.
 * The system only stores the IDs of unlocked legends; this file provides the details for those IDs.
 */

export const legendsData = {
    // Example Legend Structure
    LEGEND_DEFEAT_FIRST_BOSS: {
        id: 'LEGEND_DEFEAT_FIRST_BOSS',
        name: '首领杀手',
        description: '首次击败第一层的首领。',
        // 'trigger' is for documentation; actual unlocking is hard-coded in relevant game logic (e.g., RunManager).
        trigger: 'Defeat the floor 1 boss for the first time.',
    },
    LEGEND_WIN_WITH_ROYAL_FLUSH: {
        id: 'LEGEND_WIN_WITH_ROYAL_FLUSH',
        name: '皇家同花顺',
        description: '在德州扑克中，以一手皇家同花顺赢得牌局。',
        trigger: 'Win a hand of Texas Hold\'em with a royal flush.',
    },
    LEGEND_HIGH_ROLLER: {
        id: 'LEGEND_HIGH_ROLLER',
        name: '赌命徒',
        description: '在一场牌局中赢得超过10000筹码的彩池。',
        trigger: 'Win a single pot of over 10,000 chips.',
    },
    // Add more legends here as placeholders
    LEGEND_PLACEHOLDER_1: {
        id: 'LEGEND_PLACEHOLDER_1',
        name: '???',
        description: '???',
        trigger: '???',
    },
    LEGEND_PLACEHOLDER_2: {
        id: 'LEGEND_PLACEHOLDER_2',
        name: '???',
        description: '???',
        trigger: '???',
    },
};

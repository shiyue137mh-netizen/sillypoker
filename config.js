/**
 * AI Card Table Extension - Configuration
 * @description Centralized configuration for constants used throughout the extension.
 */
export const AIGame_Config = {
    // DOM Element IDs
    PANEL_ID: 'sillypoker-panel',
    TOGGLE_BUTTON_ID: 'sillypoker-toggle-btn',

    // Lorebook (World Book) Configuration
    LOREBOOK_PREFIX: 'SillyPoker_Data_',
    INITIAL_LOREBOOK_ENTRIES: [
        { name: 'sillypoker_enemy_data', content: '{}', enabled: true, comment: '由AI卡牌桌面插件管理。请勿手动编辑。' },
        { name: 'sillypoker_player_cards', content: '{"current_hand":[]}', enabled: false, comment: '由AI卡牌桌面插件管理。请勿手动编辑。' },
        { name: 'sillypoker_player_data', content: '{\n  "comment": "玩家的公开数据模板，AI可见。包含生命值、筹码、道具和状态。",\n  "name": "{{user}}",\n  "health": 3,\n  "max_health": 3,\n  "chips": 1000,\n  "inventory": [],\n  "status_effects": []\n}', enabled: true, comment: '由AI卡牌桌面插件管理。请勿手动编辑。' },
        { name: 'sillypoker_map_data', content: '{}', enabled: false, comment: '由AI卡牌桌面插件管理。请勿手动编辑。' },
        { name: 'sillypoker_current_game_state', content: '{}', enabled: true, comment: '由AI卡牌桌面插件管理。请勿手动编辑。' },
        { name: 'sillypoker_private_game_data', content: '{}', enabled: false, comment: '由AI卡牌桌面插件管理。请勿手动编辑。' },
    ],
    LOREBOOK_ENTRY_KEYS: [
        'sillypoker_enemy_data',
        'sillypoker_player_cards',
        'sillypoker_player_data',
        'sillypoker_map_data',
        'sillypoker_current_game_state',
        'sillypoker_private_game_data',
    ],
    WORLD_BOOK_COMMENT: '由AI卡牌桌面插件管理。请勿手动编辑。'
};
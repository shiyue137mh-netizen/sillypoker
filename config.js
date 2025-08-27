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
        { name: 'sp_enemy_data', content: '{}', enabled: true, comment: '当前遭遇的敌人数据，角色可见。用于存储敌人的状态和手牌（如果公开）。' },
        { name: 'sp_player_cards', content: '{"comment":"玩家的手牌，现在对角色可见。","current_hand":[]}', enabled: true, comment: '玩家的手牌数据。角色可见，用于AI决策。' },
        { name: 'sp_player_data', content: '{\n  "comment": "玩家的公开状态，角色可见。包含生命值、筹码、道具和状态效果。",\n  "name": "{{user}}",\n  "health": 3,\n  "max_health": 3,\n  "chips": 1000,\n  "inventory": [],\n  "status_effects": []\n}', enabled: true, comment: '玩家的公开状态，角色可见。包含生命值、筹码、道具和状态效果。' },
        { name: 'sp_map_data', content: '{}', enabled: false, comment: 'Roguelike地图的结构和玩家位置，角色不可见。由主控管理。' },
        { name: 'sp_game_state', content: '{}', enabled: true, comment: '当前牌局的公共状态，角色可见。包含公共牌、彩池、当前回合等关键信息。' },
        { name: 'sp_private_data', content: '{}', enabled: false, comment: '游戏的私有核心数据，角色不可见。主要用于存放牌堆以确保公平性。' },
    ],
    LOREBOOK_ENTRY_KEYS: [
        'sp_enemy_data',
        'sp_player_cards',
        'sp_player_data',
        'sp_map_data',
        'sp_game_state',
        'sp_private_data',
    ],
    WORLD_BOOK_COMMENT: '由AI卡牌桌面插件管理。请勿手动编辑。'
};
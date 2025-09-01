/**
 * AI Card Table Extension - Configuration
 * @description Centralized configuration for constants used throughout the extension.
 */
export const AIGame_Config = {
    // DOM Element IDs
    PANEL_ID: 'sillypoker-panel',
    TOGGLE_BUTTON_ID: 'sillypoker-toggle-btn',
    STORAGE_KEY_UI: 'sillypoker-ui-state-v3', // MODIFIED: Updated key for new state structure

    // Lorebook (World Book) Configuration
    LOREBOOK_PREFIX: 'SillyPoker_Data_',
    INITIAL_LOREBOOK_ENTRIES: [
        { 
            name: 'sp_enemy_data', 
            content: '{"comment": "当前遭遇的敌人数据，角色可见。用于存储敌人的状态和手牌。具体卡牌的可见性由visibility属性控制"}', 
            enabled: true, 
            comment: '当前遭遇的敌人数据，角色可见。用于存储敌人的状态和手牌。具体卡牌的可见性由visibility属性控制',
            strategy: { type: 'constant' },
            position: { type: 'at_depth', role: 'system', depth: 2, order: 900 }
        },
        { 
            name: 'sp_player_cards', 
            content: '{"comment": "玩家的手牌，AI可见，但具体卡牌的可见性由visibility属性控制（例如21点的明牌）。", "current_hand":[]}', 
            enabled: true, 
            comment: '玩家的手牌，AI可见，但具体卡牌的可见性由visibility属性控制（例如21点的明牌）。',
            strategy: { type: 'constant' },
            position: { type: 'at_depth', role: 'system', depth: 2, order: 100 }
        },
        { 
            name: 'sp_player_data', 
            content: '{\n  "comment": "玩家的公开状态，角色可见。包含生命值、筹码、道具和状态效果。",\n  "name": "{{user}}",\n  "health": 3,\n  "max_health": 3,\n  "chips": 1000,\n  "claimable_pot": 0,\n  "inventory": [],\n  "status_effects": []\n}', 
            enabled: true, 
            comment: '玩家的公开状态，角色可见。包含生命值、筹码、道具和状态效果。',
            strategy: { type: 'constant' },
            position: { type: 'at_depth', role: 'system', depth: 2, order: 100 }
        },
        { 
            name: 'sp_map_data', 
            content: '{"comment": "Roguelike地图的结构和玩家位置，角色不可见。由主控管理。"}', 
            enabled: false, 
            comment: 'Roguelike地图的结构和玩家位置，角色不可见。由主控管理。' 
        },
        { 
            name: 'sp_game_state', 
            content: '{"comment": "当前牌局的公共状态，角色可见。包含公共牌、彩池、当前回合等关键信息。"}', 
            enabled: true, 
            comment: '当前牌局的公共状态，角色可见。包含公共牌、彩池、当前回合等关键信息。',
            strategy: { type: 'constant' },
            position: { type: 'at_depth', role: 'system', depth: 2, order: 100 }
        },
        { 
            name: 'sp_private_data', 
            content: '{"comment": "游戏的私有核心数据，角色不可见。主要用于存放牌堆以确保公平性。"}', 
            enabled: false, 
            comment: '游戏的私有核心数据，角色不可见。主要用于存放牌堆以确保公平性。' 
        },
        {
            name: 'sp_meta_data',
            content: '{\n  "comment": "玩家的元数据，角色不可见。用于存储跨挑战的永久进度。",\n  "legacy_shards": 0,\n  "unlocked_legends": [],\n  "unlocked_talents": []\n}',
            enabled: false,
            comment: '玩家的元数据，角色不可见。用于存储跨挑战的永久进度。'
        },
        { 
            name: 'sp_visible_deck', 
            content: '{"comment":"此牌堆对AI可见，用于确保发牌顺序。"}', 
            enabled: false, 
            comment: '对局开始后打乱好的随机牌组。此条目仅供AI查看，玩家不可见。AI必须严格遵循此顺序调用[Game:Function, type:发牌]指令。',
            strategy: { type: 'constant' },
            position: { type: 'at_depth', role: 'system', depth: 1, order: 101 }
        }
    ],
    ORIGIN_MODE_LOREBOOK_ENTRIES: [
        { 
            name: 'sp_enemy_data', 
            content: '{"comment": "当前遭遇的敌人数据，角色可见。用于存储敌人的状态和手牌。具体卡牌的可见性由visibility属性控制"}', 
            enabled: true, 
            comment: '当前遭遇的敌人数据，角色可见。用于存储敌人的状态和手牌。具体卡牌的可见性由visibility属性控制',
            strategy: { type: 'constant' },
            position: { type: 'at_depth', role: 'system', depth: 2, order: 100 }
        },
        { 
            name: 'sp_player_cards', 
            content: '{"comment": "玩家的手牌，AI可见，但具体卡牌的可见性由visibility属性控制（例如21点的明牌）。", "current_hand":[]}', 
            enabled: true, 
            comment: '玩家的手牌，AI可见，但具体卡牌的可见性由visibility属性控制（例如21点的明牌）。',
            strategy: { type: 'constant' },
            position: { type: 'at_depth', role: 'system', depth: 2, order: 100 }
        },
        { 
            name: 'sp_player_data', 
            content: '{\n  "comment": "玩家的公开状态，角色可见。包含生命值、筹码、道具和状态效果。",\n  "name": "{{user}}",\n  "health": 3,\n  "max_health": 3,\n  "chips": 1000,\n  "claimable_pot": 0,\n  "inventory": [],\n  "status_effects": []\n}', 
            enabled: true, 
            comment: '玩家的公开状态，角色可见。包含生命值、筹码、道具和状态效果。',
            strategy: { type: 'constant' },
            position: { type: 'at_depth', role: 'system', depth: 2, order: 100 }
        },
        { 
            name: 'sp_game_state', 
            content: '{"comment": "当前牌局的公共状态，角色可见。包含公共牌、彩池、当前回合等关键信息。"}', 
            enabled: true, 
            comment: '当前牌局的公共状态，角色可见。包含公共牌、彩池、当前回合等关键信息。',
            strategy: { type: 'constant' },
            position: { type: 'at_depth', role: 'system', depth: 2, order: 100 }
        },
        { 
            name: 'sp_private_data', 
            content: '{"comment": "游戏的私有核心数据，角色不可见。主要用于存放牌堆以确保公平性。"}', 
            enabled: false, 
            comment: '游戏的私有核心数据，角色不可见。主要用于存放牌堆以确保公平性。' 
        },
        { 
            name: 'sp_visible_deck', 
            content: '{"comment":"此牌堆对AI可见，用于确保发牌顺序。AI必须严格遵循此顺序调用[Game:Function, type:发牌]指令。"}', 
            enabled: false, 
            comment: '对局开始后打乱好的随机牌组。此条目仅供AI查看，玩家不可见。',
            strategy: { type: 'constant' },
            position: { type: 'at_depth', role: 'system', depth: 1, order: 901 }
        }
    ],
    LOREBOOK_ENTRY_KEYS: [
        'sp_enemy_data',
        'sp_player_cards',
        'sp_player_data',
        'sp_map_data',
        'sp_game_state',
        'sp_private_data',
        'sp_meta_data',
        'sp_visible_deck'
    ],
    WORLD_BOOK_COMMENT: '由AI卡牌桌面插件管理。请勿手动编辑。',

    // Emote Wheel Texts
    EMOTE_LABELS: [
        '赌怪',
        '你能秒我？',
        '卡布奇诺',
        '全体起立',
        '陈刀仔'
    ],
    EMOTE_TEXTS: [
        '你们可能不知道只用20万赢到578万是什么概念，我们一般只会用两个字来形容这种人：赌怪！',
        '这几张牌你能秒我？？你能秒杀我？？17张牌你今天能把我{{user}}秒了，我当场就把这个牌桌吃掉！！！',
        '给阿姨倒一杯卡布奇诺啊。',
        '现在各位观众，全~体~起立~',
        '我经常说一句话，当年陈刀仔，他能用20块赢到3700万，我{{user}}用[现在筹码数]赢到1000万没有问题。'
    ]
};
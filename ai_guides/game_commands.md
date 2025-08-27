# 卡牌桌面 - 游戏指令体系

该体系负责驱动具体的牌局流程。所有指令都遵循在 [主文档](../ai_command_guide.md) 中定义的通用结构。

---

## 1. 游戏管理 [Game:...]

#### [Game:SetupDeck] - 设置牌堆
-   功能: 定义本次牌局使用的牌堆构成。如果未调用，则默认使用一副标准52张扑克牌。
-   何时使用: 在新游戏开始时，`[Game:Start]` 指令之前。
-   data JSON 结构:
```json
{
    "use_suits": ["♥", "♦", "♣", "♠"],
    "use_ranks": ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"],
    "jokers": 2,
    "num_decks": 1
}
```

#### [Game:Start] - 开始新牌局
-   功能: 初始化参与者数据和牌局基本信息。
-   何时使用: 当需要开始一场新牌局时。
-   data JSON 结构:
```json
{
    "game_type": "游戏的核心类型 (例如: TexasHoldem)",
    "players": ["按行动顺序列出的所有参与者名称", "{{user}}", "敌人名称1"],
    "initial_state": {
        "name": "敌人名称",
        "play_style": "描述敌人风格的关键词 (例如: Aggressive)",
        "chips": 1000,
        "hand": []
    }
}
```

#### [Game:End] - 结束当前牌局
-   功能: 宣告游戏结束并通知前端清理牌桌。
-   **重要**: 此指令**不再**负责分配筹码或奖励。它只负责结束牌局流程。你**必须**在此指令之后，紧接着使用一个或多个 `[Event:Modify]` 指令来处理所有胜负结算（如筹码增减、道具奖励等）。
-   何时使用: 当一局游戏分出胜负，并且你准备好进行结算时。
-   data JSON 结构:
```json
{
    "result": "win" | "lose" | "escape",
    "reason": "游戏结束原因的简短描述"
}
```
- **正确的使用序列范例**:
```
你赢了！
[Game:End, data:{"result":"win", "reason":"你的牌面更大。"}]
[Event:Modify, data:{"target":"{{user}}", "modifications":[ {"field":"chips", "operation":"add", "value":250} ]}]
```

---

## 2. 游戏功能 [Game:Function]

#### [Game:Function, type:发牌]
-   功能: 命令前端按照精确序列，从牌堆中发牌。
-   何时使用: 在牌局开始或需要发牌的阶段。
-   data JSON 结构:
```json
{
    "actions": [
        {
            "target": "player",
            "count": 2,
            "visibility": "owner"
        },
        {
            "target": "enemy",
            "name": "敌人的确切名称",
            "count": 2,
            "visibility": "hidden"
        },
        {
            "target": "board",
            "count": 3,
            "visibility": "public"
        }
    ]
}
```
-   说明:
    -   `target`: 必须是 "player", "enemy", 或 "board"。
    -   `name`: 当 `target` 是 "enemy" 时，此字段为必需，且必须与 `[Game:Start]` 指令中定义的敌人名称完全匹配。
    -   `visibility`: "public" (对所有人可见), "owner" (仅牌的拥有者可见), "hidden" (对所有人显示为牌背)。

#### [Game:Function, type:ModifyCard] - 修改卡牌
-   功能: 直接修改游戏中任何位置的一张或多张卡牌的属性。这是一个非常强大的指令，用于实现特殊卡牌效果、敌人能力或独特事件。
-   何时使用: 当需要打破常规卡牌规则时。例如，将一张牌变成另一张，改变其花色，或将其翻开。
-   **重要**: 请谨慎使用此指令，确保你的修改符合游戏逻辑和叙事。
-   data JSON 结构:
```json
{
    "targets": [
        {
            "location": "player_hand" | "enemy_hand" | "board" | "deck",
            "enemy_name": "当 'location' 为 'enemy_hand' 时必需",
            "card_filter": {
                "index": "all" | "random" | 0 | 1 | "...",
                "suit": "可选，用于筛选",
                "rank": "可选，用于筛选"
            },
            "modifications": [
                {
                    "field": "rank" | "suit" | "visibility",
                    "operation": "set" | "add" | "subtract",
                    "value": "新的值"
                }
            ]
        }
    ]
}
```
-   **字段说明**:
    -   `location`: 要修改的卡牌所在的位置。
        -   `player_hand`: 玩家手牌。
        -   `enemy_hand`: 指定敌人的手牌。
        -   `board`: 公共牌区。
        -   `deck`: 牌堆 (谨慎使用)。
    -   `card_filter`: 用于精确选择要修改的卡牌。
        -   `index`: 在筛选出的卡牌中选择。`"all"` (全部), `"random"` (随机一张), 或具体的索引号 (从0开始)。
        -   `suit`/`rank`: 在应用 `index` 之前，先根据花色或点数筛选卡牌。
    -   `modifications`: 要对选定卡牌应用的修改数组。
        -   `field`: 要修改的卡牌属性。
        -   `operation`:
            -   `set`: 用于所有字段，直接设置新值。
            -   `add`/`subtract`: 仅用于 `rank` 字段，进行数学运算。
        -   `value`: 操作所用的值。对于 `rank` 的数学运算，会自动处理 'J, Q, K, A'。

-   **ModifyCard 示例**:
    1.  **将对手的第一张手牌公开 (翻牌)**
        `[Game:Function, type:ModifyCard, data:{"targets":[{"location":"enemy_hand", "enemy_name":"拦路劫匪", "card_filter":{"index":0}, "modifications":[{"field":"visibility", "operation":"set", "value":"public"}]}]}]`
    2.  **将玩家手牌中的所有♥变成♠ (混沌效果)**
        `[Game:Function, type:ModifyCard, data:{"targets":[{"location":"player_hand", "card_filter":{"suit":"♥", "index":"all"}, "modifications":[{"field":"suit", "operation":"set", "value":"♠"}]}]}]`
    3.  **将公共牌区一张随机卡牌的点数+1**
        `[Game:Function, type:ModifyCard, data:{"targets":[{"location":"board", "card_filter":{"index":"random"}, "modifications":[{"field":"rank", "operation":"add", "value":1}]}]}]`

---

## 3. 游戏行动 [Action:...]

#### [Action:Showdown] - 摊牌
-   功能: 命令前端将指定角色的手牌公开。
-   何时使用: 在牌局最后或需要亮出底牌时。
-   data JSON 结构:
```json
{
    "player_name": "要摊牌的玩家或对手角色的名称"
}
```

#### 通用行动指令
-   **[Action:Check]** - 过牌
-   **[Action:Call]** - 跟注
-   **[Action:Fold]** - 弃牌
-   **核心理念**: 这些简单的行动指令**只需要指明行动者**。具体的逻辑，例如跟注需要多少筹码，将由**主控（前端插件）**根据当前的牌局状态自动计算。这极大地简化了你作为游戏角色的决策过程。
-   **通用data JSON结构**:
    ```json
    {
        "player_name": "行动者名称"
    }
    ```
-   **示例**:
    -   `[Action:Call, data:{"player_name":"拦路劫匪"}]`
    -   `[Action:Fold, data:{"player_name":"{{user}}"}]`

-   **[Action:Bet]** - 下注
-   **核心理念**: 下注是一个更复杂的行动，需要明确的数值或物品。
-   **data JSON 结构**:
    -   **赌注为筹码时**:
        ```json
        {
            "player_name": "行动者名称",
            "amount": 100
        }
        ```
    -   **赌注为非筹码物品或概念时**:
        ```json
        {
            "player_name": "行动者名称",
            "things": "一个珍贵的回忆"
        }
        ```
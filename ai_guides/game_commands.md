# 游戏指令体系

该体系负责驱动具体的牌局流程。

---

## 1. 游戏管理 [Game:...]

#### [Game:SetupDeck] - 设置牌堆
-   **功能**: 定义本次牌局使用的牌堆构成。若不调用，则默认使用一副标准52张扑克牌。
-   **data JSON 结构**:
```json
{
    "use_suits": ["♥", "♦", "♣", "♠"],
    "use_ranks": ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"],
    "jokers": 2,
    "num_decks": 1
}
```

#### [Game:Start] - 开始新牌局
-   **功能**: 初始化参与者数据和牌局基本信息。
-   **data JSON 结构**:
```json
{
    "game_type": "游戏核心类型 (例如: TexasHoldem)",
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
-   **功能**: 宣告游戏结束。
-   **data JSON 结构**:
```json
{
    "result": "win" | "lose" | "escape" | "boss_win" | "dead",
    "reason": "游戏结束原因的简短描述"
}
```
- **result说明**:
    -   `"win"` / `"lose"`: 普通胜负。输掉牌局本身不会扣除生命值，只有当玩家筹码归零时才会受到惩罚。
    -   `"escape"`: 玩家成功逃跑。
    -   `"boss_win"`: **【重要】** 玩家战胜了首领。**必须使用此结果**才能触发“前往下一层”的事件。将其误用为 `"win"` 将导致游戏无法继续进行。
    -   `"dead"`: **【重要】** 玩家因剧情原因死亡。此结果会**无视玩家当前生命值**，并立即**强制结束并重置整个挑战**。用于处理保命道具也无法豁免的必死情况。

---
#### **【关键】奖励分配协议 v2.0**
`[Game:End]` 指令**只负责宣告结果**，它**不会**自动处理彩池中的筹码。

-   **当玩家胜利时 (`"win"` / `"boss_win"`)**: 系统会自动将彩池中的筹码变为可供玩家领取的奖励。你**不需要**也**不应该**再发送 `[Event:Modify]` 指令来为玩家增加筹码。

-   **当敌人胜利时 (`"lose"`)**: 你**必须**在 `[Game:End]` 之后，立即跟随一个 `[Event:Modify]` 指令来手动将彩池中的筹码分配给你自己。你需要从 `<context>` 块中读取 `pot_amount` 来确定分配的数额。

**忘记为自己分配筹码是一个严重的逻辑错误。**

#### **使用序列范例**:

**1. 敌人胜利** (假设敌人名为“拦路劫匪”，彩池为 300)
<command>
    [Game:End, data:{"result":"lose", "reason":"我的牌面更大。"}]
    [Event:Modify, data:{"target":"拦路劫匪", "modifications":[ {"field":"chips", "operation":"add", "value":300} ]}]
</command>

---

## 2. 游戏功能 [Game:Function]

#### [Game:Function, type:发牌]
-   **功能**: 请求主控从牌堆中发牌。
-   **data JSON 结构**:
```json
{
    "actions": [
        {
            "target": "player" | "enemy" | "board",
            "name": "当 target 是 enemy 时必需",
            "count": 2,
            "visibility": "owner" | "hidden" | "public"
        }
    ]
}
```
-   `visibility` **说明**:
    -   `"public"`: 对所有人可见 (例如公共牌)。
    -   `"owner"`: 仅对卡牌拥有者可见 (这是**玩家和对手**私有手牌的标准设置)。
    -   `"hidden"`: 对所有人显示为牌背 (用于荷官的底牌、牌堆顶的牌等在揭示前对**所有人都未知**的情况)。

#### [Game:Function, type:Modify] - 修改、添加或移除卡牌
-   **功能**: 直接修改、添加或移除游戏中任何位置的一张或多张卡牌。
-   **data JSON 结构**:
```json
{
    "targets": [
        {
            "location": "player_hand" | "enemy_hand" | "board" | "deck",
            "enemy_name": "当 'location' 为 'enemy_hand' 时必需",
            "operation": "update" | "add" | "remove",

            "card_filter": { "index": "all" | "random" | 0, "suit": "♥", "rank": "A" },
            "modifications": [ {"field":"rank", "operation":"set", "value":"K"} ],
            "cards_to_add": [ {"rank":"A", "suit":"♥", "visibility":"owner"} ]
        }
    ]
}
```
-   **字段说明**:
    -   `location`: 卡牌位置。
    -   `operation`: 操作类型 (`update`, `add`, `remove`)。
    -   `card_filter` (用于 `update`, `remove`): 筛选目标卡牌。
    -   `modifications` (用于 `update`): 定义如何修改卡牌。
    -   `cards_to_add` (用于 `add`): 定义要添加的新卡牌。

-   **Modify 示例**:
    1.  **更新 (Update)**: 将对手的第一张手牌公开。
        [Game:Function, type:Modify, data:{"targets":[{"location":"enemy_hand", "enemy_name":"拦路劫匪", "operation":"update", "card_filter":{"index":0}, "modifications":[{"field":"visibility", "operation":"set", "value":"public"}]}]}]
    2.  **添加 (Add)**: 在玩家手牌中添加一张红桃A。
        [Game:Function, type:Modify, data:{"targets":[{"location":"player_hand", "operation":"add", "cards_to_add":[{"rank":"A", "suit":"♥", "visibility":"owner"}]}]}]
    3.  **移除 (Remove)**: 从公共牌区移除所有♠️花色的牌。
        [Game:Function, type:Modify, data:{"targets":[{"location":"board", "operation":"remove", "card_filter":{"suit":"♠", "index":"all"}}]}]

---

## 3. 游戏行动 [Action:...]

#### [Action:Hit] - 要牌
-   **功能**: 为指定玩家从牌堆发一张公开的牌。
-   **data JSON 结构**: `{"player_name": "角色名称"}`

#### [Action:SwapCards] - 交换卡牌
-   **功能**: 交换两个不同位置的卡牌。
-   **data JSON 结构**:
```json
{
    "swap_type": "random" | "specific",
    "source":      { "location": "player_hand" },
    "destination": { "location": "enemy_hand", "enemy_name": "拦路劫匪" },
    "count": 1,
    "card_one": { "location": "player_hand", "card_filter": {"index": 0} },
    "card_two": { "location": "board", "card_filter": {"rank": "A", "suit": "♥"} }
}
```

#### [Action:Showdown] - 摊牌
-   **功能**: 将指定角色的手牌公开。
-   **data JSON 结构**: `{"player_name": "角色名称"}`

#### 通用行动指令
-   **[Action:Check]** - 过牌
-   **[Action:Call]** - 跟注
-   **[Action:Fold]** - 弃牌
-   **功能**: 执行简单的游戏行动。跟注所需的具体筹码量由主控自动计算。
-   **通用 data 结构**: `{"player_name": "行动者名称"}`
-   **示例**:
    [Action:Call, data:{"player_name":"拦路劫匪"}]

-   **[Action:Bet]** - 下注
-   **功能**: 下注筹码或非筹码物品。
-   **data JSON 结构**:
```json
{
    "player_name": "行动者名称",
    "amount": 100,
    "things": "一个珍贵的回忆"
}
```
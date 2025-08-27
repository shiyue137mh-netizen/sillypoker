# 卡牌桌面 - 完整游戏流程示例

本文档将通过两个经典游戏：“21点”和“德州扑克”，详细展示玩家、前端插件和游戏主持人之间的完整交互流程。

---

## 示例一：21点 (Blackjack)

### 1. 玩家发起游戏

-   **玩家输入**: `我们来玩一局21点吧，你来当庄家。`

### 2. 庄家初始化牌局

-   **角色响应 (单次输出后停止)**:

    好的，牌桌已经准备好了。我已向主控请求发牌，祝你好运！
    [Game:Start, data:{"game_type": "Blackjack", "players": ["{{user}}", "庄家"], "initial_state": { "name": "庄家", "play_style": "ByTheBook" }}]
    [Game:Function, type:发牌, data:{"actions":[
      {"target":"player", "count":2, "visibility":"owner"},
      {"target":"enemy", "name":"庄家", "count":2, "visibility":"hidden"}
    ]}]

-   **前端行为 (作为主控)**:
    1.  **解析 `[Game:Start]`**:
        -   清空牌桌。
        -   更新 `sillypoker_enemy_data.json`，设置对手为“庄家”。
        -   更新 `sillypoker_current_game_state.json`，设置游戏类型为 "Blackjack"。
        -   在 `sillypoker_private_game_data.json` 中创建并洗好一副52张牌的牌堆。
    2.  **响应 `[Game:Function]` 的发牌请求**:
        -   从私有牌堆顶发4张牌。
        -   前2张牌（例如 `♥A`, `♦10`）写入 `sillypoker_player_cards.json`，`visibility` 为 "owner"。
        -   后2张牌（例如 `♣K`, `♠5`）写入 `sillypoker_enemy_data.json` 中“庄家”的 `hand` 字段，`visibility` 为 "hidden"。
    3.  **渲染UI**:
        -   玩家手牌区显示明牌：`♥A`, `♦10`。
        -   庄家手牌区显示两张牌背。
        -   显示玩家的操作按钮：“要牌(Hit)”、“停牌(Stand)”。

### 3. 玩家的回合：要牌

-   **玩家操作**: 点击 “要牌(Hit)” 按钮。
-   **前端行为**:
    1.  将操作 `{type: 'hit'}` 存入 `stagedPlayerActions`。
    2.  玩家点击“提交回合”按钮。
    3.  前端生成系统提示并发送给游戏主持人: `(系统提示：{{user}}选择“要牌”。)`

### 4. 游戏主持人的响应：请求发牌

-   **角色响应 (单次输出后停止)**:

    收到。我已向主控请求给你发一张牌。
    [Game:Function, type:发牌, data:{"actions":[
      {"target":"player", "count":1, "visibility":"owner"}
    ]}]

-   **前端行为 (作为主控)**:
    1.  从私有牌堆顶发1张牌（例如 `♠7`）。
    2.  将这张新牌加入到 `sillypoker_player_cards.json` 的 `current_hand` 中。
    3.  **重新渲染UI**: 玩家手牌区现在显示 `♥A`, `♦10`, `♠7`。总点数18。

### 5. 玩家的回合：停牌

-   **玩家操作**: 点击 “停牌(Stand)” 按钮，然后点击“提交回合”。
-   **前端行为**:
    1.  生成系统提示: `(系统提示：{{user}}选择“停牌”。)`
    2.  发送给游戏主持人。

### 6. 庄家的回合

-   **庄家决策**: 庄家读取 `current_game_state`，知道玩家点数为18。根据其 "ByTheBook" (按规则) 的 `play_style`，它会查看自己的底牌。假设它的底牌是 `♣K`, `♠5` (15点)，规则要求庄家在16点及以下时必须继续要牌。
-   **角色响应 (序列)**:
    1.  **第一步：亮出底牌**

        庄家翻开了自己的底牌...
        [Action:Showdown, data:{"player_name":"庄家"}]
    2.  **第二步：请求给自己发牌**

        ...他的点数是15点。我已请求主控为他再发一张牌。
        [Game:Function, type:发牌, data:{"actions":[
          {"target":"enemy", "name":"庄家", "count":1, "visibility":"public"}
        ]}]
    3.  **第三步：判定结果**

        （假设发出的牌是 `♥Q`，庄家总点数25，爆牌）
        庄家爆牌了！你赢了。
        [Game:End, data:{"result":"win", "reason":"庄家点数超过21点。"}]

-   **前端行为**:
    1.  **响应 `[Action:Showdown]`**: 庄家的两张牌背翻开，显示 `♣K`, `♠5`。
    2.  **响应 `[Game:Function]` 的发牌请求**: 从牌堆发一张新牌 `♥Q` 给庄家，并公开显示。
    3.  **响应 `[Game:End]`**:
        -   显示“胜利”动画和原因。
        -   清空牌桌，返回地图界面。

---

## 示例二：德州扑克 (Texas Hold'em)

### 1. 玩家发起游戏

-   **玩家输入**: `跟这个劫匪玩一把德州扑克。`

### 2. 初始化牌局

-   **角色响应 (单次输出后停止)**:

    拦路劫匪狞笑着把筹码扔在桌上。“想玩？那就拿出你的真本事！” 我已向主控请求发牌。
    [Game:Start, data:{"game_type": "TexasHoldem", "players": ["{{user}}", "拦路劫匪"], "initial_state": { "name": "拦路劫匪", "play_style": "Aggressive", "chips": 800 }}]
    [Game:Function, type:发牌, data:{"actions":[
      {"target":"player", "count":2, "visibility":"owner"},
      {"target":"enemy", "name":"拦路劫匪", "count":2, "visibility":"hidden"}
    ]}]

-   **前端行为 (作为主控)**: (与21点类似) 初始化德州扑克牌局，为双方各发2张底牌。UI上显示玩家的明牌和劫匪的牌背。

### 3. 对手的回合：翻牌前下注 (Pre-flop)

-   **对手决策**: 劫匪的风格是 "Aggressive" (激进型)，他决定在翻牌前就加注来施压。
-   **角色响应 (单次输出后停止)**:

    “别浪费时间了！” 劫匪直接扔出100筹码。
    [Action:Bet, data:{"player_name":"拦路劫匪", "amount":100}]

-   **前端行为**:
    1.  更新 `sillypoker_enemy_data.json`，劫匪的 `chips` 减少100。
    2.  更新 `sillypoker_current_game_state.json`，`pot_amount` 增加100。
    3.  播放筹码动画，更新UI上的彩池和劫匪筹码数量。

### 4. 玩家的回合：跟注

-   **玩家操作**: 点击 “跟注” 按钮，然后点击“提交回合”。
-   **前端行为**:
    1.  生成系统提示: `(系统提示：{{user}}选择“跟注”。)`
    2.  **立即更新** `sillypoker_player_data.json`，玩家 `chips` 减少100。
    3.  发送提示给游戏主持人。

### 5. 游戏主持人的响应：请求发翻牌 (Flop)

-   **角色响应 (单次输出后停止)**:

    我已向主控请求发出三张公共牌。
    [Game:Function, type:发牌, data:{"actions":[
      {"target":"board", "count":3, "visibility":"public"}
    ]}]

-   **前端行为 (作为主控)**:
    1.  从私有牌堆发3张牌到 `sillypoker_current_game_state.json` 的 `board_cards`。
    2.  **渲染UI**: 在牌桌中央显示三张公共牌。

### 6. 后续流程 (Turn & River)

-   游戏将继续进行“过牌”、“下注”、“跟注”的循环。
-   游戏主持人会继续发出 `[Game:Function, type:发牌]` **请求**来发“转牌”(Turn)和“河牌”(River)。
-   每次玩家行动，前端都会发送系统提示。每次对手行动，都会发出 `[Action:...]` 指令。

### 7. 最终摊牌与结算

-   **角色响应**:

    “亮出你的底牌吧！”
    [Action:Showdown, data:{"player_name":"拦路劫匪"}]
    ... （分析牌面后）
    你的两对比我的对A大。算你走运！
    [Game:End, data:{"result":"win", "reason":"你的两对(Two Pair)战胜了对手的一对(One Pair)。"}]

-   **前端行为**:
    1.  **响应 `[Action:Showdown]`**: 劫匪的牌背翻开。
    2.  **响应 `[Game:End]`**:
        -   更新 `sillypoker_player_data.json`，将彩池金额加到玩家的 `chips` 上。
        -   显示胜利动画。
        -   清空牌桌，返回地图。
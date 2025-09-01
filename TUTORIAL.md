# 卡牌桌面 - 完整游戏流程示例

本文档将通过两个经典游戏：“21点”和“德州扑克”，详细展示玩家、前端插件和游戏主持人之间的完整交互流程。

---

## 示例一：21点 (Blackjack)

### 1. 玩家发起游戏

-   **玩家输入**: `我们来玩一局21点吧，你来当庄家。`

### 2. 庄家初始化牌局

-   **角色响应**:

    好的，牌桌已经准备好了。请下注。
<command>
    [Game:Start, data:{"game_type": "Blackjack", "players": ["{{user}}", "庄家"], "initial_state": { "name": "庄家", "play_style": "ByTheBook" }}]
</command>

### 3. 玩家下注

-   **玩家行动**: 玩家下注100筹码。

-   **角色响应 (单次输出后停止)**:

    收到你的下注。我跟注。彩池现在是200筹码。现在，我将为我们发牌，你会看到我的一张明牌。祝你好运！
<command>
    [Action:Bet, data:{"player_name":"庄家", "amount":100}]
    [Game:Function, type:发牌, data:{"actions":[
      {"target":"player", "count":2, "visibility":"owner"},
      {"target":"enemy", "name":"庄家", "count":1, "visibility":"public"},
      {"target":"enemy", "name":"庄家", "count":1, "visibility":"hidden"}
    ]}]
</command>

### 4. 玩家的回合：要牌 (Hit)

-   **玩家行动**: 玩家选择“要牌”。

-   **角色响应 (单次输出后停止)**:

    再给你一张牌。
<command>
    [Game:Function, type:发牌, data:{"actions":[
      {"target":"player", "count":1, "visibility":"public"}
    ]}]
</command>

### 5. 玩家的回合：停牌 (Stand)

-   **玩家行动**: 玩家选择“停牌”。现在轮到庄家行动。

### 6. 庄家的回合与游戏结算

-   **角色响应 (单次输出后停止)**:

    你停牌了，现在轮到我了。我的底牌是...一张J，总点数16点，规则要求我必须继续要牌。
    ...来了一张10，总点数26，我爆牌了。恭喜，你赢了这局。
<command>
    [Game:Function, type:Modify, data:{"targets":[{"location":"enemy_hand", "enemy_name":"庄家", "operation":"update", "card_filter":{"index":1}, "modifications":[{"field":"visibility", "operation":"set", "value":"public"}]}]}]
    [Game:Function, type:发牌, data:{"actions":[
      {"target":"enemy", "name":"庄家", "count":1, "visibility":"public"}
    ]}]
    [Game:End, data:{"result":"win", "reason":"庄家爆牌。"}]
</command>

---
## 示例二：德州扑克 (Texas Hold'em)

### 1. 玩家移动到敌人节点

-   **玩家行动**: `(系统提示：玩家移动到了一个敌人节点。)`

### 2. 敌人初始化牌局

-   **角色响应 (单次输出后停止)**:

    一个戴着兜帽的劫匪拦住了你的去路。“想过去？先在牌桌上赢了我再说。”
<command>
    [Game:Start, data:{"game_type": "TexasHoldem", "players": ["{{user}}", "拦路劫匪"], "initial_state": { "name": "拦路劫匪", "play_style": "Aggressive", "chips": 800, "hand": [] }}]
    [Game:Function, type:发牌, data:{"actions":[
      {"target":"player", "count":2, "visibility":"owner"},
      {"target":"enemy", "name":"拦路劫匪", "count":2, "visibility":"owner"}
    ]}]
</command>

### 3. 翻牌前下注轮 (Pre-flop)

-   **角色响应 (单次输出后停止)**:

    劫匪看了一眼自己的牌，然后不屑地将50筹码推了出来。“跟不跟？”
<command>
    [Action:Bet, data:{"player_name":"拦路劫匪", "amount":50}]
</command>

### 4. 玩家响应

-   **玩家行动**: 玩家选择“跟注”。

### 5. 翻牌轮 (Flop)

-   **角色响应 (单次输出后停止)**:

    “有点胆量。”劫匪说着，示意发牌。
<command>
    [Game:Function, type:发牌, data:{"actions":[
        {"target":"board", "count":3, "visibility":"public"}
    ]}]
</command>

### 6. 翻牌圈下注

-   **玩家行动**: 玩家选择“过牌”。

-   **角色响应 (单次输出后停止)**:

    劫匪也敲了敲桌子表示过牌。
<command>
    [Action:Check, data:{"player_name":"拦路劫匪"}]
</command>

### 7. 转牌轮 (Turn)

-   **角色响应 (单次输出后停止)**:

    第四张公共牌来了。
<command>
    [Game:Function, type:发牌, data:{"actions":[
        {"target":"board", "count":1, "visibility":"public"}
    ]}]
</command>

### 8. 转牌圈下注与河牌圈

-   **玩家行动**: 玩家选择“下注”，金额为200。

-   **角色响应 (单次输出后停止)**:

    劫匪思考片刻，跟注了。河牌发了出来。
<command>
    [Action:Call, data:{"player_name":"拦路劫匪"}]
    [Game:Function, type:发牌, data:{"actions":[
        {"target":"board", "count":1, "visibility":"public"}
    ]}]
</command>

### 9. 河牌圈最终下注

-   **玩家行动**: 玩家选择“下注”，金额为500。

-   **角色响应 (单次输出后停止)**:

    “就这么点？”劫匪冷笑一声，把他剩下的所有筹码都推了出去。“我全下了！”
<command>
    [Action:Bet, data:{"player_name":"拦路劫匪", "amount":550}]
</command>

### 10. 玩家最终决定

-   **玩家行动**: 玩家选择“跟注”。

### 11. 摊牌与结算

-   **角色响应 (单次输出后停止)**:

    劫匪亮出他的底牌，是一对K。但你的牌组成了顺子！“可恶！”劫匪愤怒地砸了一下桌子。你赢得了所有筹码。
<command>
    [Action:Showdown, data:{"player_name":"拦路劫匪"}]
    [Game:End, data:{"result":"win", "reason":"你的顺子击败了对手的一对K。"}]
</command>

---

## 极限测试：四人斗地主 (Stress Test: 4-Player Dou Dizhu)

### 目的
此测试用于检验UI在处理**多个对手**和**大量手牌**时的渲染极限和布局稳定性。

### 规则
-   **人数**: 4人 (1个地主 vs 3个农民)
-   **牌数**: 使用两副牌 (108张)
-   **发牌**: 每人发25张手牌，留8张作为底牌。

### 测试指令
**将以下完整内容复制并粘贴到聊天框中发送，即可开始测试。**

`来一场极限对局吧！对手是赌圣、赌侠和赌神。游戏是四人斗地主。
<command>
[Game:Start, data:{"game_type": "DouDiZhu_4Player", "players": ["{{user}}", "赌圣", "赌侠", "赌神"], "initial_state": { "name": "AI Opponent", "play_style": "Unpredictable", "chips": 1000, "hand": [] }}]
[Game:SetupDeck, data:{"num_decks": 2, "jokers": 4}]
[Game:Function, type:发牌, data:{"actions":[
    {"target":"player", "count":25, "visibility":"owner"},
    {"target":"enemy", "name":"赌圣", "count":25, "visibility":"owner"},
    {"target":"enemy", "name":"赌侠", "count":25, "visibility":"owner"},
    {"target":"enemy", "name":"赌神", "count":25, "visibility":"owner"}
]}]
</command>`
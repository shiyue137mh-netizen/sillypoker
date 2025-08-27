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

---
## 示例二：德州扑克 (Texas Hold'em)

### 1. 玩家移动到敌人节点

-   **(前端发送)**: `(系统提示：玩家移动到了一个敌人节点。)`

### 2. 敌人初始化牌局

-   **角色响应 (单次输出后停止)**:

    一个戴着兜帽的劫匪拦住了你的去路。“想过去？先在牌桌上赢了我再说。”
    [Game:Start, data:{"game_type": "TexasHoldem", "players": ["{{user}}", "拦路劫匪"], "initial_state": { "name": "拦路劫匪", "play_style": "Aggressive", "chips": 800, "hand": [] }}]
    [Game:Function, type:发牌, data:{"actions":[
      {"target":"player", "count":2, "visibility":"owner"},
      {"target":"enemy", "name":"拦路劫匪", "count":2, "visibility":"hidden"}
    ]}]

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

```
来一场极限对局吧！对手是赌圣、赌侠和赌神。游戏是四人斗地主。
[Game:Start, data:{"game_type": "DouDiZhu_4Player", "players": ["{{user}}", "赌圣", "赌侠", "赌神"], "initial_state": { "name": "AI Opponent", "play_style": "Unpredictable", "chips": 1000, "hand": [] }}]
[Game:Function, type:发牌, data:{"actions":[
    {"target":"player", "count":25, "visibility":"owner"},
    {"target":"enemy", "name":"赌圣", "count":25, "visibility":"hidden"},
    {"target":"enemy", "name":"赌侠", "count":25, "visibility":"hidden"},
    {"target":"enemy", "name":"赌神", "count":25, "visibility":"hidden"}
]}]
```

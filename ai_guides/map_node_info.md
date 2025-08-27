# AI卡牌桌面 - 地图节点信息与事件指令指南

**核心原则**: 当玩家在一场牌局中获胜或遭遇特定事件后，你**必须**使用 `[Event:Modify]` 指令来处理所有的奖励和后果。这是驱动游戏进程和玩家成长的唯一方式。本指南将为你提供在不同地图节点下使用此指令的具体范例。

---

## 1. 普通敌人 (Enemy)

-   **描述**: 标准的牌局挑战。
-   **核心奖励**: 玩家赢得牌局后，你必须将**牌局的彩池 (pot)** 作为筹码奖励给玩家。
-   **指令范例**:
    > （假设彩池最终金额为250）
    
    你赢了！
    [Game:End, data:{"result":"win", "reason":"你的牌面更大。"}]
    [Event:Modify, data:{"target":"{{user}}", "modifications":[ {"field":"chips", "operation":"add", "value":250} ]}]

---

## 2. 精英敌人 (Elite)

-   **描述**: 拥有特殊能力的强敌，奖励更丰厚。
-   **核心奖励**: 玩家胜利后，除了奖励**彩池筹码**，你还应该**创造并奖励一个道具**。
-   **指令范例**:
    > （假设彩池金额为600）

    精英赌徒露出了难以置信的表情，你技高一筹。
    [Game:End, data:{"result":"win", "reason":"你破解了对手的策略。"}]
    [Event:Modify, data:{"target":"{{user}}", "modifications":[
        {"field":"chips", "operation":"add", "value":600},
        {"field":"inventory", "operation":"add", "value":{"icon":"🎲", "name":"老千的袖箭", "description":"主动使用：在本回合中，你可以指定一张公共牌将其作废。", "type":"active"}}
    ]}]

---

## 3. 随机事件 (Event)

-   **描述**: 充满变数的叙事节点，可能是好事也可能是坏事。
-   **核心行为**: 你需要根据叙事创造一个情景，并使用 `[Event:Modify]` 来反映其结果。
-   **正面事件范例**:
    > 你在老虎机里发现了一些被遗忘的筹码。
    
    [Event:Modify, data:{"target":"{{user}}", "modifications":[ {"field":"chips", "operation":"add", "value":125} ]}]

-   **负面事件范例**:
    > 你不小心触发了警报，警卫在追赶你时，你摔了一跤。
    
    [Event:Modify, data:{"target":"{{user}}", "modifications":[ {"field":"health", "operation":"add", "value":-1} ]}]

-   **复杂事件范例**:
    > 一个神秘人向你兜售奇怪的药水，你喝下后感觉身体发生了变化。
    
    [Event:Modify, data:{"target":"{{user}}", "modifications":[
        {"field":"max_health", "operation":"add", "value":1},
        {"field":"health", "operation":"add", "value":1},
        {"field":"status_effects", "operation":"add", "value":{"icon":"🤢", "name":"恶心", "description":"在接下来的3场战斗中，初始筹码减少100。", "duration":3}}
    ]}]

---

## 4. 休息处 (Rest)

-   **描述**: 玩家选择在此休息恢复。
-   **核心行为**: 在玩家确认休息后，为其恢复1点生命值。
-   **指令范例**:
    > 一夜好眠，你感觉精力充沛。
    
    [Event:Modify, data:{"target":"{{user}}", "modifications":[ {"field":"health", "operation":"add", "value":1} ]}]
---

## 5. 宝箱 (Treasure) 💎

-   **描述**: 无需战斗，直接获得奖励。
-   **核心行为**: 当玩家移动到此节点时，你应立即使用 `[Event:Modify]` 给予奖励，奖励可以是筹码、道具或两者皆有。
-   **指令范例**:
    > 你打开了宝箱，里面金光闪闪。
    
    [Event:Modify, data:{"target":"{{user}}", "modifications":[
        {"field":"chips", "operation":"add", "value":200},
        {"field":"inventory", "operation":"add", "value":{"icon":"🍀", "name":"四叶草", "description":"被动：小幅提高你获得好牌的几率。", "type":"passive"}}
    ]}]

---

## 6. 千术师的牌桌 (Card Sharp's Table) ✨

-   **描述**: 一个学习“千术”来升级卡牌的机会。
-   **核心行为**:
    1.  向玩家提供一个或多个升级选项。
    2.  当玩家做出选择后，使用 `[Game:Function, type:ModifyCard]` 指令来永久修改玩家牌库中的一张牌。**这是一个虚构的概念，因为我们没有牌库，但你可以用它来修改玩家的下一张手牌或赋予一个持续的效果。**
-   **指令范例**:
    > （玩家选择将一张牌的点数+1）
    
    千术师对你耳语了几句，你感觉自己对牌的掌控力更强了。
    [Game:Function, type:ModifyCard, data:{"targets":[{"location":"player_hand", "card_filter":{"index":"random"}, "modifications":[{"field":"rank", "operation":"add", "value":1}]}]}]

---
## 7. 商店 (Shop)

-   **描述**: 玩家使用筹码购买道具的地方。
-   **核心行为**: 当玩家确认购买某件商品时，你需要同时**扣除玩家的筹码**并**给予玩家道具**。
-   **指令范例**:
    > （玩家决定购买价值300筹码的“幸运硬币”）
    
    “明智的选择。”店主说道。
    [Event:Modify, data:{"target":"{{user}}", "modifications":[
        {"field":"chips", "operation":"add", "value":-300},
        {"field":"inventory", "operation":"add", "value":{"icon":"🪙", "name":"幸运硬币", "description":"每场牌局开始时，有15%的几率额外抽取一张牌。", "type":"passive"}}
    ]}]

---

## 8. 首领 (Boss)

-   **描述**: 每一层的最终挑战。
-   **核心奖励**: 战胜首领后，应获得**大量筹码**和一件**非常稀有的道具**。
-   **指令范例**:
    > （假设彩池金额为2000）

    随着赌场老板的倒下，整个楼层都安静了下来。你成功了。
    [Game:End, data:{"result":"win", "reason":"你战胜了本层的首领。"}]
    [Event:Modify, data:{"target":"{{user}}", "modifications":[
        {"field":"chips", "operation":"add", "value":2000},
        {"field":"inventory", "operation":"add", "value":{"icon":"📜", "name":"赌场的契约", "description":"被动：你每拥有一件道具，最大生命值便+1。", "type":"passive", "rarity":"legendary"}}
    ]}]

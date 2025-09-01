# 地图节点指令范例

---

## 1. 普通敌人 (Enemy)
- **描述**: 标准牌局挑战，胜利后奖励彩池筹码。
- **范例**: (彩池为250)
<command>
    [Game:End, data:{"result":"win", "reason":"你的牌面更大。"}]
    [Event:Modify, data:{"target":"{{user}}", "modifications":[ {"field":"chips", "operation":"add", "value":250} ]}]
</command>

---

## 2. 精英敌人 (Elite)
- **描述**: 强敌，胜利后除彩池外，还奖励一个道具。
- **范例**: (彩池为600)
<command>
    [Game:End, data:{"result":"win", "reason":"你破解了对手的策略。"}]
    [Event:Modify, data:{"target":"{{user}}", "modifications":[
        {"field":"chips", "operation":"add", "value":600},
        {"field":"inventory", "operation":"add", "value":{"icon":"🎲", "name":"老千的袖箭", "description":"主动使用：在本回合中，你可以指定一张公共牌将其作废。", "type":"active"}}
    ]}]
</command>

---

## 3. 随机事件 (Event)
- **描述**: 叙事节点，使用 `[Event:Modify]` 反映结果。
- **正面事件范例**:
    [Event:Modify, data:{"target":"{{user}}", "modifications":[ {"field":"chips", "operation":"add", "value":125} ]}]
- **负面事件范例**:
    [Event:Modify, data:{"target":"{{user}}", "modifications":[ {"field":"health", "operation":"add", "value":-1} ]}]
- **复杂事件范例**:
    [Event:Modify, data:{"target":"{{user}}", "modifications":[
        {"field":"max_health", "operation":"add", "value":1},
        {"field":"health", "operation":"add", "value":1},
        {"field":"status_effects", "operation":"add", "value":{"icon":"🤢", "name":"恶心", "description":"在接下来的3场战斗中，初始筹码减少100。", "duration": -1}}
    ]}]

---

## 4. 首领 (Boss)
- **描述**: 击败首领以进入下一层。
- **范例**: (彩池为2000)
<command>
    [Game:End, data:{"result":"boss_win", "reason":"你终于战胜了赌场的区域经理！"}]
    [Event:Modify, data:{"target":"{{user}}", "modifications":[ {"field":"chips", "operation":"add", "value":2000} ]}]
</command>
**注意：此处必须使用 "boss_win" 结果，这是解锁通往下一层道路的关键。**
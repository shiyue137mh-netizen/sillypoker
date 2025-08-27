# AI卡牌桌面 - 事件指令体系

事件指令体系允许AI直接、即时地修改游戏世界中的数据，通常用于叙事事件、敌人特殊能力或道具效果。这是实现所有游戏内奖励、惩罚和状态变化的核心指令。所有指令都遵循在 [主文档](../ai_command_guide.md) 中定义的通用结构。

---

## 1. 修改实体数据 [Event:Modify]
-   **功能**: 修改指定目标（玩家或敌人）的一个或多个数据属性。这是游戏中最核心和强大的数据操作指令。
-   **何时使用**:
    -   **奖励**: 在玩家战胜敌人后，分配筹码和道具。
    -   **惩罚**: 在随机事件中（“你踩到了陷阱！”）。
    -   **特殊能力**: 作为敌人特殊能力的一部分（“盗贼偷走了你的筹码！”）。
    -   **状态变化**: 由某些道具或事件触发。
-   **data JSON 结构**:
    ```json
    {
        "target": "要修改的实体名称 (例如 '{{user}}' 或 '拦路劫匪')",
        "modifications": [
            {
                "field": "要修改的字段名",
                "operation": "操作类型",
                "value": "操作的值"
            }
        ]
    }
    ```
-   **字段说明**:
    -   `target`: 必须是 `{{user}}` 或在 `[Game:Start]` 中定义的敌人名称。
    -   `modifications`: 一个包含一个或多个修改操作的数组。
    -   `field`: `health`, `max_health`, `chips`, `inventory`, `status_effects`。
    -   `operation`:
        -   对于数值字段 (`health`, `chips`): `"add"` (可为负数), `"set"`。
        -   对于数组字段 (`inventory`, `status_effects`): `"add"`, `"remove"`。
    -   `value`:
        -   `"add"`/`"set"` (数值): 一个数字。
        -   `"add"` (数组): 要添加的完整对象 (例如一个道具或状态效果对象)。
        -   `"remove"` (数组): 要移除的对象的 `name` 或 `id`。

---
## 2. 完整示例

1.  **战胜精英敌人后的复杂奖励** (单一指令)
    [Event:Modify, data:{"target":"{{user}}", "modifications":[ {"field":"chips", "operation":"add", "value":500}, {"field":"inventory", "operation":"add", "value":{"name":"灌铅骰子", "description":"你出千的成功率似乎提高了。"}} ]}]

2.  **玩家踩到陷阱** (单一指令)
    [Event:Modify, data:{"target":"{{user}}", "modifications":[ {"field":"health", "operation":"add", "value":-1}, {"field":"chips", "operation":"add", "value":-75} ]}]

3.  **敌人使用特殊能力，偷取筹码** (必须是两个独立指令)
    [Event:Modify, data:{"target":"{{user}}", "modifications":[ {"field":"chips", "operation":"add", "value":-150} ]}]
    [Event:Modify, data:{"target":"拦路劫匪", "modifications":[ {"field":"chips", "operation":"add", "value":150} ]}]

4.  **玩家获得一个有益状态**
    [Event:Modify, data:{"target":"{{user}}", "modifications":[ {"field":"status_effects", "operation":"add", "value":{"name":"专注", "description":"下一次行动不会被敌人的能力所干扰。", "duration":1}} ]}]

5.  **移除一个状态效果**
    [Event:Modify, data:{"target":"{{user}}", "modifications":[ {"field":"status_effects", "operation":"remove", "value":"专注"} ]}]

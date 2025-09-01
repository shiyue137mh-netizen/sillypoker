# 事件指令体系

事件指令允许直接修改游戏世界中的数据。

---

## 修改实体数据 [Event:Modify]
-   **功能**: 修改指定目标（玩家或敌人）的一个或多个数据属性。
-   **data JSON 结构**:
    ```json
    {
        "target": "实体名称 (例如 '{{user}}' 或 '拦路劫匪')",
        "modifications": [
            {
                "field": "字段名",
                "operation": "操作类型",
                "value": "操作的值"
            }
        ]
    }
    ```
-   **字段说明**:
    -   `target`: 必须是 `{{user}}` 或已定义的敌人名称。
    -   `modifications`: 一个包含一个或多个修改操作的数组。
    -   `field`: `health`, `max_health`, `chips`, `inventory`, `status_effects`。
    -   `operation`:
        -   数值字段 (`health`, `chips`): `"add"` (可为负数), `"set"`。
        -   数组字段 (`inventory`, `status_effects`): `"add"`, `"remove"`。
    -   `value`:
        -   `"add"`/`"set"` (数值): 一个数字。
        -   `"add"` (数组): 一个完整的对象。
        -   `"remove"` (数组): 对象的 `name` 或 `id`。

---
## 示例

1.  **复杂奖励**
    [Event:Modify, data:{"target":"{{user}}", "modifications":[ {"field":"chips", "operation":"add", "value":500}, {"field":"inventory", "operation":"add", "value":{"name":"灌铅骰子", "description":"你出千的成功率似乎提高了。"}} ]}]

2.  **玩家踩到陷阱**
    [Event:Modify, data:{"target":"{{user}}", "modifications":[ {"field":"health", "operation":"add", "value":-1}, {"field":"chips", "operation":"add", "value":-75} ]}]

3.  **偷取筹码 (需要两个独立指令)**
<command>
    [Event:Modify, data:{"target":"{{user}}", "modifications":[ {"field":"chips", "operation":"add", "value":-150} ]}]
    [Event:Modify, data:{"target":"拦路劫匪", "modifications":[ {"field":"chips", "operation":"add", "value":150} ]}]
</command>

4.  **获得状态**
    [Event:Modify, data:{"target":"{{user}}", "modifications":[ {"field":"status_effects", "operation":"add", "value":{"name":"专注", "description":"下一次行动不会被敌人的能力所干扰。", "duration":1}} ]}]

5.  **移除状态**
    [Event:Modify, data:{"target":"{{user}}", "modifications":[ {"field":"status_effects", "operation":"remove", "value":"专注"} ]}]
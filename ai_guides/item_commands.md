# 道具指令体系

---

## 1. 道具对象 (Item Object) 结构

通过 `[Event:Modify]` 指令的 `value` 字段添加道具时，需遵循此结构：

```json
{
  "icon": "💰",
  "name": "道具名称 (必需)",
  "description": "道具效果描述 (必需)",
  "type": "passive | active (必需)"
}
```

-   **`icon` (string)**: 单个Emoji字符。
-   **`name` (string)**: 道具名称。
-   **`description` (string)**: 道具说明。
-   **`type` (string)**:
    -   `"passive"`: 被动道具，获得后永久生效。
    -   `"active"`: 主动道具，需玩家点击使用。

---

## 2. 道具使用流程

1.  **奖励道具**: 通过 `[Event:Modify]` 指令将道具对象添加到玩家的 `inventory` 中。
2.  **玩家使用**: 玩家在UI上点击主动道具。
3.  **系统通知**: 系统自动发送提示，例如: `(系统提示：{{user}}使用了道具 [名称: 应急资金, 描述: 立即获得200筹码。])`
4.  **执行效果**: 接收到此提示后，必须发出相应的 `[Event:Modify]` 指令来完成效果结算。

---
## 3. 范例

#### 奖励并使用主动道具

**步骤 A: 奖励道具**
    [Event:Modify, data:{"target":"{{user}}", "modifications":[
        {"field":"inventory", "operation":"add", "value":{
            "icon": "💰",
            "name":"应急资金",
            "description":"立即获得200筹码。",
            "type":"active"
        }}
    ]}]

**步骤 B: 玩家使用后，系统发出提示**
`(系统提示：{{user}}使用了道具 [名称: 应急资金, 描述: 立即获得200筹码。])`

**步骤 C: 响应并执行效果**
    [Event:Modify, data:{"target":"{{user}}", "modifications":[
        {"field":"chips", "operation":"add", "value":200}
    ]}]
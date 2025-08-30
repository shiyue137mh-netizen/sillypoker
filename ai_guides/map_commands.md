# 地图指令体系 (Map Command System)

地图指令允许在不直接读取地图数据的情况下，智能地修改当前楼层的地图结构。AI只需表达修改的“意图”，前端插件就会负责找到最合适的节点并执行修改。

---

## 修改地图节点 [Map:Modify]
-   **功能**: 根据一系列复杂的筛选条件，找到一个或多个符合条件的地图节点，并修改它们的属性（例如，将一个敌人节点变为宝箱）。
-   **data JSON 结构**:
    ```json
    {
        "target_filter": {
            "type": ["enemy", "event"],
            "scope": "reachable" | "future" | "any_unvisited",
            "selection_priority": {
                "row": "closest" | "furthest" | "random",
                "density": "densest" | "sparsest" | "random"
            }
        },
        "modification": {
            "field": "type",
            "value": "treasure"
        },
        "effect_description": "你发现了一张藏宝图！地图上的某个地点发生了变化！"
    }
    ```

### `target_filter` 详解

这是指令的核心，告诉前端**如何寻找**一个符合条件的节点。

-   **`type` (string | array)**: 节点的类型。可以是单个类型（如`"enemy"`）或一个类型数组（如`["enemy", "event"]`），表示“寻找一个敌人**或**事件节点”。

-   **`scope` (string)**: **【关键】** 定义了搜索的范围。
    -   `"reachable"`: **仅在玩家当前可直接移动到的下一行节点中寻找**。用于制造**即时**的机遇或危险。
    -   `"future"`: 在**所有**玩家尚未访问、且**当前不可直达**的未来路径节点中寻找。用于实现“赴约”、“远方的宝藏”等长期目标。
    -   `"any_unvisited"`: 在所有未访问的节点中寻找（是`"reachable"`和`"future"`的总和）。

-   **`selection_priority` (object)**: 当有多个节点符合筛选条件时，告诉前端**优先选择哪一个**。
    -   `"row"`:
        -   `"closest"`: 优先选择行数最靠前的（离玩家最近的）。
        -   `"furthest"`: 优先选择行数最靠后的（离Boss最近的）。
        -   `"random"`: 随机选择。
    -   `"density"`:
        -   `"densest"`: 优先选择拥有**最多连接**的节点（通常是关键路径上的交汇点）。
        -   `"sparsest"`: 优先选择拥有**最少连接**的节点（通常是分支的末端）。
        -   `"random"`: 随机选择。

### `modification` 和 `effect_description`

-   **`modification` (object)**: 定义**如何修改**找到的节点。目前，`field`固定为`"type"`，`value`为新的节点类型（如`"treasure"`, `"elite"`等）。
-   **`effect_description` (string)**: 一个由你提供的文本，将在修改成功后通过弹窗显示给玩家。

---
## 范例

#### 范例A：发现藏宝图 (远期奖励)

-   **你的意图**: 我想把未来的一个普通敌人，最好是那种在小路尽头的，变成一个宝箱，给玩家一个探索偏僻路径的理由。
-   **你的指令**:
    > 你发现了一张古老的藏宝图，上面的标记似乎指向了前方的某个地方...
    > <command>[Map:Modify, data:{
    >     "target_filter": {
    >         "type": "enemy",
    >         "scope": "future",
    >         "selection_priority": {"row": "random", "density": "sparsest"}
    >     },
    >     "modification": {"field": "type", "value": "treasure"},
    >     "effect_description": "藏宝图似乎标记出了一个宝箱的位置！"
    > }]</command>

#### 范例B：精英的伏击 (近期威胁)

-   **你的意图**: 我想给玩家制造一个两难选择，把他马上就要走到的一个休息点变成一个精英怪，让他无法喘息。
-   **你的指令**:
    > 你感到一阵恶寒，似乎前方的某个安全屋传来了不祥的气息...
    > <command>[Map:Modify, data:{
    >     "target_filter": {
    >         "type": "rest",
    >         "scope": "reachable"
    >     },
    >     "modification": {"field": "type", "value": "elite"},
    >     "effect_description": "前方的休息点似乎被一个强大的敌人占据了！"
    > }]</command>
---
name: junimo
description: 用 37 个 mcp__junimo__* 工具操控《星露谷物语》里的角色——感知、移动、农活、社交、节日、生计。包含时序纪律与已知边界。
whenToUse: 用户想让 AI 玩星露谷、做农活、查看角色状态、送礼社交、参加节日，或排查"游戏连不上 / 动作没反应"时。
---

# 星露谷（junimo）

37 个工具由 `junimo-mcp.exe` 提供，经 dsh 的 mcp-client 桥接，名字形如 `mcp__junimo__get_state`。

完整参考（工具速查表、十条铁律、常见错误、已知边界）在技能目录外的长文档里：

`reference/game-semantics.md`（相对本插件包根；绝对路径见系统提示词里的「星露谷物语操作」段）

## 最短可用流程

1. `junimo_doctor` —— 一次看清 exe / 端口 / 存档 / SMAPI 哪一环没接上
2. 没开局：`junimo_game_launch` → `junimo_load_save`
3. `mcp__junimo__get_state` —— 确认角色状态与时间
4. 干活：`look` → `water`/`harvest`/`till`/`plant`（用区域参数，别逐格）
5. 收尾：`resume_time`（若冻结过）→ `mcp__junimo__sleep`（**唯一落盘方式**）

## 三条最容易翻车的

- 不 `sleep` 就结束 = 当天进度全丢。
- 窗口失焦时点击不生效 —— 驱动 UI 前 `junimo_focus`。
- 剧情不会自动跳过；`story choose` 内部已做两段式，不要补第二发点击。

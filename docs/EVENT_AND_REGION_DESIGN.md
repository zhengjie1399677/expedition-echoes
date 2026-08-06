# 事件模板库与区域威胁框架设计

> 版本：v1.0（2026-08-05）  
> 状态：设计定稿，可实施。  
> 目的：解决两个设计缺口——事件多样性不足（当前仅 2 个事件模板）与"区域威胁"概念无设计（M3 目标框架地基）。  
> 关联：GDD §6.1、§9.4、§14（G1/G2）；GAMEPLAY_AND_LLM_DESIGN §12、§14.1。

---

## 第一部分：事件模板库（G1）

## 1. 现状与问题

- 当前事件仅 2 个模板：`supply-room`（补给室）、`old-campfire`（旧营火），效果组合只有 `recover / scavenge / track` 三种。
- 问题：远征中每两节点一个事件，2 个模板 × 2 条线路 ≈ 玩家第 2–3 天就会看到完全相同的选择和文案，重复感强。
- 目标：定义**事件 schema**（效果白名单、条件、奖励档位），先扩 4–6 个新事件，每种效果组合对应一个不同的叙事犹豫。

## 2. 事件数据结构（定稿）

```ts
// src/domain/model.ts 扩展
export type ExpeditionEventEffect =
  | 'recover'      // 全队恢复 HP + 降压力（休整）
  | 'scavenge'     // 获得材料，压力上升
  | 'track'        // 获得金币，压力上升
  | 'risk_fight'   // 可选的额外战斗：胜利得稀有材料，失败压力大
  | 'aid_hero'     // 指定角色 HP 大幅恢复，其他角色压力略升
  | 'bargain';     // 以材料/金币换取某奖励或情报（双向选择）

export interface ExpeditionEventChoice {
  id: string;
  label: string;
  description: string;
  effect: ExpeditionEventEffect;
  // 效果参数（可选，缺省用 BALANCE 默认值）
  pressureCost?: number;   // 该选择施加的压力
  hpGain?: number;         // 该选择恢复的 HP（用于 aid_hero 单角色）
  goldGain?: number;       // track/bargain 的金币
  material?: { typeId: string; rarity: Rarity; count: number };
  requirement?: string;    // 前置条件描述（如"需要火焰瓶"）
}

export interface ExpeditionEvent {
  id: string;
  title: string;          // 事件标题（当前仅有 prompt，补 title 用于 UI 层级）
  prompt: string;
  background?: string;    // 事件专属背景图（可选）
  choices: ExpeditionEventChoice[];
  once?: boolean;         // 是否为一次性事件（同一远征不重复出现）
}
```

## 3. 事件模板库（第一版 6 个事件）

| 事件 ID | 标题 | 场景 | 选择（效果） | 设计意图 |
| --- | --- | --- | --- | --- |
| supply-room | 废弃补给室 | 封存药箱可用，深处有未触碰箱柜 | 整理伤口(recover) / 翻找药箱(scavenge) | 现有：安全 vs 收获 |
| old-campfire | 旧日营火 | 新鲜足迹通向阴影小径 | 围火休整(recover) / 循迹探查(track) | 现有：安全 vs 情报 |
| **collapsed-passage** | 坍塌通道 | 通道塌方，绕路多耗食物，清障有风险 | 清理碎石(risk_fight) / 绕路前行(recover, 消耗食物) | 新：战斗风险换稀有掉落 |
| **herb-grove** | 药草丛 | 稀有药草被孢兽看守 | 谨慎采摘(aid_hero, 指定最弱角色) / 全部带走(scavenge, 压力+大) | 新：单角色治疗 vs 团队收益 |
| **traveling-merchant** | 游商帐篷 | 商人愿以物易物 | 用材料换金币(bargain) / 用金币买材料(bargain) / 离开(无效果) | 新：经济取舍 |
| **echo-trap** | 回声陷阱 | 符文机关，触发会惊动守卫 | 解除机关(recover, 需镇静剂) / 硬闯(scavenge, 压力+大) / 标记路线(track) | 新：消耗品决策 + 三类收益 |

### 事件效果与 BALANCE 参数建议

| 效果 | 默认参数 | 说明 |
| --- | --- | --- |
| recover | HP +5、压力 -12 | 沿用 restNode 参数 |
| scavenge | 材料 ×1（普通）、压力 +8 | 沿用 |
| track | 金币 +12、压力 +10 | 沿用 |
| risk_fight | 触发一场额外遭遇（固定敌人 1–2 只），胜利掉落稀有材料 | 走现有 combat 节点流程，新增"奖励+稀有材料"的结算变体 |
| aid_hero | 指定 HP 最低角色 +12 HP、其他角色压力 +4 | 需 `targetHero` 逻辑 |
| bargain | 金币 ↔ 材料双向 | 复用 economy 的 sell/buy 逻辑 |

## 4. 事件选择规则（定稿）

1. 事件不重复：同一次远征中，`once: true` 的事件只出现一次（用 `Expedition.seenEvents: string[]` 记录，v13 后新增字段需存档迁移）。
2. 选择必须有可见后果：写入 `state.log`、结算摘要或后续事件条件（沿用现有约束）。
3. 效果参数进数据文件，不硬编码；新效果类型必须先扩展 `ExpeditionEventEffect` 联合类型再实现 reducer 分支。
4. 事件文案支持 `{{user}}` 与角色名占位；LLM 场景包不替代事件选择本身。

---

## 第二部分：区域威胁框架（G2）

## 5. 现状与问题

- 任务板 4 张卡片互不相关，像是随机刷新的独立委托，而非同一个世界的不同切面。
- "区域威胁"在 GDD/PROJECT_DEVELOPMENT_GUIDE 中被多次提及（M3 轻量世界推进），但无任何具体设计。
- 目标：建立"**区域 + 威胁等级 + 事件后果**"模型，让任务板、传闻、远征事件与次日新闻围绕同一世界状态运转，且**不要求线性主线**。

## 6. 区域模型（定稿）

```ts
// src/domain/model.ts 扩展
export type RegionId = 'border-ruins' | 'ash-forest' | 'north-canal' | 'sealed-gate';

export type ThreatLevel = 0 | 1 | 2 | 3; // 0 平静 / 1 异动 / 2 危险 / 3 失控

export interface Region {
  id: RegionId;
  name: string;
  threat: ThreatLevel;
  description: string;         // 区域一句话状态（供传闻/新闻使用）
  missions: string[];          // 属于该区域的任务 ID（任务板按区域分组）
  escalationTo?: RegionId;     // 威胁升级后的相邻区域（事件链延续）
  unlockAtDay?: number;        // 第几天开放（可选，默认 day 1 全开放）
  unlockThreat?: ThreatLevel;  // 需要其他区域威胁达到的等级（可选）
}
```

`GameState` 增加 `regions: Record<RegionId, ThreatLevel>`（v13 后新增持久字段，需存档迁移默认全 0）。

## 7. 四个区域的初始设计

| 区域 | 当前威胁 | 描述 | 关联任务 |
| --- | --- | --- | --- |
| 边境遗迹 border-ruins | 2（异动） | 遗迹道路异响影响商路；这是第一条事件线的舞台 | border-echoes、sealed-gate |
| 灰烬林地 ash-forest | 1（异动） | 林地异变从古树圣所向外扩散 | forest-disturbance |
| 北侧水渠 north-canal | 0（平静） | 水渠怪声传闻；预留后续事件链入口 | （预留） |
| 封印门厅 sealed-gate | 2（危险） | 连续回声，封印正在回应什么 | rusted-patrol |

## 8. 威胁等级语义与推进规则

| 威胁 | 表现 | 触发方式 |
| --- | --- | --- |
| 0 平静 | 无传闻；任务板少 1 个该区域委托 | 该区域事件链完成或自然消退 |
| 1 异动 | 城镇传闻出现；任务板出现该区域委托 | 每日新闻生成器按时间/事件推进 |
| 2 危险 | 任务难度上升（敌人波次增强）；酒馆警告文案 | 玩家在该区域失败/撤退/特定事件选择 |
| 3 失控 | 该区域任务消失，改为"紧急平息"委托；次日新闻引用 | 威胁 2 时连续两次失败 |

**核心规则**：

1. **只升级不强制**：威胁升级由玩家行为 + 事件结果触发（确定性规则），LLM 只建议不决定。
2. **不锁内容**：区域不因威胁等级封锁，玩家随时可以挑战更高威胁区域（风险自担），避免"强制线性"。
3. **任务板分组**：任务按区域展示，同一区域的委托是该区域问题的不同处理方式（呼应 ONE_DAY_EXPERIENCE §6"同一问题的不同切面"）。
4. **后果可见**：威胁升级/降级必须出现在次日新闻、酒馆文案或任务板描述中，让玩家能认出"世界记得我的选择"。
5. **平衡**：威胁等级不直接改数值，而是改敌人波次配置（每个任务提供 `threatWaves: Record<ThreatLevel, enemyWaves>`，缺省沿用默认波次）——避免数值膨胀，只改内容。

## 9. 与 LLM / 每日新闻的配合

- 每日新闻生成器输入增加：`regions` 威胁快照。
- 输出新闻时优先引用威胁 ≥2 的区域；传闻绑定区域（`<action type="offer_quest" region="border-ruins">`）。
- LLM 可以提议"某个区域威胁升级"，但必须经过白名单校验（区域 ID 存在、升级条件满足），升级本身由代码执行。

## 10. 实施顺序（建议）

**事件模板库**：

1. `model.ts` 扩展 `ExpeditionEventEffect` 与 `ExpeditionEvent`（title/once/参数）。
2. 新增 4 个事件（collapsed-passage、herb-grove、traveling-merchant、echo-trap）到 `gameContent.ts`，按线路插入节点序列。
3. `expedition.ts` 的 `RESOLVE_EVENT` 补 `risk_fight / aid_hero / bargain` 分支。
4. `Expedition.seenEvents` 字段 + 存档迁移（v13→14，若实施在 v13 之后）。
5. 补事件测试：每种效果、一次性规则、非法选择。

**区域威胁**：

1. `model.ts` 加 `Region` 类型与 `regions` 状态；`createInitialGame` 初始化 4 区域。
2. `gameContent.ts` 定义 `regions` 静态数据（含任务分组）。
3. 任务板按区域分组渲染；任务配置 `threatWaves`。
4. 威胁升级规则进 `domain`（如 `escalateRegion(state, regionId)` reducer action），触发点：任务失败/撤退/特定事件。
5. 每日新闻生成器读取威胁快照（与 LLM 协议 §9 联调）。
6. 存档迁移 + 测试。

## 11. 验收标准

1. 新玩家第 2 天能在任务板看到按区域分组的委托，并能从传闻认出昨天的选择影响。
2. 远征中事件选择不重复（同一远征内 `once` 事件只出现一次）。
3. 威胁升级后：任务波次变化、次日新闻引用、酒馆文案变化，三处至少两处可见。
4. 无 LLM 环境：事件、区域、威胁升级全部可玩、可测、确定性。
5. `npm test` 全绿、`npm run build` 通过、旧存档安全迁移。

## 12. 明确不做（本期范围外）

- 不做强制线性章节/日期解锁主线（区域可随时挑战）。
- 不做事件分支结局系统（事件后果只进状态与新闻，不做多重结局树）。
- 不做区域地图/世界地图可视化（当前任务板分组 + 传闻已足够 M3 验证）。
- 不新增招募或角色事件（留给 M4）。

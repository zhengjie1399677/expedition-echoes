# 战斗意图系统（Intent System）设计定稿

> 状态：**设计定稿**，可进入实施。  
> 目的：为《远征余响》引入"敌人威胁预告"，让战斗从"数值对撞"变成"读题→解题"。  
> 关联：DEVELOPMENT_GUIDE §5.1 远征、§10 战斗规则、§12 最低验收标准；GAMEPLAY_AND_LLM_DESIGN §13.2 战斗深度；GDD §5.4。  
> 术语：本文统一使用"压力"（代码字段 `pressure`，v13 起取代旧 `morale`）。

---

## 1. 问题（不变）

当前战斗是"玩家行动 → 敌人立即反击"的即时结算制（`combat.ts` 的 `ATTACK` case 内 `survivingAttackers` 循环）：

- 敌人没有"下一回合要做什么"的概念，玩家**无法预判威胁**；
- 站位、集火、道具使用都缺乏决策依据，战斗退化为"血多就赢"的数值对撞；
- 已实现的敌人特质（pack / thorns / spores / rock-armor / ancient-core）只有被动效果，没有主动威胁节奏。

## 2. 目标（不变）

在不改变现有"玩家行动 → 敌人行动"节奏、不改回合制架构的前提下：

1. 每个敌人行动前，向玩家**预告其下一次行动**（意图）；
2. 敌人行动按**意图执行**，而非统一反击；
3. 意图从**数据驱动**的意图池中按规则选择，确定性、可测试；
4. 新威胁节奏产生决策点：集火蓄力目标、避开防御目标、保护被瞄准的后排。

## 3. 设计边界（沿用项目纪律，含压力术语）

- 意图只存在于 `domain` 层；UI 只读展示，不计算。
- 无意图字段的敌人按纯 `attack` 处理（向后兼容，不影响现有测试与存档）。
- 数值一律进 `BALANCE` 或 enemies.json 数据文件，不硬编码。
- 意图选择使用**可注入 RNG**（`Rng = () => number`），测试可复现。
- 压力相关数值使用 `pressure*` 命名（v13 已统一），不出现 `morale`。

## 4. 数据结构（定稿）

```ts
// src/domain/model.ts
export type EnemyIntentType = 'attack' | 'charge' | 'guard' | 'pressure';

export interface EnemyIntent {
  type: EnemyIntentType;
  targetHint?: 'front' | 'back' | 'weakest'; // 缺省 front
  damage?: number;    // 覆盖默认伤害（charge 的下一回合倍率见 §5）
  pressure?: number;  // pressure 意图施加的额外压力
}

export interface Enemy {
  // ...现有字段
  intents?: EnemyIntent[]; // 意图池；缺省视为 [{ type: 'attack' }]
}

export interface Expedition {
  // ...现有字段
  enemyIntents: Record<string, EnemyIntent>;   // enemyId -> 当前预告的意图
  enemyCharge: Record<string, number>;          // enemyId -> 蓄力层数（charge 意图积累）
}
```

## 5. 意图语义（回合是"预告→玩家行动→敌人兑现"）

| 意图 | 敌人兑现时行为 | 玩家看到预告后的决策 |
|---|---|---|
| `attack` | 按 `targetHint` 选目标，造成 `damage × chargeMultiplier` 伤害并消耗蓄力 | 常规处理 |
| `charge` | 本回合不攻击，`enemyCharge[id] += 1`（最多 2 层，即伤害 ×2 封顶） | **下回合必吃大招**——要么集火打掉，要么换血硬吃 |
| `guard` | 本回合不攻击；该意图生效期间受到玩家伤害减半 | **这回合打它亏**——先处理其他目标 |
| `pressure` | 对目标施加 `pressure` 点压力，不放血 | 优先击杀或准备镇定剂 |

蓄力伤害公式（覆盖默认伤害时）：

```text
实际伤害 = (intent.damage ?? enemy.damage) × (1 + enemyCharge - 1)
         = (intent.damage ?? enemy.damage) × enemyCharge（charge 层数从 1 起，封顶 2）
```

目标倾向：

| `targetHint` | 选择规则 |
|---|---|
| `front`（缺省） | 现有逻辑：从前排起第一个可攻击的存活英雄 |
| `back` | 从后排起第一个可攻击的存活英雄（威胁游侠/术士） |
| `weakest` | 当前 `hp / maxHp` 最小的存活英雄 |

## 6. 意图选择规则（rollIntent，定稿）

- 从 `enemy.intents` 池中随机选择；
- **连续两次不得相同**（避免重复无趣）；
- `charge` 意图兑现后，下一回合强制 `attack`（蓄力必然导致攻击，且防止无限蓄力）；
- 意图池为空或未配置 → 回退 `attack`；
- 选择算法只接受 `Rng` 注入，默认 `Math.random`。

```ts
// src/domain/intents.ts（新模块）
export type Rng = () => number;

export function rollIntent(
  enemy: Enemy,
  currentIntent: EnemyIntent | undefined,
  charge: number,
  rng: Rng = Math.random,
): EnemyIntent;

export function targetForIntent(
  party: Hero[],
  intent: EnemyIntent,
): Hero | undefined;

export function resolveEnemyAction(
  state: GameState,
  attacker: Enemy,
  intent: EnemyIntent,
): GameState;

export function intentDescription(intent: EnemyIntent, enemyName: string): string;
```

`rollIntent` 语义：

1. `intents` 未配置或为空 → 返回 `{ type: 'attack' }`。
2. `charge > 0`（上一回合蓄力未兑现）→ 强制返回 `attack`（兑现蓄力）。
3. 从池中按 `rng` 均匀抽取；若结果与 `currentIntent` 相同，再次抽取（最多 3 次尝试，仍相同则接受）。
4. 返回抽取结果。

## 7. 战斗时序改造（最小侵入，定稿）

```text
遭遇开始（START_EXPEDITION / 进入 combat 节点）
  → 对每个敌人 rollIntent 并写入 expedition.enemyIntents  ← 预告可见
  → 玩家行动（ATTACK / USE_SKILL / 道具 / 站位调整）
       ├─ 玩家攻击敌人时：若该敌人当前意图为 guard → 伤害减半
       └─ 敌人全灭 → 结算，结束
  → 存活敌人按各自 enemyIntents 兑现行动（resolveEnemyAction）
       ├─ attack  → 原反击逻辑按 targetHint 选目标，伤害 × charge 倍率，charge 清零
       ├─ charge  → 只累积 enemyCharge，log「正在蓄力」
       ├─ guard   → 只 log「架起防御」
       └─ pressure→ 目标压力 + pressure 值
  → 存活检查（全灭 → settleExpedition('defeated')）
  → 对存活敌人重新 rollIntent，覆盖 enemyIntents  ← 新一轮预告
  → 回到「玩家行动」
```

现有 `ATTACK` case 中 `survivingAttackers` 循环体，替换为 `resolveEnemyAction(state, attacker)`；玩家伤害结算处增加 guard 减半判断。先锋「坚守」反制、pack/rock-armor 等既有加成**保留不变**，与意图叠加。

**关键细节（与既有系统交互）**：

- **guard 减半**：只对"玩家对处于 guard 意图的敌人造成的伤害"生效（普通攻击、单目标技能、火焰瓶）。范围技能（星辉爆裂）不减半，保持简单。
- **压力意图与压力系统联动**：`pressure` 意图施加的压力走 `editHero` 的 `pressure` 字段，受 `settings.pressureEnabled` 开关控制（关闭时忽略）。
- **敌人行动顺序**：`resolveEnemyAction` 按 `state.expedition.enemies` 数组顺序执行（与现有反击循环一致），每个敌人独立兑现自己的意图。
- **charge 兑现与死亡**：蓄力中的敌人被击杀后，其 `enemyCharge` 与 `enemyIntents` 条目一并清除（`enemyCharge` 无残留）。
- **站位调整（SWAP）不重 roll**：同一遭遇中玩家换位不改变已预告的意图，避免玩家通过换位"洗牌"。

## 8. 敌人意图池配置（enemies.json，定稿）

| 敌人 | 意图池 | 设计意图 |
|---|---|---|
| 遗迹斥候 scout | attack ×2, charge | 远程会蓄力狙击 |
| 锈甲守卫 warden | attack ×2, guard | 近战会举盾 |
| 遗迹门卫 gatekeeper | attack ×3, charge | 精英有爆发节奏 |
| 灰烬林狼 ash-wolf | attack | 靠 pack 数量施压，意图单纯 |
| 荆角巨鹿 thorn-stag | attack, charge | 冲撞蓄力 |
| 毒蕈孢子兽 spore-beast | attack ×2, pressure(back, pressure: 6) | 远程持续施压后排 |
| 岩甲蜥 rock-lizard | attack, guard | 岩甲 + 防御双减伤 |
| 古树守卫 grove-guardian | attack, charge, guard, pressure | Boss 意图多样，需读题应对 |

配置文件示例：

```json
{ "id": "scout", "name": "遗迹斥候", "intents": [
  { "type": "attack" }, { "type": "attack" }, { "type": "charge", "targetHint": "back" }
] }
{ "id": "spore-beast", "name": "毒蕈孢子兽", "intents": [
  { "type": "attack", "targetHint": "back" }, { "type": "attack", "targetHint": "back" },
  { "type": "pressure", "targetHint": "back", "pressure": 6 }
] }
{ "id": "grove-guardian", "name": "古树守卫", "intents": [
  { "type": "attack", "targetHint": "front" }, { "type": "charge", "targetHint": "weakest" },
  { "type": "guard" }, { "type": "pressure", "targetHint": "weakest", "pressure": 8 }
] }
```

## 9. UI 展示规范（定稿）

- 敌人头顶（或血条旁）展示当前意图文本，使用 `intentDescription` 输出，只读 `expedition.enemyIntents`。
- 文案与颜色映射：

| 意图 | 显示文本 | 颜色（暖色系，与战斗反馈统一） |
|---|---|---|
| attack | 「攻击」 | 默认战斗文字色 |
| charge | 「蓄力中 · 下回合重击」 | 红/橙（威胁） |
| guard | 「防御中 · 伤害减半」 | 蓝（低优先） |
| pressure | 「施加压力」 | 紫/暗色（心理威胁） |

- 蓄力 ≥ 1 层的敌人：攻击意图显示为「重击（×2）」以提醒玩家蓄力已就绪。
- 意图文本必须与角色立绘/血条同层，不被前景遮挡；移动端缩放后仍可读（字号 ≥ 11px）。

## 10. 改动文件清单（定稿）

| 文件 | 改动 |
|---|---|
| `src/domain/model.ts` | +`EnemyIntentType`/`EnemyIntent`；`Enemy.intents?`；`Expedition.enemyIntents/enemyCharge` |
| `src/domain/intents.ts`（新） | `rollIntent` / `resolveEnemyAction` / `targetForIntent` / `intentDescription` |
| `src/domain/combat.ts` | 反击循环改用 `resolveEnemyAction`；玩家攻击结算加 guard 减半；行动后重 roll |
| `src/domain/gameEngine.ts` | `START_EXPEDITION` 初始化 `enemyIntents`（逐敌人 roll）；`enterNode` 进入 combat 节点时重 roll |
| `src/content/data/enemies.json` | 8 个敌人补 `intents` 意图池 |
| `src/domain/config.ts` | 如需蓄力封顶等常量进 `BALANCE`（`chargeMaxLayers: 2`） |
| `src/ui/pages/Expedition.tsx`（或 BattleCanvas） | 敌人头顶展示意图文本（只读 `enemyIntents`） |
| `src/domain/intents.test.ts`（新） | 见 §11 |
| `src/domain/combat.test.ts` | 补充 guard 减半 / charge 倍率 / 全灭时序用例 |

## 11. 测试设计（定稿）

| 用例 | 断言 |
|---|---|
| rollIntent 缺省池 | 未配置 intents 的敌人回退 `attack` |
| rollIntent 连续相同规避 | 注入序列不产生相邻重复意图 |
| rollIntent charge 后强制 | charge 兑现后下一回合为 attack |
| rollIntent RNG 注入 | 相同 rng 序列产生相同意图（可复现） |
| resolveEnemyAction attack | 伤害与现有反击一致；targetHint=back 打后排；weakest 打最脆 |
| resolveEnemyAction charge | 本回合无伤害；enemyCharge 递增；封顶 2 层 |
| charge 兑现 | 下一回合 attack 伤害 ×2 且蓄力清零 |
| resolveEnemyAction guard | 不攻击；玩家攻击该敌人时伤害减半 |
| resolveEnemyAction pressure | 目标压力 +pressure（受 pressureEnabled 开关控制） |
| 蓄力中击杀 | charge 敌人被打掉后无任何伤害且 enemyCharge 无残留 |
| 全灭时序 | 意图兑现致全灭 → settleExpedition('defeated') 不残留敌意 |
| 迁移兼容 | 无 enemyIntents 字段的旧存档 / 测试 fixture 正常回退（v13 存档契约） |
| 换位不重 roll | SWAP 后 enemyIntents 不变 |

## 12. 验收标准（定稿）

1. `npm test` 全绿（新增意图测试全部通过）；`npm run build` 通过。
2. domain 层不引入 React / 浏览器 / LLM 依赖；UI 只读 `enemyIntents` 展示。
3. 同一场遭遇、同一 rng 序列下，意图与伤害可完全复现（确定性）。
4. 无 LLM、无插件环境下战斗完整可玩（不依赖任何外部能力）。
5. 压力术语全链路为 `pressure`，不出现 `morale` 新代码。

## 13. 实施顺序（建议）

1. `model.ts` 加类型；`enemies.json` 配 8 敌人意图池（数据先行）。
2. 新建 `domain/intents.ts` 四个纯函数 + `intents.test.ts`（先测纯函数）。
3. `combat.ts` 改造 `ATTACK` 反击循环为 `resolveEnemyAction`；补 guard 减半；`gameEngine.ts` 初始化与重 roll。
4. UI 展示意图文本（Expedition.tsx / BattleCanvas）。
5. 补 combat.test.ts 集成用例，跑全量测试与构建。

## 14. 明确不做（本期范围外，与草案一致）

- **不做回合制改造**：保持"玩家行动 → 敌人行动"节奏，意图预告已足够产生决策。
- **不做多意图队列/施法前摇动画**：本期只做数据与规则层 + 最小 UI 展示。
- **不新增敌人类型**：只用现有 8 种敌人配意图池。
- **不做意图驱动的 AI 学习/难度自适应**：意图池静态配置。

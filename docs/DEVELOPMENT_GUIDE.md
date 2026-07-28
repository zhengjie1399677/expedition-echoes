# 《远征余响》开发指南

> 面向后续维护、功能扩展和与 Mobile-Tavern / SillyTavern 的集成。

## 1. 技术栈

- React：页面、管理界面和宿舍对话。
- TypeScript：领域模型、状态和适配器。
- Phaser：远征战斗场景与动画。
- Vite：开发与生产构建。
- Vitest：领域规则和基础设施测试。

常用命令：

```powershell
npm run dev
npm test -- --run
npm run build
```

提交功能前至少运行测试和生产构建。

## 2. 目录职责

```text
src/
  content/
    静态游戏内容：角色、任务、敌人、装备、节点等
  domain/
    领域类型、纯规则、reducer 和战斗数值
  infrastructure/
    存储、资源预加载、LLM 后端适配
  ui/
    React 页面、Phaser 场景和界面行为

public/assets/
  actors-v2/          当前动漫角色战斗素材
  pixel/              像素战斗素材
  portraits-dorm/     宿舍日常立绘
  world/              城镇、酒馆、宿舍和战斗背景

docs/
  设计、流程和开发文档
```

## 3. 架构边界

### 3.1 `content`

只描述静态内容，不处理运行状态。例如：

- 角色基础信息。
- 任务模板。
- 装备定义。
- 敌人定义。
- 事件模板。
- 品质和奖励档位。

### 3.2 `domain`

负责可测试的确定性规则：

- 接取和完成任务。
- 每日限制。
- 食物消耗。
- 好感变化。
- 装备打造与出售。
- 战斗伤害。
- 事件状态推进。

不要在 reducer 内执行网络请求、读写 DOM 或调用 LLM。

### 3.3 `infrastructure`

负责外部系统：

- `storage.ts`：本地存档与迁移。
- `llm.ts`：Mobile-Tavern、SillyTavern 和离线回退。
- 未来的 XML 提取、结构化校验与叙事缓存。

### 3.4 `ui`

负责展示和用户输入。UI 可以调用基础设施服务，但不能自行计算重要经济或战斗规则。

## 4. 状态版本与迁移

当前存档版本由 `GameState.version` 管理。

新增持久状态时：

1. 修改 `GameState`。
2. 更新 `createInitialGame()`。
3. 增加对应 action 和 reducer。
4. 更新 `storage.ts` 迁移。
5. 为旧版本存档提供安全默认值。
6. 增加迁移测试。

不要因为新增字段直接丢弃旧存档。

以下规划状态应在实施时统一升级版本：

- 游戏天数。
- 今日任务状态。
- 食物库存和饥饿层数。
- 好感度与关系阶段。
- 每日赠礼次数。
- 活跃事件链。
- 每日新闻缓存。
- 角色长期记忆。

## 5. 战斗与装备规则

装备数值必须进入 `domain/gameEngine.ts` 的确定性计算，不允许只显示在 UI 上。

实现新装备效果时：

1. 在内容层定义装备。
2. 在领域层解析装备加成。
3. 将加成用于伤害或减伤计算。
4. 为装备限制和数值结果增加测试。
5. UI 只读取最终属性或加成摘要。

LLM 不能返回任意装备数值。LLM 只能引用现有装备、配方或奖励档位。

## 6. 聊天后端适配

入口文件：

[llm.ts](../src/infrastructure/llm.ts)

支持的提供方：

```ts
type NarrativeProvider =
  | 'auto'
  | 'mobile-tavern'
  | 'sillytavern';
```

### 6.1 自动选择

```text
Mobile-Tavern 可用
→ 使用 Mobile-Tavern

否则 SillyTavern 可用
→ 使用 SillyTavern

否则
→ 离线对白
```

提供方偏好是设备连接设置，单独保存在 `localStorage`，不属于游戏进度。

### 6.2 Mobile-Tavern

使用宿主注入：

```ts
window.MobileTavernPlugin.llm.chat({
  messages,
  sampling: {
    temperature: 0.8,
    max_tokens: 220,
  },
});
```

打包为 Mobile-Tavern 插件时，清单必须声明：

```json
{
  "permissions": ["llm.chat"]
}
```

本游戏不会管理 Mobile-Tavern 的模型地址或密钥。

### 6.3 SillyTavern

使用稳定扩展上下文：

```ts
const context = window.SillyTavern.getContext();
const result = await context.generateRaw({
  systemPrompt,
  prompt: messages,
});
```

不要直接导入 SillyTavern 内部模块路径。其官方建议使用 `getContext()`。

本游戏不会管理 SillyTavern 的模型地址或密钥。

### 6.4 对话上下文

发送给模型的内容包括：

- 角色名称、性格和当前关系阶段。
- 当前地点。
- 最近游戏事件。
- 最近玩家和角色消息。
- 当前玩家输入。

禁止在系统提示中要求模型修改游戏数值。

## 7. 结构化叙事

建议新增独立模块：

```text
src/infrastructure/narrativeProtocol.ts
src/domain/narrativeValidation.ts
```

职责划分：

- `narrativeProtocol.ts`
  - 提取 XML。
  - 去除代码围栏。
  - 进行有限格式修复。
  - 解析为未知数据。
- `narrativeValidation.ts`
  - 验证允许标签。
  - 验证 ID 和枚举。
  - 验证事件前置状态。
  - 将安全指令转换为领域 action。

不要让解析器直接 dispatch。

推荐处理流：

```text
LLM 原始回复
→ 提取信封
→ XML 解析
→ 结构校验
→ 语义校验
→ 生成候选叙事动作
→ reducer 应用合法动作
```

## 8. 原生结构化能力

未来 Mobile-Tavern 可以扩展能力查询，但游戏不能依赖它一定存在：

```ts
interface LlmCapabilities {
  structuredOutput: boolean;
  streaming: boolean;
  maxContextTokens?: number;
}
```

调用策略：

```text
支持 Schema
→ 原生结构化请求

不支持 Schema
→ 普通文本请求，要求 XML

解析失败
→ 本地修复

仍失败
→ 保留安全文本或使用离线模板
```

无论是否支持 Schema，都必须执行游戏语义校验。

## 9. 日程系统的推荐实现顺序

第一阶段：

1. 增加游戏天数。
2. 增加“今日是否已接任务”。
3. 限制每天一次任务。
4. 增加休息至次日。

第二阶段：

1. 增加普通食物。
2. 每进入节点消耗一份食物。
3. 食物不足时增加饥饿层数。
4. 将惩罚接入战斗计算。

第三阶段：

1. 增加任务材料奖励。
2. 增加材料出售。
3. 增加装备打造配方。
4. 打造装备进入现有背包。

第四阶段：

1. 增加礼物与角色偏好。
2. 增加好感与阶段门槛。
3. 将关系阶段注入聊天提示。
4. 增加阶段突破事件。

第五阶段：

1. 每日新闻缓存。
2. XML 叙事协议。
3. 特殊任务提议。
4. 事件链串联和次日反馈。

## 10. 测试要求

领域功能必须优先测试：

- 每天只能接一次任务。
- 撤退不能返还任务次数。
- 每个节点只消耗一次食物。
- 食物不足不会造成死档。
- 材料出售数量和金币正确。
- 打造消耗与装备产出正确。
- 装备攻击、防御进入战斗计算。
- 礼物偏好和每日限制正确。
- 好感阶段只能合法推进。
- 非法 LLM 指令不会改变状态。

基础设施测试：

- Mobile-Tavern 适配器请求结构。
- SillyTavern 适配器请求结构。
- 提供方自动选择。
- XML 提取与常见错误修复。
- 结构合法但语义非法的动作被拒绝。
- 断线和模型错误能安全降级。

## 11. 美术与 UI 约束

- 当前角色主体画风为年轻幻想动漫风。
- 宿舍使用无武器日常立绘。
- 战斗素材和宿舍立绘分开维护。
- 人物、背景与对话 UI 使用独立层。
- 宿舍对话使用 GAL 式当前对白；历史记录通过“回顾”展开。
- 高频入口位于全宽底栏。
- 新增 UI 时必须检查文字对比度和 16:9 画面遮挡。

## 12. 完成功能的最低验收

每项功能完成前应满足：

- 领域规则有测试。
- 旧存档可以迁移。
- 生产构建通过。
- 在实际浏览器中完成主要交互。
- 控制台无新错误。
- UI 不遮挡底栏、对话框或关键角色信息。
- 外部 LLM 不可用时仍可继续游戏。


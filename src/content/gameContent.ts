import type { CraftingRecipe, Enemy, ExpeditionNode, GameState, Hero, HeroClass, ItemDefinition, LastExpedition, MaterialType, Mission, Rarity, Region, SettlementState, SkillDefinition } from '../domain/model';

// 导入 JSON 平衡数据
import rawHeroes from './data/heroes.json';
import rawItems from './data/items.json';
import rawEnemies from './data/enemies.json';
import rawMissions from './data/missions.json';
import rawRecipes from './data/recipes.json';

export const heroClassNames: Record<HeroClass, string> = { vanguard: '先锋', ranger: '游侠', mage: '术士', medic: '医师' };
export const heroClassDescriptions: Record<HeroClass, string> = {
  vanguard: '攻击距离 1，生命与防护较高', ranger: '攻击距离 1–2，输出稳定',
  mage: '攻击距离 2–3，无法攻击贴身敌人', medic: '攻击距离 1–2，擅长恢复',
};
export const baseAttack: Record<HeroClass, number> = { vanguard: 7, ranger: 6, mage: 8, medic: 3 };

// 材料稀有度命名与配色。颜色用于 UI 徽章，按稀有度递进。
// 普通灰改深一档，确保在深色背景下达到 WCAG AA 对比度（4.5:1）。
export const rarityNames: Record<Rarity, string> = { 0: '普通', 1: '优良', 2: '稀有', 3: '史诗', 4: '传说' };
export const rarityColors: Record<Rarity, string> = { 0: '#cbd5e1', 1: '#4ade80', 2: '#60a5fa', 3: '#c084fc', 4: '#fbbf24' };
// 材料类型表。当前两种，后续可直接追加，无需改动逻辑。
const materialTypes: MaterialType[] = [
  { id: 'ruin-shard', name: '遗迹碎片' },
  { id: 'rust-iron', name: '锈铁块' },
];
export const materialName = (typeId: string): string => materialTypes.find((item) => item.id === typeId)?.name ?? typeId;
// 材料出售单价，按稀有度递增。商店收购价，可作为经济回收口。
export const materialSellPrices: Record<Rarity, number> = { 0: 1, 1: 5, 2: 30, 3: 150, 4: 1000 };
// 游戏内日期：从 3 月 1 日起算，day 1 = 3月1日，Date 构造自动处理跨月。
export const dayLabel = (day: number): string => {
  const date = new Date(2026, 2, day);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};
export interface GiftDefinition { id: string; name: string; tags: string[]; price: number }
export const giftDefinitions: GiftDefinition[] = [
  { id: 'wildflower', name: '野花束', tags: ['自然'], price: 5 },
  { id: 'ale', name: '麦酒', tags: ['饮食'], price: 8 },
  { id: 'old-book', name: '旧诗集', tags: ['文化'], price: 15 },
  { id: 'charm', name: '骨雕护符', tags: ['神秘', '贵重'], price: 40 },
];
export interface AffinityStage { name: string; threshold: number; description: string }
export const affinityStages: AffinityStage[] = [
  { name: '陌生', threshold: 0, description: '礼貌、克制、保持距离' },
  { name: '熟悉', threshold: 20, description: '分享习惯、日常看法和轻量过去' },
  { name: '信赖', threshold: 50, description: '谈论目标、恐惧、创伤和重要选择' },
  { name: '羁绊', threshold: 80, description: '出现专属事件、更主动的关心与情感表达' },
];
export const affinityStage = (affinity: number): AffinityStage => {
  let stage = affinityStages[0];
  for (const item of affinityStages) if (affinity >= item.threshold) stage = item;
  return stage;
};
export const skillDefinitions: Record<string, SkillDefinition> = {
  'guardians-order': {
    id: 'guardians-order',
    name: '守望号令',
    description: '降低队伍压力 8 点。',
    effect: { type: 'pressure_recovery', value: 8 }
  },
  'wind-arrow': {
    id: 'wind-arrow',
    name: '贯风箭',
    description: '无视距离对目标造成额外 3 点伤害。',
    effect: { type: 'single_damage', value: 3 }
  },
  'star-burst': {
    id: 'star-burst',
    name: '星辉爆裂',
    description: '对所有存活敌人造成 6 点伤害。',
    effect: { type: 'all_damage', value: 6 }
  },
  'healing-light': {
    id: 'healing-light',
    name: '治愈之光',
    description: '为一名虚弱的在编队友恢复 12 点生命。',
    effect: { type: 'heal_single', value: 12 }
  },
  'iron-will': {
    id: 'iron-will',
    name: '钢铁意志',
    description: '重整阵脚，平复自身 6 点压力。',
    effect: { type: 'pressure_recovery', value: 6 }
  },
  'ward-break': {
    id: 'ward-break',
    name: '破阵击',
    description: '对单体敌人造成额外 5 点伤害，无视距离。',
    effect: { type: 'single_damage', value: 5 }
  },
  'arrow-rain': {
    id: 'arrow-rain',
    name: '箭雨',
    description: '对所有存活敌人造成 4 点伤害。',
    effect: { type: 'all_damage', value: 4 }
  },
  'star-lance': {
    id: 'star-lance',
    name: '星芒',
    description: '凝聚星辉对单体敌人造成额外 7 点伤害。',
    effect: { type: 'single_damage', value: 7 }
  },
  'soothe': {
    id: 'soothe',
    name: '安抚',
    description: '温言抚慰，全队压力降低 6 点。',
    effect: { type: 'pressure_recovery', value: 6 }
  }
};

export const initialHeroes: Hero[] = rawHeroes as Hero[];
export const itemDefinitions: ItemDefinition[] = rawItems as ItemDefinition[];

// 装备查询的 O(1) 索引：避免 combat/economy 等处反复 itemDefinitions.find。
export const itemById: ReadonlyMap<string, ItemDefinition> = new Map(itemDefinitions.map((item) => [item.id, item]));
// 中央广场集市的固定售价。只有这里列出的装备、饰品、礼物与消耗品可以直接购买。
// 消耗品定价参考：火焰瓶 15g（8 点无视防御伤害）高于绷带 8g（恢复 9 生命，治疗低于输出定价），
// 镇定剂 20g（-25 压力，最强续航）为最贵消耗品，与铁壁药丸 18g（本场减伤 +3）拉开梯度。
export const marketPrices: Record<string, number> = {
  'vanguard-spear': 36, 'ranger-bow': 36, 'star-staff': 40,
  'field-mail': 42, 'warded-coat': 38, 'echo-charm': 32,
  wildflower: 5, ale: 8, 'old-book': 15, charm: 40,
  bandage: 8, sedative: 20, 'fire-bomb': 15, 'shield-elixir': 18,
};
export const initialInventory: Record<string, number> = {
  bandage: 5, sedative: 2, 'fire-bomb': 2, 'shield-elixir': 2,
  'vanguard-spear': 1, 'ranger-bow': 1, 'star-staff': 1,
  'field-mail': 1, 'warded-coat': 1, 'echo-charm': 1,
  wildflower: 2, ale: 1, 'old-book': 1,
};

export const enemies: Enemy[] = rawEnemies as Enemy[];
export const missions: Mission[] = rawMissions as Mission[];

// 任务 → 所属区域名（区域定义里的 missions 列表是任务与区域的权威对照，避免给 Mission 加冗余字段）。
export const regionNameForMission = (missionId: string): string => {
  const region = regions.find((item) => item.missions.includes(missionId));
  return region?.name ?? '未知遗迹';
};

// 区域与威胁等级（M3 目标框架地基，见 EVENT_AND_REGION_DESIGN）
// 区域状态（threat）存于 GameState.regions，此处是静态定义。
export const regions: Region[] = [
  { id: 'border-ruins', name: '边境遗迹', threat: 2, description: '遗迹道路的异响正在影响商路，封印门厅传来连续回声。', missions: ['border-echoes', 'sealed-gate', 'echo-aftermath'] },
  { id: 'ash-forest', name: '灰烬林地', threat: 1, description: '林地异变从古树圣所向外扩散，狼群与孢兽的活动越来越频繁。', missions: ['forest-disturbance'] },
  { id: 'north-canal', name: '北侧水渠', threat: 0, description: '水渠怪声只是传闻，尚无正式委托。', missions: [] },
  { id: 'sealed-gate', name: '封印门厅', threat: 2, description: '失控守卫正在截断商路，封印深处回应着什么。', missions: ['rusted-patrol'] },
];
// 区域威胁上限（避免单区域无限升级）
export const threatMax = 3;
// 威胁等级命名
export const threatNames: Record<number, string> = { 0: '平静', 1: '异动', 2: '危险', 3: '失控' };

// 事件链定义（M3 目标框架，见 GAMEPLAY_AND_LLM_DESIGN §12 状态机）
// 链的推进由明确状态条件触发（区域威胁、任务结果），LLM 只建议不决定。
// 节点行为（effect，M4 打磨 4）：推进到该节点时应用的世界变化。
// 当前落地两类——unlock-mission（解锁新委托，Tavern 任务板条件显示）与
// news-bonus（次日新闻附带链文案）；schema 可继续扩展（threat-bonus / drop-bonus 等）。
export type ChainNodeEffect =
  | { kind: 'unlock-mission'; missionId: string }
  | { kind: 'news-bonus'; text: string };

interface EventChainNode {
  id: string;
  label: string;            // 节点名（供 UI/日志）
  condition?: { regionId?: string; minThreat?: number }; // 推进前置（可选）
  effect?: ChainNodeEffect; // 推进到该节点时应用的行为（可选）
}
export interface EventChainDefinition {
  id: string;
  name: string;
  regionId: string;
  nodes: EventChainNode[];
}
export const eventChains: EventChainDefinition[] = [
  {
    id: 'border-echoes-chain',
    name: '边境遗迹的回声',
    regionId: 'border-ruins',
    nodes: [
      { id: 'rumor', label: '传闻出现' },
      // 推进到 quest-open → 解锁新委托「回声余波」（任务板条件显示）
      { id: 'quest-open', label: '前置任务开放', effect: { kind: 'unlock-mission', missionId: 'echo-aftermath' } },
      { id: 'quest-complete', label: '前置任务完成', condition: { regionId: 'border-ruins', minThreat: 1 } },
      // 推进到 followup-open → 次日新闻附带链文案（news-bonus）
      { id: 'followup-open', label: '后续事件开放', effect: { kind: 'news-bonus', text: '边境遗迹的回声变得清晰起来，镇上开始流传封印门厅深处的传闻。' } },
      { id: 'ending', label: '结局', condition: { regionId: 'border-ruins', minThreat: 3 } },
    ],
  },
];
// 事件链节点推进规则：完成任务/威胁变化时调用，返回下一个节点（无则 null）。
export const nextChainNode = (chain: EventChainDefinition, currentNodeId: string): string | null => {
  const index = chain.nodes.findIndex((n) => n.id === currentNodeId);
  if (index < 0) return chain.nodes[0]?.id ?? null;
  return chain.nodes[index + 1]?.id ?? null;
};

// ── 事件链节点行为查询（M4 打磨 4）──────────────────────────────────────────────
// 某任务是否被事件链"门控"（存在 unlock-mission effect 指向它）。
export function isChainGatedMission(missionId: string): boolean {
  return eventChains.some((chain) => chain.nodes.some((node) => node.effect?.kind === 'unlock-mission' && node.effect.missionId === missionId));
}
// 某任务当前是否已解锁：未被门控 → 恒可见；被门控 → 对应链已推进到（或越过）解锁节点。
export function isMissionUnlocked(state: GameState, missionId: string): boolean {
  for (const chain of eventChains) {
    const chainState = state.eventChains[chain.id];
    if (!chainState) continue;
    for (const [index, node] of chain.nodes.entries()) {
      if (node.effect?.kind !== 'unlock-mission' || node.effect.missionId !== missionId) continue;
      const currentIndex = chain.nodes.findIndex((n) => n.id === chainState.currentNode);
      if (chainState.completed || currentIndex >= index) return true;
    }
  }
  return !isChainGatedMission(missionId);
}
// 已触发的新闻 bonus 文案（推进到带 news-bonus effect 的节点后生效；链完成后保留全部）。
export function activeChainNewsBonus(state: GameState): string[] {
  const lines: string[] = [];
  for (const chain of eventChains) {
    const chainState = state.eventChains[chain.id];
    if (!chainState) continue;
    const currentIndex = chain.nodes.findIndex((n) => n.id === chainState.currentNode);
    for (const [index, node] of chain.nodes.entries()) {
      if (node.effect?.kind !== 'news-bonus') continue;
      if (chainState.completed || index <= currentIndex) lines.push(node.effect.text);
    }
  }
  return lines;
}

// 每日新闻本地模板：按昨日结果 + 区域威胁生成（LLM 增强前的基础版本，离线完整可玩）。
const dailyNewsTemplates: Record<'victory' | 'retreat' | 'defeated', Record<string, string>> = {
  victory: {
    '0': '晨雾散开，告示板换上了新的委托。昨晚的胜利让城门比平时更热闹。',
    '1': '广场的告示板多了一张鎏金便签：你们带回的消息让北侧商路重新有了人声。',
    '2': '你们平息了一处威胁，酒馆里的人开始打听那支远征队的名字。',
    '3': '连失控的区域都安静了下来——昨夜的胜利传遍了整座小镇。',
  },
  retreat: {
    '0': '酒馆换上了更谨慎的路线图；掌柜提醒，明天会有适合重整的短委托。',
    '1': '昨晚的撤退被记在了路线图上。有人小声说，谨慎总比消失好。',
    '2': '告示板留着你们贴的回执。区域里的动静似乎更大了些。',
    '3': '撤退的消息没有传开。但城门守卫看得出，那个方向的火光比昨天更近。',
  },
  defeated: {
    '0': '宿舍门口留下了药师的字条：先养好伤，城门不会催促任何人。',
    '1': '昨晚的失败让酒馆安静了一晚。守卫交接时多看了一眼城门外的方向。',
    '2': '败北的消息像水一样渗进小镇。那片区域需要更多人。',
    '3': '整座小镇都知道了。灯塔在夜里多亮了一刻，像是在确认什么还活着。',
  },
};
// 获取区域威胁对应的新闻文本（key 为威胁等级字符串）
export const newsForThreat = (outcome: 'victory' | 'retreat' | 'defeated', threat: number): string =>
  dailyNewsTemplates[outcome][String(threat)] ?? dailyNewsTemplates[outcome]['0'];

// 任务板默认意见：必须即时显示、离线可用，不触发 LLM 请求。
export const missionOpinions: Record<string, Record<string, string>> = {
  'border-echoes': {
    lan: '先确认封印门厅是否还稳固。若情况不对，队伍必须立刻撤回。',
    wu: '异响多半有来路，记得留一份口粮给回程。',
    xingluo: '回声会保留施术痕迹……我想亲眼看看那条路。',
  },
  'rusted-patrol': {
    lan: '正面突破会很危险，但商路不能一直断着。',
    wu: '守卫巡逻有规律，找到空隙比硬撞更聪明。',
    xingluo: '它们的锈甲上也许还留着旧式驱动符文。',
  },
  'sealed-gate': {
    lan: '这是最危险的委托。补给不足就不该接。',
    wu: '封印深处没有好消息，不过我会记好每条退路。',
    xingluo: '连续回声意味着封印正在回应什么……不能贸然破坏它。',
  },
  'forest-disturbance': {
    lan: '林地里的生物不是各自行动。先拆散狼群，别让孢子拖垮队伍。',
    wu: '这条旧猎径我认得，但树根和足迹都变了。营地是我们最稳妥的退路。',
    xingluo: '异变像是从古树圣所向外扩散。守卫的核心进入暗红状态时会更加危险。',
  },
  // 事件链解锁委托（M4 打磨 4）：border-echoes 链推进到 quest-open 后出现在任务板
  'echo-aftermath': {
    lan: '余波不会自己平息。先确认回廊没有新的守卫苏醒，再谈深入。',
    wu: '回廊的脚步声比昨天多了。我带够箭矢，你们带够绷带。',
    xingluo: '回声的频率变了……像是有什么东西在回应封印。我想记录下它。',
  },
};
export const expeditionNodes: ExpeditionNode[] = [
  { kind: 'combat', title: '坍塌入口', description: '碎石之间传来急促脚步。', enemyIds: ['scout', 'warden'] },
  { kind: 'event', title: '废弃补给室', description: '封存药箱仍可使用，但深处也有未被触碰的箱柜。', event: { id: 'supply-room', title: '废弃补给室', prompt: '队伍在补给室停下。是先照料彼此，还是冒着不安的气息翻找遗物？', choices: [
    { id: 'recover', label: '整理伤口', description: '全队恢复生命并平复压力。', effect: 'recover' },
    { id: 'scavenge', label: '翻找药箱', description: '获得一枚遗迹碎片，但全队压力上升。', effect: 'scavenge' },
  ] } },
  { kind: 'combat', title: '回声长廊', description: '锈甲守卫从墙后缓慢起身。', enemyIds: ['warden', 'scout'] },
  { kind: 'event', title: '旧日营火', description: '熄灭的营火旁留着新鲜的足迹，通向另一条阴影小径。', event: { id: 'old-campfire', title: '旧日营火', prompt: '短暂安全并不意味着没有选择。队长决定让队伍休整，还是循着痕迹确认前方风险？', choices: [
    { id: 'recover', label: '围火休整', description: '全队恢复生命并平复压力。', effect: 'recover' },
    { id: 'track', label: '循迹探查', description: '带回额外金币，但全队压力上升。', effect: 'track' },
  ] } },
  { kind: 'event', title: '坍塌通道', description: '去路被碎石堵死，绕行要消耗更多食物。', background: '/assets/world/ruins-v1/collapsed-passage-v1.png', event: { id: 'collapsed-passage', title: '坍塌通道', once: true, prompt: '碎石封住了去路，深处隐约传来刨挖的声响。是强行清路，还是绕行休整？', choices: [
    { id: 'risk_fight', label: '清理碎石', description: '惊动碎石后的生物；胜利可获得材料。', effect: 'risk_fight' },
    { id: 'recover', label: '绕路休整', description: '消耗 1 份食物绕行，全队恢复生命并平复压力。', effect: 'recover', consumes: { food: 1 } },
  ] } },
  { kind: 'event', title: '游商帐篷', description: '一位商人支起帐篷，愿意用货物交换遗迹材料。', background: '/assets/world/ruins-v1/traveling-merchant-v1.png', event: { id: 'traveling-merchant', title: '游商帐篷', once: true, prompt: '商人愿以公道价格交换。要卖掉材料换金币，还是用金币换材料？', choices: [
    { id: 'bargain', label: '出售材料', description: '用 2 份遗迹碎片换 24 金币。', effect: 'bargain', goldGain: 24, material: { typeId: 'ruin-shard', rarity: 0, count: 2 } },
    { id: 'bargain', label: '购买材料', description: '花 30 金币购入 2 份锈铁块。', effect: 'bargain', goldGain: -30, material: { typeId: 'rust-iron', rarity: 0, count: 2 } },
    { id: 'recover', label: '婉拒离开', description: '不作交易，队伍继续赶路。', effect: 'recover' },
  ] } },
  { kind: 'combat', title: '封印门厅', description: '门卫挡在出口前，这是最后一战。', enemyIds: ['gatekeeper', 'warden', 'scout'] },
] as const;
export const forestExpeditionNodes: ExpeditionNode[] = [
  { kind: 'combat', title: '林缘古道', description: '灰色兽影从阳光与树影之间逼近。', background: '/assets/world/forest-v1/forest-road-v1.png', enemyIds: ['ash-wolf', 'ash-wolf'] },
  { kind: 'event', title: '临时营地', description: '火光尚暖，岔路在暮色中伸向不同方向。', background: '/assets/world/forest-v1/forest-camp-v1.png', event: { id: 'supply-room', title: '临时营地', prompt: '队伍在林间营地停下。先检查伤势，还是搜索周围的孢子痕迹？', choices: [
    { id: 'recover', label: '围火休整', description: '全队恢复生命并平复压力。', effect: 'recover' },
    { id: 'scavenge', label: '搜索孢子', description: '获得材料，但全队压力上升。', effect: 'scavenge' },
  ] } },
  { kind: 'combat', title: '孢子林径', description: '菌盖与岩甲在幽暗林径中同时活动。', background: '/assets/world/forest-v1/forest-road-v1.png', enemyIds: ['spore-beast', 'rock-lizard', 'thorn-stag'] },
  { kind: 'event', title: '药草丛', description: '石缝间长着一丛发光的药草，附近有游走的孢子兽。', background: '/assets/world/forest-v1/herb-grove-v1.png', event: { id: 'herb-grove', title: '药草丛', once: true, prompt: '这丛药草能救急，也可能惊动周围的东西。队长怎么取舍？', choices: [
    { id: 'aid_hero', label: '谨慎采摘', description: '最虚弱的队员恢复 12 生命，其他队员压力 +4。', effect: 'aid_hero' },
    { id: 'scavenge', label: '整丛拔走', description: '获得材料，但惊动孢兽，全队压力大幅上升。', effect: 'scavenge', pressureCost: 12 },
  ] } },
  { kind: 'event', title: '暮色营火', description: '圣所就在前方，最后一次整备机会已经到来。', background: '/assets/world/forest-v1/forest-camp-v1.png', event: { id: 'old-campfire', title: '暮色营火', prompt: '队伍听见古树深处的沉重回响。休整，还是先观察守卫的行动？', choices: [
    { id: 'recover', label: '安静休整', description: '全队恢复生命并平复压力。', effect: 'recover' },
    { id: 'track', label: '侦察圣所', description: '获得额外金币，但全队压力上升。', effect: 'track' },
  ] } },
  { kind: 'event', title: '回声陷阱', description: '一片刻满符文的石地，踩中会惊动圣所守卫。', background: '/assets/world/forest-v1/echo-trap-v1.png', event: { id: 'echo-trap', title: '回声陷阱', once: true, prompt: '符文石地危险重重。用镇定剂压制回声，还是冒险快速通过？', choices: [
    { id: 'recover', label: '压制回声', description: '消耗 1 份镇定剂，全队恢复生命并平复压力。', effect: 'recover', requirement: '需要镇定剂', consumes: { sedative: 1 } },
    { id: 'track', label: '快速通过', description: '获得额外金币，但全队压力大幅上升。', effect: 'track', pressureCost: 12 },
  ] } },
  { kind: 'combat', title: '古树圣所', description: '古树守卫从根系王座前苏醒。', background: '/assets/world/forest-v1/grove-sanctuary-v1.png', enemyIds: ['grove-guardian'] },
] as const;
export const nodesForMission = (missionId: string): readonly ExpeditionNode[] => missionId === 'forest-disturbance' ? forestExpeditionNodes : expeditionNodes;

// ── 选择事实 → 可读文本（M4 打磨 2，供 LLM 场景包与宿舍离线 greeting 使用）────────────
// eventId:choiceId → 选择 label（如 'supply-room:scavenge' → '翻找药箱'）。
// supply-room / old-campfire 在两条远征线复用事件 id 但 label 不同，取先定义的（遗迹线）。
const choiceLabelByKey: Record<string, string> = {};
for (const node of [...expeditionNodes, ...forestExpeditionNodes]) {
  if (node.kind !== 'event' || !node.event) continue;
  for (const choice of node.event.choices) {
    const key = `${node.event.id}:${choice.id}`;
    if (!(key in choiceLabelByKey)) choiceLabelByKey[key] = choice.label;
  }
}
// 把 lastExpedition.choices 里的键转成一句话可读文本；未知键/撤退标记兜底。
export function describeChoiceKey(key: string): string {
  if (key.startsWith('retreat-at-node-')) {
    const nodeNum = key.split('-').pop();
    return nodeNum ? `于第 ${nodeNum} 处节点撤退` : '中途撤退';
  }
  return choiceLabelByKey[key] ?? key;
}

// 宿舍离线 greeting（M4 打磨 2）：按 heroId + outcome + choices 命中的事实台词。
// 结构：heroId → outcome → { default, `${eventId}:${choiceId}`... , retreat（撤退节点专用） }。
// 未收录的英雄/未命中 → undefined，由调用方回退现有泛用逻辑。
const dormGreetings: Record<string, Record<'victory' | 'retreat' | 'defeated', Record<string, string>>> = {
  lan: {
    victory: {
      default: '回来就好。先把伤口和补给清点完，别急着庆祝。',
      'supply-room:scavenge': '你翻找箱柜的时候，我在门口望风。带回来的材料不错，但下次别那么冒险。',
      'supply-room:recover': '你选择先让大家休整，是对的。队伍比那几件遗物值钱。',
      'old-campfire:track': '循着脚印追出去那一趟，我捏了把汗。好在你带回了值得的东西。',
    },
    retreat: {
      default: '及时撤回是正确判断。活着回来，才有下一次远征。',
      retreat: '在「那里」撤退不是丢脸的事。活着回来，才有下一次远征。',
      'supply-room:scavenge': '翻到一半就撤，箱子的事我替你记着。下次换个更稳的走法。',
    },
    defeated: {
      default: '别勉强说话，先休息。责任不该只落在一个人身上。',
      'collapsed-passage:risk_fight': '清路那一下太冒险了。下次这种活，让我先上。',
    },
  },
  wu: {
    victory: {
      default: '这次路没白走。队长，下次我们要不要试试另一条岔路？',
      'supply-room:scavenge': '翻箱倒柜那几下，我在旁边数着你的心跳呢。收获不错，下次换我来。',
      'supply-room:recover': '先养伤再赶路，这招我熟。补给室里最值钱的不是箱子。',
      'old-campfire:track': '追着脚印走，是我教你的第一课。看来你学得不错。',
    },
    retreat: {
      default: '我就知道队长不会把撤退当成丢脸的事。下次换个走法。',
      retreat: '撤得漂亮。路线我都记下了，下次绕开那一段。',
    },
    defeated: {
      default: '我把门关好了。今晚不谈遗迹，只谈怎么把大家养回来。',
    },
  },
  xingluo: {
    victory: {
      default: '封印的回声还在耳边……但我们确实带回了新的线索。',
      'supply-room:scavenge': '补给室那些箱子的封条，是旧式符文……你翻开的瞬间我心跳都停了。',
      'supply-room:recover': '休整的间隙，我在想那些箱子后面藏着什么。不过先养好伤更重要。',
      'old-campfire:track': '营火边的脚印通向的正是我猜的方向。你验证了我的星盘推演。',
    },
    retreat: {
      default: '虽然没能看完，但那些痕迹不会消失。我们准备好再去。',
      retreat: '撤退让我没能读完那组符文，但痕迹不会消失。我们准备好再去。',
    },
    defeated: {
      default: '是我太急了……不过，能回来就还有重新计算的机会。',
      'echo-trap:track': '穿过回声陷阱是我的提议……下次我会先算出代价。',
    },
  },
  cheng: {
    victory: {
      default: '大家都平安回来了，这就是最好的消息。伤口片刻就能治好。',
      'herb-grove:aid_hero': '你采回的那丛药草，我熬成了三份药汤。最虚弱的人已经好多了。',
    },
    retreat: {
      default: '队长做出了明智的选择。队员们的健康和安全永远是第一位的。',
      retreat: '提前回来不是坏事，我正好把大家的伤都处理一遍。',
    },
    defeated: {
      default: '伤得这么重……别担心，有我在，快躺下休息，我会用药草帮大家疗伤。',
    },
  },
  yan: {
    victory: {
      default: '任务结了，金币收好。明天继续。',
    },
    retreat: {
      default: '风口不对，撤是对的。我的长刀随时待命。',
    },
    defeated: {
      default: '倒下又如何，站起来就是了。下一单什么时候接？',
    },
  },
};

// 宿舍离线 greeting：优先命中选择事实（撤退节点 → retreat 键，其次 eventId:choiceId），
// 未命中回退 outcome 默认；无 lastExpedition 或英雄未收录时返回 undefined（调用方走旧逻辑）。
export function dormGreeting(heroId: string, last: LastExpedition | undefined): string | undefined {
  if (!last) return undefined;
  const heroTable = dormGreetings[heroId];
  if (!heroTable) return undefined;
  const outcomeTable = heroTable[last.outcome];
  if (!outcomeTable) return undefined;
  if (last.outcome === 'retreat' && last.choices.some((key) => key.startsWith('retreat-at-node'))) {
    const retreatLine = outcomeTable['retreat'];
    if (retreatLine) return retreatLine;
  }
  for (const key of last.choices) {
    const line = outcomeTable[key];
    if (line) return line;
  }
  return outcomeTable.default ?? undefined;
}

// ── 选择事实 → 次日新闻引用句（M4 打磨 1，本地模板，离线可用）──────────────────────────────
// 键形如 `${eventId}:${choiceId}`，与 GameState.lastExpedition.choices 保持一致。
// 文案刻意不写死地点名：supply-room / old-campfire 的事件 id 在两条远征线中复用，
// 泛化描述可在「废弃补给室」与「临时营地」等场景下通吃。
const choiceNewsMentions: Record<string, string> = {
  'supply-room:recover': '远征队在路上停下休整，恢复了状态。',
  'supply-room:scavenge': '有人冒险翻开了尘封的箱柜，带回了一些材料。',
  'old-campfire:recover': '队伍在营火旁围坐休整了一夜。',
  'old-campfire:track': '据说有人循着痕迹追向深处，带回了意外的收获。',
  'collapsed-passage:risk_fight': '坍塌通道的碎石被清开了，惊动的生物让消息传遍了镇子。',
  'collapsed-passage:recover': '坍塌通道前，队伍选择绕行，路过的旅人记住了他们的谨慎。',
  'traveling-merchant:bargain': '游商帐篷的生意做了个来回，有人用材料换回了金币。',
  'herb-grove:aid_hero': '药草丛里的光被人采走了，最虚弱的同伴因此得救。',
  'herb-grove:scavenge': '药草被整丛拔走，惊动的孢兽在林中留下了痕迹。',
  'echo-trap:recover': '回声陷阱前，队伍用镇定剂压住了符文石地的声响。',
  'echo-trap:track': '有人冒险穿过了回声陷阱，带回了额外的金币。',
};
// 兜底：按选择效果泛化生成。当前内容中 choiceId 与 effect 同名（recover/scavenge/track/...），
// 未来新增事件即使未录入精确文案，也能退回到可读的泛化句。
const effectNewsMentions: Record<string, string> = {
  recover: '远征队在途中停下休整，恢复了状态。',
  scavenge: '有人冒险翻找了遗迹的遗物，带回了一些材料。',
  track: '队伍循着痕迹探查，找到了被遗落的价值。',
  aid_hero: '队伍小心照料了最虚弱的同伴。',
  bargain: '队伍与游商做了一笔交易。',
  risk_fight: '队伍惊动了藏匿的生物，经历了一场额外的战斗。',
};

// 把最近一次远征的选择事实转成一句可拼接的新闻引用；无可引用事实时返回 null。
// 优先级：撤退（最重大）> 精确 eventId:choiceId > effect 泛化。
export function choiceNewsMention(last: LastExpedition): string | null {
  if (!last) return null;
  if (last.outcome === 'retreat') {
    const nodeTitle = last.missionId ? nodesForMission(last.missionId)[last.nodeReached ?? 0]?.title : undefined;
    return nodeTitle
      ? `队伍在「${nodeTitle}」提前撤回，路线图被重新标注了一遍。`
      : '队伍在远征途中提前撤回，路线图被重新标注了一遍。';
  }
  for (const key of last.choices) {
    const exact = choiceNewsMentions[key];
    if (exact) return exact;
  }
  for (const key of last.choices) {
    const choiceId = key.split(':')[1];
    const fallback = choiceId ? effectNewsMentions[choiceId] : undefined;
    if (fallback) return fallback;
  }
  return null;
}

// ── 结算页「队员反应」氛围引子（M4 打磨 3，本地模板，离线可用）────────────────────────
// 逐角色台词仍直接使用 heroes.json 的 reactions（victory/retreat/defeated），
// 这里只提供结算页顶部的"队伍氛围"引子：优先引用本次远征的选择事实，未命中回退 default。
const settlementReactions: Record<SettlementState['outcome'], Record<string, string>> = {
  victory: {
    default: '远征告一段落，收获被一件件清点入库。',
    'supply-room:scavenge': '有人翻开了尘封的箱柜，战利品里多了些说不清来路的材料。',
    'old-campfire:track': '循着旧日痕迹的发现，成了归途上最热的话题。',
    'collapsed-passage:risk_fight': '清开碎石的那一战，让队伍身上多了几道新的伤疤。',
    'herb-grove:aid_hero': '药草的微光救回了最虚弱的同伴，队伍的士气高了几分。',
    'echo-trap:track': '冒险穿过回声陷阱的收获，比预想中更沉。',
  },
  retreat: {
    default: '队伍提前撤回了城镇，路线图被重新标注了一遍。',
    'supply-room:scavenge': '带着翻找来的材料撤退，大家心里都有些不是滋味。',
    'old-campfire:track': '循迹的收获没能支撑队伍走得更远，撤回来时天色已晚。',
  },
  defeated: {
    default: '队伍力竭而归，宿舍的灯一夜未熄。',
    'collapsed-passage:risk_fight': '清路惊动的生物超出了预期，队伍在撤退路上力竭。',
    'echo-trap:track': '冒险穿过回声陷阱的代价，比预想中更沉重。',
    'herb-grove:scavenge': '整丛拔走的药草没能挽回局面，孢兽的痕迹还留在林间。',
  },
};

// 结算页氛围引子：按 outcome + lastExpedition 生成。
// 优先级：撤退引用撤退位置（如「回声长廊」）> 精确命中选择事实 > outcome 默认。
export function settlementReactionLine(last: LastExpedition | undefined, outcome: SettlementState['outcome']): string {
  const table = settlementReactions[outcome];
  const choices = last?.choices ?? [];
  if (outcome === 'retreat' && last?.missionId) {
    const nodeTitle = nodesForMission(last.missionId)[last.nodeReached ?? 0]?.title;
    if (nodeTitle) return `队伍在「${nodeTitle}」选择撤退，路线图被重新标注了一遍。`;
  }
  for (const key of choices) {
    const line = table[key];
    if (line) return line;
  }
  return table.default;
}
// 装备打造配方。产物均沿用 itemDefinitions 中的装备，材料+金币消耗后装备入背包。
// 配方表后续可继续追加，逻辑不写死数量。
export const craftingRecipes: CraftingRecipe[] = rawRecipes as CraftingRecipe[];

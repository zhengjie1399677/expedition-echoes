import type { CraftingRecipe, Enemy, ExpeditionNode, Hero, HeroClass, ItemDefinition, MaterialType, Mission, Rarity, Region, SkillDefinition } from '../domain/model';

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
// 中央广场集市的固定售价。只有这里列出的装备、饰品与礼物可以直接购买。
export const marketPrices: Record<string, number> = {
  'vanguard-spear': 36, 'ranger-bow': 36, 'star-staff': 40,
  'field-mail': 42, 'warded-coat': 38, 'echo-charm': 32,
  wildflower: 5, ale: 8, 'old-book': 15, charm: 40,
  'fire-bomb': 15, 'shield-elixir': 18,
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
  { id: 'border-ruins', name: '边境遗迹', threat: 2, description: '遗迹道路的异响正在影响商路，封印门厅传来连续回声。', missions: ['border-echoes', 'sealed-gate'] },
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
export interface EventChainNode {
  id: string;
  label: string;            // 节点名（供 UI/日志）
  condition?: { regionId?: string; minThreat?: number }; // 推进前置（可选）
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
      { id: 'quest-open', label: '前置任务开放' },
      { id: 'quest-complete', label: '前置任务完成', condition: { regionId: 'border-ruins', minThreat: 1 } },
      { id: 'followup-open', label: '后续事件开放' },
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

// 每日新闻本地模板：按昨日结果 + 区域威胁生成（LLM 增强前的基础版本，离线完整可玩）。
export interface DailyNewsTemplate {
  outcome: 'victory' | 'retreat' | 'defeated';
  threat0: string;
  threat1: string;
  threat2: string;
  threat3: string;
}
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
// 装备打造配方。产物均沿用 itemDefinitions 中的装备，材料+金币消耗后装备入背包。
// 配方表后续可继续追加，逻辑不写死数量。
export const craftingRecipes: CraftingRecipe[] = rawRecipes as CraftingRecipe[];

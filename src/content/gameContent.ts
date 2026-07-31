import type { CraftingRecipe, Enemy, ExpeditionNode, Hero, HeroClass, ItemDefinition, MaterialType, Mission, Rarity, SkillDefinition } from '../domain/model';

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
export const rarityNames: Record<Rarity, string> = { 0: '普通', 1: '精良', 2: '稀有', 3: '史诗', 4: '传说' };
export const rarityColors: Record<Rarity, string> = { 0: '#cbd5e1', 1: '#4ade80', 2: '#60a5fa', 3: '#c084fc', 4: '#fbbf24' };
// 材料类型表。当前两种，后续可直接追加，无需改动逻辑。
export const materialTypes: MaterialType[] = [
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
    effect: { type: 'morale_recovery', value: 8 }
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
    effect: { type: 'morale_recovery', value: 6 }
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
  { kind: 'event', title: '废弃补给室', description: '封存药箱仍可使用，但深处也有未被触碰的箱柜。', event: { id: 'supply-room', prompt: '队伍在补给室停下。是先照料彼此，还是冒着不安的气息翻找遗物？', choices: [
    { id: 'recover', label: '整理伤口', description: '全队恢复生命并平复士气。', effect: 'recover' },
    { id: 'scavenge', label: '翻找药箱', description: '获得一枚遗迹碎片，但全队士气上升。', effect: 'scavenge' },
  ] } },
  { kind: 'combat', title: '回声长廊', description: '锈甲守卫从墙后缓慢起身。', enemyIds: ['warden', 'scout'] },
  { kind: 'event', title: '旧日营火', description: '熄灭的营火旁留着新鲜的足迹，通向另一条阴影小径。', event: { id: 'old-campfire', prompt: '短暂安全并不意味着没有选择。队长决定让队伍休整，还是循着痕迹确认前方风险？', choices: [
    { id: 'recover', label: '围火休整', description: '全队恢复生命并平复士气。', effect: 'recover' },
    { id: 'track', label: '循迹探查', description: '带回额外金币，但全队士气上升。', effect: 'track' },
  ] } },
  { kind: 'combat', title: '封印门厅', description: '门卫挡在出口前，这是最后一战。', enemyIds: ['gatekeeper', 'warden', 'scout'] },
] as const;
export const forestExpeditionNodes: ExpeditionNode[] = [
  { kind: 'combat', title: '林缘古道', description: '灰色兽影从阳光与树影之间逼近。', background: '/assets/world/forest-v1/forest-road-v1.png', enemyIds: ['ash-wolf', 'ash-wolf'] },
  { kind: 'event', title: '临时营地', description: '火光尚暖，岔路在暮色中伸向不同方向。', background: '/assets/world/forest-v1/forest-camp-v1.png', event: { id: 'supply-room', prompt: '队伍在林间营地停下。先检查伤势，还是搜索周围的孢子痕迹？', choices: [
    { id: 'recover', label: '围火休整', description: '全队恢复生命并平复压力。', effect: 'recover' },
    { id: 'scavenge', label: '搜索孢子', description: '获得材料，但全队压力上升。', effect: 'scavenge' },
  ] } },
  { kind: 'combat', title: '孢子林径', description: '菌盖与岩甲在幽暗林径中同时活动。', background: '/assets/world/forest-v1/forest-road-v1.png', enemyIds: ['spore-beast', 'rock-lizard', 'thorn-stag'] },
  { kind: 'event', title: '暮色营火', description: '圣所就在前方，最后一次整备机会已经到来。', background: '/assets/world/forest-v1/forest-camp-v1.png', event: { id: 'old-campfire', prompt: '队伍听见古树深处的沉重回响。休整，还是先观察守卫的行动？', choices: [
    { id: 'recover', label: '安静休整', description: '全队恢复生命并平复压力。', effect: 'recover' },
    { id: 'track', label: '侦察圣所', description: '获得额外金币，但全队压力上升。', effect: 'track' },
  ] } },
  { kind: 'combat', title: '古树圣所', description: '古树守卫从根系王座前苏醒。', background: '/assets/world/forest-v1/grove-sanctuary-v1.png', enemyIds: ['grove-guardian'] },
] as const;
export const nodesForMission = (missionId: string): readonly ExpeditionNode[] => missionId === 'forest-disturbance' ? forestExpeditionNodes : expeditionNodes;
// 装备打造配方。产物均沿用 itemDefinitions 中的装备，材料+金币消耗后装备入背包。
// 配方表后续可继续追加，逻辑不写死数量。
export const craftingRecipes: CraftingRecipe[] = rawRecipes as CraftingRecipe[];

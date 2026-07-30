import type { CraftingRecipe, Enemy, ExpeditionNode, Hero, HeroClass, ItemDefinition, MaterialType, Mission, Rarity } from '../domain/model';

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
export const initialHeroes: Hero[] = [
  { id: 'lan', name: '岚', heroClass: 'vanguard', maxHp: 32, hp: 32, morale: 0, gearLevel: 0, level: 1, experience: 0, equipment: {}, recruited: true, personality: '寡言克制的前哨守卫，把每次冒险都当作必须平安带人回来的职责', affinity: 0, preferredGiftTags: ['文化', '贵重'] },
  { id: 'wu', name: '雾', heroClass: 'ranger', maxHp: 24, hp: 24, morale: 0, gearLevel: 0, level: 1, experience: 0, equipment: {}, recruited: true, personality: '爱开玩笑的游侠，总能先找到退路；真正紧张时反而说得更多', affinity: 0, preferredGiftTags: ['饮食', '自然'] },
  { id: 'xingluo', name: '星罗', heroClass: 'mage', maxHp: 19, hp: 19, morale: 0, gearLevel: 0, level: 1, experience: 0, equipment: {}, recruited: true, personality: '从星辉塔跑出来的年轻术士，把危险遗迹当成难得的研究现场', affinity: 0, preferredGiftTags: ['神秘', '自然'] },
  { id: 'cheng', name: '澄', heroClass: 'medic', maxHp: 25, hp: 25, morale: 0, gearLevel: 0, level: 1, experience: 0, equipment: {}, recruited: false, personality: '温和克制，留意每个人的状态', affinity: 0, preferredGiftTags: ['文化', '自然'] },
  { id: 'yan', name: '砚', heroClass: 'vanguard', maxHp: 35, hp: 35, morale: 0, gearLevel: 0, level: 1, experience: 0, equipment: {}, recruited: false, personality: '沉默强硬，把承诺看得比报酬重要', affinity: 0, preferredGiftTags: ['饮食', '贵重'] },
];
export const itemDefinitions: ItemDefinition[] = [
  { id: 'bandage', name: '绷带', kind: 'consumable', description: '远征时恢复 9 点生命。' },
  { id: 'sedative', name: '镇定剂', kind: 'consumable', description: '远征时降低 25 点士气压力。' },
  { id: 'vanguard-spear', name: '守望长枪', kind: 'equipment', slot: 'weapon', description: '先锋制式长枪。', attack: 2, allowedClasses: ['vanguard'] },
  { id: 'ranger-bow', name: '白榆猎弓', kind: 'equipment', slot: 'weapon', description: '轻巧而稳定的远射武器。', attack: 2, allowedClasses: ['ranger'] },
  { id: 'star-staff', name: '星辉法杖', kind: 'equipment', slot: 'weapon', description: '引导星术的晶石法杖。', attack: 2, allowedClasses: ['mage'] },
  { id: 'field-mail', name: '远征锁甲', kind: 'equipment', slot: 'armor', description: '抵消 1 点受到的伤害。', defense: 1 },
  { id: 'warded-coat', name: '刻印旅行衣', kind: 'equipment', slot: 'armor', description: '轻便且带有防护刻印。', defense: 1 },
  { id: 'echo-charm', name: '回声护符', kind: 'equipment', slot: 'accessory', description: '微弱增幅持有者的攻击。', attack: 1 },
];

// 装备查询的 O(1) 索引：避免 combat/economy 等处反复 itemDefinitions.find。
export const itemById: ReadonlyMap<string, ItemDefinition> = new Map(itemDefinitions.map((item) => [item.id, item]));
export const initialInventory: Record<string, number> = {
  bandage: 5, sedative: 2, 'vanguard-spear': 1, 'ranger-bow': 1, 'star-staff': 1,
  'field-mail': 1, 'warded-coat': 1, 'echo-charm': 1,
  wildflower: 2, ale: 1, 'old-book': 1,
};
export const enemies: Enemy[] = [
  { id: 'scout', name: '遗迹斥候', maxHp: 26, hp: 26, distance: 1, attackMinRange: 2, attackMaxRange: 3, damage: 4,
    drops: [
      { typeId: 'ruin-shard', rarity: 0, chance: 0.6 },
      { typeId: 'ruin-shard', rarity: 1, chance: 0.15 },
    ] },
  { id: 'warden', name: '锈甲守卫', maxHp: 34, hp: 34, distance: 1, attackMinRange: 1, attackMaxRange: 1, damage: 5,
    drops: [
      { typeId: 'rust-iron', rarity: 0, chance: 0.65 },
      { typeId: 'rust-iron', rarity: 1, chance: 0.18 },
    ] },
  { id: 'gatekeeper', name: '遗迹门卫', maxHp: 46, hp: 46, distance: 1, attackMinRange: 1, attackMaxRange: 2, damage: 7,
    drops: [
      { typeId: 'rust-iron', rarity: 1, chance: 0.5 },
      { typeId: 'ruin-shard', rarity: 1, chance: 0.35 },
    ] },
];
export const missions: Mission[] = [
  { id: 'border-echoes', title: '边境回声', summary: '调查遗迹道路上的异常脚步，并确认封印门厅是否安全。', difficulty: 1, reward: 45, enemyWaves: { 0: ['scout', 'warden'], 2: ['warden', 'scout'], 4: ['gatekeeper', 'warden', 'scout'] },
    materialRewards: [{ typeId: 'ruin-shard', rarity: 0, count: 2 }] },
  { id: 'rusted-patrol', title: '锈甲巡逻队', summary: '一支失控的守卫队正在截断商路，需要正面突破。', difficulty: 2, reward: 62, enemyWaves: { 0: ['warden', 'scout'], 2: ['scout', 'warden'], 4: ['gatekeeper', 'warden'] },
    materialRewards: [{ typeId: 'rust-iron', rarity: 1, count: 1 }, { typeId: 'ruin-shard', rarity: 1, count: 1 }] },
  { id: 'sealed-gate', title: '封门异响', summary: '封印深处传来连续回声，公会要求带回完整调查记录。', difficulty: 3, reward: 84, enemyWaves: { 0: ['scout', 'warden'], 2: ['gatekeeper', 'scout', 'warden'], 4: ['gatekeeper', 'warden', 'scout'] },
    materialRewards: [{ typeId: 'ruin-shard', rarity: 2, count: 1 }, { typeId: 'rust-iron', rarity: 1, count: 2 }] },
];
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
// 装备打造配方。产物均沿用 itemDefinitions 中的装备，材料+金币消耗后装备入背包。
// 配方表后续可继续追加，逻辑不写死数量。
export const craftingRecipes: CraftingRecipe[] = [
  { id: 'craft-spear', resultItemId: 'vanguard-spear', goldCost: 20, materials: [{ typeId: 'ruin-shard', rarity: 0, count: 3 }, { typeId: 'rust-iron', rarity: 0, count: 2 }] },
  { id: 'craft-bow', resultItemId: 'ranger-bow', goldCost: 20, materials: [{ typeId: 'ruin-shard', rarity: 0, count: 3 }, { typeId: 'rust-iron', rarity: 1, count: 1 }] },
  { id: 'craft-staff', resultItemId: 'star-staff', goldCost: 25, materials: [{ typeId: 'ruin-shard', rarity: 1, count: 2 }, { typeId: 'rust-iron', rarity: 0, count: 3 }] },
  { id: 'craft-mail', resultItemId: 'field-mail', goldCost: 30, materials: [{ typeId: 'rust-iron', rarity: 1, count: 3 }, { typeId: 'ruin-shard', rarity: 0, count: 2 }] },
  { id: 'craft-coat', resultItemId: 'warded-coat', goldCost: 25, materials: [{ typeId: 'rust-iron', rarity: 0, count: 4 }, { typeId: 'ruin-shard', rarity: 1, count: 1 }] },
  { id: 'craft-charm', resultItemId: 'echo-charm', goldCost: 35, materials: [{ typeId: 'ruin-shard', rarity: 1, count: 3 }, { typeId: 'rust-iron', rarity: 1, count: 1 }] },
];

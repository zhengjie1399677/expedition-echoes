import type { Enemy, Hero, HeroClass, ItemDefinition, Mission } from '../domain/model';

export const heroClassNames: Record<HeroClass, string> = { vanguard: '先锋', ranger: '游侠', mage: '术士', medic: '医师' };
export const heroClassDescriptions: Record<HeroClass, string> = {
  vanguard: '攻击距离 1，生命与防护较高', ranger: '攻击距离 1–2，输出稳定',
  mage: '攻击距离 2–3，无法攻击贴身敌人', medic: '攻击距离 1–2，擅长恢复',
};
export const baseAttack: Record<HeroClass, number> = { vanguard: 7, ranger: 6, mage: 8, medic: 3 };
export const initialHeroes: Hero[] = [
  { id: 'lan', name: '岚', heroClass: 'vanguard', maxHp: 32, hp: 32, morale: 0, gearLevel: 0, level: 1, experience: 0, equipment: {}, recruited: true, personality: '谨慎可靠，不喜欢无谓冒险' },
  { id: 'wu', name: '雾', heroClass: 'ranger', maxHp: 24, hp: 24, morale: 0, gearLevel: 0, level: 1, experience: 0, equipment: {}, recruited: true, personality: '敏锐健谈，总能先发现退路' },
  { id: 'xingluo', name: '星罗', heroClass: 'mage', maxHp: 19, hp: 19, morale: 0, gearLevel: 0, level: 1, experience: 0, equipment: {}, recruited: true, personality: '面对未知时格外兴奋' },
  { id: 'cheng', name: '澄', heroClass: 'medic', maxHp: 25, hp: 25, morale: 0, gearLevel: 0, level: 1, experience: 0, equipment: {}, recruited: false, personality: '温和克制，留意每个人的状态' },
  { id: 'yan', name: '砚', heroClass: 'vanguard', maxHp: 35, hp: 35, morale: 0, gearLevel: 0, level: 1, experience: 0, equipment: {}, recruited: false, personality: '沉默强硬，把承诺看得比报酬重要' },
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
export const initialInventory: Record<string, number> = {
  bandage: 5, sedative: 2, 'vanguard-spear': 1, 'ranger-bow': 1, 'star-staff': 1,
  'field-mail': 1, 'warded-coat': 1, 'echo-charm': 1,
};
export const enemies: Enemy[] = [
  { id: 'scout', name: '遗迹斥候', maxHp: 26, hp: 26, distance: 1, attackMinRange: 2, attackMaxRange: 3, damage: 4 },
  { id: 'warden', name: '锈甲守卫', maxHp: 34, hp: 34, distance: 1, attackMinRange: 1, attackMaxRange: 1, damage: 5 },
  { id: 'gatekeeper', name: '遗迹门卫', maxHp: 46, hp: 46, distance: 1, attackMinRange: 1, attackMaxRange: 2, damage: 7 },
];
export const missions: Mission[] = [
  { id: 'border-echoes', title: '边境回声', summary: '调查遗迹道路上的异常脚步，并确认封印门厅是否安全。', difficulty: 1, reward: 45, enemyWaves: { 0: ['scout', 'warden'], 2: ['warden', 'scout'], 4: ['gatekeeper', 'warden', 'scout'] } },
  { id: 'rusted-patrol', title: '锈甲巡逻队', summary: '一支失控的守卫队正在截断商路，需要正面突破。', difficulty: 2, reward: 62, enemyWaves: { 0: ['warden', 'scout'], 2: ['scout', 'warden'], 4: ['gatekeeper', 'warden'] } },
  { id: 'sealed-gate', title: '封门异响', summary: '封印深处传来连续回声，公会要求带回完整调查记录。', difficulty: 3, reward: 84, enemyWaves: { 0: ['scout', 'warden'], 2: ['gatekeeper', 'scout', 'warden'], 4: ['gatekeeper', 'warden', 'scout'] } },
];
export const expeditionNodes = [
  { kind: 'combat', title: '坍塌入口', description: '碎石之间传来急促脚步。', enemyIds: ['scout', 'warden'] },
  { kind: 'rest', title: '废弃补给室', description: '封存药箱仍可使用，全队恢复生命与士气。' },
  { kind: 'combat', title: '回声长廊', description: '锈甲守卫从墙后缓慢起身。', enemyIds: ['warden', 'scout'] },
  { kind: 'rest', title: '旧日营火', description: '这里短暂安全，队伍重新整理呼吸。' },
  { kind: 'combat', title: '封印门厅', description: '门卫挡在出口前，这是最后一战。', enemyIds: ['gatekeeper', 'warden', 'scout'] },
] as const;

import type { Enemy, Hero, HeroClass } from '../domain/model';

export const heroClassNames: Record<HeroClass, string> = { vanguard: '先锋', ranger: '游侠', mage: '术士', medic: '医师' };
export const heroClassDescriptions: Record<HeroClass, string> = {
  vanguard: '攻击距离 1，生命与防护较高', ranger: '攻击距离 1–2，输出稳定',
  mage: '攻击距离 2–3，无法攻击贴身敌人', medic: '攻击距离 1–2，擅长恢复',
};
export const baseAttack: Record<HeroClass, number> = { vanguard: 7, ranger: 6, mage: 8, medic: 3 };
export const initialHeroes: Hero[] = [
  { id: 'lan', name: '岚', heroClass: 'vanguard', maxHp: 32, hp: 32, morale: 0, gearLevel: 0, recruited: true, personality: '谨慎可靠，不喜欢无谓冒险' },
  { id: 'wu', name: '雾', heroClass: 'ranger', maxHp: 24, hp: 24, morale: 0, gearLevel: 0, recruited: true, personality: '敏锐健谈，总能先发现退路' },
  { id: 'xingluo', name: '星罗', heroClass: 'mage', maxHp: 19, hp: 19, morale: 0, gearLevel: 0, recruited: true, personality: '面对未知时格外兴奋' },
  { id: 'cheng', name: '澄', heroClass: 'medic', maxHp: 25, hp: 25, morale: 0, gearLevel: 0, recruited: false, personality: '温和克制，留意每个人的状态' },
  { id: 'yan', name: '砚', heroClass: 'vanguard', maxHp: 35, hp: 35, morale: 0, gearLevel: 0, recruited: false, personality: '沉默强硬，把承诺看得比报酬重要' },
];
export const enemies: Enemy[] = [
  { id: 'scout', name: '遗迹斥候', maxHp: 26, hp: 26, distance: 1, attackMinRange: 2, attackMaxRange: 3, damage: 4 },
  { id: 'warden', name: '锈甲守卫', maxHp: 34, hp: 34, distance: 1, attackMinRange: 1, attackMaxRange: 1, damage: 5 },
  { id: 'gatekeeper', name: '遗迹门卫', maxHp: 46, hp: 46, distance: 1, attackMinRange: 1, attackMaxRange: 2, damage: 7 },
];
export const expeditionNodes = [
  { kind: 'combat', title: '坍塌入口', description: '碎石之间传来急促脚步。', enemyIds: ['scout', 'warden'] },
  { kind: 'rest', title: '废弃补给室', description: '封存药箱仍可使用，全队恢复生命与士气。' },
  { kind: 'combat', title: '回声长廊', description: '锈甲守卫从墙后缓慢起身。', enemyIds: ['warden', 'scout'] },
  { kind: 'rest', title: '旧日营火', description: '这里短暂安全，队伍重新整理呼吸。' },
  { kind: 'combat', title: '封印门厅', description: '门卫挡在出口前，这是最后一战。', enemyIds: ['gatekeeper', 'warden', 'scout'] },
] as const;

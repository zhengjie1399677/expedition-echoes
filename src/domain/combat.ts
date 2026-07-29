import { baseAttack, itemDefinitions } from '../content/gameContent';
import type { Enemy, GameAction, GameState, Hero } from './model';
import { addLog, editHero } from './shared';
import { addMaterials, describeMaterial, rollDrops } from './economy';

export const experienceToNextLevel = (level: number): number => 15 + Math.max(1, level) * 15;
export const enemyExperienceReward = (enemy: Enemy): number => 8 + Math.ceil(enemy.maxHp / 8);

export function gainExperience(hero: Hero, amount: number): Hero {
  let level = Math.max(1, hero.level);
  let experience = Math.max(0, hero.experience) + Math.max(0, amount);
  let levelsGained = 0;
  while (experience >= experienceToNextLevel(level)) {
    experience -= experienceToNextLevel(level);
    level += 1;
    levelsGained += 1;
  }
  if (levelsGained === 0) return { ...hero, level, experience };
  const healthGain = levelsGained * 3;
  return { ...hero, level, experience, maxHp: hero.maxHp + healthGain, hp: Math.min(hero.maxHp + healthGain, hero.hp + healthGain) };
}

export function equipmentBonuses(hero: Hero): { attack: number; defense: number } {
  return Object.values(hero.equipment).reduce((bonuses, itemId) => {
    const item = itemDefinitions.find((candidate) => candidate.id === itemId);
    return { attack: bonuses.attack + (item?.attack ?? 0), defense: bonuses.defense + (item?.defense ?? 0) };
  }, { attack: 0, defense: 0 });
}

export function availableItemCount(state: GameState, itemId: string): number {
  const equippedCount = state.roster.filter((hero) => Object.values(hero.equipment).includes(itemId)).length;
  return Math.max(0, (state.inventory[itemId] ?? 0) - equippedCount);
}

export function canAttack(hero: Hero, enemy: Enemy, formationIndex = 0): boolean {
  if (hero.hp <= 0 || enemy.hp <= 0) return false;
  const targetDistance = enemy.distance + formationIndex;
  if (hero.heroClass === 'vanguard') return targetDistance === 1;
  if (hero.heroClass === 'mage') return targetDistance >= 2 && targetDistance <= 3;
  return targetDistance >= 1 && targetDistance <= 2;
}

export function attackDamage(hero: Hero, moraleEnabled: boolean, hunger = 0): number {
  return Math.max(1, baseAttack[hero.heroClass] + hero.gearLevel + Math.max(0, hero.level - 1) + equipmentBonuses(hero).attack - (moraleEnabled && hero.morale >= 50 ? 2 : 0) - hunger);
}

export function enemyCanAttack(enemy: Enemy, formationIndex: number): boolean {
  const targetDistance = enemy.distance + formationIndex;
  return targetDistance >= enemy.attackMinRange && targetDistance <= enemy.attackMaxRange;
}

export function combatReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'ATTACK': {
      if (!state.expedition?.enemies.some((enemy) => enemy.hp > 0)) return state;
      const hero = state.roster.find((item) => item.id === action.heroId);
      const enemy = state.expedition.enemies.find((item) => item.id === action.enemyId && item.hp > 0) ?? state.expedition.enemies.find((item) => item.hp > 0)!;
      const heroIndex = state.expedition.formation.indexOf(action.heroId);
      const targetDistance = enemy.distance + Math.max(0, heroIndex);
      if (!hero || heroIndex < 0 || !canAttack(hero, enemy, heroIndex)) return addLog(state, `${hero?.name ?? '队员'}无法攻击距离 ${targetDistance} 的目标。`);
      const damage = attackDamage(hero, state.settings.moraleEnabled, state.hunger);
      const nextEnemy = { ...enemy, hp: Math.max(0, enemy.hp - damage) };
      let next: GameState = { ...state, expedition: { ...state.expedition, enemies: state.expedition.enemies.map((item) => item.id === enemy.id ? nextEnemy : item) } };
      const defeatedEnemy = enemy.hp > 0 && nextEnemy.hp === 0;
      const experienceReward = defeatedEnemy ? enemyExperienceReward(enemy) : 0;
      const previousLevels = new Map(next.roster.map((item) => [item.id, item.level]));
      if (experienceReward > 0) {
        const formation = new Set(next.expedition!.formation);
        next = { ...next, roster: next.roster.map((item) => formation.has(item.id) ? gainExperience(item, experienceReward) : item) };
      }
      const leveledHeroes = next.roster.filter((item) => item.level > (previousLevels.get(item.id) ?? item.level)).map((item) => `${item.name}升至 ${item.level} 级`);
      const experienceLog = defeatedEnemy ? `全队获得 ${experienceReward} 经验${leveledHeroes.length > 0 ? `，${leveledHeroes.join('、')}` : ''}。` : '';
      const defeatedAll = next.expedition!.enemies.every((item) => item.hp <= 0);
      if (defeatedAll) {
        const drops = rollDrops(state.expedition.enemies);
        const materials = addMaterials(next.materials, drops);
        const dropLine = drops.length ? `，捡起 ${drops.map((d) => describeMaterial(d.typeId, d.rarity)).join('、')}` : '';
        return addLog({ ...next, gold: next.gold + 12 * state.expedition.enemies.length, materials }, `${hero.name}结束了战斗，队伍获得战利品${dropLine}。${experienceLog}`);
      }
      for (const attacker of next.expedition!.enemies.filter((item) => item.hp > 0)) {
        const targetIndex = next.expedition!.formation.findIndex((id, index) => next.roster.find((item) => item.id === id)!.hp > 0 && enemyCanAttack(attacker, index));
        if (targetIndex < 0) continue;
        const targetId = next.expedition!.formation[targetIndex];
        next = editHero(next, targetId, (target) => ({ ...target, hp: Math.max(0, target.hp - Math.max(1, attacker.damage - equipmentBonuses(target).defense)), morale: state.settings.moraleEnabled ? Math.min(100, target.morale + 11) : target.morale }));
      }
      return addLog(next, `${hero.name}对${enemy.name}造成 ${damage} 点伤害。${experienceLog}存活敌人随后进行了反击。`);
    }
    default: return state;
  }
}

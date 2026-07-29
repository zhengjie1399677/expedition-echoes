import { baseAttack, itemDefinitions } from '../content/gameContent';
import type { Enemy, GameAction, GameState, Hero, SettlementState } from './model';
import { addLog, editHero, returnExpeditionSupplies } from './shared';
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
  
  // 游侠/斥候（锐眼）：处于后排（站位 index > 0）时，可攻击任意距离的存活敌人
  if (hero.heroClass === 'ranger' && formationIndex > 0) return true;
  
  const targetDistance = enemy.distance + formationIndex;
  if (hero.heroClass === 'vanguard') return targetDistance === 1;
  if (hero.heroClass === 'mage') return targetDistance >= 2 && targetDistance <= 3;
  return targetDistance >= 1 && targetDistance <= 2;
}

export function attackDamage(hero: Hero, moraleEnabled: boolean, hunger = 0, formationIndex = 0, party: Hero[] = []): number {
  let damage = baseAttack[hero.heroClass] + hero.gearLevel + Math.max(0, hero.level - 1) + equipmentBonuses(hero).attack - (moraleEnabled && hero.morale >= 50 ? 2 : 0) - hunger;

  // 职业被动加成 (Class Passive Bonuses)
  if (hero.heroClass === 'ranger') {
    // 游侠/斥候在后排时（index > 0），伤害 +2
    if (formationIndex > 0) {
      damage += 2;
    }
  } else if (hero.heroClass === 'mage') {
    // 术士相邻位置有存活队友时伤害 +2，孤立无援时伤害 -1
    const hasNeighbor = party.some((teammate, idx) => {
      if (teammate.id === hero.id || teammate.hp <= 0) return false;
      return Math.abs(idx - formationIndex) === 1;
    });
    if (hasNeighbor) {
      damage += 2;
    } else {
      damage -= 1;
    }
  }

  return Math.max(1, damage);
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
      
      const party = state.expedition.formation.map(id => state.roster.find(h => h.id === id)!).filter(Boolean);
      const damage = attackDamage(hero, state.settings.moraleEnabled, state.hunger, heroIndex, party);
      const nextEnemy = { ...enemy, hp: Math.max(0, enemy.hp - damage) };
      let next: GameState = { ...state, expedition: { ...state.expedition, enemies: state.expedition.enemies.map((item) => item.id === enemy.id ? nextEnemy : item) } };
      
      const defeatedEnemy = enemy.hp > 0 && nextEnemy.hp === 0;
      const experienceReward = defeatedEnemy ? enemyExperienceReward(enemy) : 0;
      const previousLevels = new Map(next.roster.map((item) => [item.id, item.level]));
      if (experienceReward > 0) {
        const formation = new Set(next.expedition!.formation);
        next = {
          ...next,
          roster: next.roster.map((item) => formation.has(item.id) ? gainExperience(item, experienceReward) : item),
          expedition: {
            ...next.expedition!,
            gainedExperience: next.expedition!.gainedExperience + experienceReward
          }
        };
      }
      const leveledHeroes = next.roster.filter((item) => item.level > (previousLevels.get(item.id) ?? item.level)).map((item) => `${item.name}升至 ${item.level} 级`);
      const experienceLog = defeatedEnemy ? `全队获得 ${experienceReward} 经验${leveledHeroes.length > 0 ? `，${leveledHeroes.join('、')}` : ''}。` : '';
      
      // Check if all enemies are defeated immediately after player's attack
      const defeatedAll = next.expedition!.enemies.every((item) => item.hp <= 0);
      if (defeatedAll) {
        const drops = rollDrops(state.expedition.enemies);
        
        // 战利品存入 expedition 待结算 (Store drops to expedition temporarily)
        const nextExpedition = {
          ...next.expedition!,
          gainedGold: next.expedition!.gainedGold + 12 * state.expedition.enemies.length,
          gainedMaterials: addMaterials(next.expedition!.gainedMaterials, drops)
        };
        next = { ...next, expedition: nextExpedition };
        
        const dropLine = drops.length ? `，拾获战利品 ${drops.map((d) => describeMaterial(d.typeId, d.rarity)).join('、')}` : '';
        return addLog(next, `${hero.name}击败了敌人。${experienceLog}战斗结束，队伍获得战利品${dropLine}。`);
      }
      
      let logMsg = `${hero.name}对${enemy.name}造成 ${damage} 点伤害。${experienceLog}`;
      
      // Surviving enemies counterattack
      const survivingAttackers = next.expedition!.enemies.filter((item) => item.hp > 0);
      if (survivingAttackers.length > 0) {
        logMsg += '存活敌人随后进行了反击。';
        for (const attacker of survivingAttackers) {
          const targetIndex = next.expedition!.formation.findIndex(
            (id, index) => next.roster.find((item) => item.id === id)!.hp > 0 && enemyCanAttack(attacker, index)
          );
          if (targetIndex < 0) continue;
          const targetId = next.expedition!.formation[targetIndex];
          
          next = editHero(next, targetId, (target) => {
            const isVanguard = target.heroClass === 'vanguard';
            const isFrontRow = targetIndex === 0;
            const damageRed = (isVanguard && isFrontRow) ? 1 : 0;
            const incomingDmg = Math.max(1, attacker.damage - equipmentBonuses(target).defense - damageRed);
            return {
              ...target,
              hp: Math.max(0, target.hp - incomingDmg),
              morale: state.settings.moraleEnabled ? Math.min(100, target.morale + 11) : target.morale
            };
          });
          
          // Vanguard counterattack passive trigger
          const targetHeroAfter = next.roster.find((h) => h.id === targetId)!;
          if (targetHeroAfter.heroClass === 'vanguard' && targetIndex === 0 && (attacker.distance + targetIndex === 1)) {
            next = {
              ...next,
              expedition: {
                ...next.expedition!,
                enemies: next.expedition!.enemies.map((e) => {
                  if (e.id === attacker.id) {
                    return { ...e, hp: Math.max(0, e.hp - 2) };
                  }
                  return e;
                })
              }
            };
            next = addLog(next, `先锋${targetHeroAfter.name}触发「坚守」进行了贴身反击，对${attacker.name}造成 2 点反制伤害。`);
          }
        }
      }
      
      // Check if all heroes are defeated
      const allHeroesDefeated = next.expedition!.formation.every(
        (id) => next.roster.find((item) => item.id === id)!.hp <= 0
      );
      if (allHeroesDefeated) {
        const consumed = {
          food: next.expedition!.startSupplies.food - next.expedition!.supplies.food,
          bandage: next.expedition!.startSupplies.bandage - next.expedition!.supplies.bandage,
          sedative: next.expedition!.startSupplies.sedative - next.expedition!.supplies.sedative
        };
        const settlement: SettlementState = {
          outcome: 'defeated',
          consumedSupplies: consumed,
          lootGold: 0,
          lootMaterials: {},
          gainedExperience: next.expedition!.gainedExperience
        };
        const returned = returnExpeditionSupplies(next);
        return addLog(
          {
            ...returned,
            page: 'settlement',
            settlement,
            expedition: null,
            hasAcceptedMission: false
          },
          '队伍全体力竭，远征失败！'
        );
      }
      
      // Check if the Vanguard counter-attack killed the last enemy
      const defeatedAllAfterCounter = next.expedition!.enemies.every((item) => item.hp <= 0);
      if (defeatedAllAfterCounter) {
        const drops = rollDrops(state.expedition.enemies);
        const nextExpedition = {
          ...next.expedition!,
          gainedGold: next.expedition!.gainedGold + 12 * state.expedition.enemies.length,
          gainedMaterials: addMaterials(next.expedition!.gainedMaterials, drops)
        };
        next = { ...next, expedition: nextExpedition };
        
        const dropLine = drops.length ? `，拾获战利品 ${drops.map((d) => describeMaterial(d.typeId, d.rarity)).join('、')}` : '';
        return addLog(next, `敌人在反击中被击败！${experienceLog}战斗结束，队伍获得战利品${dropLine}。`);
      }
      
      return addLog(next, logMsg);
    }
    default: return state;
  }
}

import { baseAttack, itemById } from '../content/gameContent';
import type { Enemy, GameAction, GameState, Hero } from './model';
import { addLog, editHero } from './shared';
import { addMaterials, describeMaterial, rollDrops, settleExpedition } from './economy';
import { BALANCE } from './config';

export const experienceToNextLevel = (level: number): number => BALANCE.experienceBase + Math.max(1, level) * BALANCE.experiencePerLevel;
export const enemyExperienceReward = (enemy: Enemy): number => BALANCE.enemyExperienceBase + Math.ceil(enemy.maxHp / BALANCE.enemyExperiencePerHp);

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
  const healthGain = levelsGained * BALANCE.levelUpHealthGain;
  return { ...hero, level, experience, maxHp: hero.maxHp + healthGain, hp: Math.min(hero.maxHp + healthGain, hero.hp + healthGain) };
}

export function equipmentBonuses(hero: Hero): { attack: number; defense: number } {
  return Object.values(hero.equipment).reduce((bonuses, itemId) => {
    // 用 Map 替代 find，O(1) 查找；多次调用（攻击/UI 渲染）开销显著降低。
    const item = itemById.get(itemId);
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
  let damage = baseAttack[hero.heroClass] + hero.gearLevel + Math.max(0, hero.level - 1) + equipmentBonuses(hero).attack - (moraleEnabled && hero.morale >= BALANCE.moraleThreshold ? BALANCE.moraleDamageReduction : 0) - hunger * BALANCE.hungerDamagePenaltyPerStack;

  // 职业被动加成 (Class Passive Bonuses)
  if (hero.heroClass === 'ranger') {
    // 游侠/斥候在后排时（index > 0），伤害 +rangerBackRowDamageBonus
    if (formationIndex > 0) {
      damage += BALANCE.rangerBackRowDamageBonus;
    }
  } else if (hero.heroClass === 'mage') {
    // 术士相邻位置有存活队友时伤害 +mageNeighborDamageBonus，孤立无援时伤害 -mageIsolatedDamagePenalty
    const hasNeighbor = party.some((teammate, idx) => {
      if (teammate.id === hero.id || teammate.hp <= 0) return false;
      return Math.abs(idx - formationIndex) === 1;
    });
    if (hasNeighbor) {
      damage += BALANCE.mageNeighborDamageBonus;
    } else {
      damage -= BALANCE.mageIsolatedDamagePenalty;
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
    case 'USE_SKILL': {
      if (!state.expedition?.enemies.some((enemy) => enemy.hp > 0)) return state;
      const hero = state.roster.find((item) => item.id === action.heroId);
      const heroIndex = state.expedition.formation.indexOf(action.heroId);
      if (!hero || heroIndex < 0 || hero.hp <= 0) return addLog(state, '无法发动技能：队员状态无效。');
      if (state.expedition.skillUses[hero.id]) return addLog(state, `${hero.name}在这场遭遇中已经使用过技能。`);
      const markUsed = (next: GameState) => ({ ...next, expedition: { ...next.expedition!, skillUses: { ...next.expedition!.skillUses, [hero.id]: true } } });
      const partyIds = new Set(state.expedition.formation);
      if (hero.id === 'lan') {
        const roster = state.roster.map((item) => partyIds.has(item.id) ? { ...item, morale: Math.max(0, item.morale - 8) } : item);
        return addLog(markUsed({ ...state, roster }), `${hero.name}发动「守望号令」，队伍的压力稍稍平复。`);
      }
      if (hero.id === 'wu') {
        const enemy = state.expedition.enemies.find((item) => item.id === action.enemyId && item.hp > 0) ?? state.expedition.enemies.find((item) => item.hp > 0);
        if (!enemy) return state;
        const party = state.expedition.formation.map((id) => state.roster.find((item) => item.id === id)).filter((item): item is Hero => Boolean(item));
        const damage = attackDamage(hero, state.settings.moraleEnabled, state.hunger, heroIndex, party) + 3;
        // 技能不单独结算击杀奖励；保留至少 1 点生命，避免绕开普通攻击的结算与掉落流程。
        const enemies = state.expedition.enemies.map((item) => item.id === enemy.id ? { ...item, hp: Math.max(1, item.hp - damage) } : item);
        return addLog(markUsed({ ...state, expedition: { ...state.expedition, enemies } }), `${hero.name}发动「贯风箭」，无视距离对${enemy.name}造成 ${damage} 点伤害。`);
      }
      if (hero.id === 'xingluo') {
        // 同上，范围技能用于压低全体血线，不跳过战斗结算。
        const enemies = state.expedition.enemies.map((item) => item.hp > 0 ? { ...item, hp: Math.max(1, item.hp - 6) } : item);
        return addLog(markUsed({ ...state, expedition: { ...state.expedition, enemies } }), `${hero.name}发动「星辉爆裂」，对所有存活敌人造成 6 点伤害。`);
      }
      return addLog(state, `${hero.name}尚未掌握可用的远征技能。`);
    }
    case 'ATTACK': {
      if (!state.expedition?.enemies.some((enemy) => enemy.hp > 0)) return state;
      const hero = state.roster.find((item) => item.id === action.heroId);
      const enemy = state.expedition.enemies.find((item) => item.id === action.enemyId && item.hp > 0) ?? state.expedition.enemies.find((item) => item.hp > 0);
      const heroIndex = state.expedition.formation.indexOf(action.heroId);
      // 任何一项缺失或站位非法都直接中止，避免非空断言导致运行时崩溃。
      if (!hero || !enemy || heroIndex < 0) return addLog(state, '无法发动攻击：目标或站位无效。');
      if (!canAttack(hero, enemy, heroIndex)) {
        const targetDistance = enemy.distance + heroIndex;
        return addLog(state, `${hero.name}无法攻击距离 ${targetDistance} 的目标。`);
      }

      const party = state.expedition.formation
        .map((id) => state.roster.find((h) => h.id === id))
        .filter((h): h is Hero => Boolean(h));
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
          gainedGold: next.expedition!.gainedGold + BALANCE.lootGoldPerEnemy * state.expedition.enemies.length,
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
            (id, index) => {
              const targetHero = next.roster.find((item) => item.id === id);
              return Boolean(targetHero) && targetHero!.hp > 0 && enemyCanAttack(attacker, index);
            }
          );
          if (targetIndex < 0) continue;
          const targetId = next.expedition!.formation[targetIndex];

          next = editHero(next, targetId, (target) => {
            const isVanguard = target.heroClass === 'vanguard';
            const isFrontRow = targetIndex === 0;
            const damageRed = (isVanguard && isFrontRow) ? BALANCE.vanguardDamageReduction : 0;
            const incomingDmg = Math.max(1, attacker.damage - equipmentBonuses(target).defense - damageRed);
            return {
              ...target,
              hp: Math.max(0, target.hp - incomingDmg),
              morale: state.settings.moraleEnabled ? Math.min(BALANCE.moraleCap, target.morale + BALANCE.counterattackMoraleGain) : target.morale
            };
          });

          // Vanguard counterattack passive trigger：贴身（distance + index === 1）才反击
          const targetHeroAfter = next.roster.find((h) => h.id === targetId);
          if (targetHeroAfter && targetHeroAfter.heroClass === 'vanguard' && targetIndex === 0 && (attacker.distance + targetIndex === 1)) {
            const counterDmg = BALANCE.vanguardCounterattackDamage;
            next = {
              ...next,
              expedition: {
                ...next.expedition!,
                enemies: next.expedition!.enemies.map((e) => {
                  if (e.id === attacker.id) {
                    return { ...e, hp: Math.max(0, e.hp - counterDmg) };
                  }
                  return e;
                })
              }
            };
            next = addLog(next, `先锋${targetHeroAfter.name}触发「坚守」进行了贴身反击，对${attacker.name}造成 ${counterDmg} 点反制伤害。`);
          }
        }
      }
      
      // Check if all heroes are defeated
      const allHeroesDefeated = next.expedition!.formation.every(
        (id) => {
          const h = next.roster.find((item) => item.id === id);
          return !h || h.hp <= 0;
        }
      );
      if (allHeroesDefeated) {
        // 队伍全灭：不保留战利品，仅返还剩余补给。
        return settleExpedition(
          next,
          'defeated',
          0,
          {},
          next.expedition!.gainedExperience,
          '队伍全体力竭，远征失败！',
        );
      }
      
      // Check if the Vanguard counter-attack killed the last enemy
      const defeatedAllAfterCounter = next.expedition!.enemies.every((item) => item.hp <= 0);
      if (defeatedAllAfterCounter) {
        const drops = rollDrops(state.expedition.enemies);
        const nextExpedition = {
          ...next.expedition!,
          gainedGold: next.expedition!.gainedGold + BALANCE.lootGoldPerEnemy * state.expedition.enemies.length,
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

import { baseAttack, itemById, skillDefinitions } from '../content/gameContent';
import type { Enemy, GameAction, GameState, Hero } from './model';
import { addLog, editHero } from './shared';
import { addMaterials, describeMaterial, rollDrops, settleExpedition } from './economy';
import { BALANCE } from './config';
import { intentDescription, isGuarding, resolveEnemyAction, rollIntent } from './intents';

// 技能使用记录的键：每名英雄的每个技能每场遭遇限用一次。
export const skillUseKey = (heroId: string, skillId: string): string => `${heroId}:${skillId}`;

export const experienceToNextLevel = (level: number): number => BALANCE.experienceBase + Math.max(1, level) * BALANCE.experiencePerLevel;
export const enemyExperienceReward = (enemy: Enemy): number => BALANCE.enemyExperienceBase + Math.ceil(enemy.maxHp / BALANCE.enemyExperiencePerHp);
export const pressureStage = (pressure: number): { name: string; tone: 'steady' | 'tense' | 'shaken' | 'critical' } => {
  if (pressure >= 75) return { name: '临界', tone: 'critical' };
  if (pressure >= BALANCE.pressureThreshold) return { name: '动摇', tone: 'shaken' };
  if (pressure >= 30) return { name: '紧绷', tone: 'tense' };
  return { name: '沉着', tone: 'steady' };
};

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

export function attackDamage(hero: Hero, pressureEnabled: boolean, hunger = 0, formationIndex = 0, party: Hero[] = []): number {
  let damage = baseAttack[hero.heroClass] + hero.gearLevel + Math.max(0, hero.level - 1) * BALANCE.levelUpAttackGain + equipmentBonuses(hero).attack - (pressureEnabled && hero.pressure >= BALANCE.pressureThreshold ? BALANCE.pressureDamageReduction : 0) - hunger * BALANCE.hungerDamagePenaltyPerStack;

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
      const skillId = action.skillId ?? hero.skills[0];
      if (!hero.skills.includes(skillId)) return addLog(state, `${hero.name}并未掌握该技能。`);
      if (state.expedition.skillUses[skillUseKey(hero.id, skillId)]) return addLog(state, `${hero.name}的「${skillDefinitions[skillId]?.name ?? '该技能'}」在这场遭遇中已经使用过了。`);

      const skill = skillDefinitions[skillId];
      if (!skill) return addLog(state, `${hero.name}尚未掌握可用的远征技能。`);

      const markUsed = (next: GameState) => ({
        ...next,
        expedition: {
          ...next.expedition!,
          skillUses: { ...next.expedition!.skillUses, [skillUseKey(hero.id, skillId)]: true }
        }
      });
      const partyIds = new Set(state.expedition.formation);

      if (skill.effect.type === 'pressure_recovery') {
        const roster = state.roster.map((item) => partyIds.has(item.id) ? { ...item, pressure: Math.max(0, item.pressure - skill.effect.value) } : item);
        return addLog(markUsed({ ...state, roster }), `${hero.name}发动「${skill.name}」，队伍的压力稍稍平复。`);
      }

      if (skill.effect.type === 'single_damage') {
        const enemy = state.expedition.enemies.find((item) => item.id === action.enemyId && item.hp > 0) ?? state.expedition.enemies.find((item) => item.hp > 0);
        if (!enemy) return state;
        const party = state.expedition.formation.map((id) => state.roster.find((item) => item.id === id)).filter((item): item is Hero => Boolean(item));
        const rawDamage = attackDamage(hero, state.settings.pressureEnabled, state.hunger, heroIndex, party) + skill.effect.value;
        // guard 意图生效期间单目标技能伤害减半（向上取整）
        const guardReduced = isGuarding(enemy, state.expedition.enemyIntents[enemy.id]) ? Math.ceil(rawDamage / 2) : rawDamage;
        const damage = Math.max(1, guardReduced - (enemy.trait === 'rock-armor' ? 2 : 0));
        // 技能不单独结算击杀奖励；保留至少 1 点生命，避免绕开普通攻击的结算与掉落流程。
        const enemies = state.expedition.enemies.map((item) => item.id === enemy.id ? { ...item, hp: Math.max(1, item.hp - damage) } : item);
        return addLog(markUsed({ ...state, expedition: { ...state.expedition, enemies } }), `${hero.name}发动「${skill.name}」，无视距离对${enemy.name}造成 ${damage} 点伤害。`);
      }

      if (skill.effect.type === 'all_damage') {
        // 范围技能用于压低全体血线，不跳过战斗结算。
        // 实际落血：岩甲（rock-armor）目标额外减免 2 点，日志如实标注，避免虚报伤害。
        const enemies = state.expedition.enemies.map((item) => item.hp > 0 ? { ...item, hp: Math.max(1, item.hp - Math.max(1, skill.effect.value - (item.trait === 'rock-armor' ? 2 : 0))) } : item);
        return addLog(markUsed({ ...state, expedition: { ...state.expedition, enemies } }), `${hero.name}发动「${skill.name}」，对所有存活敌人造成 ${skill.effect.value} 点伤害（岩甲目标减免 2 点）。`);
      }

      if (skill.effect.type === 'heal_single') {
        const party = state.expedition.formation
          .map((id) => state.roster.find((h) => h.id === id))
          .filter((h): h is Hero => h !== undefined && h.hp > 0);
        if (party.length === 0) return state;
        const targetHero = party.reduce((min, cur) => cur.hp / cur.maxHp < min.hp / min.maxHp ? cur : min, party[0]);
        const actualHeal = Math.min(targetHero.maxHp - targetHero.hp, skill.effect.value);
        const roster = state.roster.map((item) => item.id === targetHero.id ? { ...item, hp: item.hp + actualHeal } : item);
        return addLog(markUsed({ ...state, roster }), `${hero.name}对${targetHero.name}发动「${skill.name}」，恢复了 ${actualHeal} 点生命。`);
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
      const isCrit = Math.random() < 0.12;
      const baseDmg = attackDamage(hero, state.settings.pressureEnabled, state.hunger, heroIndex, party);
      const rawDamage = isCrit ? Math.ceil(baseDmg * 1.5) : baseDmg;
      // guard 意图生效期间玩家伤害减半（向上取整，保证至少 1 点）
      const guarding = isGuarding(enemy, state.expedition.enemyIntents[enemy.id]);
      const guardReduced = guarding ? Math.ceil(rawDamage / 2) : rawDamage;
      const armorReduction = enemy.trait === 'rock-armor' ? 2 : 0;
      const damage = Math.max(1, guardReduced - armorReduction);
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
      
      let logMsg = `${isCrit ? '暴击！' : ''}${hero.name}对${enemy.name}造成 ${damage} 点伤害。${armorReduction ? `岩甲抵消了 ${armorReduction} 点伤害。` : ''}${experienceLog}`;
      if (enemy.trait === 'thorns') {
        next = editHero(next, hero.id, (attacker) => ({
          ...attacker,
          pressure: state.settings.pressureEnabled ? Math.min(BALANCE.pressureCap, attacker.pressure + 4) : attacker.pressure,
        }));
        logMsg += `荆棘反震令${hero.name}压力 +4。`;
      }
      
      // 存活敌人按各自预告意图兑现行动（resolveEnemyAction），随后重 roll 下一轮意图
      const survivingAttackers = next.expedition!.enemies.filter((item) => item.hp > 0);
      if (survivingAttackers.length > 0) {
        logMsg += '存活敌人随后采取了行动。';
        for (const attacker of survivingAttackers) {
          const intent = next.expedition!.enemyIntents[attacker.id];
          if (intent) {
            next = resolveEnemyAction(next, attacker, intent);
          }
          // 蓄力中的敌人不在此轮重 roll（charge 兑现后由 resolveEnemyAction 清蓄力，下一轮强制 attack）
        }
      }

      // 新一轮预告：对仍存活的敌人重新 rollIntent 覆盖 enemyIntents
      const aliveAfterActions = next.expedition!.enemies.filter((item) => item.hp > 0);
      if (aliveAfterActions.length > 0) {
        const enemyIntents = { ...next.expedition!.enemyIntents };
        for (const enemy of aliveAfterActions) {
          enemyIntents[enemy.id] = rollIntent(enemy, enemyIntents[enemy.id], next.expedition!.enemyCharge[enemy.id] ?? 0);
        }
        next = { ...next, expedition: { ...next.expedition!, enemyIntents } };
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
    case 'USE_FIRE_BOMB': {
      if (!state.expedition || state.expedition.supplies.fireBomb < 1) return addLog(state, '火焰瓶已经用完。');
      const enemies = state.expedition.enemies;
      if (!enemies.some((e) => e.hp > 0)) return addLog(state, '当前遭遇已结束。');
      
      const enemy = enemies.find((e) => e.id === action.enemyId && e.hp > 0) ?? enemies.find((e) => e.hp > 0);
      if (!enemy) return state;

      // guard 意图生效期间火焰瓶伤害减半（向上取整）
      const guardingBomb = isGuarding(enemy, state.expedition.enemyIntents[enemy.id]);
      const damage = guardingBomb ? Math.ceil(8 / 2) : 8;
      const nextEnemy = { ...enemy, hp: Math.max(0, enemy.hp - damage) };
      
      let next: GameState = {
        ...state,
        expedition: {
          ...state.expedition,
          supplies: {
            ...state.expedition.supplies,
            fireBomb: state.expedition.supplies.fireBomb - 1
          },
          enemies: state.expedition.enemies.map((item) => item.id === enemy.id ? nextEnemy : item)
        }
      };

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
      
      const defeatedAll = next.expedition!.enemies.every((item) => item.hp <= 0);
      if (defeatedAll) {
        const drops = rollDrops(state.expedition.enemies);
        const nextExpedition = {
          ...next.expedition!,
          gainedGold: next.expedition!.gainedGold + BALANCE.lootGoldPerEnemy * state.expedition.enemies.length,
          gainedMaterials: addMaterials(next.expedition!.gainedMaterials, drops)
        };
        next = { ...next, expedition: nextExpedition };
        const dropLine = drops.length ? `，拾获战利品 ${drops.map((d) => describeMaterial(d.typeId, d.rarity)).join('、')}` : '';
        return addLog(next, `投掷火焰瓶击败了${enemy.name}。${experienceLog}战斗结束，队伍获得战利品${dropLine}。`);
      }
      
      return addLog(next, `投掷火焰瓶对${enemy.name}造成 ${damage} 点无视防御伤害。${experienceLog}`);
    }
    case 'USE_SHIELD_ELIXIR': {
      if (!state.expedition || state.expedition.supplies.shieldElixir < 1) return addLog(state, '铁壁药丸已经用完。');
      const hero = state.roster.find((item) => item.id === action.heroId);
      const heroIndex = state.expedition.formation.indexOf(action.heroId);
      if (!hero || heroIndex < 0 || hero.hp <= 0) return addLog(state, '无法使用药丸：目标队员状态无效。');
      if (state.expedition.shieldBuffs[action.heroId]) return addLog(state, `${hero.name}已经处于铁壁增益状态中。`);

      const next: GameState = {
        ...state,
        expedition: {
          ...state.expedition,
          supplies: {
            ...state.expedition.supplies,
            shieldElixir: state.expedition.supplies.shieldElixir - 1
          },
          shieldBuffs: {
            ...state.expedition.shieldBuffs,
            [action.heroId]: true
          }
        }
      };
      return addLog(next, `${hero.name}服下铁壁药丸，获得伤害减免效果（防御力临时 +3，本场战斗有效）。`);
    }
    case 'DEFEND': {
      if (!state.expedition) return state;
      const hero = state.roster.find((item) => item.id === action.heroId);
      const heroIndex = state.expedition.formation.indexOf(action.heroId);
      if (!hero || heroIndex < 0 || hero.hp <= 0) return addLog(state, '无法进入防御姿态：队员状态无效。');
      if (state.expedition.defendBuffs[action.heroId]) return addLog(state, `${hero.name}已经处于防御姿态。`);
      const next: GameState = {
        ...state,
        expedition: {
          ...state.expedition,
          defendBuffs: { ...state.expedition.defendBuffs, [action.heroId]: true }
        }
      };
      return addLog(next, `${hero.name}举盾防御，本场战斗受到的伤害降低（临时减伤 +${BALANCE.defendDamageReduction}）。`);
    }
    default: return state;
  }
}

import type { Enemy, EnemyIntent, GameState, Hero } from './model';
import { itemById } from '../content/gameContent';
import { BALANCE } from './config';
import { addLog, editHero } from './shared';

// 战斗意图系统：敌人行动前的威胁预告（读题→解题）。
// 详见 docs/COMBAT_INTENT_SYSTEM.md（设计定稿）。
// 本模块只包含确定性规则，UI 只读展示，不计算。

export type Rng = () => number;

const ATTACK_INTENT: EnemyIntent = { type: 'attack' };

// 蓄力伤害倍率：1 层 → ×2，2 层封顶 ×2（chargeMaxLayers=2）。
export function chargeMultiplier(chargeLayers: number): number {
  return 1 + Math.min(chargeLayers, BALANCE.chargeMaxLayers - 1) * BALANCE.chargeMultiplierPerLayer;
}

// 从意图池中按规则选择下一个意图：
// - 未配置/空池 → 回退 attack
// - charge > 0（上一回合蓄力未兑现）→ 强制 attack（兑现蓄力）
// - 从池中按 rng 均匀抽取；与当前意图相同则最多重抽 3 次
export function rollIntent(
  enemy: Enemy,
  currentIntent: EnemyIntent | undefined,
  charge: number,
  rng: Rng = Math.random,
): EnemyIntent {
  const pool = enemy.intents;
  if (!pool || pool.length === 0) return { ...ATTACK_INTENT };
  // 蓄力兑现：上一回合的 charge 意图带 targetHint（如 scout 打后排、grove-guardian 打最弱），
  // 兑现重击时沿用原 targetHint，保证"预告打谁就真的打谁"（读题→解题一致性）。
  if (charge > 0) return { ...ATTACK_INTENT, targetHint: currentIntent?.targetHint };

  let pick = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  for (let attempt = 0; attempt < 3 && currentIntent && pick.type === currentIntent.type; attempt += 1) {
    pick = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  }
  return { ...pick };
}

// 按 targetHint 选择目标：front（缺省，前排起第一个可攻击的存活英雄）/ back（后排起第一个可攻击的）/ weakest（hp 比例最小的可攻击目标）。
// party 顺序与 expedition.formation 一致，index 0 为前排；enemyCanAttack 约束攻击范围（打不到则跳过）。
export function targetForIntent(party: Hero[], intent: EnemyIntent, enemy: Enemy): Hero | undefined {
  const canHit = (hero: Hero, index: number): boolean => hero.hp > 0 && enemyCanAttack(enemy, index);
  if (intent.targetHint === 'back') {
    for (let index = party.length - 1; index >= 0; index -= 1) {
      if (canHit(party[index], index)) return party[index];
    }
    return undefined;
  }
  if (intent.targetHint === 'weakest') {
    let weakest: Hero | undefined;
    let weakestRatio = Infinity;
    party.forEach((hero, index) => {
      if (!canHit(hero, index)) return;
      const ratio = hero.hp / hero.maxHp;
      if (ratio < weakestRatio) { weakest = hero; weakestRatio = ratio; }
    });
    return weakest;
  }
  for (let index = 0; index < party.length; index += 1) {
    if (canHit(party[index], index)) return party[index];
  }
  return undefined;
}

// 敌人能否攻击到某站位（与 combat.ts 对齐，避免循环依赖）。
export function enemyCanAttack(enemy: Enemy, formationIndex: number): boolean {
  const targetDistance = enemy.distance + formationIndex;
  return targetDistance >= enemy.attackMinRange && targetDistance <= enemy.attackMaxRange;
}

// 敌人兑现当前意图，返回更新后的 GameState。
// 调用方负责：本轮行动前从 state.expedition.enemyIntents 读取意图。
export function resolveEnemyAction(state: GameState, attacker: Enemy, intent: EnemyIntent): GameState {
  if (!state.expedition) return state;
  const formation = state.expedition.formation;
  const party = formation
    .map((id) => state.roster.find((hero) => hero.id === id))
    .filter((hero): hero is Hero => Boolean(hero));

  switch (intent.type) {
    case 'charge': {
      const next = {
        ...state,
        expedition: {
          ...state.expedition,
          enemyCharge: {
            ...state.expedition.enemyCharge,
            [attacker.id]: Math.min(BALANCE.chargeMaxLayers, (state.expedition.enemyCharge[attacker.id] ?? 0) + 1),
          },
        },
      };
      return addLog(next, `${attacker.name}正在蓄力，下一击将更加沉重。`);
    }
    case 'guard': {
      return addLog(state, `${attacker.name}架起防御，受到的伤害减半。`);
    }
    case 'pressure': {
      const target = targetForIntent(party, intent, attacker);
      if (!target) return state;
      const amount = intent.pressure ?? 5;
      if (!state.settings.pressureEnabled) return addLog(state, `${attacker.name}试图施加压力，但压力系统处于关闭状态。`);
      const next = editHero(state, target.id, (hero) => ({ ...hero, pressure: Math.min(BALANCE.pressureCap, hero.pressure + amount) }));
      return addLog(next, `${attacker.name}对${target.name}施加了 ${amount} 点压力。`);
    }
    case 'attack':
    default: {
      const chargeLayers = state.expedition.enemyCharge[attacker.id] ?? 0;
      const multiplier = chargeMultiplier(chargeLayers);
      const target = targetForIntent(party, intent, attacker);
      if (!target) return state; // 打不到任何存活目标
      const targetIndex = formation.indexOf(target.id);

      const isVanguard = target.heroClass === 'vanguard';
      const isFrontRow = targetIndex === 0;
      const damageRed = isVanguard && isFrontRow ? BALANCE.vanguardDamageReduction : 0;
      const packBonus = attacker.trait === 'pack' && state.expedition.enemies.filter((enemy) => enemy.trait === 'pack' && enemy.hp > 0).length > 1 ? 2 : 0;
      const ancientCoreBonus = attacker.trait === 'ancient-core' && attacker.hp <= attacker.maxHp / 2 ? 3 : 0;
      const shieldElixirBonus = state.expedition.shieldBuffs[target.id] ? BALANCE.shieldElixirDamageReduction : 0;
      const defendBonus = state.expedition.defendBuffs[target.id] ? BALANCE.defendDamageReduction : 0;
      const defense = equipmentDefense(target);
      const baseDamage = Math.max(1, (intent.damage ?? attacker.damage) * multiplier + packBonus + ancientCoreBonus - defense - damageRed - shieldElixirBonus - defendBonus);
      const sporePressure = attacker.trait === 'spores' ? 5 : 0;

      let next = editHero(state, target.id, (hero) => {
        const damage = Math.max(1, baseDamage);
        return {
          ...hero,
          hp: Math.max(0, hero.hp - damage),
          pressure: state.settings.pressureEnabled ? Math.min(BALANCE.pressureCap, hero.pressure + BALANCE.counterattackPressureGain + sporePressure) : hero.pressure,
        };
      });

      const logMessage = `${attacker.name}攻击${target.name}，造成 ${Math.max(1, baseDamage)} 点伤害${chargeLayers > 1 ? '（蓄力重击）' : ''}。`;
      next = addLog(next, logMessage);

      // 蓄力兑现后清零；同时清除本回合已兑现的意图（由调用方统一重 roll，这里仅清蓄力）
      const clearedCharge = { ...next.expedition!.enemyCharge, [attacker.id]: 0 };
      next = { ...next, expedition: { ...next.expedition!, enemyCharge: clearedCharge } };

      // 先锋贴身反击（沿用现有被动）
      const targetAfter = next.roster.find((hero) => hero.id === target.id);
      if (targetAfter && targetAfter.heroClass === 'vanguard' && targetIndex === 0 && attacker.distance + targetIndex === 1) {
        const counterDmg = BALANCE.vanguardCounterattackDamage;
        next = {
          ...next,
          expedition: {
            ...next.expedition!,
            enemies: next.expedition!.enemies.map((enemy) => (enemy.id === attacker.id ? { ...enemy, hp: Math.max(0, enemy.hp - counterDmg) } : enemy)),
          },
        };
        next = addLog(next, `先锋${targetAfter.name}触发「坚守」进行了贴身反击，对${attacker.name}造成 ${counterDmg} 点反制伤害。`);
      }

      return next;
    }
  }
}

// 装备防御力（与 combat.ts 的 equipmentBonuses 对齐；在此用 itemById 避免循环依赖）。
function equipmentDefense(hero: Hero): number {
  return Object.values(hero.equipment).reduce((total, itemId) => total + (itemById.get(itemId)?.defense ?? 0), 0);
}

// 玩家攻击处于 guard 意图的敌人时伤害是否减半。
export function isGuarding(_enemy: Enemy, currentIntent: EnemyIntent | undefined): boolean {
  return Boolean(currentIntent && currentIntent.type === 'guard');
}

// 意图展示文案（供 UI 只读展示）。
export function intentDescription(intent: EnemyIntent, charge: number, enemyName: string): string {
  if (charge > 0 && intent.type === 'attack') return `${enemyName}：重击（×${chargeMultiplier(charge)}）`;
  switch (intent.type) {
    case 'charge': return `${enemyName}：蓄力中，下回合重击`;
    case 'guard': return `${enemyName}：防御中，伤害减半`;
    case 'pressure': return `${enemyName}：施加压力`;
    case 'attack':
    default: return `${enemyName}：攻击`;
  }
}

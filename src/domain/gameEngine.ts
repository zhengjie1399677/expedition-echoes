import { baseAttack, enemies, expeditionNodes, initialHeroes, missions } from '../content/gameContent';
import type { Enemy, GameAction, GameState, Hero } from './model';

const enemyById = (id: string): Enemy => ({ ...enemies.find((enemy) => enemy.id === id)! });
const addLog = (state: GameState, message: string): GameState => ({ ...state, log: [message, ...state.log].slice(0, 8) });
const editHero = (state: GameState, id: string, edit: (hero: Hero) => Hero): GameState => ({ ...state, roster: state.roster.map((hero) => hero.id === id ? edit(hero) : hero) });

export function createInitialGame(): GameState {
  return { version: 5, page: 'town', gold: 100, roster: initialHeroes.map((hero) => ({ ...hero })), selectedHeroIds: ['lan', 'wu', 'xingluo'], selectedMissionId: missions[0].id, expedition: null, settings: { moraleEnabled: true, llmEnabled: true }, log: ['酒馆已经备好第一份远征契约。'] };
}

export function canAttack(hero: Hero, enemy: Enemy, formationIndex = 0): boolean {
  if (hero.hp <= 0 || enemy.hp <= 0) return false;
  const targetDistance = enemy.distance + formationIndex;
  if (hero.heroClass === 'vanguard') return targetDistance === 1;
  if (hero.heroClass === 'mage') return targetDistance >= 2 && targetDistance <= 3;
  return targetDistance >= 1 && targetDistance <= 2;
}

export function attackDamage(hero: Hero, moraleEnabled: boolean): number {
  return Math.max(1, baseAttack[hero.heroClass] + hero.gearLevel - (moraleEnabled && hero.morale >= 50 ? 2 : 0));
}

export function enemyCanAttack(enemy: Enemy, formationIndex: number): boolean {
  const targetDistance = enemy.distance + formationIndex;
  return targetDistance >= enemy.attackMinRange && targetDistance <= enemy.attackMaxRange;
}

function enterNode(state: GameState, nodeIndex: number): GameState {
  const node = expeditionNodes[nodeIndex];
  if (!state.expedition || !node) return state;
  if (node.kind === 'rest') {
    const roster = state.roster.map((hero) => state.expedition!.formation.includes(hero.id) ? { ...hero, hp: Math.min(hero.maxHp, hero.hp + 5), morale: Math.max(0, hero.morale - 12) } : hero);
    return addLog({ ...state, roster, expedition: { ...state.expedition, nodeIndex, enemies: [] } }, `${node.title}：${node.description}`);
  }
  const mission = missions.find((item) => item.id === state.expedition!.missionId) ?? missions[0];
  const enemyIds = mission.enemyWaves[nodeIndex] ?? node.enemyIds;
  return addLog({ ...state, expedition: { ...state.expedition, nodeIndex, enemies: enemyIds.map(enemyById) } }, `${node.title}：${node.description}`);
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'NAVIGATE': return { ...state, page: action.page };
    case 'ACCEPT_MISSION': {
      const mission = missions.find((item) => item.id === action.missionId);
      return mission ? addLog({ ...state, selectedMissionId: mission.id }, `已接受任务：${mission.title}。`) : state;
    }
    case 'TOGGLE_PARTY': {
      const hero = state.roster.find((item) => item.id === action.heroId);
      if (!hero?.recruited) return addLog(state, '需要先招募这名队员。');
      if (state.selectedHeroIds.includes(action.heroId)) return { ...state, selectedHeroIds: state.selectedHeroIds.filter((id) => id !== action.heroId) };
      if (state.selectedHeroIds.length >= 3) return addLog(state, '首版远征最多派出三人。');
      return { ...state, selectedHeroIds: [...state.selectedHeroIds, action.heroId] };
    }
    case 'RECRUIT': {
      if (state.gold < 25) return addLog(state, '金币不足，无法招募。');
      const hero = state.roster.find((item) => item.id === action.heroId);
      if (!hero || hero.recruited) return state;
      return addLog(editHero({ ...state, gold: state.gold - 25 }, hero.id, (item) => ({ ...item, recruited: true })), `${hero.name}签下了远征契约。`);
    }
    case 'UPGRADE_GEAR': {
      const hero = state.roster.find((item) => item.id === action.heroId);
      const cost = 30 + (hero?.gearLevel ?? 0) * 20;
      if (!hero || hero.gearLevel >= 3 || state.gold < cost) return addLog(state, '当前无法升级装备。');
      return addLog(editHero({ ...state, gold: state.gold - cost }, hero.id, (item) => ({ ...item, gearLevel: item.gearLevel + 1 })), `${hero.name}的装备提升至 ${hero.gearLevel + 1} 级。`);
    }
    case 'START_EXPEDITION': {
      if (state.selectedHeroIds.length < 2) return addLog(state, '至少选择两名队员。');
      const prepared: GameState = { ...state, page: 'expedition', roster: state.roster.map((hero) => state.selectedHeroIds.includes(hero.id) ? { ...hero, hp: hero.maxHp, morale: 0 } : hero), expedition: { missionId: state.selectedMissionId, nodeIndex: 0, formation: [...state.selectedHeroIds], enemies: [], supplies: { bandage: 3, sedative: 1 } } };
      return enterNode(prepared, 0);
    }
    case 'ATTACK': {
      if (!state.expedition?.enemies.some((enemy) => enemy.hp > 0)) return state;
      const hero = state.roster.find((item) => item.id === action.heroId);
      const enemy = state.expedition.enemies.find((item) => item.id === action.enemyId && item.hp > 0) ?? state.expedition.enemies.find((item) => item.hp > 0)!;
      const heroIndex = state.expedition.formation.indexOf(action.heroId);
      const targetDistance = enemy.distance + Math.max(0, heroIndex);
      if (!hero || heroIndex < 0 || !canAttack(hero, enemy, heroIndex)) return addLog(state, `${hero?.name ?? '队员'}无法攻击距离 ${targetDistance} 的目标。`);
      const damage = attackDamage(hero, state.settings.moraleEnabled);
      const nextEnemy = { ...enemy, hp: Math.max(0, enemy.hp - damage) };
      let next: GameState = { ...state, expedition: { ...state.expedition, enemies: state.expedition.enemies.map((item) => item.id === enemy.id ? nextEnemy : item) } };
      const defeatedAll = next.expedition!.enemies.every((item) => item.hp <= 0);
      if (defeatedAll) return addLog({ ...next, gold: next.gold + 12 * state.expedition.enemies.length }, `${hero.name}结束了战斗，队伍获得战利品。`);
      for (const attacker of next.expedition!.enemies.filter((item) => item.hp > 0)) {
        const targetIndex = next.expedition!.formation.findIndex((id, index) => next.roster.find((item) => item.id === id)!.hp > 0 && enemyCanAttack(attacker, index));
        if (targetIndex < 0) continue;
        const targetId = next.expedition!.formation[targetIndex];
        next = editHero(next, targetId, (target) => ({ ...target, hp: Math.max(0, target.hp - attacker.damage), morale: state.settings.moraleEnabled ? Math.min(100, target.morale + 11) : target.morale }));
      }
      return addLog(next, `${hero.name}对${enemy.name}造成 ${damage} 点伤害，存活敌人随后进行了反击。`);
    }
    case 'SWAP': {
      if (!state.expedition || action.index < 0 || action.index >= state.expedition.formation.length - 1) return state;
      const formation = [...state.expedition.formation]; [formation[action.index], formation[action.index + 1]] = [formation[action.index + 1], formation[action.index]];
      return addLog({ ...state, expedition: { ...state.expedition, formation } }, '队伍调整了前后站位。');
    }
    case 'USE_BANDAGE': {
      if (!state.expedition || state.expedition.supplies.bandage < 1) return addLog(state, '绷带已经用完。');
      const hero = state.roster.find((item) => item.id === action.heroId);
      if (!hero || hero.hp <= 0 || hero.hp >= hero.maxHp) return addLog(state, '这名队员现在不需要绷带。');
      const healed = editHero(state, hero.id, (item) => ({ ...item, hp: Math.min(item.maxHp, item.hp + 9) }));
      return addLog({ ...healed, expedition: { ...healed.expedition!, supplies: { ...healed.expedition!.supplies, bandage: healed.expedition!.supplies.bandage - 1 } } }, `${hero.name}使用绷带恢复了生命。`);
    }
    case 'USE_SEDATIVE': {
      if (!state.expedition || !state.settings.moraleEnabled || state.expedition.supplies.sedative < 1) return addLog(state, '当前无法使用镇定剂。');
      const hero = state.roster.find((item) => item.id === action.heroId);
      if (!hero || hero.morale === 0) return addLog(state, '这名队员目前很冷静。');
      const calmed = editHero(state, hero.id, (item) => ({ ...item, morale: Math.max(0, item.morale - 25) }));
      return addLog({ ...calmed, expedition: { ...calmed.expedition!, supplies: { ...calmed.expedition!.supplies, sedative: calmed.expedition!.supplies.sedative - 1 } } }, `${hero.name}的士气压力下降了。`);
    }
    case 'ADVANCE': {
      if (!state.expedition || state.expedition.enemies.some((enemy) => enemy.hp > 0)) return addLog(state, '需要先解决当前遭遇。');
      const nextIndex = state.expedition.nodeIndex + 1;
      if (nextIndex >= expeditionNodes.length) {
        const reward = missions.find((mission) => mission.id === state.expedition!.missionId)?.reward ?? 45;
        return addLog({ ...state, page: 'town', gold: state.gold + reward, expedition: null }, `远征完成，全队带回 ${reward} 金币。`);
      }
      return enterNode(state, nextIndex);
    }
    case 'RETREAT': return addLog({ ...state, page: 'town', expedition: null }, '队伍提前撤回城镇。');
    case 'TOGGLE_MORALE': return { ...state, settings: { ...state.settings, moraleEnabled: !state.settings.moraleEnabled } };
    case 'TOGGLE_LLM': return { ...state, settings: { ...state.settings, llmEnabled: !state.settings.llmEnabled } };
    case 'RESET': return createInitialGame();
  }
}

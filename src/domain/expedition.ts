import { expeditionNodes, missions } from '../content/gameContent';
import type { GameAction, GameState } from './model';
import { addLog, enemyById } from './shared';
import { addMaterials, describeMaterial } from './economy';

function returnExpeditionSupplies(state: GameState): GameState {
  if (!state.expedition) return state;
  return {
    ...state,
    inventory: {
      ...state.inventory,
      bandage: (state.inventory.bandage ?? 0) + state.expedition.supplies.bandage,
      sedative: (state.inventory.sedative ?? 0) + state.expedition.supplies.sedative,
    },
  };
}

function enterNode(state: GameState, nodeIndex: number): GameState {
  const node = expeditionNodes[nodeIndex];
  if (!state.expedition || !node) return state;
  const isRest = node.kind === 'rest';
  const consumed = !isRest && state.food > 0;
  const next = { ...state, food: consumed ? state.food - 1 : state.food, hunger: isRest ? state.hunger : (consumed ? state.hunger : state.hunger + 1) };
  const foodLog = isRest ? '' : (consumed ? '' : '（食物不足，饥饿加深）');
  if (node.kind === 'rest') {
    const roster = next.roster.map((hero) => next.expedition!.formation.includes(hero.id) ? { ...hero, hp: Math.min(hero.maxHp, hero.hp + 5), morale: Math.max(0, hero.morale - 12) } : hero);
    return addLog({ ...next, roster, expedition: { ...next.expedition!, nodeIndex, enemies: [] } }, `${node.title}：${node.description}${foodLog}`);
  }
  const mission = missions.find((item) => item.id === next.expedition!.missionId) ?? missions[0];
  const enemyIds = mission.enemyWaves[nodeIndex] ?? node.enemyIds;
  return addLog({ ...next, expedition: { ...next.expedition!, nodeIndex, enemies: enemyIds.map(enemyById) } }, `${node.title}：${node.description}${foodLog}`);
}

export function expeditionReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_EXPEDITION': {
      if (!state.hasAcceptedMission) return addLog(state, '请先在酒馆任务板接取一份委托，再从城门出发。');
      if (state.selectedHeroIds.length < 2) return addLog(state, '至少选择两名队员。');
      const bandage = Math.min(3, state.inventory.bandage ?? 0);
      const sedative = Math.min(1, state.inventory.sedative ?? 0);
      const prepared: GameState = {
        ...state,
        page: 'expedition',
        inventory: { ...state.inventory, bandage: (state.inventory.bandage ?? 0) - bandage, sedative: (state.inventory.sedative ?? 0) - sedative },
        roster: state.roster.map((hero) => state.selectedHeroIds.includes(hero.id) ? { ...hero, hp: hero.maxHp, morale: 0 } : hero),
        expedition: { missionId: state.selectedMissionId, nodeIndex: 0, formation: [...state.selectedHeroIds], enemies: [], supplies: { bandage, sedative } },
      };
      return enterNode(prepared, 0);
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
      const healed = state.roster.map((item) => item.id === hero.id ? { ...item, hp: Math.min(item.maxHp, item.hp + 9) } : item);
      return addLog({ ...state, roster: healed, expedition: { ...state.expedition, supplies: { ...state.expedition.supplies, bandage: state.expedition.supplies.bandage - 1 } } }, `${hero.name}使用绷带恢复了生命。`);
    }
    case 'USE_SEDATIVE': {
      if (!state.expedition || !state.settings.moraleEnabled || state.expedition.supplies.sedative < 1) return addLog(state, '当前无法使用镇定剂。');
      const hero = state.roster.find((item) => item.id === action.heroId);
      if (!hero || hero.morale === 0) return addLog(state, '这名队员目前很冷静。');
      const calmed = state.roster.map((item) => item.id === hero.id ? { ...item, morale: Math.max(0, item.morale - 25) } : item);
      return addLog({ ...state, roster: calmed, expedition: { ...state.expedition, supplies: { ...state.expedition.supplies, sedative: state.expedition.supplies.sedative - 1 } } }, `${hero.name}的士气压力下降了。`);
    }
    case 'ADVANCE': {
      if (!state.expedition || state.expedition.enemies.some((enemy) => enemy.hp > 0)) return addLog(state, '需要先解决当前遭遇。');
      const nextIndex = state.expedition.nodeIndex + 1;
      if (nextIndex >= expeditionNodes.length) {
        const mission = missions.find((item) => item.id === state.expedition!.missionId);
        const reward = mission?.reward ?? 45;
        const rewards = mission?.materialRewards ?? [];
        const returned = returnExpeditionSupplies(state);
        const materials = addMaterials(returned.materials, rewards);
        const rewardLine = rewards.length ? `，并获得 ${rewards.map((r) => `${describeMaterial(r.typeId, r.rarity)} ×${r.count}`).join('、')}` : '';
        return addLog({ ...returned, page: 'town', gold: returned.gold + reward, materials, expedition: null, hasAcceptedMission: false }, `远征完成，全队带回 ${reward} 金币${rewardLine}。`);
      }
      return enterNode(state, nextIndex);
    }
    case 'RETREAT': {
      const returned = returnExpeditionSupplies(state);
      return addLog({ ...returned, page: 'town', expedition: null, hasAcceptedMission: false }, '队伍提前撤回城镇。');
    }
    default: return state;
  }
}

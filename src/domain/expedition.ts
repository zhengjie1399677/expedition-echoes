import { expeditionNodes, missions } from '../content/gameContent';
import type { Enemy, GameAction, GameState } from './model';
import { addLog, enemyById } from './shared';
import { addMaterials, describeMaterial, materialKey, settleExpedition } from './economy';
import { BALANCE } from './config';

function enterNode(state: GameState, nodeIndex: number): GameState {
  const node = expeditionNodes[nodeIndex];
  if (!state.expedition || !node) return state;
  const isEvent = node.kind === 'event';
  const consumed = !isEvent && state.expedition.supplies.food > 0;
  const nextSupplies = {
    ...state.expedition.supplies,
    food: consumed ? state.expedition.supplies.food - 1 : state.expedition.supplies.food
  };
  const next: GameState = {
    ...state,
    hunger: isEvent ? state.hunger : (consumed ? state.hunger : state.hunger + 1),
    expedition: {
      ...state.expedition,
      nodeIndex,
      eventResolved: !isEvent,
      skillUses: {},
      supplies: nextSupplies,
      enemies: [] as Enemy[]
    }
  };
  const foodLog = isEvent ? '' : (consumed ? '' : '（食物不足，饥饿加深）');
  if (isEvent) return addLog(next, `${node.title}：${node.description}`);
  const mission = missions.find((item) => item.id === next.expedition!.missionId) ?? missions[0];
  const enemyIds = mission.enemyWaves[nodeIndex] ?? node.enemyIds;
  const expedition = next.expedition!;
  expedition.enemies = enemyIds.map(enemyById);
  return addLog({ ...next, expedition }, `${node.title}：${node.description}${foodLog}`);
}

export function expeditionReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_EXPEDITION': {
      if (!state.hasAcceptedMission) return addLog(state, '请先在酒馆任务板接取一份委托，再从城门出发。');
      if (state.selectedHeroIds.length < BALANCE.partyMinSize) return addLog(state, `至少选择 ${BALANCE.partyMinSize} 名队员。`);

      const food = action.supplies?.food ?? Math.min(2, state.food);
      const bandage = action.supplies?.bandage ?? Math.min(3, state.inventory.bandage ?? 0);
      const sedative = action.supplies?.sedative ?? Math.min(1, state.inventory.sedative ?? 0);

      const totalSupplies = food + bandage + sedative;
      if (totalSupplies > BALANCE.suppliesCap) {
        return addLog(state, `出征行囊空间不足（最多携带 ${BALANCE.suppliesCap} 件补给品）。`);
      }
      if (food > state.food || bandage > (state.inventory.bandage ?? 0) || sedative > (state.inventory.sedative ?? 0)) {
        return addLog(state, '携带的补给品数量超过了城镇库存。');
      }
      
      const supplies = { food, bandage, sedative };
      const prepared: GameState = {
        ...state,
        page: 'expedition',
        food: state.food - food,
        inventory: {
          ...state.inventory,
          bandage: (state.inventory.bandage ?? 0) - bandage,
          sedative: (state.inventory.sedative ?? 0) - sedative
        },
        roster: state.roster.map((hero) => state.selectedHeroIds.includes(hero.id) ? { ...hero, hp: hero.maxHp, morale: 0 } : hero),
        expedition: {
          missionId: state.selectedMissionId,
          nodeIndex: 0,
          formation: [...state.selectedHeroIds],
          enemies: [],
          supplies,
          startSupplies: { ...supplies },
          gainedGold: 0,
          gainedMaterials: {},
          gainedExperience: 0
          ,eventResolved: false
          ,skillUses: {}
        },
      };
      return enterNode(prepared, 0);
    }
    case 'SWAP': {
      if (!state.expedition) return addLog(state, '当前不在远征途中。');
      if (action.index < 0 || action.index >= state.expedition.formation.length - 1) return addLog(state, '站位调整无效。');
      const formation = [...state.expedition.formation]; [formation[action.index], formation[action.index + 1]] = [formation[action.index + 1], formation[action.index]];
      return addLog({ ...state, expedition: { ...state.expedition, formation } }, '队伍调整了前后站位。');
    }
    case 'USE_BANDAGE': {
      if (!state.expedition || state.expedition.supplies.bandage < 1) return addLog(state, '绷带已经用完。');
      const hero = state.roster.find((item) => item.id === action.heroId);
      if (!hero || hero.hp <= 0 || hero.hp >= hero.maxHp) return addLog(state, '这名队员现在不需要绷带。');
      const healed = state.roster.map((item) => item.id === hero.id ? { ...item, hp: Math.min(item.maxHp, item.hp + BALANCE.bandageHealAmount) } : item);
      return addLog({ ...state, roster: healed, expedition: { ...state.expedition, supplies: { ...state.expedition.supplies, bandage: state.expedition.supplies.bandage - 1 } } }, `${hero.name}使用绷带恢复了生命。`);
    }
    case 'USE_SEDATIVE': {
      if (!state.expedition || !state.settings.moraleEnabled || state.expedition.supplies.sedative < 1) return addLog(state, '当前无法使用镇定剂。');
      const hero = state.roster.find((item) => item.id === action.heroId);
      if (!hero || hero.morale === 0) return addLog(state, '这名队员目前很冷静。');
      const calmed = state.roster.map((item) => item.id === hero.id ? { ...item, morale: Math.max(0, item.morale - BALANCE.sedativeMoraleReduce) } : item);
      return addLog({ ...state, roster: calmed, expedition: { ...state.expedition, supplies: { ...state.expedition.supplies, sedative: state.expedition.supplies.sedative - 1 } } }, `${hero.name}的士气压力下降了。`);
    }
    case 'ADVANCE': {
      if (!state.expedition || state.expedition.enemies.some((enemy) => enemy.hp > 0)) return addLog(state, '需要先解决当前遭遇。');
      const currentNode = expeditionNodes[state.expedition.nodeIndex];
      if (currentNode?.kind === 'event' && !state.expedition.eventResolved) return addLog(state, '请先决定如何处理当前的远征事件。');
      const nextIndex = state.expedition.nodeIndex + 1;
      if (nextIndex >= expeditionNodes.length) {
        const mission = missions.find((item) => item.id === state.expedition!.missionId);
        const reward = mission?.reward ?? BALANCE.missionDefaultReward;
        const rewards = mission?.materialRewards ?? [];
        const lootGold = state.expedition.gainedGold + reward;
        const lootMaterials = addMaterials(state.expedition.gainedMaterials, rewards);
        const rewardLine = rewards.length ? `，并获得 ${rewards.map((r) => `${describeMaterial(r.typeId, r.rarity)} ×${r.count}`).join('、')}` : '';
        return settleExpedition(
          state,
          'victory',
          lootGold,
          lootMaterials,
          state.expedition.gainedExperience,
          `远征完成，全队带回 ${reward} 金币${rewardLine}。`,
        );
      }
      return enterNode(state, nextIndex);
    }
    case 'RESOLVE_EVENT': {
      if (!state.expedition) return addLog(state, '当前不在远征途中。');
      const node = expeditionNodes[state.expedition.nodeIndex];
      const event = node?.kind === 'event' && node.event?.id === action.eventId ? node.event : undefined;
      const choice = event?.choices.find((item) => item.id === action.choiceId);
      if (!event || !choice || state.expedition.eventResolved) return addLog(state, '该远征事件无法再次处理。');
      const partyIds = new Set(state.expedition.formation);
      if (choice.effect === 'recover') {
        const roster = state.roster.map((hero) => partyIds.has(hero.id) ? { ...hero, hp: Math.min(hero.maxHp, hero.hp + BALANCE.restNodeHpRecover), morale: Math.max(0, hero.morale - BALANCE.restNodeMoraleRecover) } : hero);
        return addLog({ ...state, roster, expedition: { ...state.expedition, eventResolved: true } }, `${node.title}：队伍围拢休整，恢复了状态。`);
      }
      if (choice.effect === 'scavenge') {
        const roster = state.roster.map((hero) => partyIds.has(hero.id) ? { ...hero, morale: Math.min(BALANCE.moraleCap, hero.morale + 8) } : hero);
        const gainedMaterials = { ...state.expedition.gainedMaterials, [materialKey('ruin-shard', 0)]: (state.expedition.gainedMaterials[materialKey('ruin-shard', 0)] ?? 0) + 1 };
        return addLog({ ...state, roster, expedition: { ...state.expedition, eventResolved: true, gainedMaterials } }, `${node.title}：在破损药箱下找到遗迹碎片，全队有些不安。`);
      }
      const roster = state.roster.map((hero) => partyIds.has(hero.id) ? { ...hero, morale: Math.min(BALANCE.moraleCap, hero.morale + 10) } : hero);
      return addLog({ ...state, roster, expedition: { ...state.expedition, eventResolved: true, gainedGold: state.expedition.gainedGold + 12 } }, `${node.title}：队伍沿足迹找到遗落的钱袋，带回 12 金币。`);
    }
    case 'RETREAT': {
      if (!state.expedition) return addLog(state, '当前不在远征途中。');
      return settleExpedition(
        state,
        'retreat',
        state.expedition.gainedGold,
        state.expedition.gainedMaterials,
        state.expedition.gainedExperience,
        '队伍提前撤回城镇。',
      );
    }
    default: return state;
  }
}

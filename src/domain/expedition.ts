import { missions, nodesForMission } from '../content/gameContent';
import type { Enemy, GameAction, GameState, Hero, Supplies } from './model';
import { addLog, enemyById } from './shared';
import { addMaterials, describeMaterial, materialKey, settleExpedition } from './economy';
import { BALANCE } from './config';
import { rollIntent } from './intents';

function rollEnemyIntents(expedition: { enemies: Enemy[]; enemyIntents: Record<string, import('./model').EnemyIntent> }): void {
  for (const enemy of expedition.enemies) {
    expedition.enemyIntents[enemy.id] = rollIntent(enemy, undefined, 0);
  }
}

function enterNode(state: GameState, nodeIndex: number): GameState {
  const node = state.expedition ? nodesForMission(state.expedition.missionId)[nodeIndex] : undefined;
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
      shieldBuffs: {},
      defendBuffs: {},
      // 一次性事件（once）的已见记录在整场远征中累积，不随节点切换清空，
      // 否则跨节点再次遇到同一事件时 once 检查（RESOLVE_EVENT）无法生效。
      seenEvents: state.expedition.seenEvents,
      supplies: nextSupplies,
      enemies: [] as Enemy[],
      enemyIntents: {},
      enemyCharge: {},
    }
  };
  const foodLog = isEvent ? '' : (consumed ? '' : '（食物不足，饥饿加深）');
  if (isEvent) return addLog(next, `${node.title}：${node.description}`);
  const mission = missions.find((item) => item.id === next.expedition!.missionId) ?? missions[0];
  const enemyIds = mission.enemyWaves[nodeIndex] ?? node.enemyIds;
  const expedition = next.expedition!;
  const occurrences = new Map<string, number>();
  expedition.enemies = enemyIds.map((enemyId) => {
    const enemy = enemyById(enemyId);
    const occurrence = (occurrences.get(enemyId) ?? 0) + 1;
    occurrences.set(enemyId, occurrence);
    return occurrence === 1 ? enemy : { ...enemy, id: `${enemy.id}-${occurrence}` };
  });
  // 进入战斗节点：为每个敌人 roll 初始意图（预告可见）
  rollEnemyIntents(expedition);
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
      const fireBomb = action.supplies?.fireBomb ?? 0;
      const shieldElixir = action.supplies?.shieldElixir ?? 0;

      const totalSupplies = food + bandage + sedative + fireBomb + shieldElixir;
      if (totalSupplies > BALANCE.suppliesCap) {
        return addLog(state, `出征行囊空间不足（最多携带 ${BALANCE.suppliesCap} 件补给品）。`);
      }
      if (
        food > state.food ||
        bandage > (state.inventory.bandage ?? 0) ||
        sedative > (state.inventory.sedative ?? 0) ||
        fireBomb > (state.inventory['fire-bomb'] ?? 0) ||
        shieldElixir > (state.inventory['shield-elixir'] ?? 0)
      ) {
        return addLog(state, '携带的补给品数量超过了城镇库存。');
      }
      
      const supplies = { food, bandage, sedative, fireBomb, shieldElixir };
      const prepared: GameState = {
        ...state,
        page: 'expedition',
        food: state.food - food,
        inventory: {
          ...state.inventory,
          bandage: (state.inventory.bandage ?? 0) - bandage,
          sedative: (state.inventory.sedative ?? 0) - sedative,
          'fire-bomb': (state.inventory['fire-bomb'] ?? 0) - fireBomb,
          'shield-elixir': (state.inventory['shield-elixir'] ?? 0) - shieldElixir,
        },
        roster: state.roster.map((hero) => state.selectedHeroIds.includes(hero.id) ? { ...hero, hp: hero.maxHp, pressure: 0 } : hero),
        expedition: {
          missionId: state.selectedMissionId,
          nodeIndex: 0,
          formation: [...state.selectedHeroIds],
          enemies: [],
          supplies,
          startSupplies: { ...supplies },
          gainedGold: 0,
          gainedMaterials: {},
          gainedExperience: 0,
          eventResolved: false,
          skillUses: {},
          shieldBuffs: {},
          defendBuffs: {},
          seenEvents: [],
          enemyIntents: {},
          enemyCharge: {},
        },
      };
      return enterNode(prepared, 0);
    }
    case 'USE_BANDAGE': {
      if (!state.expedition || state.expedition.supplies.bandage < 1) return addLog(state, '绷带已经用完。');
      const hero = state.roster.find((item) => item.id === action.heroId);
      if (!hero || hero.hp <= 0 || hero.hp >= hero.maxHp) return addLog(state, '这名队员现在不需要绷带。');
      const healed = state.roster.map((item) => item.id === hero.id ? { ...item, hp: Math.min(item.maxHp, item.hp + BALANCE.bandageHealAmount) } : item);
      return addLog({ ...state, roster: healed, expedition: { ...state.expedition, supplies: { ...state.expedition.supplies, bandage: state.expedition.supplies.bandage - 1 } } }, `${hero.name}使用绷带恢复了生命。`);
    }
    case 'USE_SEDATIVE': {
      if (!state.expedition || !state.settings.pressureEnabled || state.expedition.supplies.sedative < 1) return addLog(state, '当前无法使用镇定剂。');
      const hero = state.roster.find((item) => item.id === action.heroId);
      if (!hero || hero.pressure === 0) return addLog(state, '这名队员目前很冷静。');
      const calmed = state.roster.map((item) => item.id === hero.id ? { ...item, pressure: Math.max(0, item.pressure - BALANCE.sedativePressureReduce) } : item);
      return addLog({ ...state, roster: calmed, expedition: { ...state.expedition, supplies: { ...state.expedition.supplies, sedative: state.expedition.supplies.sedative - 1 } } }, `${hero.name}的压力下降了。`);
    }
    case 'ADVANCE': {
      if (!state.expedition || state.expedition.enemies.some((enemy) => enemy.hp > 0)) return addLog(state, '需要先解决当前遭遇。');
      const nodes = nodesForMission(state.expedition.missionId);
      const currentNode = nodes[state.expedition.nodeIndex];
      if (currentNode?.kind === 'event' && !state.expedition.eventResolved) return addLog(state, '请先决定如何处理当前的远征事件。');
      const nextIndex = state.expedition.nodeIndex + 1;
      if (nextIndex >= nodes.length) {
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
      const node = nodesForMission(state.expedition.missionId)[state.expedition.nodeIndex];
      const event = node?.kind === 'event' && node.event?.id === action.eventId ? node.event : undefined;
      const choice = event?.choices.find((item) => item.id === action.choiceId);
      if (!event || !choice || state.expedition.eventResolved) return addLog(state, '该远征事件无法再次处理。');
      const partyIds = new Set(state.expedition.formation);
      // 一次性事件：同一远征只出现一次
      if (event.once && state.expedition.seenEvents.includes(event.id)) return addLog(state, '这个事件已经处理过了。');
      const markSeen = (next: GameState) => ({ ...next, expedition: { ...next.expedition!, seenEvents: [...next.expedition!.seenEvents, event.id] } });
      // 行囊补给消耗（如"绕路休整"消耗 1 份食物、"压制回声"消耗 1 份镇定剂）：
      // 先校验库存，不足则拒绝该选择；足够则在应用效果时统一扣减行囊补给。
      const consumes = choice.consumes ?? {};
      const lacks: string[] = [];
      const checkSupply = (n: number | undefined, have: number, label: string): void => { if ((n ?? 0) > have) lacks.push(label); };
      checkSupply(consumes.food, state.expedition.supplies.food, '食物');
      checkSupply(consumes.bandage, state.expedition.supplies.bandage, '绷带');
      checkSupply(consumes.sedative, state.expedition.supplies.sedative, '镇定剂');
      checkSupply(consumes.fireBomb, state.expedition.supplies.fireBomb, '火焰瓶');
      checkSupply(consumes.shieldElixir, state.expedition.supplies.shieldElixir, '铁壁药丸');
      if (lacks.length > 0) return addLog(state, `补给不足，无法选择「${choice.label}」（缺少${lacks.join('、')}）。`);
      const hasConsumes = Object.values(consumes).some((n) => (n ?? 0) > 0);
      const nextSupplies: Supplies = hasConsumes
        ? {
            ...state.expedition.supplies,
            food: state.expedition.supplies.food - (consumes.food ?? 0),
            bandage: state.expedition.supplies.bandage - (consumes.bandage ?? 0),
            sedative: state.expedition.supplies.sedative - (consumes.sedative ?? 0),
            fireBomb: state.expedition.supplies.fireBomb - (consumes.fireBomb ?? 0),
            shieldElixir: state.expedition.supplies.shieldElixir - (consumes.shieldElixir ?? 0),
          }
        : state.expedition.supplies;
      // 统一应用补给扣减到最终结果（所有 effect 分支共用）。
      const withConsumes = (next: GameState): GameState => hasConsumes
        ? { ...next, expedition: { ...next.expedition!, supplies: nextSupplies } }
        : next;

      if (choice.effect === 'recover') {
        const pressureCost = choice.pressureCost ?? BALANCE.restNodePressureRecover;
        const roster = state.roster.map((hero) => partyIds.has(hero.id) ? { ...hero, hp: Math.min(hero.maxHp, hero.hp + BALANCE.restNodeHpRecover), pressure: Math.max(0, hero.pressure - pressureCost) } : hero);
        return addLog(withConsumes(markSeen({ ...state, roster, expedition: { ...state.expedition, eventResolved: true } })), `${node.title}：队伍围拢休整，恢复了状态。`);
      }
      if (choice.effect === 'scavenge') {
        const pressureCost = choice.pressureCost ?? 8;
        const roster = state.roster.map((hero) => partyIds.has(hero.id) ? { ...hero, pressure: Math.min(BALANCE.pressureCap, hero.pressure + pressureCost) } : hero);
        const gainedMaterials = choice.material
          ? { ...state.expedition.gainedMaterials, [materialKey(choice.material.typeId, choice.material.rarity)]: (state.expedition.gainedMaterials[materialKey(choice.material.typeId, choice.material.rarity)] ?? 0) + choice.material.count }
          : { ...state.expedition.gainedMaterials, [materialKey('ruin-shard', 0)]: (state.expedition.gainedMaterials[materialKey('ruin-shard', 0)] ?? 0) + 1 };
        return addLog(withConsumes(markSeen({ ...state, roster, expedition: { ...state.expedition, eventResolved: true, gainedMaterials } })), `${node.title}：队伍获得了材料，全队有些不安。`);
      }
      if (choice.effect === 'track') {
        const pressureCost = choice.pressureCost ?? 10;
        const roster = state.roster.map((hero) => partyIds.has(hero.id) ? { ...hero, pressure: Math.min(BALANCE.pressureCap, hero.pressure + pressureCost) } : hero);
        const goldGain = choice.goldGain ?? 12;
        return addLog(withConsumes(markSeen({ ...state, roster, expedition: { ...state.expedition, eventResolved: true, gainedGold: state.expedition.gainedGold + goldGain } })), `${node.title}：队伍找到了遗落的价值，带回 ${goldGain} 金币。`);
      }
      if (choice.effect === 'aid_hero') {
        const hpGain = choice.hpGain ?? 12;
        const pressureCost = choice.pressureCost ?? 4;
        // 最虚弱的在编队员获得治疗，其余队员压力略升
        const party: Hero[] = [];
        for (const id of state.expedition.formation) {
          const hero = state.roster.find((item) => item.id === id);
          if (hero && hero.hp > 0) party.push(hero);
        }
        if (party.length === 0) return addLog(state, '队伍已无力处理这丛药草。');
        const weakest = party.reduce((min, cur) => (cur.hp / cur.maxHp < min.hp / min.maxHp ? cur : min), party[0]);
        const roster = state.roster.map((hero) => {
          if (!partyIds.has(hero.id)) return hero;
          if (hero.id === weakest?.id) return { ...hero, hp: Math.min(hero.maxHp, hero.hp + hpGain) };
          return { ...hero, pressure: Math.min(BALANCE.pressureCap, hero.pressure + pressureCost) };
        });
        return addLog(withConsumes(markSeen({ ...state, roster, expedition: { ...state.expedition, eventResolved: true } })), `${node.title}：队伍小心采下药草，${weakest?.name ?? '最虚弱的队员'}恢复了 ${hpGain} 点生命。`);
      }
      if (choice.effect === 'bargain') {
        const goldGain = choice.goldGain ?? 0;
        const material = choice.material;
        // 出售材料（goldGain>0）：扣材料，收入计入本次远征 gainedGold（结算时入账）
        // 购买材料（goldGain<0）：从城镇金币扣除，材料计入本次远征收益
        const key = material ? materialKey(material.typeId, material.rarity) : '';
        const owned = key ? (state.expedition.gainedMaterials[key] ?? 0) : 0;
        if (goldGain < 0 && state.gold < -goldGain) return addLog(state, '金币不足，无法完成这笔交易。');
        if (goldGain > 0 && material && owned < material.count) return addLog(state, '本次远征带出的材料不足，无法出售。');
        const gainedMaterials = material
          ? goldGain > 0
            ? { ...state.expedition.gainedMaterials, [key]: owned - material.count }
            : { ...state.expedition.gainedMaterials, [key]: owned + material.count }
          : state.expedition.gainedMaterials;
        const nextExpedition = goldGain > 0
          ? { ...state.expedition, eventResolved: true, gainedMaterials, gainedGold: state.expedition.gainedGold + goldGain }
          : { ...state.expedition, eventResolved: true, gainedMaterials };
        const nextState = goldGain > 0 ? state : { ...state, gold: state.gold + goldGain };
        return addLog(withConsumes(markSeen({ ...nextState, expedition: nextExpedition })), goldGain > 0
          ? `${node.title}：商人收下材料，付给队伍 ${goldGain} 金币。`
          : `${node.title}：队伍用 ${-goldGain} 金币从商人处购得材料。`);
      }
      if (choice.effect === 'risk_fight') {
        // 触发一场额外的可选战斗：清路惊动的敌人
        const extraEnemies = ['rock-lizard', 'ash-wolf'].map((id, index) => {
          const enemy = enemyById(id);
          return index === 0 ? enemy : { ...enemy, id: `${enemy.id}-extra` };
        });
        const enemyIntents: Record<string, import('./model').EnemyIntent> = {};
        for (const enemy of extraEnemies) enemyIntents[enemy.id] = rollIntent(enemy, undefined, 0);
        const next = {
          ...state,
          expedition: {
            ...state.expedition,
            eventResolved: true,
            enemies: extraEnemies,
            enemyIntents,
          },
        };
        return addLog(withConsumes(markSeen(next)), `${node.title}：碎石被移开的瞬间，藏匿的生物扑了出来！`);
      }
      // 穷尽性检查：新增 effect 类型时若忘记在此实现，TS 会在编译期报错。
      const _exhaustive: never = choice.effect;
      void _exhaustive;
      return addLog(state, '该事件效果尚未实现。');
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

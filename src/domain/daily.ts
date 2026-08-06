import { dayLabel, eventChains, missions, newsForThreat, nextChainNode, regions } from '../content/gameContent';
import type { GameAction, GameState } from './model';
import { addLog } from './shared';

// 事件链推进（M3 目标框架）：由明确状态条件触发，LLM 只建议不决定。
// 推进规则：
// 1. 任务胜利 → 推进所属区域的事件链；
// 2. 区域威胁达到条件节点的 minThreat → 推进；
// 3. 无下一节点 → 链结束。
export function advanceChainIfReady(state: GameState, chainId: string): GameState {
  const chain = eventChains.find((item) => item.id === chainId);
  if (!chain) return state;
  const current = state.eventChains[chainId];
  if (!current || current.completed) return state;
  const nextId = nextChainNode(chain, current.currentNode);
  if (!nextId) {
    const next: GameState = {
      ...state,
      eventChains: { ...state.eventChains, [chainId]: { ...current, completed: true } },
    };
    return addLog(next, `事件链「${chain.name}」迎来了结局。`);
  }
  const nextNode = chain.nodes.find((n) => n.id === nextId);
  // 条件节点：区域威胁不足时不能推进（等待玩家处理该区域）
  if (nextNode?.condition?.regionId && nextNode.condition.minThreat !== undefined) {
    const threat = state.regions[nextNode.condition.regionId] ?? 0;
    if (threat < nextNode.condition.minThreat) return state;
  }
  const next: GameState = {
    ...state,
    eventChains: { ...state.eventChains, [chainId]: { ...current, currentNode: nextId, completed: false } },
  };
  return addLog(next, `事件链「${chain.name}」推进到：${nextNode?.label ?? nextId}。`);
}

// 任务结算联动：胜利推进所属区域的事件链。
export function onMissionSettled(state: GameState, missionId: string, outcome: 'victory' | 'retreat' | 'defeated'): GameState {
  if (outcome !== 'victory') return state; // 失败/撤退由区域威胁承担，链等待条件满足
  const region = regions.find((r) => r.missions.includes(missionId));
  if (!region) return state;
  const chain = eventChains.find((item) => item.regionId === region.id);
  if (!chain || !state.eventChains[chain.id]) return state;
  return advanceChainIfReady(state, chain.id);
}

export function dailyReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'ACCEPT_MISSION': {
      if (state.missionAcceptedToday) return addLog(state, '今日已接取过任务，请休息至次日后再来。');
      const mission = missions.find((item) => item.id === action.missionId);
      return mission ? addLog({ ...state, selectedMissionId: mission.id, hasAcceptedMission: true, missionAcceptedToday: true }, `已接受任务：${mission.title}。`) : state;
    }
    case 'REST_TO_NEXT_DAY': {
      if (state.expedition) return addLog(state, '远征途中无法休息，请先撤回或完成远征。');
      const outcome = state.dayReport?.outcome;
      const roster = state.roster.map((hero) => ({ ...hero, hp: Math.min(hero.maxHp, hero.hp + 18), pressure: Math.max(0, hero.pressure - 16), affinity: Math.max(0, hero.affinity + (outcome === 'victory' ? 1 : 0)) }));
      // 每日新闻：按昨日结果 + 昨日任务所属区域的当前威胁生成
      const lastMissionId = state.dayReport?.missionTitle
        ? missions.find((m) => m.title === state.dayReport!.missionTitle)?.id
        : undefined;
      const lastRegion = lastMissionId ? regions.find((r) => r.missions.includes(lastMissionId)) : undefined;
      const threat = lastRegion ? (state.regions[lastRegion.id] ?? 0) : 0;
      const townNews = outcome ? newsForThreat(outcome, threat) : '晨雾散开，酒馆的告示板换上了新的委托。';
      const report = {
        completedDay: state.day,
        outcome,
        missionTitle: state.dayReport?.missionTitle,
        townNews,
        recovery: roster.filter((hero) => hero.recruited).map((hero) => ({ name: hero.name, hp: 18, pressure: 16, affinity: outcome === 'victory' ? 1 : 0 })),
        reactions: roster.filter((hero) => hero.recruited).map((hero) => {
          const line = hero.reactions[outcome || 'idle'] ?? '今晚好好休息，明天再出发。';
          return { heroId: hero.id, name: hero.name, line };
        }),
        pending: false,
      };
      return addLog({ ...state, roster, day: state.day + 1, page: 'town', missionAcceptedToday: false, food: 5, hunger: 0, giftsGivenToday: {}, settlement: null, dayReport: report }, `休息一夜，进入 ${dayLabel(state.day + 1)}。${townNews}`);
    }
    case 'ADVANCE_EVENT_CHAIN': {
      if (!state.eventChains[action.chainId]) return addLog(state, '该事件链尚未开始。');
      return advanceChainIfReady(state, action.chainId);
    }
    default: return state;
  }
}

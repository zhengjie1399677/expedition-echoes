import { activeChainNewsBonus, choiceNewsMention, dayLabel, eventChains, isMissionUnlocked, missions, newsForThreat, nextChainNode, regions } from '../content/gameContent';
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
  // 节点行为（M4 打磨 4）：推进到带 effect 的节点时应用世界变化（日志提示；实际状态变化见
  // isMissionUnlocked / activeChainNewsBonus 的查询——解锁任务进任务板、新闻附带链文案）。
  const effect = nextNode?.effect;
  const effectNote = effect
    ? effect.kind === 'unlock-mission'
      ? `新的委托「${missions.find((m) => m.id === effect.missionId)?.title ?? effect.missionId}」出现在任务板上。`
      : '边境的传闻又多了几分。'
    : '';
  return addLog(next, `事件链「${chain.name}」推进到：${nextNode?.label ?? nextId}。${effectNote}`);
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
      if (!mission) return state;
      // 事件链门控（M4 打磨 4）：未解锁的委托（如「回声余波」）不可接取，防御 UI 过滤之外的直达路径。
      if (!isMissionUnlocked(state, mission.id)) return addLog(state, '这张委托还没有被公会让出，暂时无法接取。');
      return addLog({ ...state, selectedMissionId: mission.id, hasAcceptedMission: true, missionAcceptedToday: true }, `已接受任务：${mission.title}。`);
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
      // 选择事实（M4 打磨 1）：昨日远征的关键选择被本地新闻引用（"选择有后果"闭环）。
      // 只有昨日确有过远征（outcome 存在）时才追加引用句；消费后即清空 lastExpedition。
      const mention = outcome && state.lastExpedition ? choiceNewsMention(state.lastExpedition) : null;
      const baseNews = outcome ? newsForThreat(outcome, threat) : '晨雾散开，酒馆的告示板换上了新的委托。';
      // 事件链节点行为（M4 打磨 4）：已触发的 news-bonus 文案附带在新闻后（世界变化可感知）。
      const chainBonuses = activeChainNewsBonus(state);
      const bonusText = chainBonuses.length > 0 ? ` ${chainBonuses.join(' ')}` : '';
      const townNews = `${baseNews}${bonusText}${mention ? ` ${mention}` : ''}`;
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
      return addLog({ ...state, roster, day: state.day + 1, page: 'town', missionAcceptedToday: false, food: 5, hunger: 0, giftsGivenToday: {}, settlement: null, dayReport: report, lastExpedition: undefined }, `休息一夜，进入 ${dayLabel(state.day + 1)}。${townNews}`);
    }
    case 'ADVANCE_EVENT_CHAIN': {
      if (!state.eventChains[action.chainId]) return addLog(state, '该事件链尚未开始。');
      return advanceChainIfReady(state, action.chainId);
    }
    default: return state;
  }
}

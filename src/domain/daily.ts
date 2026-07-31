import { dayLabel, missions } from '../content/gameContent';
import type { GameAction, GameState } from './model';
import { addLog } from './shared';

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
      const roster = state.roster.map((hero) => ({ ...hero, hp: Math.min(hero.maxHp, hero.hp + 18), morale: Math.max(0, hero.morale - 16), affinity: Math.max(0, hero.affinity + (outcome === 'victory' ? 1 : 0)) }));
      const townNews = outcome === 'victory' ? '广场的告示板多了一张鎏金便签：你们的远征成果已经传开，新的委托正在路上。' : outcome === 'retreat' ? '酒馆换上了更谨慎的路线图；掌柜提醒，明天会有适合重整的短委托。' : outcome === 'defeated' ? '宿舍门口留下了药师的字条：先养好伤，城门不会催促任何人。' : '晨雾散开，酒馆的告示板换上了新的委托。';
      const report = {
        completedDay: state.day,
        outcome,
        missionTitle: state.dayReport?.missionTitle,
        townNews,
        recovery: roster.map((hero) => ({ name: hero.name, hp: 18, pressure: 16, affinity: outcome === 'victory' ? 1 : 0 })),
        reactions: roster.filter((hero) => hero.recruited).map((hero) => {
          const line = hero.reactions[outcome || 'idle'] ?? '今晚好好休息，明天再出发。';
          return { heroId: hero.id, name: hero.name, line };
        })
      };
      return addLog({ ...state, roster, day: state.day + 1, page: 'town', missionAcceptedToday: false, food: 5, hunger: 0, giftsGivenToday: {}, settlement: null, dayReport: report }, `休息一夜，进入 ${dayLabel(state.day + 1)}。${townNews}`);
      if (state.expedition) return addLog(state, '远征途中无法休息，请先撤回或完成远征。');
      return addLog({ ...state, day: state.day + 1, missionAcceptedToday: false, food: 5, hunger: 0, giftsGivenToday: {} }, `休息一夜，进入 ${dayLabel(state.day + 1)}，队伍补足口粮。`);
    }
    default: return state;
  }
}

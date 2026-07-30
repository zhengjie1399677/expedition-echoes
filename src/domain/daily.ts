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
      const lines = outcome === 'victory'
        ? { lan: '今晚先把收获归档。明天，城里会知道我们带回了什么。', wu: '这下酒馆里该有人谈论我们了。别担心，我会挑着好听的听。', xingluo: '遗迹的回响还没有散去，但它已经替我们打开了一条新线索。' }
        : outcome === 'retreat' ? { lan: '撤退不是终点。把今天记下来，下一次就会更稳。', wu: '路线没白看，至少我们知道该避开什么。', xingluo: '未完成的推演，也会成为明天的准备。' }
          : outcome === 'defeated' ? { lan: '人都回来了，就还有重整队伍的机会。', wu: '下次我会先把退路画得更清楚。', xingluo: '请把这次的失误交给我复盘。明天会不一样。' }
            : { lan: '明早我会检查补给。队长也别忘了休息。', wu: '又是新一天，去看看酒馆今天有什么消息。', xingluo: '晨星的位置很好，适合重新开始。' };
      const townNews = outcome === 'victory' ? '广场的告示板多了一张鎏金便签：你们的远征成果已经传开，新的委托正在路上。' : outcome === 'retreat' ? '酒馆换上了更谨慎的路线图；掌柜提醒，明天会有适合重整的短委托。' : outcome === 'defeated' ? '宿舍门口留下了药师的字条：先养好伤，城门不会催促任何人。' : '晨雾散开，酒馆的告示板换上了新的委托。';
      const report = { completedDay: state.day, outcome, missionTitle: state.dayReport?.missionTitle, townNews, recovery: roster.map((hero) => ({ name: hero.name, hp: 18, pressure: 16, affinity: outcome === 'victory' ? 1 : 0 })), reactions: roster.filter((hero) => hero.recruited).map((hero) => ({ heroId: hero.id, name: hero.name, line: lines[hero.id as keyof typeof lines] ?? '今晚好好休息，明天再出发。' })) };
      return addLog({ ...state, roster, day: state.day + 1, page: 'town', missionAcceptedToday: false, food: 5, hunger: 0, giftsGivenToday: {}, settlement: null, dayReport: report }, `休息一夜，进入 ${dayLabel(state.day + 1)}。${townNews}`);
      if (state.expedition) return addLog(state, '远征途中无法休息，请先撤回或完成远征。');
      return addLog({ ...state, day: state.day + 1, missionAcceptedToday: false, food: 5, hunger: 0, giftsGivenToday: {} }, `休息一夜，进入 ${dayLabel(state.day + 1)}，队伍补足口粮。`);
    }
    default: return state;
  }
}

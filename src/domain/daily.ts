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
      return addLog({ ...state, day: state.day + 1, missionAcceptedToday: false, food: 5, hunger: 0, giftsGivenToday: {} }, `休息一夜，进入 ${dayLabel(state.day + 1)}，队伍补足口粮。`);
    }
    default: return state;
  }
}

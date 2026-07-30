import { affinityStage, giftDefinitions } from '../content/gameContent';
import type { GameAction, GameState } from './model';
import { addLog } from './shared';

export function relationReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'GIVE_GIFT': {
      const hero = state.roster.find((item) => item.id === action.heroId);
      const gift = giftDefinitions.find((item) => item.id === action.giftId);
      if (!hero) return addLog(state, '未找到这名队员。');
      if (!gift) return addLog(state, '未找到该礼物。');
      if ((state.inventory[gift.id] ?? 0) <= 0) return addLog(state, '没有该礼物可赠送。');
      if ((state.giftsGivenToday[hero.id] ?? 0) >= 1) return addLog(state, `今天已经给${hero.name}送过礼物了。`);
      const matched = gift.tags.some((tag) => hero.preferredGiftTags.includes(tag));
      const gain = matched ? 5 : 2;
      const stageBefore = affinityStage(hero.affinity).name;
      const stageAfter = affinityStage(hero.affinity + gain).name;
      const updatedRoster = state.roster.map((item) => item.id === hero.id ? { ...item, affinity: item.affinity + gain } : item);
      const log = stageBefore !== stageAfter ? `送出${gift.name}，${hero.name}的关系进入「${stageAfter}」。` : `送出${gift.name}，${hero.name}好感+${gain}${matched ? '（偏好）' : ''}。`;
      return addLog({ ...state, roster: updatedRoster, inventory: { ...state.inventory, [gift.id]: state.inventory[gift.id] - 1 }, giftsGivenToday: { ...state.giftsGivenToday, [hero.id]: (state.giftsGivenToday[hero.id] ?? 0) + 1 } }, log);
    }
    default: return state;
  }
}

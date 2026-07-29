import { initialHeroes, initialInventory, missions } from '../content/gameContent';
import type { GameAction, GameState } from './model';
import { combatReducer } from './combat';
import { economyReducer } from './economy';
import { expeditionReducer } from './expedition';
import { partyReducer } from './party';
import { dailyReducer } from './daily';
import { relationReducer } from './relation';

// 纯函数重新导出，保持外部 `from './gameEngine'` 引用不变。
export { attackDamage, availableItemCount, canAttack, enemyCanAttack, equipmentBonuses, enemyExperienceReward, experienceToNextLevel, gainExperience } from './combat';

export function createInitialGame(): GameState {
  return { version: 12, page: 'town', gold: 100, roster: initialHeroes.map((hero) => ({ ...hero, equipment: { ...hero.equipment } })), inventory: { ...initialInventory }, selectedHeroIds: ['lan', 'wu', 'xingluo'], selectedMissionId: missions[0].id, managementTab: 'party', expedition: null, settlement: null, settings: { moraleEnabled: true, llmEnabled: true }, log: ['酒馆备好了远征委托，请先接取任务再从城门出发。'], materials: {}, hasAcceptedMission: false, day: 1, missionAcceptedToday: false, food: 5, hunger: 0, giftsGivenToday: {} };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'NAVIGATE': return { ...state, page: action.page };
    case 'OPEN_MANAGEMENT': return { ...state, page: 'management', managementTab: action.tab };
    case 'TOGGLE_MORALE': return { ...state, settings: { ...state.settings, moraleEnabled: !state.settings.moraleEnabled } };
    case 'TOGGLE_LLM': return { ...state, settings: { ...state.settings, llmEnabled: !state.settings.llmEnabled } };
    case 'RESET': return createInitialGame();
    case 'ACCEPT_MISSION':
    case 'REST_TO_NEXT_DAY': return dailyReducer(state, action);
    case 'TOGGLE_PARTY':
    case 'MOVE_PARTY':
    case 'EQUIP_ITEM':
    case 'UNEQUIP_ITEM':
    case 'RECRUIT':
    case 'UPGRADE_GEAR': return partyReducer(state, action);
    case 'ATTACK': return combatReducer(state, action);
    case 'START_EXPEDITION':
    case 'SWAP':
    case 'USE_BANDAGE':
    case 'USE_SEDATIVE':
    case 'ADVANCE':
    case 'RETREAT': return expeditionReducer(state, action);
    case 'GIVE_GIFT': return relationReducer(state, action);
    case 'SELL_MATERIAL':
    case 'CRAFT_ITEM': return economyReducer(state, action);
    case 'CLOSE_SETTLEMENT': return { ...state, page: 'town', settlement: null };
  }
}

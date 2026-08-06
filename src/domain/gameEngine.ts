import { initialHeroes, initialInventory, missions, regions, eventChains } from '../content/gameContent';
import type { GameAction, GameState } from './model';
import { combatReducer } from './combat';
import { economyReducer } from './economy';
import { expeditionReducer } from './expedition';
import { partyReducer } from './party';
import { dailyReducer } from './daily';
import { relationReducer } from './relation';
import { regionReducer } from './region';
import { createLogger } from '../infrastructure/logger';

const logger = createLogger('game');

// 提取关键状态指标用于日志，避免输出整个庞大 state。
function snapshot(state: GameState) {
  return {
    day: state.day,
    page: state.page,
    gold: state.gold,
    hasAcceptedMission: state.hasAcceptedMission,
    selectedHeroIds: state.selectedHeroIds,
    roster: state.roster.map((h) => ({ id: h.id, hp: h.hp, maxHp: h.maxHp, pressure: h.pressure, level: h.level })),
    expedition: state.expedition
      ? { nodeIndex: state.expedition.nodeIndex, enemies: state.expedition.enemies.map((e) => ({ id: e.id, hp: e.hp })) }
      : null,
    settlement: state.settlement?.outcome ?? null,
  };
}

// 纯函数重新导出，保持外部 `from './gameEngine'` 引用不变。
export { attackDamage, availableItemCount, canAttack, enemyCanAttack, equipmentBonuses, enemyExperienceReward, experienceToNextLevel, gainExperience, pressureStage } from './combat';

export function createInitialGame(): GameState {
  return { version: 13, page: 'town', gold: 100, roster: initialHeroes.map((hero) => ({ ...hero, equipment: { ...hero.equipment } })), inventory: { ...initialInventory }, selectedHeroIds: ['lan', 'wu', 'xingluo'], selectedMissionId: missions[0].id, managementTab: 'party', expedition: null, settlement: null, dayReport: null, settings: { pressureEnabled: true, llmEnabled: true }, log: ['酒馆备好了远征委托，请先接取任务再从城门出发。'], materials: {}, hasAcceptedMission: false, day: 1, missionAcceptedToday: false, food: 5, hunger: 0, giftsGivenToday: {}, regions: Object.fromEntries(regions.map((r) => [r.id, r.threat])), eventChains: Object.fromEntries(eventChains.map((c) => [c.id, { currentNode: c.nodes[0]?.id ?? 'start', completed: false }])) };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  // 入口统一日志：记录 action 类型、关键参数与状态快照，便于排查报错时回溯分发链路。
  const { type, ...params } = action;
  logger.info(`${type} ▸ dispatch`, { params, state: snapshot(state) });

  switch (action.type) {
    case 'NAVIGATE': {
      const next = { ...state, page: action.page };
      logger.info(`${type} ✓`, { page: `${state.page}→${next.page}` });
      return next;
    }
    case 'OPEN_MANAGEMENT': {
      const next: GameState = { ...state, page: 'management', managementTab: action.tab };
      logger.info(`${type} ✓`, { tab: next.managementTab });
      return next;
    }
    case 'TOGGLE_PRESSURE': {
      const next = { ...state, settings: { ...state.settings, pressureEnabled: !state.settings.pressureEnabled } };
      logger.info(`${type} ✓`, { pressureEnabled: next.settings.pressureEnabled });
      return next;
    }
    case 'TOGGLE_LLM': {
      const next = { ...state, settings: { ...state.settings, llmEnabled: !state.settings.llmEnabled } };
      logger.info(`${type} ✓`, { llmEnabled: next.settings.llmEnabled });
      return next;
    }
    case 'RESET': {
      logger.info(`${type} ✓`, { reset: true });
      return createInitialGame();
    }
    case 'ACCEPT_MISSION':
    case 'REST_TO_NEXT_DAY':
    case 'ADVANCE_EVENT_CHAIN': {
      logger.info(`${type} → dailyReducer`);
      return dailyReducer(state, action);
    }
    case 'TOGGLE_PARTY':
    case 'MOVE_PARTY':
    case 'EQUIP_ITEM':
    case 'UNEQUIP_ITEM':
    case 'RECRUIT':
    case 'UPGRADE_GEAR': {
      logger.info(`${type} → partyReducer`);
      return partyReducer(state, action);
    }
    case 'ATTACK':
    case 'USE_SKILL':
    case 'USE_FIRE_BOMB':
    case 'USE_SHIELD_ELIXIR':
    case 'DEFEND': {
      logger.info(`${type} → combatReducer`);
      return combatReducer(state, action);
    }
    case 'START_EXPEDITION':
    case 'USE_BANDAGE':
    case 'USE_SEDATIVE':
    case 'RESOLVE_EVENT':
    case 'ADVANCE':
    case 'RETREAT': {
      logger.info(`${type} → expeditionReducer`);
      return expeditionReducer(state, action);
    }
    case 'GIVE_GIFT': {
      logger.info(`${type} → relationReducer`);
      return relationReducer(state, action);
    }
    case 'SELL_MATERIAL':
    case 'BUY_ITEM':
    case 'CRAFT_ITEM': {
      logger.info(`${type} → economyReducer`);
      return economyReducer(state, action);
    }
    case 'ESCALATE_REGION': {
      logger.info(`${type} → regionReducer`);
      return regionReducer(state, action);
    }
    case 'CLOSE_SETTLEMENT': {
      const next: GameState = { ...state, page: 'town', settlement: null };
      logger.info(`${type} ✓`, { page: next.page });
      return next;
    }
    case 'CLOSE_DAY_REPORT': {
      const next = { ...state, dayReport: null };
      logger.info(`${type} ✓`);
      return next;
    }
    default: {
      // 穷尽性检查：新增 action 类型时若忘记在此分发，TS 会在编译期报错。
      const _exhaustive: never = action;
      void _exhaustive;
      logger.warn(`${type} ✗ unhandled action`);
      return state;
    }
  }
}

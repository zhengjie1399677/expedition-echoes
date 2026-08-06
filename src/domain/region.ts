import { regions, threatMax } from '../content/gameContent';
import type { GameAction, GameState } from './model';
import { addLog } from './shared';

// 区域威胁管理（M3 目标框架）：威胁等级 0 平静 / 1 异动 / 2 危险 / 3 失控。
// 规则：只升级不强制（玩家可随时挑战更高威胁区域）；威胁变化必须可被新闻/任务板读到。

const regionName = (regionId: string): string => regions.find((r) => r.id === regionId)?.name ?? regionId;

export function regionReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'ESCALATE_REGION': {
      const current = state.regions[action.regionId] ?? 0;
      if (current >= threatMax) return addLog(state, `${regionName(action.regionId)}的威胁已到顶点，无法继续升级。`);
      const next: GameState = {
        ...state,
        regions: { ...state.regions, [action.regionId]: (current + 1) as GameState['regions'][string] },
      };
      return addLog(next, `${regionName(action.regionId)}的威胁升级了（${current} → ${current + 1}）。`);
    }
    default: return state;
  }
}

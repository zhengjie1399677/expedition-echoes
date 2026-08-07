import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { gameReducer, createInitialGame } from './gameEngine';
import { regions } from '../content/gameContent';
import type { GameState } from './model';

// 固定随机避免意图/暴击干扰
beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.2);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const ready = () => gameReducer(createInitialGame(), { type: 'ACCEPT_MISSION', missionId: 'border-echoes' });

describe('区域威胁框架', () => {
  it('初始状态包含全部区域的默认威胁', () => {
    const state = createInitialGame();
    for (const region of regions) {
      expect(state.regions[region.id]).toBe(region.threat);
    }
  });

  it('威胁升级：ESCALATE_REGION 提高等级并封顶', () => {
    let state = createInitialGame();
    expect(state.regions['border-ruins']).toBe(2);
    state = gameReducer(state, { type: 'ESCALATE_REGION', regionId: 'border-ruins' });
    expect(state.regions['border-ruins']).toBe(3);
    // 封顶 3，无法再升
    state = gameReducer(state, { type: 'ESCALATE_REGION', regionId: 'border-ruins' });
    expect(state.regions['border-ruins']).toBe(3);
  });

  it('任务失败后对应区域威胁升级（settleExpedition 联动）', () => {
    const accepted = gameReducer(createInitialGame(), { type: 'ACCEPT_MISSION', missionId: 'border-echoes' });
    const started = gameReducer(accepted, { type: 'START_EXPEDITION' });
    // 制造全灭失败：星罗预先阵亡，仅前排两人参战（与既有全灭测试一致）；敌人伤害拉满
    const doomed: GameState = {
      ...started,
      roster: started.roster.map((h) => (h.id === 'xingluo' ? { ...h, hp: 0 } : { ...h, hp: 1 })),
      expedition: { ...started.expedition!, enemies: started.expedition!.enemies.map((e) => ({ ...e, damage: 99 })) },
    };
    const defeated = gameReducer(doomed, { type: 'ATTACK', heroId: 'lan', enemyId: 'scout' });
    expect(defeated.settlement?.outcome).toBe('defeated');
    // border-echoes 属于 border-ruins，威胁从 2 → 3
    expect(defeated.regions['border-ruins']).toBe(3);
  });

  it('任务撤退后对应区域威胁升级', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    const retreated = gameReducer(started, { type: 'RETREAT' });
    expect(retreated.settlement?.outcome).toBe('retreat');
    expect(retreated.regions['border-ruins']).toBe(3); // 2 → 3
  });

  it('任务胜利不升级威胁', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    const atLast: GameState = { ...started, expedition: { ...started.expedition!, nodeIndex: 6, enemies: [] } };
    const completed = gameReducer(atLast, { type: 'ADVANCE' });
    expect(completed.settlement?.outcome).toBe('victory');
    expect(completed.regions['border-ruins']).toBe(2); // 保持
  });

  it('威胁已到顶时失败不再升级', () => {
    const accepted = gameReducer(createInitialGame(), { type: 'ACCEPT_MISSION', missionId: 'border-echoes' });
    const maxed: GameState = { ...accepted, regions: { ...accepted.regions, 'border-ruins': 3 } };
    const started = gameReducer(maxed, { type: 'START_EXPEDITION' });
    const retreated = gameReducer(started, { type: 'RETREAT' });
    expect(retreated.regions['border-ruins']).toBe(3); // 封顶
  });
});

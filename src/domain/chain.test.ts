import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { gameReducer, createInitialGame } from './gameEngine';
import { eventChains, newsForThreat } from '../content/gameContent';
import type { GameState } from './model';

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.2);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const ready = () => gameReducer(createInitialGame(), { type: 'ACCEPT_MISSION', missionId: 'border-echoes' });

describe('事件链状态机（A4）', () => {
  it('初始状态：所有事件链从首个节点开始', () => {
    const state = createInitialGame();
    for (const chain of eventChains) {
      expect(state.eventChains[chain.id].currentNode).toBe(chain.nodes[0].id);
      expect(state.eventChains[chain.id].completed).toBe(false);
    }
  });

  it('任务胜利推进所属区域事件链', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    const atLast: GameState = { ...started, expedition: { ...started.expedition!, nodeIndex: 6, enemies: [] } };
    const completed = gameReducer(atLast, { type: 'ADVANCE' });
    // border-echoes 属于 border-ruins，胜利后链从 rumor → quest-open
    const chain = eventChains.find((c) => c.regionId === 'border-ruins')!;
    expect(completed.eventChains[chain.id].currentNode).toBe('quest-open');
  });

  it('任务失败不推进事件链（威胁由区域承担）', () => {
    const accepted = gameReducer(createInitialGame(), { type: 'ACCEPT_MISSION', missionId: 'border-echoes' });
    const started = gameReducer(accepted, { type: 'START_EXPEDITION' });
    const retreated = gameReducer(started, { type: 'RETREAT' });
    const chain = eventChains.find((c) => c.regionId === 'border-ruins')!;
    expect(retreated.eventChains[chain.id].currentNode).toBe('rumor'); // 未推进
  });

  it('威胁达到条件节点后 ADVANCE_EVENT_CHAIN 推进', () => {
    let state = createInitialGame();
    // 先把威胁升到 3（quest-complete 需要 minThreat 1、ending 需要 minThreat 3）
    state = gameReducer(state, { type: 'ESCALATE_REGION', regionId: 'border-ruins' }); // 2→3
    // 任务胜利推进 rumor → quest-open
    const accepted = gameReducer(state, { type: 'ACCEPT_MISSION', missionId: 'border-echoes' });
    const started = gameReducer(accepted, { type: 'START_EXPEDITION' });
    const atLast: GameState = { ...started, expedition: { ...started.expedition!, nodeIndex: 6, enemies: [] } };
    const completed = gameReducer(atLast, { type: 'ADVANCE' });
    const chain = eventChains.find((c) => c.regionId === 'border-ruins')!;
    // quest-open → quest-complete（threat 3 ≥ 1 满足）
    const advanced = gameReducer(completed, { type: 'ADVANCE_EVENT_CHAIN', chainId: chain.id });
    expect(advanced.eventChains[chain.id].currentNode).toBe('quest-complete');
    // quest-complete → followup-open（无条件）
    const advanced2 = gameReducer(advanced, { type: 'ADVANCE_EVENT_CHAIN', chainId: chain.id });
    expect(advanced2.eventChains[chain.id].currentNode).toBe('followup-open');
    // followup-open → ending（threat 3 ≥ 3 满足）
    const advanced3 = gameReducer(advanced2, { type: 'ADVANCE_EVENT_CHAIN', chainId: chain.id });
    expect(advanced3.eventChains[chain.id].currentNode).toBe('ending');
    // ending → 链结束
    const final = gameReducer(advanced3, { type: 'ADVANCE_EVENT_CHAIN', chainId: chain.id });
    expect(final.eventChains[chain.id].completed).toBe(true);
  });

  it('威胁不足时条件节点不推进', () => {
    const state = createInitialGame(); // border-ruins 威胁 2
    const accepted = gameReducer(state, { type: 'ACCEPT_MISSION', missionId: 'border-echoes' });
    const started = gameReducer(accepted, { type: 'START_EXPEDITION' });
    const atLast: GameState = { ...started, expedition: { ...started.expedition!, nodeIndex: 6, enemies: [] } };
    const completed = gameReducer(atLast, { type: 'ADVANCE' });
    const chain = eventChains.find((c) => c.regionId === 'border-ruins')!;
    // 已到 quest-open；尝试推进到 quest-complete（需要 minThreat 1，满足），继续推进到 followup-open（无条件）
    const advanced = gameReducer(completed, { type: 'ADVANCE_EVENT_CHAIN', chainId: chain.id });
    // quest-open → quest-complete（威胁 2 ≥ 1 ✓）
    expect(advanced.eventChains[chain.id].currentNode).toBe('quest-complete');
  });
});

describe('每日新闻模板（A4）', () => {
  it('按结果与威胁等级返回对应新闻', () => {
    expect(newsForThreat('victory', 0)).toContain('告示板');
    expect(newsForThreat('victory', 2)).toContain('平息');
    expect(newsForThreat('defeated', 3)).toContain('灯塔');
    expect(newsForThreat('retreat', 1)).toContain('路线图');
  });

  it('未知威胁等级回退到 0 级', () => {
    expect(newsForThreat('victory', 99)).toBe(newsForThreat('victory', 0));
  });

  it('休息至次日按昨日任务区域威胁生成新闻', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    const atLast: GameState = { ...started, expedition: { ...started.expedition!, nodeIndex: 6, enemies: [] } };
    const completed = gameReducer(atLast, { type: 'ADVANCE' });
    const nextDay = gameReducer(completed, { type: 'REST_TO_NEXT_DAY' });
    // border-ruins 威胁 2 + victory → "平息"模板
    expect(nextDay.dayReport?.townNews).toContain('平息');
  });
});

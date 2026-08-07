// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Settlement } from './Settlement';
import { createInitialGame } from '../../domain/gameEngine';
import type { GameState } from '../../domain/model';

// 构造一个位于结算页、带 settlement 数据的 GameState（默认胜利结算）。
const settlementState = (overrides: Partial<GameState> = {}): GameState => ({
  ...createInitialGame(),
  page: 'settlement',
  settlement: {
    outcome: 'victory',
    consumedSupplies: { food: 2, bandage: 1, sedative: 0, fireBomb: 0, shieldElixir: 0 },
    lootGold: 50,
    lootMaterials: { 'ruin-shard:0': 2 },
    gainedExperience: 30,
  },
  ...overrides,
});

describe('Settlement 队员反应区（M4 打磨 3）', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('胜利结算显示队员反应区：氛围引子 + 逐角色 heroes.json 台词', () => {
    render(<Settlement state={settlementState()} dispatch={vi.fn()} />);
    expect(screen.getByText('队员反应')).toBeDefined();
    // 氛围引子：未命中选择事实时用 victory default
    expect(screen.getByText(/远征告一段落/)).toBeDefined();
    // 岚的胜利台词来自 heroes.json reactions
    expect(screen.getByText(/今晚先把收获归档/)).toBeDefined();
  });

  it('撤退结算引用撤退位置（lastExpedition.nodeReached → 节点标题「回声长廊」）', () => {
    const state = settlementState({
      settlement: {
        ...settlementState().settlement!,
        outcome: 'retreat',
        lootGold: 0,
        lootMaterials: {},
        gainedExperience: 5,
      },
      lastExpedition: { outcome: 'retreat', missionId: 'border-echoes', choices: ['retreat-at-node-3'], nodeReached: 2 },
    });
    render(<Settlement state={state} dispatch={vi.fn()} />);
    expect(screen.getByText(/回声长廊/)).toBeDefined();
    // 撤退角色台词（岚）
    expect(screen.getByText(/撤退不是终点/)).toBeDefined();
  });

  it('失败结算显示全灭氛围与失败台词（命中选择时引用具体选择）', () => {
    const state = settlementState({
      settlement: {
        ...settlementState().settlement!,
        outcome: 'defeated',
        lootGold: 0,
        lootMaterials: {},
        gainedExperience: 0,
      },
      lastExpedition: { outcome: 'defeated', missionId: 'border-echoes', choices: ['collapsed-passage:risk_fight'], nodeReached: 4 },
    });
    render(<Settlement state={state} dispatch={vi.fn()} />);
    // 氛围引子命中 defeated 表的 collapsed-passage:risk_fight
    expect(screen.getByText(/清路惊动的生物超出了预期/)).toBeDefined();
    // 失败角色台词（岚）
    expect(screen.getByText(/人都回来了，就还有重整队伍的机会/)).toBeDefined();
  });

  it('失败结算未命中选择时回退 outcome 默认氛围（力竭而归）', () => {
    const state = settlementState({
      settlement: {
        ...settlementState().settlement!,
        outcome: 'defeated',
        lootGold: 0,
        lootMaterials: {},
        gainedExperience: 0,
      },
      // supply-room:scavenge 不在 defeated 表中 → 回退 default
      lastExpedition: { outcome: 'defeated', missionId: 'border-echoes', choices: ['supply-room:scavenge'], nodeReached: 4 },
    });
    render(<Settlement state={state} dispatch={vi.fn()} />);
    expect(screen.getByText(/力竭而归/)).toBeDefined();
  });

  it('选择事实命中时氛围引子引用具体选择（supply-room:scavenge）', () => {
    const state = settlementState({
      lastExpedition: { outcome: 'victory', missionId: 'border-echoes', choices: ['supply-room:scavenge'], nodeReached: 6 },
    });
    render(<Settlement state={state} dispatch={vi.fn()} />);
    expect(screen.getByText(/尘封的箱柜/)).toBeDefined();
  });

  it('无 lastExpedition 时也能正常渲染（旧档/无历史事实场景，回退 outcome 默认）', () => {
    const state = settlementState({ lastExpedition: undefined });
    render(<Settlement state={state} dispatch={vi.fn()} />);
    expect(screen.getByText(/远征告一段落/)).toBeDefined();
  });
});

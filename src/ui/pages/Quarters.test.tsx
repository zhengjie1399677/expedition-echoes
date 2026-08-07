// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Quarters } from './Quarters';
import { createInitialGame } from '../../domain/gameEngine';
import type { GameState } from '../../domain/model';

// 点击指定角色的房间，返回渲染后的聊天窗口文本。
const enterRoom = (state: GameState, heroName: string) => {
  render(<Quarters state={state} dispatch={vi.fn()} onRestClick={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`${heroName}的房间`) }));
};

describe('Quarters 宿舍离线 greeting（M4 打磨 2：事实注入）', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('有 lastExpedition 且命中选择时，greeting 引用具体选择（翻找箱柜）', () => {
    const state: GameState = {
      ...createInitialGame(),
      page: 'quarters',
      lastExpedition: { outcome: 'victory', missionId: 'border-echoes', choices: ['supply-room:scavenge'], goldGained: 50, materialsGained: 1, nodeReached: 6 },
    };
    enterRoom(state, '岚');
    expect(screen.getByText(/翻找箱柜/)).toBeDefined();
  });

  it('有 lastExpedition 但未命中选择时，回退 outcome 默认台词（撤退）', () => {
    const state: GameState = {
      ...createInitialGame(),
      page: 'quarters',
      lastExpedition: { outcome: 'retreat', missionId: 'border-echoes', choices: ['retreat-at-node-3'], nodeReached: 2 },
    };
    enterRoom(state, '岚');
    // 撤退节点命中 lan.retreat 键 → 引用撤退相关台词
    expect(screen.getByText(/活着回来，才有下一次远征/)).toBeDefined();
  });

  it('无 lastExpedition 时回退旧版关键词泛用逻辑（log 匹配远征完成）', () => {
    const state: GameState = {
      ...createInitialGame(),
      page: 'quarters',
      lastExpedition: undefined,
      log: ['远征完成，全队带回 50 金币。'],
    };
    enterRoom(state, '岚');
    expect(screen.getByText(/先把伤口和补给清点完/)).toBeDefined();
  });

  it('无 lastExpedition 且 log 无关键词时回退常驻问候', () => {
    const state: GameState = {
      ...createInitialGame(),
      page: 'quarters',
      lastExpedition: undefined,
      log: ['酒馆备好了远征委托。'],
    };
    enterRoom(state, '岚');
    expect(screen.getByText(/还没休息吗/)).toBeDefined();
  });
});

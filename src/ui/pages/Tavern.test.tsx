// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Tavern } from './Tavern';
import { createInitialGame } from '../../domain/gameEngine';
import type { GameState } from '../../domain/model';

const openBoard = (state: GameState) => {
  render(<Tavern state={state} dispatch={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '查看公会任务板' }));
};

describe('Tavern 任务板事件链解锁（M4 打磨 4）', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('未解锁的「回声余波」不在任务板出现', () => {
    openBoard(createInitialGame());
    // 初始链在 rumor：echo-aftermath 被门控 → 不显示
    expect(screen.queryByText('回声余波')).toBeNull();
    // 既有委托正常显示
    expect(screen.getByText('边境回声')).toBeDefined();
  });

  it('解锁后「回声余波」出现在任务板并带事件链徽章', () => {
    const base = createInitialGame();
    const state: GameState = {
      ...base,
      eventChains: {
        ...base.eventChains,
        'border-echoes-chain': { currentNode: 'quest-open', completed: false },
      },
    };
    openBoard(state);
    expect(screen.getByText('回声余波')).toBeDefined();
    expect(screen.getAllByText('事件链解锁').length).toBeGreaterThan(0);
  });

  it('链完成后解锁委托仍保留在任务板', () => {
    const base = createInitialGame();
    const state: GameState = {
      ...base,
      eventChains: {
        ...base.eventChains,
        'border-echoes-chain': { currentNode: 'ending', completed: true },
      },
    };
    openBoard(state);
    expect(screen.getByText('回声余波')).toBeDefined();
  });
});

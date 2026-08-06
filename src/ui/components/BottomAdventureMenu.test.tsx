// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BottomAdventureMenu } from './BottomAdventureMenu';
import { createInitialGame } from '../../domain/gameEngine';
import type { GameState } from '../../domain/model';

describe('BottomAdventureMenu 组件', () => {
  afterEach(() => {
    cleanup();
  });

  it('在 settings、expedition 和 settlement 页面时，应返回 null 且不渲染任何内容', () => {
    const dispatch = vi.fn();
    const baseState = createInitialGame();

    const testPages: GameState['page'][] = ['settings', 'expedition', 'settlement'];
    testPages.forEach((page) => {
      const state = { ...baseState, page };
      const { container } = render(<BottomAdventureMenu state={state} dispatch={dispatch} />);
      expect(container.firstChild).toBeNull();
    });
  });

  it('在 town 页面时，应正确渲染全部四个导航按钮，且“城镇”处于激活状态', () => {
    const dispatch = vi.fn();
    const state = { ...createInitialGame(), page: 'town' as const };

    render(<BottomAdventureMenu state={state} dispatch={dispatch} />);

    const menu = screen.getByRole('navigation', { name: '冒险菜单' });
    expect(menu).toBeDefined();

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(5);

    // 验证对应文本与激活类
    const townButton = buttons.find((btn) => btn.textContent?.includes('城镇'));
    expect(townButton).toBeDefined();
    expect(townButton?.className).toContain('active');

    const backpackButton = buttons.find((btn) => btn.textContent?.includes('背包'));
    expect(backpackButton).toBeDefined();
    expect(backpackButton?.className).not.toContain('active');

    const craftButton = buttons.find((btn) => btn.textContent?.includes('打造'));
    expect(craftButton).toBeDefined();
    expect(craftButton?.className).not.toContain('active');
  });

  it('点击其他非激活按钮时，应正确派发 (dispatch) 对应 NAVIGATE 或 OPEN_MANAGEMENT Action', () => {
    const dispatch = vi.fn();
    const state = { ...createInitialGame(), page: 'town' as const };

    render(<BottomAdventureMenu state={state} dispatch={dispatch} />);

    const buttons = screen.getAllByRole('button');
    const backpackButton = buttons.find((btn) => btn.textContent?.includes('背包'))!;

    // 触发点击背包
    fireEvent.click(backpackButton);

    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({
      type: 'OPEN_MANAGEMENT',
      tab: 'inventory',
    });
  });
});

// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Town } from './Town';
import { createInitialGame } from '../../domain/gameEngine';

describe('Town 页面组件（冒烟）', () => {
  afterEach(() => {
    cleanup();
  });

  const renderTown = (overrides: Partial<ReturnType<typeof createInitialGame>> = {}) => {
    const dispatch = vi.fn();
    const onGateClick = vi.fn();
    const state = { ...createInitialGame(), ...overrides };
    render(<Town state={state} dispatch={dispatch} onGateClick={onGateClick} />);
    return { dispatch, onGateClick };
  };

  it('冒烟：正常渲染城镇地图、热点与常驻威胁概况条', () => {
    renderTown();

    expect(screen.getByText('旅途酒馆')).toBeDefined();
    expect(screen.getByText('中央广场')).toBeDefined();
    expect(screen.getByText('旅人宿舍')).toBeDefined();
    expect(screen.getByText('东侧城门')).toBeDefined();

    // 常驻威胁条（Top 1 新增）：按 GameState.regions 渲染各区域徽章
    const strip = screen.getByLabelText('区域威胁概况');
    expect(strip).toBeDefined();
    expect(strip.textContent).toContain('边境遗迹');
    expect(strip.textContent).toContain('危险');
  });

  it('点击「边境情报」热点打开区域情报面板，可再关闭', () => {
    renderTown();

    // 初始不显示情报面板
    expect(screen.queryByText('区域局势与事件链')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '打开边境情报' }));
    expect(screen.getByText('区域局势与事件链')).toBeDefined();
    expect(screen.getByText('区域威胁')).toBeDefined();
    expect(screen.getByText('事件链')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: '关闭边境情报' }));
    expect(screen.queryByText('区域局势与事件链')).toBeNull();
  });

  it('未接任务时点击城门引导至酒馆，不触发 onGateClick', () => {
    const { dispatch, onGateClick } = renderTown({ hasAcceptedMission: false });

    fireEvent.click(screen.getByRole('button', { name: /东侧城门/ }));

    expect(dispatch).toHaveBeenCalledWith({ type: 'NAVIGATE', page: 'tavern' });
    expect(onGateClick).not.toHaveBeenCalled();
  });

  it('已接任务时点击城门触发 onGateClick', () => {
    const { dispatch, onGateClick } = renderTown({ hasAcceptedMission: true });

    fireEvent.click(screen.getByRole('button', { name: /东侧城门/ }));

    expect(dispatch).not.toHaveBeenCalled();
    expect(onGateClick).toHaveBeenCalledOnce();
  });
});

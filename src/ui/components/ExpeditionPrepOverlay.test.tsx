// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ExpeditionPrepOverlay } from './ExpeditionPrepOverlay';
import { createInitialGame } from '../../domain/gameEngine';

describe('ExpeditionPrepOverlay 组件', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('若出征队伍人数不足 2 人，应显示警告提示，且禁用“确认出发”按钮', () => {
    const dispatch = vi.fn();
    const onClose = vi.fn();
    const state = {
      ...createInitialGame(),
      selectedHeroIds: ['lan'], // 只有 1 人，不足 2 人
    };

    render(<ExpeditionPrepOverlay state={state} dispatch={dispatch} onClose={onClose} />);

    expect(screen.getByText(/至少需要 2 名队员出征/)).toBeDefined();
    const confirmButton = screen.getByRole('button', { name: '确认出发' }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
  });

  it('库存充足时，点击“+”与“-”可以增减携带道具，但不能超出最大行囊容量 (10)', () => {
    const dispatch = vi.fn();
    const onClose = vi.fn();
    const state = {
      ...createInitialGame(),
      food: 15,
      inventory: { bandage: 12, sedative: 5 },
      selectedHeroIds: ['lan', 'wu'], // 2 人，有效队伍
    };

    const { container } = render(<ExpeditionPrepOverlay state={state} dispatch={dispatch} onClose={onClose} />);

    const foodAddBtn = screen.getByRole('button', { name: '增加口粮' });
    const bandageAddBtn = screen.getByRole('button', { name: '增加绷带' }) as HTMLButtonElement;
    const confirmButton = screen.getByRole('button', { name: '确认出发' }) as HTMLButtonElement;

    expect(confirmButton.disabled).toBe(false);

    // 疯狂点击增加口粮，使其达到 10 个携带量
    for (let i = 0; i < 10; i++) {
      fireEvent.click(foodAddBtn);
    }

    const carryVals = container.querySelectorAll('.carry-val');
    // carryVals[0] 是口粮的携带值，应为 10
    expect(carryVals[0].textContent).toBe('10');

    // 此时已满 10，增加绷带的按钮应被禁用
    expect(bandageAddBtn.disabled).toBe(true);

    // 再次点击增加口粮，口粮携带量应依然是 10，不会超出上限
    fireEvent.click(foodAddBtn);
    expect(carryVals[0].textContent).toBe('10');
  });

  it('点击“确认出发”时，应派发 START_EXPEDITION Action，保存配置并关闭窗口', () => {
    const dispatch = vi.fn();
    const onClose = vi.fn();
    const state = {
      ...createInitialGame(),
      food: 5,
      inventory: { bandage: 5, sedative: 2 },
      selectedHeroIds: ['lan', 'wu'],
    };

    render(<ExpeditionPrepOverlay state={state} dispatch={dispatch} onClose={onClose} />);

    const foodAddBtn = screen.getByRole('button', { name: '增加口粮' });
    const bandageAddBtn = screen.getByRole('button', { name: '增加绷带' });

    // 增加 2 口粮，1 绷带
    fireEvent.click(foodAddBtn);
    fireEvent.click(foodAddBtn);
    fireEvent.click(bandageAddBtn);

    const confirmButton = screen.getByRole('button', { name: '确认出发' });
    fireEvent.click(confirmButton);

    // 验证派发的 action
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({
      type: 'START_EXPEDITION',
      supplies: { food: 2, bandage: 1, sedative: 0 },
    });

    // 验证 localStorage 是否缓存了配置
    const cached = JSON.parse(localStorage.getItem('last_expedition_supplies') || '{}');
    expect(cached).toEqual({ food: 2, bandage: 1, sedative: 0 });

    // 验证 onClose 是否调用
    expect(onClose).toHaveBeenCalledOnce();
  });
});

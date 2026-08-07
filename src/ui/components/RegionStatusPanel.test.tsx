// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RegionStatusPanel } from './RegionStatusPanel';
import { createInitialGame } from '../../domain/gameEngine';
import { eventChains, regions, threatMax } from '../../content/gameContent';

describe('RegionStatusPanel 组件（M3 区域威胁 / 事件链 UI 闭环）', () => {
  afterEach(() => {
    cleanup();
  });

  it('渲染全部区域的威胁等级与事件链进度', () => {
    const dispatch = vi.fn();
    const state = createInitialGame();

    render(<RegionStatusPanel state={state} dispatch={dispatch} />);

    // 区域威胁：每个区域名 + 威胁徽章（区域名也可能出现在事件链所属区域标签中）
    for (const region of regions) {
      expect(screen.getAllByText(region.name).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText(/威胁：危险/).length).toBeGreaterThan(0); // border-ruins / sealed-gate 初始 2
    expect(screen.getByText(/威胁：平静/)).toBeDefined(); // north-canal 初始 0

    // 事件链：链名与当前节点（初始为首节点 rumor → 传闻出现）
    for (const chain of eventChains) {
      expect(screen.getByText(chain.name)).toBeDefined();
    }
    expect(screen.getByText('当前节点')).toBeDefined();
    expect(screen.getByText('传闻出现')).toBeDefined();
  });

  it('点击“升级威胁”派发 ESCALATE_REGION Action', () => {
    const dispatch = vi.fn();
    const state = createInitialGame();

    render(<RegionStatusPanel state={state} dispatch={dispatch} />);

    fireEvent.click(screen.getByRole('button', { name: '升级边境遗迹威胁' }));

    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({ type: 'ESCALATE_REGION', regionId: 'border-ruins' });
  });

  it('威胁已达顶点（threatMax）时升级按钮禁用', () => {
    const dispatch = vi.fn();
    const base = createInitialGame();
    const state = {
      ...base,
      regions: { ...base.regions, 'border-ruins': threatMax as 3 },
    };

    render(<RegionStatusPanel state={state} dispatch={dispatch} />);

    const escalateButton = screen.getByRole('button', { name: '升级边境遗迹威胁' }) as HTMLButtonElement;
    expect(escalateButton.disabled).toBe(true);
    expect(escalateButton.textContent).toContain('威胁已到顶点');

    // 未到顶点的区域仍可升级
    const forestButton = screen.getByRole('button', { name: '升级灰烬林地威胁' }) as HTMLButtonElement;
    expect(forestButton.disabled).toBe(false);
  });

  it('点击“推进事件链”派发 ADVANCE_EVENT_CHAIN Action', () => {
    const dispatch = vi.fn();
    const state = createInitialGame();

    render(<RegionStatusPanel state={state} dispatch={dispatch} />);

    fireEvent.click(screen.getByRole('button', { name: '推进边境遗迹的回声事件链' }));

    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({ type: 'ADVANCE_EVENT_CHAIN', chainId: 'border-echoes-chain' });
  });

  it('下一节点威胁条件不足时推进按钮禁用并显示提示', () => {
    const dispatch = vi.fn();
    const base = createInitialGame();
    // 把链推到 followup-open：下一节点 ending 需要 border-ruins 威胁 ≥ 3，而初始为 2
    const state = {
      ...base,
      eventChains: {
        ...base.eventChains,
        'border-echoes-chain': { currentNode: 'followup-open', completed: false },
      },
    };

    render(<RegionStatusPanel state={state} dispatch={dispatch} />);

    const advanceButton = screen.getByRole('button', { name: '推进边境遗迹的回声事件链' }) as HTMLButtonElement;
    expect(advanceButton.disabled).toBe(true);
    expect(advanceButton.textContent).toContain('条件不足');
    expect(screen.getByText(/需要「边境遗迹」威胁达到 3/)).toBeDefined();
  });

  it('事件链已完成时推进按钮禁用并标记完成', () => {
    const dispatch = vi.fn();
    const base = createInitialGame();
    const state = {
      ...base,
      eventChains: {
        ...base.eventChains,
        'border-echoes-chain': { currentNode: 'ending', completed: true },
      },
    };

    render(<RegionStatusPanel state={state} dispatch={dispatch} />);

    expect(screen.getByText('已完成')).toBeDefined();
    // “事件链已结束”同时出现在当前节点文案与按钮文本中
    expect(screen.getAllByText('事件链已结束').length).toBeGreaterThan(0);
    const advanceButton = screen.getByRole('button', { name: '推进边境遗迹的回声事件链' }) as HTMLButtonElement;
    expect(advanceButton.disabled).toBe(true);
  });

  it('位于最后一个节点（未完成）时，推进按钮允许结束事件链', () => {
    const dispatch = vi.fn();
    const base = createInitialGame();
    const state = {
      ...base,
      eventChains: {
        ...base.eventChains,
        'border-echoes-chain': { currentNode: 'ending', completed: false },
      },
    };

    render(<RegionStatusPanel state={state} dispatch={dispatch} />);

    const advanceButton = screen.getByRole('button', { name: '推进边境遗迹的回声事件链' }) as HTMLButtonElement;
    expect(advanceButton.disabled).toBe(false);
    expect(advanceButton.textContent).toContain('结束事件链');

    fireEvent.click(advanceButton);
    expect(dispatch).toHaveBeenCalledWith({ type: 'ADVANCE_EVENT_CHAIN', chainId: 'border-echoes-chain' });
  });

  it('事件链节点已生效的 effect 显示小字提示（解锁委托，M4 打磨 4）', () => {
    const dispatch = vi.fn();
    const base = createInitialGame();
    const state = {
      ...base,
      eventChains: {
        ...base.eventChains,
        'border-echoes-chain': { currentNode: 'quest-open', completed: false },
      },
    };

    render(<RegionStatusPanel state={state} dispatch={dispatch} />);

    expect(screen.getByText(/已生效：解锁委托「回声余波」/)).toBeDefined();
  });

  it('事件链节点无 effect 时（初始 rumor）不显示生效提示', () => {
    const dispatch = vi.fn();
    render(<RegionStatusPanel state={createInitialGame()} dispatch={dispatch} />);
    expect(screen.queryByText(/已生效/)).toBeNull();
  });

  it('提供 onClose 时渲染关闭按钮并回调', () => {
    const dispatch = vi.fn();
    const onClose = vi.fn();
    const state = createInitialGame();

    render(<RegionStatusPanel state={state} dispatch={dispatch} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '关闭边境情报' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

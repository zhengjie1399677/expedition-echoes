// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BattleCanvasBoundary } from './BattleCanvasBoundary';

// 触发子组件渲染时抛错，验证 ErrorBoundary 隔离错误并渲染占位框。
function Boom(): never { throw new Error('phaser boom'); }

describe('BattleCanvasBoundary (BUG-003 黑屏兜底)', () => {
  afterEach(() => { cleanup(); });

  it('子组件正常时不显示兜底', () => {
    render(<BattleCanvasBoundary><div data-testid="ok">child</div></BattleCanvasBoundary>);
    expect(screen.getByTestId('ok')).toBeTruthy();
    expect(screen.queryByText(/战场画面暂时无法渲染/)).toBeNull();
  });

  it('子组件抛错时捕获并渲染兜底框', () => {
    // 抑制 React 报出的未捕获错误日志，避免污染测试输出。
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(
      <BattleCanvasBoundary>
        <Boom />
      </BattleCanvasBoundary>
    );
    expect(screen.getByText(/战场画面暂时无法渲染/)).toBeTruthy();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('兜底框携带可访问的 aria-label 与 phaser-battle-fallback 样式钩子', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { container } = render(
      <BattleCanvasBoundary>
        <Boom />
      </BattleCanvasBoundary>
    );
    const fallback = container.querySelector('.phaser-battle-fallback');
    expect(fallback).toBeTruthy();
    expect(fallback?.getAttribute('aria-label')).toBe('战场画面暂不可用');
    spy.mockRestore();
  });
});
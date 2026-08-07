import { Component, type ErrorInfo, type ReactNode } from 'react';

// BattleCanvas 错误隔离：Phaser 4 在战斗/事件节点 key 切换时若与 React StrictMode 的 mount/cleanup/remount
// 产生竞态抛错，没有 error boundary 会导致整页卸载出现黑屏。此处捕获后渲染占位框，
// 远征页其余部分（队伍、技能、事件选项、撤退）仍可正常操作。
export interface BattleCanvasBoundaryProps {
  children: ReactNode;
}
interface BattleCanvasBoundaryState {
  error: Error | null;
}
export class BattleCanvasBoundary extends Component<BattleCanvasBoundaryProps, BattleCanvasBoundaryState> {
  state: BattleCanvasBoundaryState = { error: null };
  static getDerivedStateFromError(error: Error): BattleCanvasBoundaryState { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('[BattleCanvas] 渲染异常已隔离：', error?.message, info.componentStack);
  }
  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="phaser-battle-shell phaser-battle-fallback" role="img" aria-label="战场画面暂不可用">
          <div className="phaser-battle-fallback-text">战场画面暂时无法渲染，可继续当前节点操作（事件/前进/撤退）。</div>
        </div>
      );
    }
    return this.props.children;
  }
}
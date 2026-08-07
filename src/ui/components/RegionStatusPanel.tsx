import type { GameAction, GameState } from '../../domain/model';
import { eventChains, missions, nextChainNode, regions, threatMax, threatNames } from '../../content/gameContent';

export interface RegionStatusPanelProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  onClose?: () => void;
}

const regionName = (regionId: string): string => regions.find((item) => item.id === regionId)?.name ?? regionId;

// 边境情报面板（M3 UI 闭环）：只读展示区域威胁与事件链进度，交互通过既有动作派发通道
// （ESCALATE_REGION / ADVANCE_EVENT_CHAIN）驱动领域层状态变更，UI 不直接改写状态。
export function RegionStatusPanel({ state, dispatch, onClose }: RegionStatusPanelProps) {
  return (
    <section className="intel-panel" aria-label="边境情报">
      <header className="intel-header">
        <div>
          <small>边境情报 · 侦察台</small>
          <strong>区域局势与事件链</strong>
        </div>
        {onClose && (
          <button className="intel-close" aria-label="关闭边境情报" onClick={onClose}>×</button>
        )}
      </header>

      <div className="intel-body">
        <section className="intel-section">
          <h4>区域威胁</h4>
          <p className="intel-hint">威胁越高，委托越凶险；主动升级威胁可推进部分事件链。</p>
          <div className="intel-region-list">
            {regions.map((region) => {
              const threat = state.regions[region.id] ?? region.threat;
              const maxed = threat >= threatMax;
              return (
                <article key={region.id} className="intel-region">
                  <div className="intel-region-head">
                    <strong>{region.name}</strong>
                    <span className={`threat-badge threat-${threat}`}>
                      威胁：{threatNames[threat] ?? threat}
                    </span>
                  </div>
                  <div className="threat-bar" aria-label={`${region.name}威胁等级 ${threat}`}>
                    {Array.from({ length: threatMax }, (_, index) => (
                      <i key={index} className={index < threat ? 'filled' : ''} />
                    ))}
                  </div>
                  <p className="intel-region-desc">{region.description}</p>
                  <button
                    className="intel-action"
                    disabled={maxed}
                    aria-label={`升级${region.name}威胁`}
                    onClick={() => dispatch({ type: 'ESCALATE_REGION', regionId: region.id })}
                  >
                    {maxed ? '威胁已到顶点' : '升级威胁'}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="intel-section">
          <h4>事件链</h4>
          <p className="intel-hint">事件链按区域推进，部分节点需要对应区域威胁达标才能继续。</p>
          <div className="intel-chain-list">
            {eventChains.map((chain) => {
              const chainState = state.eventChains[chain.id];
              if (!chainState) return null;
              const currentIndex = chain.nodes.findIndex((node) => node.id === chainState.currentNode);
              const nextId = nextChainNode(chain, chainState.currentNode);
              const nextNode = nextId ? chain.nodes.find((node) => node.id === nextId) : undefined;
              // 已是最后一个节点时，再次推进会让领域层把链标记为已完成。
              const isLastNode = !nextNode;
              const condition = nextNode?.condition;
              const blockedByThreat = Boolean(
                condition?.regionId !== undefined &&
                condition.minThreat !== undefined &&
                (state.regions[condition.regionId] ?? 0) < condition.minThreat
              );
              const canAdvance = !chainState.completed && (isLastNode || !blockedByThreat);
              const blockedHint =
                condition?.regionId !== undefined &&
                condition.minThreat !== undefined &&
                blockedByThreat
                  ? `下一步「${nextNode?.label ?? ''}」需要「${regionName(condition.regionId)}」威胁达到 ${condition.minThreat}`
                  : '';
              const region = regions.find((item) => item.id === chain.regionId);
              const currentLabel = chainState.completed
                ? '事件链已结束'
                : chain.nodes[currentIndex]?.label ?? chainState.currentNode;
              return (
                <article key={chain.id} className={`intel-chain ${chainState.completed ? 'completed' : ''}`}>
                  <div className="intel-chain-head">
                    <strong>{chain.name}</strong>
                    <span className="intel-chain-region">{region?.name ?? chain.regionId}</span>
                    {chainState.completed && <em className="intel-chain-done">已完成</em>}
                  </div>
                  <div className="chain-steps" aria-label={`${chain.name}进度`}>
                    {chain.nodes.map((node, index) => (
                      <i
                        key={node.id}
                        className={
                          chainState.completed
                            ? 'done'
                            : index < currentIndex
                              ? 'done'
                              : index === currentIndex
                                ? 'current'
                                : 'todo'
                        }
                        title={node.label}
                      />
                    ))}
                  </div>
                  <div className="intel-chain-current">
                    <span>当前节点</span>
                    <strong>{currentLabel}</strong>
                  </div>
                  {/* 节点已生效的行为（M4 打磨 4）：小字提示世界变化（解锁委托/新闻提及） */}
                  {!chainState.completed && (() => {
                    const effect = chain.nodes[currentIndex]?.effect;
                    if (!effect) return null;
                    return (
                      <p className="intel-chain-effect">
                        {effect.kind === 'unlock-mission'
                          ? `已生效：解锁委托「${missions.find((m) => m.id === effect.missionId)?.title ?? effect.missionId}」`
                          : '已生效：新闻将提及这条传闻'}
                      </p>
                    );
                  })()}
                  {blockedHint && <p className="intel-chain-blocked">{blockedHint}</p>}
                  <button
                    className="intel-action"
                    disabled={!canAdvance}
                    aria-label={`推进${chain.name}事件链`}
                    onClick={() => dispatch({ type: 'ADVANCE_EVENT_CHAIN', chainId: chain.id })}
                  >
                    {chainState.completed
                      ? '事件链已结束'
                      : isLastNode
                        ? '结束事件链'
                        : canAdvance
                          ? `推进到「${nextNode?.label ?? ''}」`
                          : '条件不足'}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}

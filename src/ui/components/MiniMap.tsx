import type { ExpeditionNode } from '../../domain/model';

export interface MiniMapProps {
  currentNode: number;
  nodes: readonly ExpeditionNode[];
}

export function MiniMap({ currentNode, nodes }: MiniMapProps) {
  const cells = [
    { column: 1, row: 2 },
    { column: 2, row: 2 },
    { column: 2, row: 1 },
    { column: 3, row: 1 },
    { column: 3, row: 2 }
  ];
  return (
    <div className="exp-map" aria-label="遗迹格子地图">
      <div className="exp-map-header">
        <strong>边境遗迹</strong>
        <small>探索地图</small>
      </div>
      <div className="exp-map-grid">
        <svg className="exp-map-corridors" viewBox="0 0 180 104" preserveAspectRatio="none" aria-hidden="true">
          <path d="M30 78 H90 V26 H150 V78" />
        </svg>
        {nodes.map((node, index) => (
          <div
            key={node.title}
            style={{ gridColumn: cells[index]?.column, gridRow: cells[index]?.row }}
            className={`exp-map-cell ${index === currentNode ? 'current' : index < currentNode ? 'passed' : 'unknown'}`}
            title={index <= currentNode ? node.title : '未知区域'}
          >
            <i>{index > currentNode ? '?' : node.kind === 'combat' ? '⚔' : '✦'}</i>
            <small>{index + 1}</small>
          </div>
        ))}
      </div>
      <div className="exp-map-location">
        <span>当前位置</span>
        <strong>{nodes[currentNode]?.title ?? '未知'}</strong>
      </div>
    </div>
  );
}

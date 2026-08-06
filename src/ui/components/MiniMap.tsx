import type { ExpeditionNode } from '../../domain/model';

export interface MiniMapProps {
  currentNode: number;
  nodes: readonly ExpeditionNode[];
  regionName?: string;
}

// 把 N 个节点铺成一个 5 列的蛇形（zig-zag）网格，自动适配任意节点数量，
// 不再写死格子坐标（旧实现只有 5 格，7 节点任务的第 6/7 节点会错位）。
const COLUMNS = 5;
const cellPosition = (index: number) => {
  const row = Math.floor(index / COLUMNS);
  const colInRow = index % COLUMNS;
  // 偶数行从左往右，奇数行从右往左，形成蛇形路径。
  const column = row % 2 === 0 ? colInRow + 1 : COLUMNS - colInRow;
  return { column, row: row + 1 };
};

export function MiniMap({ currentNode, nodes, regionName }: MiniMapProps) {
  const totalRows = Math.ceil(nodes.length / COLUMNS);
  return (
    <div className="exp-map" aria-label="遗迹格子地图">
      <div className="exp-map-header">
        <strong>{regionName ?? '遗迹'}</strong>
        <small>探索地图</small>
      </div>
      <div
        className="exp-map-grid"
        style={{ gridTemplateRows: `repeat(${totalRows}, 1fr)` }}
      >
        <svg className="exp-map-corridors" viewBox="0 0 180 104" preserveAspectRatio="none" aria-hidden="true">
          <path d="M30 78 H90 V26 H150 V78" />
        </svg>
        {nodes.map((node, index) => {
          const { column, row } = cellPosition(index);
          return (
            <div
              key={node.title}
              style={{ gridColumn: column, gridRow: row }}
              className={`exp-map-cell ${index === currentNode ? 'current' : index < currentNode ? 'passed' : 'unknown'}`}
              title={index <= currentNode ? node.title : '未知区域'}
            >
              <i>{index > currentNode ? '?' : node.kind === 'combat' ? 'x' : '+'}</i>
              <small>{index + 1}</small>
            </div>
          );
        })}
      </div>
      <div className="exp-map-location">
        <span>当前位置</span>
        <strong>{nodes[currentNode]?.title ?? '未知'}</strong>
      </div>
    </div>
  );
}

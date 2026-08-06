import type { Rarity } from '../../domain/model';
import { rarityNames, rarityColors } from '../../content/gameContent';

export interface RarityBadgeProps {
  rarity: Rarity;
  size?: 'sm' | 'md';
}

// 稀有度文字徽章：颜色与命名统一从内容层读取，UI 不自行计算。
// 替代各页面散落的 inline style 写法，确保 5 档稀有度展示一致。
export function RarityBadge({ rarity, size = 'md' }: RarityBadgeProps) {
  const color = rarityColors[rarity];
  return (
    <span
      className={`item-badge tag-material rarity-badge rarity-${rarity}${size === 'sm' ? ' sm' : ''}`}
      style={{ color, borderColor: color }}
    >
      {rarityNames[rarity]}
    </span>
  );
}

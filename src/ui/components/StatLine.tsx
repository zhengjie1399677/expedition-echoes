export interface StatLineProps {
  attack?: number;
  defense?: number;
  delta?: { attack?: number; defense?: number };
}

// 装备加成数值行：仅展示领域层返回的 attack/defense 数值，不实现任何公式。
// delta 模式用于"装备后预览"，显示与当前加成的差值。
export function StatLine({ attack, defense, delta }: StatLineProps) {
  if (delta) {
    const da = delta.attack ?? 0;
    const dd = delta.defense ?? 0;
    if (da === 0 && dd === 0) return null;
    return (
      <span className="stat-line preview-delta">
        {da !== 0 && (
          <span className={da > 0 ? 'positive' : 'negative'}>Δ攻击 {da > 0 ? '+' : ''}{da}</span>
        )}
        {dd !== 0 && (
          <span className={dd > 0 ? 'positive' : 'negative'}>Δ减伤 {dd > 0 ? '+' : ''}{dd}</span>
        )}
      </span>
    );
  }

  const hasAttack = attack !== undefined && attack > 0;
  const hasDefense = defense !== undefined && defense > 0;
  if (!hasAttack && !hasDefense) return null;

  return (
    <span className="stat-line">
      {hasAttack && <span>攻击 +{attack}</span>}
      {hasAttack && hasDefense && ' · '}
      {hasDefense && <span>减伤 +{defense}</span>}
    </span>
  );
}

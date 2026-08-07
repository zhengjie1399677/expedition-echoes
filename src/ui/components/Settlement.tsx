import type { GameState, GameAction, Rarity } from '../../domain/model';
import { rarityColors, rarityNames, materialName } from '../../content/gameContent';

export interface SettlementProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export function Settlement({ state, dispatch }: SettlementProps) {
  const settlement = state.settlement;
  if (!settlement) {
    return (
      <section className="empty-state">
        <div>
          <h2>无结算数据</h2>
          <button className="primary" onClick={() => dispatch({ type: 'CLOSE_SETTLEMENT' })}>返回城镇</button>
        </div>
      </section>
    );
  }

  const outcomeTitles = { victory: '远征凯旋', retreat: '战术撤退', defeated: '队伍全灭' };
  const outcomeColors = { victory: '#d6a232', retreat: '#829ba8', defeated: '#b93a38' };
  const outcomeClasses = { victory: 'outcome-victory', retreat: 'outcome-retreat', defeated: 'outcome-defeated' };
  const matEntries = Object.entries(settlement.lootMaterials).filter(([, count]) => count > 0);

  return (
    <section className={`page settlement-page ${outcomeClasses[settlement.outcome]}`}>
      <div className="settlement-card">
        <header className="settlement-header">
          <small>远征战役总结</small>
          <h2 style={{ color: outcomeColors[settlement.outcome] }}>{outcomeTitles[settlement.outcome]}</h2>
        </header>

        <div className="settlement-content">
          <section className="settlement-section">
            <h3>战利品收益</h3>
            <div className="settlement-loot-grid">
              <div className="settlement-loot-item gold-loot">
                <strong>获得金币</strong>
                <span className="loot-val">+{settlement.lootGold} 金币</span>
              </div>
              <div className="settlement-loot-item exp-loot">
                <strong>团队经验值</strong>
                <span className="loot-val">+{settlement.gainedExperience} EXP</span>
              </div>
            </div>
            {matEntries.length > 0 ? (
              <div className="settlement-materials">
                <strong>获得物资</strong>
                <div className="materials-grid" style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {matEntries.map(([key, count]) => {
                    const [typeId, rarityStr] = key.split(':');
                    const rarity = Number(rarityStr) as Rarity;
                    return (
                      <span key={key} className={`rarity-badge rarity-${rarity}`} style={{ borderColor: rarityColors[rarity], color: rarityColors[rarity] }}>
                        {materialName(typeId)}·{rarityNames[rarity]} ×{count}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="no-materials-label">本次远征未获得物资材料。</p>
            )}
          </section>

          <section className="settlement-section">
            <h3>行囊消耗统计</h3>
            <div className="settlement-supplies-grid">
              <div className="settlement-supply-stat">
                <span>食物口粮</span>
                <strong>-{settlement.consumedSupplies.food}</strong>
              </div>
              <div className="settlement-supply-stat">
                <span>绷带</span>
                <strong>-{settlement.consumedSupplies.bandage}</strong>
              </div>
              <div className="settlement-supply-stat">
                <span>镇定剂</span>
                <strong>-{settlement.consumedSupplies.sedative}</strong>
              </div>
              <div className="settlement-supply-stat">
                <span>火焰瓶</span>
                <strong>-{settlement.consumedSupplies.fireBomb}</strong>
              </div>
              <div className="settlement-supply-stat">
                <span>铁壁药丸</span>
                <strong>-{settlement.consumedSupplies.shieldElixir}</strong>
              </div>
            </div>
            <p className="supplies-return-tip">行囊内剩余的补给品已自动放回城镇背包。</p>
          </section>
        </div>

        <footer className="settlement-footer-btn">
          <button className="primary" onClick={() => dispatch({ type: 'CLOSE_SETTLEMENT' })}>确认并返回城镇</button>
        </footer>
      </div>
    </section>
  );
}

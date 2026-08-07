import { useState } from 'react';
import type { GameState, GameAction } from '../../domain/model';
import { heroClassNames } from '../../content/gameContent';
import { equipmentBonuses } from '../../domain/gameEngine';
import { BALANCE } from '../../domain/config';

export interface ExpeditionPrepOverlayProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  onClose: () => void;
}

export function ExpeditionPrepOverlay({ state, dispatch, onClose }: ExpeditionPrepOverlayProps) {
  const [carryFood, setCarryFood] = useState(() => {
    try {
      const saved = localStorage.getItem('last_expedition_supplies');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Math.min(parsed.food ?? 0, state.food);
      }
    } catch (e) {}
    return 0;
  });
  const [carryBandage, setCarryBandage] = useState(() => {
    try {
      const saved = localStorage.getItem('last_expedition_supplies');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Math.min(parsed.bandage ?? 0, state.inventory.bandage ?? 0);
      }
    } catch (e) {}
    return 0;
  });
  const [carrySedative, setCarrySedative] = useState(() => {
    try {
      const saved = localStorage.getItem('last_expedition_supplies');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Math.min(parsed.sedative ?? 0, state.inventory.sedative ?? 0);
      }
    } catch (e) {}
    return 0;
  });
  const [carryFireBomb, setCarryFireBomb] = useState(() => {
    try {
      const saved = localStorage.getItem('last_expedition_supplies');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Math.min(parsed.fireBomb ?? 0, state.inventory['fire-bomb'] ?? 0);
      }
    } catch (e) {}
    return 0;
  });
  const [carryShieldElixir, setCarryShieldElixir] = useState(() => {
    try {
      const saved = localStorage.getItem('last_expedition_supplies');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Math.min(parsed.shieldElixir ?? 0, state.inventory['shield-elixir'] ?? 0);
      }
    } catch (e) {}
    return 0;
  });

  const totalSlots = carryFood + carryBandage + carrySedative + carryFireBomb + carryShieldElixir;
  const isTeamValid = state.selectedHeroIds.length >= 2;

  const handleStart = () => {
    if (!isTeamValid || totalSlots > BALANCE.suppliesCap) return;
    try {
      localStorage.setItem('last_expedition_supplies', JSON.stringify({
        food: carryFood,
        bandage: carryBandage,
        sedative: carrySedative,
        fireBomb: carryFireBomb,
        shieldElixir: carryShieldElixir
      }));
    } catch (e) {}
    dispatch({
      type: 'START_EXPEDITION',
      supplies: {
        food: carryFood,
        bandage: carryBandage,
        sedative: carrySedative,
        fireBomb: carryFireBomb,
        shieldElixir: carryShieldElixir
      }
    });
    onClose();
  };

  const selectedHeroes = state.selectedHeroIds.map(id => state.roster.find(h => h.id === id)!).filter(Boolean);

  return (
    <div className="confirm-overlay prep-overlay" onClick={onClose}>
      <div className="confirm-dialog prep-dialog" onClick={(e) => e.stopPropagation()}>
        <header className="prep-header">
          <h3>远征出征整备</h3>
          <p>请挑选本次远征所携带的口粮与药剂。行囊最大容量为 {BALANCE.suppliesCap} 格。</p>
        </header>

        <div className="prep-layout">
          <section className="prep-section prep-party-list">
            <h4>出征队伍 ({selectedHeroes.length}/3)</h4>
            {!isTeamValid && <p className="prep-warning">⚠️ 至少需要 2 名队员出征，请先前往队伍整备！</p>}
            <div className="prep-party-grid">
              {selectedHeroes.map((hero, index) => {
                const bonuses = equipmentBonuses(hero);
                return (
                  <div key={hero.id} className="prep-hero-card">
                    <span className="prep-hero-idx">{index + 1}</span>
                    <div className="prep-hero-idx-label" style={{ display: 'none' }}>{index + 1}</div>
                    <div className="prep-hero-info">
                      <strong>{hero.name}</strong>
                      <small>{heroClassNames[hero.heroClass]} · Lv.{hero.level}</small>
                      <div className="prep-hero-stats">
                        <span>生命 {hero.hp}/{hero.maxHp}</span>
                        <span>攻击 +{bonuses.attack}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="prep-section prep-supplies-list">
            <h4>行囊配置 (已用: {totalSlots}/{BALANCE.suppliesCap} 格)</h4>
            <div className="prep-capacity" aria-label={`行囊已使用 ${totalSlots} 格，共 ${BALANCE.suppliesCap} 格`}>
              {Array.from({ length: BALANCE.suppliesCap }, (_, index) => <i key={index} className={index < totalSlots ? 'is-filled' : ''} />)}
            </div>
            <div className="supply-control-row">
              <div className="supply-label-col">
                <strong>口粮 (食物)</strong>
                <small>城镇库存: {state.food}</small>
              </div>
              <div className="supply-btn-group">
                <button aria-label="减少口粮" disabled={carryFood <= 0} onClick={() => setCarryFood(f => f - 1)}>-</button>
                <span className="carry-val">{carryFood}</span>
                <button aria-label="增加口粮" disabled={carryFood >= state.food || totalSlots >= BALANCE.suppliesCap} onClick={() => setCarryFood(f => f + 1)}>+</button>
              </div>
            </div>

            <div className="supply-control-row">
              <div className="supply-label-col">
                <strong>绷带</strong>
                <small>城镇库存: {state.inventory.bandage ?? 0}</small>
              </div>
              <div className="supply-btn-group">
                <button aria-label="减少绷带" disabled={carryBandage <= 0} onClick={() => setCarryBandage(b => b - 1)}>-</button>
                <span className="carry-val">{carryBandage}</span>
                <button aria-label="增加绷带" disabled={carryBandage >= (state.inventory.bandage ?? 0) || totalSlots >= BALANCE.suppliesCap} onClick={() => setCarryBandage(b => b + 1)}>+</button>
              </div>
            </div>

            <div className="supply-control-row">
              <div className="supply-label-col">
                <strong>镇定剂</strong>
                <small>城镇库存: {state.inventory.sedative ?? 0}</small>
              </div>
              <div className="supply-btn-group">
                <button aria-label="减少镇定剂" disabled={carrySedative <= 0} onClick={() => setCarrySedative(s => s - 1)}>-</button>
                <span className="carry-val">{carrySedative}</span>
                <button aria-label="增加镇定剂" disabled={carrySedative >= (state.inventory.sedative ?? 0) || totalSlots >= BALANCE.suppliesCap} onClick={() => setCarrySedative(s => s + 1)}>+</button>
              </div>
            </div>

            <div className="supply-control-row">
              <div className="supply-label-col">
                <strong>火焰瓶</strong>
                <small>城镇库存: {state.inventory['fire-bomb'] ?? 0}</small>
              </div>
              <div className="supply-btn-group">
                <button aria-label="减少火焰瓶" disabled={carryFireBomb <= 0} onClick={() => setCarryFireBomb(s => s - 1)}>-</button>
                <span className="carry-val">{carryFireBomb}</span>
                <button aria-label="增加火焰瓶" disabled={carryFireBomb >= (state.inventory['fire-bomb'] ?? 0) || totalSlots >= BALANCE.suppliesCap} onClick={() => setCarryFireBomb(s => s + 1)}>+</button>
              </div>
            </div>

            <div className="supply-control-row">
              <div className="supply-label-col">
                <strong>铁壁药丸</strong>
                <small>城镇库存: {state.inventory['shield-elixir'] ?? 0}</small>
              </div>
              <div className="supply-btn-group">
                <button aria-label="减少铁壁药丸" disabled={carryShieldElixir <= 0} onClick={() => setCarryShieldElixir(s => s - 1)}>-</button>
                <span className="carry-val">{carryShieldElixir}</span>
                <button aria-label="增加铁壁药丸" disabled={carryShieldElixir >= (state.inventory['shield-elixir'] ?? 0) || totalSlots >= BALANCE.suppliesCap} onClick={() => setCarryShieldElixir(s => s + 1)}>+</button>
              </div>
            </div>
          </section>
        </div>

        <div className="confirm-actions prep-actions">
          <button onClick={onClose}>返回城镇</button>
          <button className="confirm-yes" disabled={!isTeamValid || totalSlots > BALANCE.suppliesCap} onClick={handleStart}>确认出发</button>
        </div>
      </div>
    </div>
  );
}

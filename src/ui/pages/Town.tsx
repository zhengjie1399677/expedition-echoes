import { useState } from 'react';
import type { GameState, GameAction, ItemDefinition, Rarity } from '../../domain/model';
import { itemDefinitions, giftDefinitions, marketPrices, rarityNames, rarityColors, regions, threatNames } from '../../content/gameContent';
import { RegionStatusPanel } from '../components/RegionStatusPanel';

export interface TownProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  onGateClick: () => void;
}

export function Town({ state, dispatch, onGateClick }: TownProps) {
  const [marketOpen, setMarketOpen] = useState(false);
  const [marketStall, setMarketStall] = useState<'equipment' | 'accessory' | 'supplies' | 'gift' | null>(null);
  const [intelOpen, setIntelOpen] = useState(false);
  const handleGateClick = () => {
    if (!state.hasAcceptedMission) {
      // 未接任务时城门处于"锁定"态：点击引导到酒馆任务板，而非静默派发无意义动作。
      dispatch({ type: 'NAVIGATE', page: 'tavern' });
      return;
    }
    onGateClick();
  };
  const stallTitle = marketStall === 'equipment' ? '装备商' : marketStall === 'accessory' ? '饰品商' : marketStall === 'supplies' ? '补给商' : '礼物摊';
  const stallItems = marketStall === 'equipment'
    ? itemDefinitions.filter((item) => item.kind === 'equipment' && item.slot !== 'accessory' && marketPrices[item.id] !== undefined)
    : marketStall === 'accessory'
      ? itemDefinitions.filter((item) => item.slot === 'accessory' && marketPrices[item.id] !== undefined)
      : marketStall === 'supplies'
        ? itemDefinitions.filter((item) => item.kind === 'consumable' && marketPrices[item.id] !== undefined)
        : giftDefinitions.map((gift) => ({ ...gift, description: `送给队员的${gift.name}` }));

  if (marketOpen) {
    return (
      <section className="page town-page plaza-page">
        <div className="plaza-scene">
          <img src="/assets/world/central-market-v1.webp" alt="阳光下的中央广场集市，左侧是装备商，右侧是补给商、饰品商和礼物摊" />
          <div className="plaza-scene-vignette" />
          <button className="plaza-back" onClick={() => { setMarketOpen(false); setMarketStall(null); }}>返回城镇</button>
          <button className="plaza-hotspot plaza-equipment" onClick={() => setMarketStall('equipment')}>
            <strong>装备商</strong>
            <span>武器 · 防具</span>
          </button>
          <button className="plaza-hotspot plaza-supplies" onClick={() => setMarketStall('supplies')}>
            <strong>补给商</strong>
            <span>绷带 · 药剂 · 火瓶</span>
          </button>
          <button className="plaza-hotspot plaza-accessories" onClick={() => setMarketStall('accessory')}>
            <strong>饰品商</strong>
            <span>护符 · 挂件</span>
          </button>
          <button className="plaza-hotspot plaza-gifts" onClick={() => setMarketStall('gift')}>
            <strong>礼物摊</strong>
            <span>花束 · 酒 · 诗集</span>
          </button>
          {marketStall && (
            <aside className="market-stall-panel" aria-label={stallTitle}>
              <header>
                <div>
                  <small>中央广场 · {stallTitle}</small>
                  <strong>{stallTitle}</strong>
                </div>
                <button onClick={() => setMarketStall(null)}>收起</button>
              </header>
              <div>
                {stallItems.map((item) => {
                  const rarity = (item as ItemDefinition).rarity as Rarity | undefined;
                  return (
                  <article key={item.id}>
                    <div>
                      <strong style={rarity ? { color: rarityColors[rarity] } : undefined}>{item.name}</strong>
                      {rarity ? <small style={{ color: rarityColors[rarity] }}>{rarityNames[rarity]}</small> : null}
                      <small>{item.description}</small>
                    </div>
                    <button
                      disabled={state.gold < marketPrices[item.id]}
                      onClick={() => dispatch({ type: 'BUY_ITEM', itemId: item.id })}
                    >
                      {marketPrices[item.id]} 金币
                    </button>
                  </article>
                  );
                })}
              </div>
            </aside>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="page town-page">
      <div className="town-map">
        <img src="/assets/world/town-hub-v3.webp" alt="明亮的冒险者城镇，包含酒馆、广场、宿舍和城门" />
        <div className="town-map-shade" />
        <div className="town-sun-haze" aria-hidden="true" />
        <div className="town-distance-mist" aria-hidden="true" />
        <div className="town-map-frame" />
        {state.dayReport && !state.dayReport.pending && (
          <div className="town-news-plaque" aria-label="今日城镇消息">
            <small>晨间告示</small>
            <strong>{state.dayReport.townNews}</strong>
          </div>
        )}

        <div className="town-threat-strip" aria-label="区域威胁概况">
          {regions.map((region) => {
            const threat = state.regions[region.id] ?? region.threat;
            return (
              <span key={region.id} className={`threat-badge threat-${threat}`}>
                {region.name} · {threatNames[threat] ?? threat}
              </span>
            );
          })}
        </div>
        
        <div className="town-particles" aria-hidden="true">
          <span className="particle p1"></span>
          <span className="particle p2"></span>
          <span className="particle p3"></span>
          <span className="particle p4"></span>
          <span className="particle p5"></span>
          <span className="particle p6"></span>
          <span className="particle p7"></span>
          <span className="particle p8"></span>
        </div>
        <div className="town-foreground" aria-hidden="true"><i /><i /><i /><i /></div>

        <button className="map-hotspot hotspot-tavern" onClick={() => dispatch({ type: 'NAVIGATE', page: 'tavern' })}>
          <span className="beacon-ring" />
          <strong>旅途酒馆</strong>
          <span>招募 · 任务 · 补给</span>
        </button>
        <button className="map-hotspot hotspot-plaza" aria-label="打开中央广场集市" onClick={() => setMarketOpen(true)}>
          <span className="beacon-ring" />
          <strong>中央广场</strong>
          <span>集市 · 补给 · 装备</span>
        </button>
        <button className="map-hotspot hotspot-quarters" onClick={() => dispatch({ type: 'NAVIGATE', page: 'quarters' })}>
          <span className="beacon-ring" />
          <strong>旅人宿舍</strong>
          <span>休息 · 交谈</span>
        </button>
        <button className={`map-hotspot hotspot-gate ${state.hasAcceptedMission ? '' : 'locked'}`} onClick={handleGateClick}>
          <span className="beacon-ring" />
          <strong>东侧城门</strong>
          <span>{state.hasAcceptedMission ? '开始远征' : '需先接取任务'}</span>
        </button>
        <button className="map-hotspot hotspot-intel" aria-label="打开边境情报" onClick={() => setIntelOpen(true)}>
          <span className="beacon-ring" />
          <strong>边境情报</strong>
          <span>区域威胁 · 事件链</span>
        </button>
      </div>

      {intelOpen && (
        <div className="intel-overlay" onClick={() => setIntelOpen(false)}>
          <div className="intel-dialog" onClick={(e) => e.stopPropagation()}>
            <RegionStatusPanel state={state} dispatch={dispatch} onClose={() => setIntelOpen(false)} />
          </div>
        </div>
      )}
    </section>
  );
}

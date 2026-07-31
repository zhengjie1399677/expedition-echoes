import { useState, useMemo } from 'react';
import type { GameState, GameAction, EquipmentSlot, Rarity, Hero } from '../../domain/model';
import {
  heroClassNames,
  initialHeroes,
  itemDefinitions,
  craftingRecipes,
  rarityNames,
  rarityColors,
  materialName,
  materialSellPrices
} from '../../content/gameContent';
import { availableItemCount, equipmentBonuses, pressureStage } from '../../domain/gameEngine';
import { quartersPortraits } from './Quarters';

export interface ManagementProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

const equipmentSlotNames: Record<EquipmentSlot, string> = { weapon: '武器', armor: '防具', accessory: '饰品' };
const itemIcons: Record<string, string> = {
  bandage: '🩹',
  sedative: '🧪',
  'vanguard-spear': '🔱',
  'ranger-bow': '🏹',
  'star-staff': '🔮',
  'field-mail': '🛡️',
  'warded-coat': '🧥',
  'echo-charm': '💎',
};

export function Management({ state, dispatch }: ManagementProps) {
  const tab = state.managementTab;
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'food' | 'equipment' | 'material'>('all');
  const [showStory, setShowStory] = useState(false);
  const managementTitle = tab === 'party' ? '队伍编成' : tab === 'equipment' ? '角色装备' : tab === 'craft' ? '装备打造' : '旅行背包';
  const recruited = state.roster.filter((hero) => hero.recruited);
  const [heroId, setHeroId] = useState(state.selectedHeroIds[0] ?? recruited[0]?.id ?? '');

  const handleHeroChange = (id: string) => {
    setHeroId(id);
    setShowStory(false);
  };

  const hero = recruited.find((item) => item.id === heroId) ?? recruited[0];
  const ownedItems = useMemo(() => itemDefinitions.filter((item) => (state.inventory[item.id] ?? 0) > 0), [state.inventory]);
  const equipmentItems = useMemo(() => itemDefinitions.filter((item) => item.kind === 'equipment'), []);
  const bonuses = hero ? equipmentBonuses(hero) : { attack: 0, defense: 0 };

  const materialEntries = useMemo(() => {
    return Object.entries(state.materials)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => {
        const [typeId, rarityStr] = key.split(':');
        const rarity = Number(rarityStr) as Rarity;
        return { typeId, rarity, count };
      })
      .sort((a, b) => a.rarity - b.rarity || materialName(a.typeId).localeCompare(materialName(b.typeId)));
  }, [state.materials]);

  const unifiedItems = [
    ...ownedItems.map(item => ({
      key: `item:${item.id}`,
      type: 'item' as const,
      id: item.id,
      name: item.name,
      kind: item.kind,
      description: item.description,
      count: state.inventory[item.id],
      data: item,
      rarity: 0 as Rarity
    })),
    ...materialEntries.map(m => ({
      key: `material:${m.typeId}:${m.rarity}`,
      type: 'material' as const,
      id: m.typeId,
      name: `${materialName(m.typeId)}·${rarityNames[m.rarity]}`,
      kind: 'material' as const,
      description: `击败遗迹怪物与完成任务时获得的稀有材料。`,
      count: m.count,
      rarity: m.rarity,
      data: null
    }))
  ];

  const filteredItems = unifiedItems.filter(item => {
    if (categoryFilter === 'all') return true;
    if (categoryFilter === 'food') return item.kind === 'consumable';
    if (categoryFilter === 'equipment') return item.kind === 'equipment';
    if (categoryFilter === 'material') return item.type === 'material';
    return true;
  });

  return (
    <section className="page management-page">
      <header className="management-title">
        <div>
          <small>冒险整备</small>
          <h2>{managementTitle}</h2>
        </div>
        {tab === 'inventory' && (
          <div className="inventory-header-tabs">
            <button className={categoryFilter === 'all' ? 'active' : ''} onClick={() => setCategoryFilter('all')}>全部</button>
            <button className={categoryFilter === 'food' ? 'active' : ''} onClick={() => setCategoryFilter('food')}>口粮</button>
            <button className={categoryFilter === 'equipment' ? 'active' : ''} onClick={() => setCategoryFilter('equipment')}>装备</button>
            <button className={categoryFilter === 'material' ? 'active' : ''} onClick={() => setCategoryFilter('material')}>材料</button>
          </div>
        )}
      </header>

      {tab === 'party' && (
        <div className="party-management">
          <div className="formation-panel">
            <header>
              <strong>出征队伍</strong>
              <span>{state.selectedHeroIds.length}/3</span>
            </header>
            <div className="formation-list">
              {state.selectedHeroIds.map((id, index) => {
                const member = state.roster.find((item) => item.id === id)!;
                return (
                  <article key={id}>
                    <b>{index + 1}</b>
                    <div>
                      <strong>{member.name}</strong>
                      <span>{index === 0 ? '前排 · 靠近敌方' : `第 ${index + 1} 位 · 距离 ${index + 1}`}</span>
                    </div>
                    <div className="formation-actions">
                      <button disabled={index === 0} onClick={() => dispatch({ type: 'MOVE_PARTY', index, direction: -1 })}>前移</button>
                      <button disabled={index === state.selectedHeroIds.length - 1} onClick={() => dispatch({ type: 'MOVE_PARTY', index, direction: 1 })}>后移</button>
                      <button onClick={() => dispatch({ type: 'TOGGLE_PARTY', heroId: id })}>移出</button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
          <div className="reserve-panel">
            <header>
              <strong>冒险者名册</strong>
              <span>点击编入队伍</span>
            </header>
            {recruited.map((member) => {
              const selected = state.selectedHeroIds.includes(member.id);
              const memberBonuses = equipmentBonuses(member);
              return (
                <button
                  key={member.id}
                  className={selected ? 'selected' : ''}
                  disabled={selected}
                  onClick={() => dispatch({ type: 'TOGGLE_PARTY', heroId: member.id })}
                >
                  <span className="management-avatar">{member.name.slice(0, 1)}</span>
                  <span>
                    <strong>{member.name} · Lv.{member.level}</strong>
                    <small>{heroClassNames[member.heroClass]} · 攻击 +{memberBonuses.attack} · 防御 +{memberBonuses.defense}</small>
                  </span>
                  <em>{selected ? '已出征' : '编入'}</em>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'inventory' && (
        <div className="inventory-panel inventory-with-loadout">
          {hero && (
            <aside className={`inventory-loadout ${showStory ? 'story-active' : ''}`}>
              <div className="loadout-hero-switch" aria-label="切换查看角色">
                {recruited.map((member) => (
                  <button
                    key={member.id}
                    className={member.id === hero.id ? 'active' : ''}
                    onClick={() => handleHeroChange(member.id)}
                  >
                    {member.name}
                  </button>
                ))}
              </div>
              <div className={`loadout-portrait ${showStory ? 'show-story' : ''}`}>
                <div className="portrait-front">
                  <img src={quartersPortraits[hero.id] ?? '/assets/actors-v2/scout-idle-v2.png'} alt={`${hero.name}的日常立绘`} />
                  <div className="portrait-nameplate">
                    <strong>{hero.name}</strong>
                    <span>{heroClassNames[hero.heroClass]} · Lv.{hero.level}</span>
                  </div>
                  <button className="view-story-btn" onClick={() => setShowStory(true)}>📖 故事</button>
                </div>
                <div className="portrait-back">
                  <div className="story-header">
                    <strong>{hero.name} · {heroClassNames[hero.heroClass]}</strong>
                    <small>生平传记</small>
                  </div>
                  <div className="story-content">
                    <p className="personality-box"><strong>性格倾向：</strong>{hero.personality}</p>
                    <p className="biography-box">
                      {hero.story ??
                        initialHeroes.find((h: Hero) => h.id === hero.id)?.story ??
                        '这个角色在边境留下了许多传说，但详情尚待发掘。'}
                    </p>
                  </div>
                  <button className="view-portrait-btn" onClick={() => setShowStory(false)}>👤 立绘</button>
                </div>
              </div>
              <div className="loadout-vitals">
                <span>生命 <b>{hero.hp}/{hero.maxHp}</b></span>
                <span className={`pressure-state ${pressureStage(hero.morale).tone}`}>
                  压力 <b>{hero.morale}/100 · {pressureStage(hero.morale).name}</b>
                </span>
              </div>
              <div className="loadout-slots">
                {(['weapon', 'armor', 'accessory'] as EquipmentSlot[]).map((slot) => {
                  const equipped = itemDefinitions.find((item) => item.id === hero.equipment[slot]);
                  return (
                    <button key={slot} onClick={() => dispatch({ type: 'OPEN_MANAGEMENT', tab: 'equipment' })}>
                      <small>{equipmentSlotNames[slot]}</small>
                      <strong>{equipped?.name ?? '未装备'}</strong>
                      <span>{equipped ? equipped.description : '点击前往装备管理'}</span>
                    </button>
                  );
                })}
              </div>
            </aside>
          )}
          <div className="inventory-content-wrapper">
            {filteredItems.length === 0 ? (
              <div className="inventory-empty">此处尚未存放任何此类物品。</div>
            ) : (
              <div className="inventory-compact-list">
                {filteredItems.map((item) => {
                  if (item.type === 'item') {
                    const available = item.data!.kind === 'equipment' ? availableItemCount(state, item.id) : item.count;
                    const icon = itemIcons[item.id] || '📦';
                    const kindLabel = item.data!.kind === 'equipment' ? (item.data!.slot ? equipmentSlotNames[item.data!.slot] : '装备') : '消耗品';
                    const rowClass = item.data!.kind;

                    return (
                      <article key={item.key} className={`inventory-row ${rowClass}`}>
                        <span className="item-icon-frame">{icon}</span>
                        <div className="item-body">
                          <div className="item-meta">
                            <strong className="item-name">{item.name}</strong>
                            <span className="item-badge">{kindLabel}</span>
                          </div>
                          <p className="item-desc">{item.description}</p>
                        </div>
                        <div className="item-actions">
                          {item.data!.kind === 'equipment' && <span className="item-avail">可用 {available}</span>}
                          <strong className="item-qty">× {item.count}</strong>
                        </div>
                      </article>
                    );
                  } else {
                    const icon = '💎';
                    const kindLabel = `材料 · ${rarityNames[item.rarity]}`;
                    const rowClass = `material rarity-${item.rarity}`;

                    return (
                      <article key={item.key} className={`inventory-row ${rowClass}`}>
                        <span className="item-icon-frame" style={{ borderColor: rarityColors[item.rarity] }}>{icon}</span>
                        <div className="item-body">
                          <div className="item-meta">
                            <strong className="item-name" style={{ color: rarityColors[item.rarity] }}>{item.name}</strong>
                            <span
                              className="item-badge tag-material"
                              style={{ color: rarityColors[item.rarity], borderColor: rarityColors[item.rarity] }}
                            >
                              {kindLabel}
                            </span>
                          </div>
                          <p className="item-desc">{item.description}</p>
                        </div>
                        <div className="item-actions">
                          <button
                            className="sell-button compact-sell"
                            onClick={() => dispatch({ type: 'SELL_MATERIAL', typeId: item.id, rarity: item.rarity, count: 1 })}
                          >
                            🪙 售 {materialSellPrices[item.rarity]}
                          </button>
                          <strong className="item-qty">× {item.count}</strong>
                        </div>
                      </article>
                    );
                  }
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'craft' && (
        <div className="craft-panel">
          <header>
            <strong>装备打造</strong>
            <span>消耗材料与金币，打造装备入背包</span>
          </header>
          <div className="craft-grid">
            {craftingRecipes.map((recipe) => {
              const result = itemDefinitions.find((item) => item.id === recipe.resultItemId);
              const goldOk = state.gold >= recipe.goldCost;
              const matsOk = recipe.materials.every((m) => (state.materials[`${m.typeId}:${m.rarity}`] ?? 0) >= m.count);
              const canCraft = goldOk && matsOk;
              return (
                <article key={recipe.id} className={`craft-card ${canCraft ? '' : 'disabled'}`}>
                  <div className="craft-result">
                    <strong>{result?.name ?? recipe.resultItemId}</strong>
                    <small>
                      {result?.attack ? `攻击 +${result.attack}` : ''}
                      {result?.attack && result?.defense ? ' · ' : ''}
                      {result?.defense ? `减伤 +${result.defense}` : ''}
                    </small>
                  </div>
                  <div className="craft-cost">
                    <span className="craft-mats">
                      {recipe.materials.map((m, i) => (
                        <span
                          key={i}
                          className={`rarity-badge rarity-${m.rarity}`}
                          style={{ borderColor: rarityColors[m.rarity], color: rarityColors[m.rarity] }}
                        >
                          {materialName(m.typeId)}·{rarityNames[m.rarity]} ×{m.count}
                        </span>
                      ))}
                    </span>
                    <span className="craft-gold">{recipe.goldCost} 金币</span>
                  </div>
                  <button disabled={!canCraft} onClick={() => dispatch({ type: 'CRAFT_ITEM', recipeId: recipe.id })}>
                    {canCraft ? '打造' : '不足'}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'equipment' && hero && (
        <div className="equipment-management">
          <aside className="equipment-heroes">
            {recruited.map((member) => (
              <button
                key={member.id}
                className={member.id === hero.id ? 'active' : ''}
                onClick={() => setHeroId(member.id)}
              >
                <img src={quartersPortraits[member.id] ?? '/assets/actors-v2/scout-idle-v2.png'} alt="" />
                <div>
                  <strong>{member.name}</strong>
                  <small>Lv.{member.level} · {heroClassNames[member.heroClass]}</small>
                </div>
              </button>
            ))}
          </aside>
          <div className="equipment-detail">
            <header>
              <div className="equipment-character">
                <img key={hero.id} src={quartersPortraits[hero.id] ?? '/assets/actors-v2/scout-idle-v2.png'} alt={`${hero.name}的装备立绘`} />
                <div>
                  <small>当前角色</small>
                  <h3>{hero.name}</h3>
                </div>
              </div>
              <div className="equipment-summary">
                <span>攻击加成 <b>+{bonuses.attack}</b></span>
                <span>伤害减免 <b>+{bonuses.defense}</b></span>
              </div>
            </header>
            <div className="equipment-slots">
              {(['weapon', 'armor', 'accessory'] as EquipmentSlot[]).map((slot) => {
                const currentId = hero.equipment[slot];
                const current = itemDefinitions.find((item) => item.id === currentId);
                return (
                  <section key={slot}>
                    <header>
                      <strong>{equipmentSlotNames[slot]}</strong>
                      {current && <button onClick={() => dispatch({ type: 'UNEQUIP_ITEM', heroId: hero.id, slot })}>卸下</button>}
                    </header>
                    <div className="equipped-item">
                      {current ? (
                        <>
                          <b>{current.name}</b>
                          <span>{current.description}</span>
                        </>
                      ) : (
                        <span>未装备</span>
                      )}
                    </div>
                    <div className="equipment-options">
                      {equipmentItems
                        .filter((item) => item.slot === slot && (!item.allowedClasses || item.allowedClasses.includes(hero.heroClass)))
                        .map((item) => {
                          const equipped = currentId === item.id;
                          const available = availableItemCount(state, item.id);
                          return (
                            <button
                              key={item.id}
                              className={equipped ? 'equipped' : ''}
                              disabled={!equipped && available < 1}
                              onClick={() => dispatch({ type: 'EQUIP_ITEM', heroId: hero.id, itemId: item.id })}
                            >
                              <strong>{item.name}</strong>
                              <small>
                                {item.attack ? `攻击 +${item.attack}` : ''}
                                {item.attack && item.defense ? ' · ' : ''}
                                {item.defense ? `减伤 +${item.defense}` : ''} · 可用 {available}
                              </small>
                            </button>
                          );
                        })}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

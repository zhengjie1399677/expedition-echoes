import { lazy, Suspense, useEffect, useReducer, useState } from 'react';
import { affinityStage, craftingRecipes, dayLabel, expeditionNodes, giftDefinitions, heroClassDescriptions, heroClassNames, itemDefinitions, materialName, materialSellPrices, missions, rarityColors, rarityNames } from '../content/gameContent';
import { availableItemCount, canAttack, createInitialGame, enemyCanAttack, equipmentBonuses, experienceToNextLevel, gameReducer } from '../domain/gameEngine';
import type { EquipmentSlot, GameAction, GameState, Hero, Rarity, SettlementState } from '../domain/model';
import { narrativeService, playerPlaceholder } from '../infrastructure/llm';
import type { NarrativeMessage, NarrativeProvider } from '../infrastructure/llm';
import { warmExpeditionResources } from '../infrastructure/expeditionPreloader';
import { clearGame, loadGame, saveGame } from '../infrastructure/storage';

const BattleCanvas = lazy(() => import('./BattleCanvas').then((module) => ({ default: module.BattleCanvas })));

function HeroCard({ hero, selected, dispatch }: { hero: Hero; selected: boolean; dispatch: React.Dispatch<GameAction> }) {
  const upgradeCost = 30 + hero.gearLevel * 20;
  const nextLevelExperience = experienceToNextLevel(hero.level);
  return <article className={`hero-card ${selected ? 'is-selected' : ''}`}>
    <div className="portrait">{hero.name.slice(0, 1)}</div><div className="hero-info">
      <div className="hero-title"><strong>{hero.name}</strong><span>Lv.{hero.level} · {heroClassNames[hero.heroClass]}</span></div>
      <p>{hero.personality}</p><small>{heroClassDescriptions[hero.heroClass]}</small>
      <div className="stats"><span>生命 {hero.maxHp}</span><span>装备 +{hero.gearLevel}</span></div>
      <div className="hero-exp" aria-label={`${hero.name}经验 ${hero.experience}/${nextLevelExperience}`}><i style={{ width: `${hero.experience / nextLevelExperience * 100}%` }} /><span>EXP {hero.experience}/{nextLevelExperience}</span></div>
      <div className="button-row">{!hero.recruited
        ? <button onClick={() => dispatch({ type: 'RECRUIT', heroId: hero.id })}>招募 · 25 金币</button>
        : <><button className={selected ? 'active' : ''} onClick={() => dispatch({ type: 'TOGGLE_PARTY', heroId: hero.id })}>{selected ? '已编入队伍' : '编入队伍'}</button><button disabled={hero.gearLevel >= 3} onClick={() => dispatch({ type: 'UPGRADE_GEAR', heroId: hero.id })}>装备升级 · {upgradeCost}</button></>}
      </div>
    </div>
  </article>;
}

function Town({ state, dispatch, onGateClick }: { state: GameState; dispatch: React.Dispatch<GameAction>; onGateClick: () => void }) {
  const handleGateClick = () => {
    if (!state.hasAcceptedMission) {
      dispatch({ type: 'START_EXPEDITION' });
      return;
    }
    onGateClick();
  };
  return <section className="page town-page">
    <div className="town-map">
      <img src="/assets/world/town-hub-v3.png" alt="明亮的冒险者城镇，包含酒馆、广场、宿舍和城门" />
      <div className="town-map-shade" />
      <div className="town-map-frame" />
      
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

      <button className="map-hotspot hotspot-tavern" onClick={() => dispatch({ type: 'NAVIGATE', page: 'tavern' })}>
        <span className="beacon-ring" />
        <strong>旅途酒馆</strong>
        <span>招募 · 任务 · 补给</span>
      </button>
      <div className="map-hotspot hotspot-plaza location-marker" aria-label="中央广场，当前所在位置">
        <span className="beacon-ring" />
        <strong>中央广场</strong>
        <span>城镇据点</span>
      </div>
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
    </div>
  </section>;
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
  'echo-charm': '📿',
};
const quartersPortraits: Record<string, string> = {
  lan: '/assets/portraits-dorm/lan-dorm-v2.png',
  wu: '/assets/portraits-dorm/wu-dorm-v2.png',
  xingluo: '/assets/portraits-dorm/xingluo-dorm-v2.png',
  scout: '/assets/actors/scout-v1.png',
};
const quartersGreetings: Record<string, string> = {
  lan: '还没休息吗？进来吧，我正好在整理明天要带的东西。',
  wu: '门没锁。要聊聊今天在路上看到的事吗？',
  xingluo: '来得正好，我刚把星盘收起来。今晚的天象很安静。',
};

function Management({ state, dispatch }: { state: GameState; dispatch: React.Dispatch<GameAction> }) {
  const tab = state.managementTab;
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'food' | 'equipment' | 'material'>('all');
  const managementTitle = tab === 'party' ? '队伍编成' : tab === 'equipment' ? '角色装备' : tab === 'craft' ? '装备打造' : '旅行背包';
  const recruited = state.roster.filter((hero) => hero.recruited);
  const [heroId, setHeroId] = useState(state.selectedHeroIds[0] ?? recruited[0]?.id ?? '');
  const hero = recruited.find((item) => item.id === heroId) ?? recruited[0];
  const ownedItems = itemDefinitions.filter((item) => (state.inventory[item.id] ?? 0) > 0);
  const equipmentItems = itemDefinitions.filter((item) => item.kind === 'equipment');
  const bonuses = hero ? equipmentBonuses(hero) : { attack: 0, defense: 0 };
  const materialEntries = Object.entries(state.materials).filter(([, count]) => count > 0).map(([key, count]) => { const [typeId, rarityStr] = key.split(':'); const rarity = Number(rarityStr) as Rarity; return { typeId, rarity, count }; }).sort((a, b) => a.rarity - b.rarity || materialName(a.typeId).localeCompare(materialName(b.typeId)));

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

  return <section className="page management-page">
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

    {tab === 'party' && <div className="party-management">
      <div className="formation-panel"><header><strong>出征队伍</strong><span>{state.selectedHeroIds.length}/3</span></header>
        <div className="formation-list">{state.selectedHeroIds.map((id, index) => { const member = state.roster.find((item) => item.id === id)!; return <article key={id}>
          <b>{index + 1}</b><div><strong>{member.name}</strong><span>{index === 0 ? '前排 · 靠近敌方' : `第 ${index + 1} 位 · 距离 ${index + 1}`}</span></div>
          <div className="formation-actions"><button disabled={index === 0} onClick={() => dispatch({ type: 'MOVE_PARTY', index, direction: -1 })}>前移</button><button disabled={index === state.selectedHeroIds.length - 1} onClick={() => dispatch({ type: 'MOVE_PARTY', index, direction: 1 })}>后移</button><button onClick={() => dispatch({ type: 'TOGGLE_PARTY', heroId: id })}>移出</button></div>
        </article>; })}</div>
      </div>
      <div className="reserve-panel"><header><strong>冒险者名册</strong><span>点击编入队伍</span></header>{recruited.map((member) => {
        const selected = state.selectedHeroIds.includes(member.id); const memberBonuses = equipmentBonuses(member);
        return <button key={member.id} className={selected ? 'selected' : ''} disabled={selected} onClick={() => dispatch({ type: 'TOGGLE_PARTY', heroId: member.id })}><span className="management-avatar">{member.name.slice(0, 1)}</span><span><strong>{member.name} · Lv.{member.level}</strong><small>{heroClassNames[member.heroClass]} · 攻击 +{memberBonuses.attack} · 防御 +{memberBonuses.defense}</small></span><em>{selected ? '已出征' : '编入'}</em></button>;
      })}</div>
    </div>}

    {tab === 'inventory' && <div className="inventory-panel">
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
                        <span className="item-badge tag-material" style={{ color: rarityColors[item.rarity], borderColor: rarityColors[item.rarity] }}>{kindLabel}</span>
                      </div>
                      <p className="item-desc">{item.description}</p>
                    </div>
                    <div className="item-actions">
                      <button className="sell-button compact-sell" onClick={() => dispatch({ type: 'SELL_MATERIAL', typeId: item.id, rarity: item.rarity, count: 1 })}>
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
    </div>}

    {tab === 'craft' && <div className="craft-panel"><header><strong>装备打造</strong><span>消耗材料与金币，打造装备入背包</span></header><div className="craft-grid">{craftingRecipes.map((recipe) => {
      const result = itemDefinitions.find((item) => item.id === recipe.resultItemId);
      const goldOk = state.gold >= recipe.goldCost;
      const matsOk = recipe.materials.every((m) => (state.materials[`${m.typeId}:${m.rarity}`] ?? 0) >= m.count);
      const canCraft = goldOk && matsOk;
      return <article key={recipe.id} className={`craft-card ${canCraft ? '' : 'disabled'}`}><div className="craft-result"><strong>{result?.name ?? recipe.resultItemId}</strong><small>{result?.attack ? `攻击 +${result.attack}` : ''}{result?.attack && result?.defense ? ' · ' : ''}{result?.defense ? `减伤 +${result.defense}` : ''}</small></div><div className="craft-cost"><span className="craft-mats">{recipe.materials.map((m, i) => <span key={i} className={`rarity-badge rarity-${m.rarity}`} style={{ borderColor: rarityColors[m.rarity], color: rarityColors[m.rarity] }}>{materialName(m.typeId)}·{rarityNames[m.rarity]} ×{m.count}</span>)}</span><span className="craft-gold">{recipe.goldCost} 金币</span></div><button disabled={!canCraft} onClick={() => dispatch({ type: 'CRAFT_ITEM', recipeId: recipe.id })}>{canCraft ? '打造' : '不足'}</button></article>;
    })}</div></div>}

    {tab === 'equipment' && hero && <div className="equipment-management">
      <aside className="equipment-heroes">{recruited.map((member) => <button key={member.id} className={member.id === hero.id ? 'active' : ''} onClick={() => setHeroId(member.id)}><span>{member.name.slice(0, 1)}</span><div><strong>{member.name}</strong><small>Lv.{member.level} · {heroClassNames[member.heroClass]}</small></div></button>)}</aside>
      <div className="equipment-detail"><header><div><small>当前角色</small><h3>{hero.name}</h3></div><div className="equipment-summary"><span>攻击加成 <b>+{bonuses.attack}</b></span><span>伤害减免 <b>+{bonuses.defense}</b></span></div></header>
        <div className="equipment-slots">{(['weapon', 'armor', 'accessory'] as EquipmentSlot[]).map((slot) => {
          const currentId = hero.equipment[slot]; const current = itemDefinitions.find((item) => item.id === currentId);
          return <section key={slot}><header><strong>{equipmentSlotNames[slot]}</strong>{current && <button onClick={() => dispatch({ type: 'UNEQUIP_ITEM', heroId: hero.id, slot })}>卸下</button>}</header><div className="equipped-item">{current ? <><b>{current.name}</b><span>{current.description}</span></> : <span>未装备</span>}</div><div className="equipment-options">{equipmentItems.filter((item) => item.slot === slot && (!item.allowedClasses || item.allowedClasses.includes(hero.heroClass))).map((item) => {
            const equipped = currentId === item.id; const available = availableItemCount(state, item.id);
            return <button key={item.id} className={equipped ? 'equipped' : ''} disabled={!equipped && available < 1} onClick={() => dispatch({ type: 'EQUIP_ITEM', heroId: hero.id, itemId: item.id })}><strong>{item.name}</strong><small>{item.attack ? `攻击 +${item.attack}` : ''}{item.attack && item.defense ? ' · ' : ''}{item.defense ? `减伤 +${item.defense}` : ''} · 可用 {available}</small></button>;
          })}</div></section>;
        })}</div>
      </div>
    </div>}
  </section>;
}

function Tavern({ state, dispatch }: { state: GameState; dispatch: React.Dispatch<GameAction> }) {
  const [rosterOpen, setRosterOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [previewMissionId, setPreviewMissionId] = useState<string>();
  const [acceptingMission, setAcceptingMission] = useState(false);
  const previewMission = missions.find((mission) => mission.id === previewMissionId);
  const closeBoard = () => {
    if (acceptingMission) return;
    setBoardOpen(false);
    setPreviewMissionId(undefined);
  };
  const acceptMission = () => {
    if (!previewMission || acceptingMission || state.missionAcceptedToday) return;
    dispatch({ type: 'ACCEPT_MISSION', missionId: previewMission.id });
    setAcceptingMission(true);
    globalThis.setTimeout(() => {
      setBoardOpen(false);
      setPreviewMissionId(undefined);
      setAcceptingMission(false);
    }, 720);
  };
  return <section className="page tavern-page tavern-scene">
    <img className="tavern-background" src="/assets/world/tavern-hall-v2.png" alt="有老板和冒险者客人的黄昏酒馆" />
    <button className="scene-hotspot tavernkeeper-hotspot" aria-label="与酒馆老板交谈，打开招募与整备" onClick={() => setRosterOpen(true)}><span>酒馆老板</span></button>
    <button className="scene-hotspot quest-board-hotspot" aria-label="查看公会任务板" onClick={() => { setBoardOpen(true); setPreviewMissionId(undefined); }}><span>查看任务板</span></button>
    {boardOpen && !previewMission && <aside className="quest-dialog quest-list-dialog" aria-label="公会任务板">
      <header><div><small>公会任务板</small><strong>选择远征委托</strong></div><button onClick={closeBoard}>关闭</button></header>
      <div className="quest-dialog-list">{missions.map((mission) => <button key={mission.id} className="quest-dialog-card" onClick={() => setPreviewMissionId(mission.id)}>
        <div><strong>{mission.title}</strong><span>{'◆'.repeat(mission.difficulty)}{'◇'.repeat(3 - mission.difficulty)}</span></div>
        <p>{mission.summary}</p><small>{mission.reward} 金币 · 点击展开委托</small>
      </button>)}</div>
      <footer>选择一张委托，查看完整内容。</footer>
    </aside>}
    {boardOpen && previewMission && <aside className={`quest-parchment ${acceptingMission ? 'accepting' : ''}`} aria-label={`${previewMission.title}任务详情`}>
      <button className="parchment-close" aria-label="关闭任务详情" onClick={closeBoard}>×</button>
      <div className="parchment-kicker">冒险者公会 · 正式委托</div>
      <h2>{previewMission.title}</h2>
      <div className="parchment-difficulty" aria-label={`难度 ${previewMission.difficulty}`}>{'◆'.repeat(previewMission.difficulty)}{'◇'.repeat(3 - previewMission.difficulty)}</div>
      <div className="parchment-rule" />
      <p className="parchment-summary">{previewMission.summary}</p>
      <dl className="parchment-details">
        <div><dt>委托报酬</dt><dd>{previewMission.reward} 金币</dd></div>
        {previewMission.materialRewards?.length ? <div><dt>材料报酬</dt><dd className="parchment-materials">{previewMission.materialRewards.map((r, i) => <span key={i} className={`rarity-badge rarity-${r.rarity}`} style={{ borderColor: rarityColors[r.rarity], color: rarityColors[r.rarity] }}>{materialName(r.typeId)}·{rarityNames[r.rarity]} ×{r.count}</span>)}</dd></div> : null}
        <div><dt>行动区域</dt><dd>边境遗迹</dd></div>
        <div><dt>预计行程</dt><dd>{Object.keys(previewMission.enemyWaves).length} 场遭遇</dd></div>
      </dl>
      <div className="parchment-actions">
        <button onClick={() => setPreviewMissionId(undefined)}>返回任务板</button>
        <button className="accept-mission" disabled={state.missionAcceptedToday} onClick={acceptMission}>{state.missionAcceptedToday ? '今日已接取' : '接取任务'}</button>
      </div>
      {acceptingMission && <div className="accepted-check" aria-live="polite"><strong>✓</strong><span>任务已接取</span></div>}
    </aside>}
    {rosterOpen && <aside className="tavern-roster-drawer"><header><div><p className="eyebrow">酒馆老板 · 队伍整备</p><strong>冒险者名册</strong></div><button onClick={() => setRosterOpen(false)}>关闭</button></header><p className="roster-summary">当前队伍：{state.selectedHeroIds.map((id) => state.roster.find((hero) => hero.id === id)?.name).join('、') || '尚未选择'}</p><div className="roster">{state.roster.map((hero) => <HeroCard key={hero.id} hero={hero} selected={state.selectedHeroIds.includes(hero.id)} dispatch={dispatch} />)}</div></aside>}
  </section>;
}

function Quarters({ state, dispatch, onRestClick }: { state: GameState; dispatch: React.Dispatch<GameAction>; onRestClick: () => void }) {
  const recruited = state.roster.filter((hero) => hero.recruited);
  const [heroId, setHeroId] = useState(recruited[0]?.id ?? ''); const [roomHeroId, setRoomHeroId] = useState<string | null>(null); const [messages, setMessages] = useState<NarrativeMessage[]>([{ role: 'assistant', content: '今晚的宿舍很安静。' }]); const [playerText, setPlayerText] = useState(''); const [loading, setLoading] = useState(false); const [historyOpen, setHistoryOpen] = useState(false);
  const hero = recruited.find((item) => item.id === heroId) ?? recruited[0];
  const connection = narrativeService.status();
  const freeChatAvailable = state.settings.llmEnabled && connection.available;
  const talk = async (presetText?: string) => {
    const text = (presetText ?? playerText).trim();
    if (!hero || !text || loading) return;
    const history = messages;
    setMessages((current) => [...current, { role: 'user' as const, content: text }].slice(-16));
    setPlayerText('');
    setLoading(true);
    const reply = await narrativeService.chat(hero, state, history, text);
    setMessages((current) => [...current, { role: 'assistant' as const, content: reply }].slice(-16));
    setLoading(false);
  };
  const enterRoom = (id: string) => { setHeroId(id); setRoomHeroId(id); setMessages([{ role: 'assistant', content: quartersGreetings[id] ?? '今晚的宿舍很安静。' }]); setPlayerText(''); setHistoryOpen(false); };
  if (!roomHeroId) return <section className="page quarters-page quarters-hall">
    <img className="quarters-background" src="/assets/world/quarters-hall-v1.png" alt="冒险者宿舍公共走廊" />
    <div className="room-directory">{recruited.map((item, index) => <button className={`room-entry room-entry-${index}`} key={item.id} onClick={() => enterRoom(item.id)}><strong>{item.name}的房间</strong><span>{heroClassNames[item.heroClass]} · 敲门进入</span></button>)}</div>
    <button className="quarters-rest-button" onClick={onRestClick}>
      <strong>上楼休息</strong>
      <span>结束今日 · 进入 {dayLabel(state.day + 1)}</span>
    </button>
  </section>;
  return <section className="page quarters-page">
    <img className="quarters-background" src="/assets/world/quarters-dorm-v1.png" alt="暮色中的冒险者宿舍" />
    <div className="quarters-topbar"><div><p className="eyebrow">{hero?.name}的房间 · 日常交谈</p><strong>远征后的安静时间</strong>{hero && <div className="gift-row"><span className="gift-info">好感 {hero.affinity} · {affinityStage(hero.affinity).name}</span>{giftDefinitions.filter((g) => (state.inventory[g.id] ?? 0) > 0).map((g) => <button key={g.id} disabled={(state.giftsGivenToday[hero.id] ?? 0) >= 1} onClick={() => dispatch({ type: 'GIVE_GIFT', heroId: hero.id, giftId: g.id })}>{g.name}×{state.inventory[g.id]}{hero.preferredGiftTags.some((t) => g.tags.includes(t)) ? '★' : ''}</button>)}{(state.giftsGivenToday[hero.id] ?? 0) >= 1 && <span>今日已送</span>}</div>}</div><button className="leave-room" onClick={() => setRoomHeroId(null)}>返回公共区域</button></div>
    {hero && <div className="quarters-character" aria-hidden="true">
      <div className="quarters-character-shadow" />
      <img key={hero.id} src={quartersPortraits[hero.id] ?? '/assets/actors-v2/scout-idle-v2.png'} alt="" />
    </div>}
    <div
      className={`quarters-chat gal-dialogue ${historyOpen ? 'history-open' : ''} ${loading ? 'loading' : ''}`}
      aria-label={historyOpen ? '对话回顾' : '宿舍聊天窗口'}
    >
      <div className="gal-nameplate"><strong>{hero?.name ?? '无人'}</strong><span>{hero ? `${heroClassNames[hero.heroClass]} · 与队长交谈` : ''}</span></div>
      <button className="gal-history" onClick={(event) => { event.stopPropagation(); setHistoryOpen((open) => !open); }}>{historyOpen ? '返回对白' : '回顾'}</button>
      <div className="chat-thread">{messages.map((message, index) => <div className={`chat-message ${message.role}`} key={`${index}-${message.content}`}>{message.role === 'assistant' ? `“${message.content}”` : `队长 ${playerPlaceholder}：${message.content}`}</div>)}</div>
      {!historyOpen && <form className={`gal-input ${freeChatAvailable ? '' : 'offline'}`} onSubmit={(event) => { event.preventDefault(); void (freeChatAvailable ? talk() : talk('今晚好好休息，明天见。')); }}>
        <span className="speaker-label">队长 {playerPlaceholder}</span>
        <input value={playerText} onChange={(event) => setPlayerText(event.target.value)} disabled={loading || !hero || !freeChatAvailable} maxLength={240} placeholder={loading ? `${hero?.name ?? '对方'}正在回应…` : freeChatAvailable ? `和${hero?.name ?? '对方'}说点什么…` : '连接 LLM 后可自由交谈'} aria-label="以队长身份输入对话内容" />
        <button disabled={loading || (freeChatAvailable && !playerText.trim())} type="submit">{loading ? '回应中' : freeChatAvailable ? '发送' : '简单问候'}</button>
      </form>}
    </div>
  </section>;
}

function MiniMap({ currentNode }: { currentNode: number }) {
  const cells = [{ column: 1, row: 2 }, { column: 2, row: 2 }, { column: 2, row: 1 }, { column: 3, row: 1 }, { column: 3, row: 2 }];
  return <div className="exp-map" aria-label="遗迹格子地图">
    <div className="exp-map-header"><strong>边境遗迹</strong><small>探索地图</small></div>
    <div className="exp-map-grid">
      <svg className="exp-map-corridors" viewBox="0 0 180 104" preserveAspectRatio="none" aria-hidden="true"><path d="M30 78 H90 V26 H150 V78" /></svg>
      {expeditionNodes.map((node, index) => <div key={node.title} style={{ gridColumn: cells[index].column, gridRow: cells[index].row }} className={`exp-map-cell ${index === currentNode ? 'current' : index < currentNode ? 'passed' : 'unknown'}`} title={index <= currentNode ? node.title : '未知区域'}>
        <i>{index > currentNode ? '?' : node.kind === 'combat' ? '⚔' : '✦'}</i><small>{index + 1}</small>
      </div>)}
    </div>
    <div className="exp-map-location"><span>当前位置</span><strong>{expeditionNodes[currentNode].title}</strong></div>
  </div>;
}

function Expedition({ state, dispatch }: { state: GameState; dispatch: React.Dispatch<GameAction> }) {
  const [attackRequest, setAttackRequest] = useState<{ heroId: string; nonce: number }>();
  const [selectedEnemyId, setSelectedEnemyId] = useState<string>();
  const run = state.expedition;
  if (!run) return <section className="empty-state"><div><h2>尚未开始远征</h2><p>请先在酒馆选择队员并完成整备。</p><button className="primary" onClick={() => dispatch({ type: 'NAVIGATE', page: 'tavern' })}>返回酒馆</button></div></section>;
  const party = run.formation.map((id) => state.roster.find((hero) => hero.id === id)!).filter(Boolean);
  const aliveEnemies = run.enemies.filter((enemy) => enemy.hp > 0);
  const selectedEnemy = aliveEnemies.find((enemy) => enemy.id === selectedEnemyId) ?? aliveEnemies[0];
  const node = expeditionNodes[run.nodeIndex];
  const commitAttack = (heroId: string, enemyId: string) => dispatch({ type: 'ATTACK', heroId, enemyId });
  const requestAttack = (heroId: string) => setAttackRequest((current) => ({ heroId, nonce: (current?.nonce ?? 0) + 1 }));
  return <section className="page expedition-screen">
    <header className="expedition-header">
      <div className="expedition-header-copy"><small>远征 · 节点 {run.nodeIndex + 1}/{expeditionNodes.length}</small><strong>{node.title}</strong><span>{node.description}</span></div>
      <div className="expedition-progress" style={{ '--expedition-progress': `${(run.nodeIndex + 1) / expeditionNodes.length * 100}%` } as React.CSSProperties}><span>{run.nodeIndex + 1}/{expeditionNodes.length}</span><i /></div>
    </header>
    <div className="expedition-stage"><Suspense fallback={<div className="phaser-loading">正在展开遗迹场景…</div>}><BattleCanvas key={`${run.nodeIndex}-${run.enemies.map((enemy) => enemy.id).join('-') || 'rest'}`} party={party} enemies={run.enemies} targetEnemyId={selectedEnemy?.id} onSelectEnemy={setSelectedEnemyId} nodeIndex={run.nodeIndex} attackRequest={attackRequest} counterTargetId={selectedEnemy ? party.find((hero, index) => hero.hp > 0 && enemyCanAttack(selectedEnemy, index))?.id : undefined} canHeroAttack={(hero, index, enemy) => canAttack(hero, enemy, index)} onAttack={commitAttack} /></Suspense></div>
    <aside className="expedition-sidebar">
      <MiniMap currentNode={run.nodeIndex} />
      <div className="expedition-tools"><span className="expedition-tools-label">远征补给</span><span className="expedition-tool"><b>绷带</b><em>× {run.supplies.bandage}</em></span><span className="expedition-tool"><b>镇定剂</b><em>× {run.supplies.sedative}</em></span></div>
      <button className="expedition-retreat" onClick={() => dispatch({ type: 'RETREAT' })}>撤退并返回城镇</button>
    </aside>
    <div className="expedition-hud">
      <div className="expedition-party">{party.map((hero, index) => { const nextLevelExperience = experienceToNextLevel(hero.level); return <article className={`exp-unit ${hero.hp <= 0 ? 'down' : ''}`} key={hero.id}><div className="exp-unit-header"><strong>{index === 0 ? '前排 · ' : ''}{hero.name}</strong><small>Lv.{hero.level} · {heroClassNames[hero.heroClass]} · 距离 {index + 1}</small></div><div className={`exp-bar ${hero.hp / hero.maxHp <= .3 ? 'critical' : ''}`}><i style={{ width: `${hero.hp / hero.maxHp * 100}%` }} /><span>{hero.hp}/{hero.maxHp}</span></div><div className="exp-unit-meta">{state.settings.moraleEnabled && <span>士气 {hero.morale}/100</span>}<span>EXP {hero.experience}/{nextLevelExperience}</span></div><div className="exp-mini-exp"><i style={{ width: `${hero.experience / nextLevelExperience * 100}%` }} /></div><div className="exp-unit-actions"><button className="attack" disabled={!selectedEnemy || hero.hp <= 0} onClick={() => requestAttack(hero.id)}>攻击</button><button onClick={() => dispatch({ type: 'USE_BANDAGE', heroId: hero.id })}>绷带</button><button onClick={() => dispatch({ type: 'USE_SEDATIVE', heroId: hero.id })}>镇定</button>{index < party.length - 1 && <button onClick={() => dispatch({ type: 'SWAP', index })}>换位</button>}</div></article>; })}</div>
      <div className="expedition-enemies">{run.enemies.map((enemy, index) => <button type="button" key={enemy.id} disabled={enemy.hp <= 0} className={`exp-enemy ${selectedEnemy?.id === enemy.id ? 'targeted' : ''}`} onClick={() => setSelectedEnemyId(enemy.id)}><div className="exp-enemy-header"><strong>{index === 0 ? '前排 · ' : ''}{enemy.name}</strong><small>范围 {enemy.attackMinRange}–{enemy.attackMaxRange}</small></div><div className={`exp-bar ${enemy.hp / enemy.maxHp <= .3 ? 'critical' : ''}`}><i style={{ width: `${enemy.hp / enemy.maxHp * 100}%` }} /><span>{enemy.hp}/{enemy.maxHp}</span></div></button>)}</div>
    </div>
    <footer className="expedition-footer"><div><strong>最近记录</strong><p>{state.log[0]}</p></div>{aliveEnemies.length === 0 && <button className="primary" onClick={() => dispatch({ type: 'ADVANCE' })}>{run.nodeIndex === expeditionNodes.length - 1 ? '完成远征' : '前往下一节点'}</button>}</footer>
  </section>;
}

function Settings({ state, dispatch }: { state: GameState; dispatch: React.Dispatch<GameAction> }) {
  const [provider, setProvider] = useState<NarrativeProvider>(() => narrativeService.provider);
  const connection = narrativeService.status(provider);
  const changeProvider = (value: NarrativeProvider) => { narrativeService.provider = value; setProvider(value); };
  return <section className="settings-page">
    <p className="eyebrow">设置 · 游戏规则</p>
    <h2>按你想要的节奏游玩。</h2>
    <div className="setting-card">
      <div>
        <strong>士气系统</strong>
        <p>开启后，受击会增加士气压力；达到 50 时进入“动摇”，攻击降低 2 点。</p>
      </div>
      <button className={`toggle-btn ${state.settings.moraleEnabled ? 'active' : ''}`} onClick={() => dispatch({ type: 'TOGGLE_MORALE' })}>
        {state.settings.moraleEnabled ? '已开启' : '已关闭'}
      </button>
    </div>
    <div className="setting-card">
      <div>
        <strong>真实角色聊天</strong>
        <p>当前：{connection.label}。自动模式优先使用 Mobile-Tavern 插件桥接，其次使用 SillyTavern；均不可用时使用离线对白。</p>
        <small>Mobile-Tavern {connection.mobileTavernAvailable ? '已连接' : '未连接'} · SillyTavern {connection.sillyTavernAvailable ? '已连接' : '未连接'}</small>
      </div>
      <div className="llm-controls">
        <select aria-label="聊天接口" value={provider} onChange={(event) => changeProvider(event.target.value as NarrativeProvider)}>
          <option value="auto">自动选择</option>
          <option value="mobile-tavern">Mobile-Tavern</option>
          <option value="sillytavern">SillyTavern</option>
        </select>
        <button className={`toggle-btn ${state.settings.llmEnabled ? 'active' : ''}`} onClick={() => dispatch({ type: 'TOGGLE_LLM' })}>
          {state.settings.llmEnabled ? '已开启' : '已关闭'}
        </button>
      </div>
    </div>
    <div className="setting-card danger">
      <div>
        <strong>重置本地存档</strong>
        <p>清除招募、装备升级与设置，恢复初始状态。</p>
      </div>
      <button className="reset-btn" onClick={() => { clearGame(); dispatch({ type: 'RESET' }); }}>重置</button>
    </div>
  </section>;
}

function BottomAdventureMenu({ state, dispatch }: { state: GameState; dispatch: React.Dispatch<GameAction> }) {
  if (state.page === 'expedition' || state.page === 'settings' || state.page === 'settlement') return null;
  const entries = [
    { id: 'town', label: '城镇', glyph: '◇', active: state.page === 'town', action: () => dispatch({ type: 'NAVIGATE', page: 'town' }) },
    { id: 'party', label: '队伍', glyph: 'Ⅲ', active: state.page === 'management' && state.managementTab === 'party', action: () => dispatch({ type: 'OPEN_MANAGEMENT', tab: 'party' }) },
    { id: 'equipment', label: '角色', glyph: '♙', active: state.page === 'management' && state.managementTab === 'equipment', action: () => dispatch({ type: 'OPEN_MANAGEMENT', tab: 'equipment' }) },
    { id: 'inventory', label: '背包', glyph: '▣', active: state.page === 'management' && state.managementTab === 'inventory', action: () => dispatch({ type: 'OPEN_MANAGEMENT', tab: 'inventory' }) },
    { id: 'craft', label: '打造', glyph: '⚒', active: state.page === 'management' && state.managementTab === 'craft', action: () => dispatch({ type: 'OPEN_MANAGEMENT', tab: 'craft' }) },
  ];
  return <nav className="adventure-menu" aria-label="冒险菜单">{entries.map((entry) => <button key={entry.id} className={entry.active ? 'active' : ''} onClick={entry.action}><span className="menu-glyph">{entry.glyph}</span><strong className="menu-label">{entry.label}</strong></button>)}</nav>;
}

function ExpeditionPrepOverlay({ state, dispatch, onClose }: { state: GameState; dispatch: React.Dispatch<GameAction>; onClose: () => void }) {
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

  const totalSlots = carryFood + carryBandage + carrySedative;
  const isTeamValid = state.selectedHeroIds.length >= 2;

  const handleStart = () => {
    if (!isTeamValid || totalSlots > 10) return;
    try {
      localStorage.setItem('last_expedition_supplies', JSON.stringify({
        food: carryFood,
        bandage: carryBandage,
        sedative: carrySedative
      }));
    } catch (e) {}
    dispatch({ type: 'START_EXPEDITION', supplies: { food: carryFood, bandage: carryBandage, sedative: carrySedative } });
    onClose();
  };

  const selectedHeroes = state.selectedHeroIds.map(id => state.roster.find(h => h.id === id)!).filter(Boolean);

  return (
    <div className="confirm-overlay prep-overlay" onClick={onClose}>
      <div className="confirm-dialog prep-dialog" onClick={(e) => e.stopPropagation()}>
        <header className="prep-header">
          <h3>远征出征整备</h3>
          <p>请挑选本次远征所携带的口粮与药剂。行囊最大容量为 10 格。</p>
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
            <h4>行囊配置 (已用: {totalSlots}/10 格)</h4>
            <div className="supply-control-row">
              <div className="supply-label-col">
                <strong>口粮 (食物)</strong>
                <small>城镇库存: {state.food}</small>
              </div>
              <div className="supply-btn-group">
                <button disabled={carryFood <= 0} onClick={() => setCarryFood(f => f - 1)}>-</button>
                <span className="carry-val">{carryFood}</span>
                <button disabled={carryFood >= state.food || totalSlots >= 10} onClick={() => setCarryFood(f => f + 1)}>+</button>
              </div>
            </div>

            <div className="supply-control-row">
              <div className="supply-label-col">
                <strong>绷带</strong>
                <small>城镇库存: {state.inventory.bandage ?? 0}</small>
              </div>
              <div className="supply-btn-group">
                <button disabled={carryBandage <= 0} onClick={() => setCarryBandage(b => b - 1)}>-</button>
                <span className="carry-val">{carryBandage}</span>
                <button disabled={carryBandage >= (state.inventory.bandage ?? 0) || totalSlots >= 10} onClick={() => setCarryBandage(b => b + 1)}>+</button>
              </div>
            </div>

            <div className="supply-control-row">
              <div className="supply-label-col">
                <strong>镇定剂</strong>
                <small>城镇库存: {state.inventory.sedative ?? 0}</small>
              </div>
              <div className="supply-btn-group">
                <button disabled={carrySedative <= 0} onClick={() => setCarrySedative(s => s - 1)}>-</button>
                <span className="carry-val">{carrySedative}</span>
                <button disabled={carrySedative >= (state.inventory.sedative ?? 0) || totalSlots >= 10} onClick={() => setCarrySedative(s => s + 1)}>+</button>
              </div>
            </div>
          </section>
        </div>

        <div className="confirm-actions prep-actions">
          <button onClick={onClose}>返回城镇</button>
          <button className="confirm-yes" disabled={!isTeamValid || totalSlots > 10} onClick={handleStart}>确认出发</button>
        </div>
      </div>
    </div>
  );
}

function Settlement({ state, dispatch }: { state: GameState; dispatch: React.Dispatch<GameAction> }) {
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

export function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => loadGame() ?? createInitialGame());
  const [confirmRest, setConfirmRest] = useState(false);
  const [prepOpen, setPrepOpen] = useState(false);

  useEffect(() => saveGame(state), [state]);
  useEffect(() => warmExpeditionResources(), []);

  return <main className={`app-shell ${state.page !== 'expedition' && state.page !== 'settings' && state.page !== 'settlement' ? 'with-adventure-menu' : ''}`}><header className="topbar"><button className="brand-home" onClick={() => dispatch({ type: 'NAVIGATE', page: 'town' })}><span className="eyebrow">边境远征队 · 第一版</span><strong>远征余响</strong></button><div className="topbar-actions"><div className="resource"><small>{state.page === 'town' ? '城镇据点' : '◆ 当前地点'}</small><strong>{dayLabel(state.day)} · ◆ {state.gold} · 口粮 {state.food}{state.hunger > 0 ? ` · 饥饿${state.hunger}` : ''}</strong></div>{state.page === 'settings' && <button className="return-town" onClick={() => dispatch({ type: 'NAVIGATE', page: 'town' })}>返回城镇</button>}<button className={`settings-entry ${state.page === 'settings' ? 'selected' : ''}`} aria-label="设置" title="设置" onClick={() => dispatch({ type: 'NAVIGATE', page: 'settings' })}>⚙</button></div></header><div className="game-viewport">{state.page === 'town' && <Town state={state} dispatch={dispatch} onGateClick={() => setPrepOpen(true)} />}{state.page === 'management' && <Management state={state} dispatch={dispatch} />}{state.page === 'tavern' && <Tavern state={state} dispatch={dispatch} />}{state.page === 'quarters' && <Quarters state={state} dispatch={dispatch} onRestClick={() => setConfirmRest(true)} />}{state.page === 'expedition' && <Expedition state={state} dispatch={dispatch} />}{state.page === 'settings' && <Settings state={state} dispatch={dispatch} />}{state.page === 'settlement' && <Settlement state={state} dispatch={dispatch} />}</div><BottomAdventureMenu state={state} dispatch={dispatch} />{confirmRest && <div className="confirm-overlay" onClick={() => setConfirmRest(false)}><div className="confirm-dialog" onClick={(e) => e.stopPropagation()}><p>上楼休息至次日？</p><small>将结束今天并进入 {dayLabel(state.day + 1)}，新的一天可以再次接取任务。</small><div className="confirm-actions"><button onClick={() => setConfirmRest(false)}>取消</button><button className="confirm-yes" onClick={() => { dispatch({ type: 'REST_TO_NEXT_DAY' }); setConfirmRest(false); }}>确认休息</button></div></div></div>}{prepOpen && <ExpeditionPrepOverlay state={state} dispatch={dispatch} onClose={() => setPrepOpen(false)} />}</main>;
}

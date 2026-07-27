import { lazy, Suspense, useEffect, useMemo, useReducer, useState } from 'react';
import { expeditionNodes, heroClassDescriptions, heroClassNames } from '../content/gameContent';
import { canAttack, createInitialGame, enemyCanAttack, gameReducer } from '../domain/gameEngine';
import type { GameAction, GameState, Hero, Page } from '../domain/model';
import { narrativeService } from '../infrastructure/llm';
import { warmExpeditionResources } from '../infrastructure/expeditionPreloader';
import { clearGame, loadGame, saveGame } from '../infrastructure/storage';

const BattleCanvas = lazy(() => import('./BattleCanvas').then((module) => ({ default: module.BattleCanvas })));

const pages: Array<{ id: Page; label: string }> = [
  { id: 'tavern', label: '酒馆' }, { id: 'quarters', label: '宿舍' },
  { id: 'expedition', label: '远征' }, { id: 'settings', label: '设置' },
];
function HeroCard({ hero, selected, dispatch }: { hero: Hero; selected: boolean; dispatch: React.Dispatch<GameAction> }) {
  const upgradeCost = 30 + hero.gearLevel * 20;
  return <article className={`hero-card ${selected ? 'is-selected' : ''}`}>
    <div className="portrait">{hero.name.slice(0, 1)}</div><div className="hero-info">
      <div className="hero-title"><strong>{hero.name}</strong><span>{heroClassNames[hero.heroClass]}</span></div>
      <p>{hero.personality}</p><small>{heroClassDescriptions[hero.heroClass]}</small>
      <div className="stats"><span>生命 {hero.maxHp}</span><span>装备 +{hero.gearLevel}</span></div>
      <div className="button-row">{!hero.recruited
        ? <button onClick={() => dispatch({ type: 'RECRUIT', heroId: hero.id })}>招募 · 25 金币</button>
        : <><button className={selected ? 'active' : ''} onClick={() => dispatch({ type: 'TOGGLE_PARTY', heroId: hero.id })}>{selected ? '已编入队伍' : '编入队伍'}</button><button disabled={hero.gearLevel >= 3} onClick={() => dispatch({ type: 'UPGRADE_GEAR', heroId: hero.id })}>装备升级 · {upgradeCost}</button></>}
      </div>
    </div>
  </article>;
}

function Tavern({ state, dispatch }: { state: GameState; dispatch: React.Dispatch<GameAction> }) {
  const [location, setLocation] = useState<'plaza' | 'tavern'>('plaza');
  const partyNames = state.selectedHeroIds.map((id) => state.roster.find((hero) => hero.id === id)?.name).filter(Boolean).join('、');
  return <section className="page town-page">
    <div className="town-map">
      <img src="/assets/world/town-hub-v1.png" alt="夕阳下的冒险者城镇，包含酒馆、广场、宿舍和城门" />
      <div className="town-map-shade" />
      <button className="map-hotspot hotspot-tavern" onClick={() => setLocation('tavern')}><strong>旅途酒馆</strong><span>招募 · 任务 · 补给</span></button>
      <button className="map-hotspot hotspot-plaza" onClick={() => setLocation('plaza')}><strong>中央广场</strong><span>城镇据点</span></button>
      <button className="map-hotspot hotspot-quarters" onClick={() => dispatch({ type: 'NAVIGATE', page: 'quarters' })}><strong>旅人宿舍</strong><span>休息 · 交谈</span></button>
      <button className="map-hotspot hotspot-gate" onClick={() => dispatch({ type: 'START_EXPEDITION' })}><strong>东侧城门</strong><span>开始远征</span></button>
      <div className="town-map-card">
        <p className="eyebrow">{location === 'plaza' ? '据点 · 中央广场' : '据点 · 旅途酒馆'}</p>
        <h2>{location === 'plaza' ? '新的旅程从这里展开。' : '在出发前决定由谁承担风险。'}</h2>
        <p>{location === 'plaza' ? '酒馆负责招募、任务与物资整备；宿舍承载队员互动；穿过城门即可进入远征。' : `当前队伍：${partyNames || '尚未选择'}。装备只在城内升级，进入遗迹后无法更换。`}</p>
        {location === 'plaza' ? <button className="primary" onClick={() => setLocation('tavern')}>前往酒馆整备</button> : <button className="primary" onClick={() => dispatch({ type: 'START_EXPEDITION' })}>整队前往城门</button>}
      </div>
    </div>
    {location === 'tavern' && <div className="town-management"><div className="management-heading"><div><p className="eyebrow">酒馆 · 队伍整备</p><h2>远征成员</h2></div><button onClick={() => setLocation('plaza')}>收起面板</button></div><div className="roster">{state.roster.map((hero) => <HeroCard key={hero.id} hero={hero} selected={state.selectedHeroIds.includes(hero.id)} dispatch={dispatch} />)}</div></div>}
  </section>;
}

function Quarters({ state }: { state: GameState }) {
  const recruited = state.roster.filter((hero) => hero.recruited);
  const [heroId, setHeroId] = useState(recruited[0]?.id ?? ''); const [line, setLine] = useState('今晚的宿舍很安静。'); const [loading, setLoading] = useState(false);
  const hero = recruited.find((item) => item.id === heroId) ?? recruited[0];
  const talk = async () => { if (!hero) return; setLoading(true); setLine(await narrativeService.campLine(hero, state)); setLoading(false); };
  return <section className="page quarters-page"><div className="intro-panel"><p className="eyebrow">宿舍 · 角色互动</p><h2>远征结束后，队员仍然有话想说。</h2><p>宿舍是可选 LLM 叙事的主要入口。生成内容只负责表现，不会修改金币、装备、生命或远征结果。</p><label>交谈对象<select value={heroId} onChange={(event) => setHeroId(event.target.value)}>{recruited.map((item) => <option value={item.id} key={item.id}>{item.name} · {heroClassNames[item.heroClass]}</option>)}</select></label><button className="primary" disabled={loading} onClick={talk}>{loading ? '正在组织语言…' : narrativeService.available && state.settings.llmEnabled ? '开始交谈' : '查看本地对白'}</button></div><div className="quarters-scene"><div className="speaker">{hero?.name ?? '无人'}</div><blockquote>“{line}”</blockquote><small>{narrativeService.available ? '已检测到宿主 LLM' : '当前使用离线对白库'}</small></div></section>;
}

function MiniMap({ currentNode }: { currentNode: number }) {
  return <aside className="mini-map" aria-label="遗迹场景地图"><div className="map-heading"><strong>边境遗迹</strong><small>场景地图</small></div><div className="map-path">{expeditionNodes.map((node, index) => <div key={node.title} className={`map-node ${index === currentNode ? 'current' : index < currentNode ? 'passed' : 'unknown'}`} title={node.title}><i>{index + 1}</i><span>{index <= currentNode ? node.title : '未知'}</span></div>)}</div></aside>;
}

function Expedition({ state, dispatch }: { state: GameState; dispatch: React.Dispatch<GameAction> }) {
  const [attackRequest, setAttackRequest] = useState<{ heroId: string; nonce: number }>();
  const run = state.expedition;
  if (!run) return <section className="empty-state"><div><h2>尚未开始远征</h2><p>请先在酒馆选择队员并完成整备。</p><button className="primary" onClick={() => dispatch({ type: 'NAVIGATE', page: 'tavern' })}>返回酒馆</button></div></section>;
  const party = run.formation.map((id) => state.roster.find((hero) => hero.id === id)!).filter(Boolean);
  const node = expeditionNodes[run.nodeIndex];
  const commitAttack = (heroId: string) => dispatch({ type: 'ATTACK', heroId });
  const requestAttack = (heroId: string) => setAttackRequest((current) => ({ heroId, nonce: (current?.nonce ?? 0) + 1 }));
  return <section className="page expedition-page">
    <div className="run-header"><div><p className="eyebrow">远征 · 节点 {run.nodeIndex + 1}/{expeditionNodes.length}</p><h2>{node.title}</h2><p>{node.description}</p></div><div className="supplies"><span>绷带 × {run.supplies.bandage}</span><span>镇定剂 × {run.supplies.sedative}</span><button onClick={() => dispatch({ type: 'RETREAT' })}>撤退</button></div></div>
    <MiniMap currentNode={run.nodeIndex} />
    <Suspense fallback={<div className="phaser-loading">正在展开遗迹场景…</div>}><BattleCanvas key={`${run.nodeIndex}-${run.enemy?.id ?? 'rest'}`} party={party} enemy={run.enemy} nodeIndex={run.nodeIndex} attackRequest={attackRequest} counterTargetId={run.enemy ? party.find((hero, index) => hero.hp > 0 && enemyCanAttack(run.enemy!, index))?.id : undefined} canHeroAttack={(hero, index) => !!run.enemy && canAttack(hero, run.enemy, index)} onAttack={commitAttack} /></Suspense>
    <div className="battle-hud">
      <div className="party-hud">{party.map((hero, index) => <article className={`hud-unit ${hero.hp <= 0 ? 'down' : ''}`} key={hero.id}><div className="hud-heading"><strong>{hero.name}</strong><small>{heroClassNames[hero.heroClass]} · 距离 {index + 1}</small></div><div className="bar"><i style={{ width: `${hero.hp / hero.maxHp * 100}%` }} /></div><div className="hud-values"><span>生命 {hero.hp}/{hero.maxHp}</span>{state.settings.moraleEnabled && <span>士气 {hero.morale}/100</span>}</div><div className="hud-actions"><button className="attack-button" disabled={!run.enemy || hero.hp <= 0} onClick={() => requestAttack(hero.id)}>攻击</button><button onClick={() => dispatch({ type: 'USE_BANDAGE', heroId: hero.id })}>绷带</button><button onClick={() => dispatch({ type: 'USE_SEDATIVE', heroId: hero.id })}>镇定</button>{index < party.length - 1 && <button onClick={() => dispatch({ type: 'SWAP', index })}>换位</button>}</div></article>)}</div>
      {run.enemy && <article className="enemy-hud"><div className="hud-heading"><strong>{run.enemy.name}</strong><small>攻击 {run.enemy.damage} · 范围 {run.enemy.attackMinRange}–{run.enemy.attackMaxRange}</small></div><div className="bar enemy-bar"><i style={{ width: `${run.enemy.hp / run.enemy.maxHp * 100}%` }} /></div><span>生命 {run.enemy.hp}/{run.enemy.maxHp}</span></article>}
    </div>
    <div className="run-footer"><div><strong>最近记录</strong><p>{state.log[0]}</p></div>{(!run.enemy || run.enemy.hp === 0) && <button className="primary" onClick={() => dispatch({ type: 'ADVANCE' })}>{run.nodeIndex === expeditionNodes.length - 1 ? '完成远征' : '前往下一节点'}</button>}</div>
  </section>;
}

function Settings({ state, dispatch }: { state: GameState; dispatch: React.Dispatch<GameAction> }) {
  return <section className="settings-page"><p className="eyebrow">设置 · 游戏规则</p><h2>按你想要的节奏游玩。</h2><div className="setting-card"><div><strong>士气系统</strong><p>开启后，受击会增加士气压力；达到 50 时进入“动摇”，攻击降低 2 点。</p></div><button onClick={() => dispatch({ type: 'TOGGLE_MORALE' })}>{state.settings.moraleEnabled ? '已开启' : '已关闭'}</button></div><div className="setting-card"><div><strong>LLM 叙事增强</strong><p>只影响宿舍对白等表现内容。关闭或不可用时自动使用本地文案。</p></div><button onClick={() => dispatch({ type: 'TOGGLE_LLM' })}>{state.settings.llmEnabled ? '已开启' : '已关闭'}</button></div><div className="setting-card danger"><div><strong>重置本地存档</strong><p>清除招募、装备升级与设置，恢复初始状态。</p></div><button onClick={() => { clearGame(); dispatch({ type: 'RESET' }); }}>重置</button></div></section>;
}

export function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => loadGame() ?? createInitialGame());
  useEffect(() => saveGame(state), [state]);
  useEffect(() => warmExpeditionResources(), []);
  const title = useMemo(() => pages.find((page) => page.id === state.page)?.label, [state.page]);
  return <main className="app-shell"><header className="topbar"><div><p className="eyebrow">边境远征队 · 第一版</p><h1>远征余响</h1></div><div className="resource"><small>{title}</small><strong>◆ {state.gold} 金币</strong></div></header><nav className="main-nav">{pages.map((page) => <button key={page.id} className={state.page === page.id ? 'selected' : ''} onClick={() => dispatch({ type: 'NAVIGATE', page: page.id })}>{page.label}</button>)}</nav>{state.page === 'tavern' && <Tavern state={state} dispatch={dispatch} />}{state.page === 'quarters' && <Quarters state={state} />}{state.page === 'expedition' && <Expedition state={state} dispatch={dispatch} />}{state.page === 'settings' && <Settings state={state} dispatch={dispatch} />}<aside className="history"><strong>旅店记录</strong>{state.log.slice(0, 3).map((item, index) => <p key={`${item}-${index}`}>{item}</p>)}</aside></main>;
}

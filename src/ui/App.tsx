import { lazy, Suspense, useEffect, useReducer, useState } from 'react';
import { expeditionNodes, heroClassDescriptions, heroClassNames, missions } from '../content/gameContent';
import { canAttack, createInitialGame, enemyCanAttack, gameReducer } from '../domain/gameEngine';
import type { GameAction, GameState, Hero } from '../domain/model';
import { narrativeService } from '../infrastructure/llm';
import { warmExpeditionResources } from '../infrastructure/expeditionPreloader';
import { clearGame, loadGame, saveGame } from '../infrastructure/storage';

const BattleCanvas = lazy(() => import('./BattleCanvas').then((module) => ({ default: module.BattleCanvas })));

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

function Town({ dispatch }: { dispatch: React.Dispatch<GameAction> }) {
  return <section className="page town-page">
    <div className="town-map">
      <img src="/assets/world/town-hub-v1.png" alt="夕阳下的冒险者城镇，包含酒馆、广场、宿舍和城门" />
      <div className="town-map-shade" />
      <button className="map-hotspot hotspot-tavern" onClick={() => dispatch({ type: 'NAVIGATE', page: 'tavern' })}><strong>旅途酒馆</strong><span>招募 · 任务 · 补给</span></button>
      <button className="map-hotspot hotspot-plaza" aria-label="中央广场，当前所在位置"><strong>中央广场</strong><span>城镇据点</span></button>
      <button className="map-hotspot hotspot-quarters" onClick={() => dispatch({ type: 'NAVIGATE', page: 'quarters' })}><strong>旅人宿舍</strong><span>休息 · 交谈</span></button>
      <button className="map-hotspot hotspot-gate" onClick={() => dispatch({ type: 'START_EXPEDITION' })}><strong>东侧城门</strong><span>开始远征</span></button>
    </div>
  </section>;
}

function Tavern({ state, dispatch }: { state: GameState; dispatch: React.Dispatch<GameAction> }) {
  const selectedMission = missions.find((mission) => mission.id === state.selectedMissionId) ?? missions[0];
  return <section className="page tavern-page tavern-scene">
    <img className="tavern-background" src="/assets/world/tavern-hall-v1.png" alt="黄昏中的冒险者酒馆和任务板" />
    <aside className="tavern-roster-panel"><header><p className="eyebrow">酒馆 · 队伍整备</p><strong>冒险者名册</strong><span>当前队伍：{state.selectedHeroIds.map((id) => state.roster.find((hero) => hero.id === id)?.name).join('、') || '尚未选择'}</span></header><div className="roster">{state.roster.map((hero) => <HeroCard key={hero.id} hero={hero} selected={state.selectedHeroIds.includes(hero.id)} dispatch={dispatch} />)}</div></aside>
    <aside className="mission-board-panel"><header><p className="eyebrow">公会任务板</p><strong>可接受任务</strong><span>任务数据来自内容层，可由本地内容或后续服务动态替换。</span></header><div className="mission-list">{missions.map((mission) => <button key={mission.id} className={`mission-card ${selectedMission.id === mission.id ? 'selected' : ''}`} onClick={() => dispatch({ type: 'ACCEPT_MISSION', missionId: mission.id })}><div><strong>{mission.title}</strong><span>{'◆'.repeat(mission.difficulty)}{'◇'.repeat(3 - mission.difficulty)}</span></div><p>{mission.summary}</p><small>报酬 {mission.reward} 金币 · 三段远征</small></button>)}</div><footer><div><small>已接受</small><strong>{selectedMission.title}</strong></div><button className="primary" onClick={() => dispatch({ type: 'START_EXPEDITION' })}>整队出发</button></footer></aside>
  </section>;
}

function Quarters({ state }: { state: GameState }) {
  const recruited = state.roster.filter((hero) => hero.recruited);
  const [heroId, setHeroId] = useState(recruited[0]?.id ?? ''); const [roomHeroId, setRoomHeroId] = useState<string | null>(null); const [line, setLine] = useState('今晚的宿舍很安静。'); const [loading, setLoading] = useState(false);
  const hero = recruited.find((item) => item.id === heroId) ?? recruited[0];
  const talk = async () => { if (!hero) return; setLoading(true); setLine(await narrativeService.campLine(hero, state)); setLoading(false); };
  const enterRoom = (id: string) => { setHeroId(id); setRoomHeroId(id); setLine('今晚的宿舍很安静。'); };
  if (!roomHeroId) return <section className="page quarters-page quarters-hall">
    <img className="quarters-background" src="/assets/world/quarters-hall-v1.png" alt="冒险者宿舍公共走廊" />
    <div className="hall-heading"><p className="eyebrow">旅人宿舍 · 公共区域</p><strong>选择要拜访的房间</strong><span>每位队员拥有独立的生活空间。</span></div>
    <div className="room-directory">{recruited.map((item, index) => <button className={`room-entry room-entry-${index}`} key={item.id} onClick={() => enterRoom(item.id)}><strong>{item.name}的房间</strong><span>{heroClassNames[item.heroClass]} · 敲门进入</span></button>)}</div>
  </section>;
  return <section className="page quarters-page">
    <img className="quarters-background" src="/assets/world/quarters-dorm-v1.png" alt="暮色中的冒险者宿舍" />
    <div className="quarters-topbar"><div><p className="eyebrow">{hero?.name}的房间 · 日常交谈</p><strong>远征后的安静时间</strong></div><button className="leave-room" onClick={() => setRoomHeroId(null)}>返回公共区域</button></div>
    <div className="quarters-chat" aria-label="宿舍聊天窗口">
      <header><div><strong>{hero?.name ?? '无人'}</strong><span>{hero ? heroClassNames[hero.heroClass] : '未选择队员'}</span></div><small>{narrativeService.available && state.settings.llmEnabled ? 'LLM 交谈已连接' : '离线对白'}</small></header>
      <div className="chat-thread"><div className="chat-message companion">“{line}”</div></div>
      <footer><span>聊天不会直接修改战斗数值。</span><button disabled={loading || !hero} onClick={talk}>{loading ? '正在回复…' : '继续交谈'}</button></footer>
    </div>
  </section>;
}

function MiniMap({ currentNode }: { currentNode: number }) {
  return <aside className="mini-map" aria-label="遗迹场景地图"><div className="map-heading"><strong>边境遗迹</strong><small>场景地图</small></div><div className="map-path">{expeditionNodes.map((node, index) => <div key={node.title} className={`map-node ${index === currentNode ? 'current' : index < currentNode ? 'passed' : 'unknown'}`} title={node.title}><i>{index + 1}</i><span>{index <= currentNode ? node.title : '未知'}</span></div>)}</div></aside>;
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
  return <section className="page expedition-page">
    <div className="run-header"><div><p className="eyebrow">远征 · 节点 {run.nodeIndex + 1}/{expeditionNodes.length}</p><h2>{node.title}</h2><p>{node.description}</p></div><div className="supplies"><span>绷带 × {run.supplies.bandage}</span><span>镇定剂 × {run.supplies.sedative}</span><button onClick={() => dispatch({ type: 'RETREAT' })}>撤退</button></div></div>
    <MiniMap currentNode={run.nodeIndex} />
    <Suspense fallback={<div className="phaser-loading">正在展开遗迹场景…</div>}><BattleCanvas key={`${run.nodeIndex}-${run.enemies.map((enemy) => enemy.id).join('-') || 'rest'}`} party={party} enemies={run.enemies} targetEnemyId={selectedEnemy?.id} onSelectEnemy={setSelectedEnemyId} nodeIndex={run.nodeIndex} attackRequest={attackRequest} counterTargetId={selectedEnemy ? party.find((hero, index) => hero.hp > 0 && enemyCanAttack(selectedEnemy, index))?.id : undefined} canHeroAttack={(hero, index, enemy) => canAttack(hero, enemy, index)} onAttack={commitAttack} /></Suspense>
    <div className="battle-hud">
      <div className="party-hud">{party.map((hero, index) => <article className={`hud-unit ${hero.hp <= 0 ? 'down' : ''}`} key={hero.id}><div className="hud-heading"><strong>{index === 0 ? '前排 · ' : ''}{hero.name}</strong><small>{heroClassNames[hero.heroClass]} · 距离 {index + 1}</small></div><div className={`bar hp-bar ${hero.hp / hero.maxHp <= .3 ? 'critical' : ''}`}><i style={{ width: `${hero.hp / hero.maxHp * 100}%` }} /><span>{hero.hp}/{hero.maxHp}</span></div><div className="hud-values">{state.settings.moraleEnabled && <span>士气 {hero.morale}/100</span>}</div><div className="hud-actions"><button className="attack-button" disabled={!selectedEnemy || hero.hp <= 0} onClick={() => requestAttack(hero.id)}>攻击</button><button onClick={() => dispatch({ type: 'USE_BANDAGE', heroId: hero.id })}>绷带</button><button onClick={() => dispatch({ type: 'USE_SEDATIVE', heroId: hero.id })}>镇定</button>{index < party.length - 1 && <button onClick={() => dispatch({ type: 'SWAP', index })}>换位</button>}</div></article>)}</div>
      <div className="enemy-party-hud">{run.enemies.map((enemy, index) => <button type="button" key={enemy.id} disabled={enemy.hp <= 0} className={`enemy-hud ${selectedEnemy?.id === enemy.id ? 'targeted' : ''}`} onClick={() => setSelectedEnemyId(enemy.id)}><div className="hud-heading"><strong>{index === 0 ? '前排 · ' : ''}{enemy.name}</strong><small>范围 {enemy.attackMinRange}–{enemy.attackMaxRange}</small></div><div className={`bar enemy-bar ${enemy.hp / enemy.maxHp <= .3 ? 'critical' : ''}`}><i style={{ width: `${enemy.hp / enemy.maxHp * 100}%` }} /><span>{enemy.hp}/{enemy.maxHp}</span></div></button>)}</div>
    </div>
    <div className="run-footer"><div><strong>最近记录</strong><p>{state.log[0]}</p></div>{aliveEnemies.length === 0 && <button className="primary" onClick={() => dispatch({ type: 'ADVANCE' })}>{run.nodeIndex === expeditionNodes.length - 1 ? '完成远征' : '前往下一节点'}</button>}</div>
  </section>;
}

function Settings({ state, dispatch }: { state: GameState; dispatch: React.Dispatch<GameAction> }) {
  return <section className="settings-page"><p className="eyebrow">设置 · 游戏规则</p><h2>按你想要的节奏游玩。</h2><div className="setting-card"><div><strong>士气系统</strong><p>开启后，受击会增加士气压力；达到 50 时进入“动摇”，攻击降低 2 点。</p></div><button onClick={() => dispatch({ type: 'TOGGLE_MORALE' })}>{state.settings.moraleEnabled ? '已开启' : '已关闭'}</button></div><div className="setting-card"><div><strong>LLM 叙事增强</strong><p>只影响宿舍对白等表现内容。关闭或不可用时自动使用本地文案。</p></div><button onClick={() => dispatch({ type: 'TOGGLE_LLM' })}>{state.settings.llmEnabled ? '已开启' : '已关闭'}</button></div><div className="setting-card danger"><div><strong>重置本地存档</strong><p>清除招募、装备升级与设置，恢复初始状态。</p></div><button onClick={() => { clearGame(); dispatch({ type: 'RESET' }); }}>重置</button></div></section>;
}

export function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => loadGame() ?? createInitialGame());
  useEffect(() => saveGame(state), [state]);
  useEffect(() => warmExpeditionResources(), []);
  return <main className="app-shell"><header className="topbar"><button className="brand-home" onClick={() => dispatch({ type: 'NAVIGATE', page: 'town' })}><span className="eyebrow">边境远征队 · 第一版</span><strong>远征余响</strong></button><div className="topbar-actions"><div className="resource"><small>{state.page === 'town' ? '城镇据点' : '◆ 当前地点'}</small><strong>◆ {state.gold} 金币</strong></div>{state.page !== 'town' && state.page !== 'expedition' && <button className="return-town" onClick={() => dispatch({ type: 'NAVIGATE', page: 'town' })}>返回城镇</button>}<button className={`settings-entry ${state.page === 'settings' ? 'selected' : ''}`} aria-label="设置" title="设置" onClick={() => dispatch({ type: 'NAVIGATE', page: 'settings' })}>⚙</button></div></header><div className="game-viewport">{state.page === 'town' && <Town dispatch={dispatch} />}{state.page === 'tavern' && <Tavern state={state} dispatch={dispatch} />}{state.page === 'quarters' && <Quarters state={state} />}{state.page === 'expedition' && <Expedition state={state} dispatch={dispatch} />}{state.page === 'settings' && <Settings state={state} dispatch={dispatch} />}</div></main>;
}

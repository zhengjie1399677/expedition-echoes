import { useState, useMemo, useEffect, Suspense, lazy } from 'react';
import type { GameState, GameAction, Hero, Enemy } from '../../domain/model';
import { nodesForMission, regionNameForMission, dayLabel, skillDefinitions, itemDefinitions, itemById } from '../../content/gameContent';
import { canAttack, equipmentBonuses, attackDamage } from '../../domain/gameEngine';
import { skillUseKey } from '../../domain/combat';
import { narrativeService, playerPlaceholder } from '../../infrastructure/llm';
import { targetForIntent } from '../../domain/intents';
import { MiniMap } from '../components/MiniMap';
import { BattleCanvasBoundary } from '../components/BattleCanvasBoundary';

const BattleCanvas = lazy(() => import('../BattleCanvas').then((module) => ({ default: module.BattleCanvas })));

export interface ExpeditionProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

const skillDetails: Record<string, { name: string; hint: string }> = {
  lan: { name: '守望号令', hint: '全队压力 -8' },
  wu: { name: '贯风箭', hint: '无视距离，伤害 +3' },
  xingluo: { name: '星辉爆裂', hint: '全体敌人各受 6 伤害' },
  cheng: { name: '治愈之光', hint: '恢复虚弱队友 12 点生命' },
  yan: { name: '钢铁意志', hint: '自身压力 -6' },
};

export function Expedition({ state, dispatch }: ExpeditionProps) {
  const [attackRequest, setAttackRequest] = useState<{ heroId: string; nonce: number }>();
  const [feedback, setFeedback] = useState<{
    kind: 'attack' | 'skill' | 'bandage' | 'sedative' | 'fire-bomb' | 'shield-elixir' | 'enemy-hit';
    heroId: string;
    enemyId?: string;
    nonce: number;
    subKind?: 'damage' | 'buff' | 'heal';
    skillName?: string;
  }>();
  const [selectedEnemyId, setSelectedEnemyId] = useState<string>();
  const [advisorId, setAdvisorId] = useState('');
  const [consultation, setConsultation] = useState('');
  const [consulting, setConsulting] = useState(false);
  const [activeHeroId, setActiveHeroId] = useState<string>();
  const [chatOpen, setChatOpen] = useState(false);
  const [autoBattle, setAutoBattle] = useState(false);
  const [backpackOpen, setBackpackOpen] = useState(false);

  const supplyItems = [
    { key: 'bandage', label: '绷带', icon: '/assets/ui/items/bandage.png', hint: '解除流血并恢复生命' },
    { key: 'sedative', label: '镇定剂', icon: '/assets/ui/items/sedative.png', hint: '大幅降低压力值' },
    { key: 'fireBomb', label: '火焰瓶', icon: '/assets/ui/items/fire-bomb.png', hint: '对前排敌人造成灼烧伤害' },
    { key: 'shieldElixir', label: '铁壁药丸', icon: '/assets/ui/items/shield-elixir.png', hint: '提供临时护盾增加防护' },
  ] as const;

  const useSkill = (heroId: string, skillId: string) => {
    const def = skillDefinitions[skillId];
    const effectType = def?.effect.type;
    // 技能效果子类：buff（压力恢复）、heal（单体治疗）、damage（单/群体伤害）。
    // 仅 damage 形技能需要 enemyId；buff/heal 形不传 enemyId，避免误把法术打到当前选中的敌人身上。
    const subKind: 'damage' | 'buff' | 'heal' =
      effectType === 'pressure_recovery' ? 'buff'
      : effectType === 'heal_single' ? 'heal'
      : 'damage';
    const enemyId = subKind === 'damage' ? selectedEnemy?.id : undefined;
    dispatch({ type: 'USE_SKILL', heroId, enemyId, skillId });
    setFeedback({ kind: 'skill', heroId, subKind, skillName: def?.name ?? '技能', enemyId, nonce: Date.now() });
  };
  const useDefend = (heroId: string) => {
    dispatch({ type: 'DEFEND', heroId });
  };
  const useBandage = (heroId: string) => {
    dispatch({ type: 'USE_BANDAGE', heroId });
    setFeedback({ kind: 'bandage', heroId, nonce: Date.now() });
  };
  const useSedative = (heroId: string) => {
    dispatch({ type: 'USE_SEDATIVE', heroId });
    setFeedback({ kind: 'sedative', heroId, nonce: Date.now() });
  };
  const useFireBomb = (heroId: string) => {
    dispatch({ type: 'USE_FIRE_BOMB', heroId, enemyId: selectedEnemy?.id });
    setFeedback({ kind: 'fire-bomb', heroId, enemyId: selectedEnemy?.id, nonce: Date.now() });
  };
  const useShieldElixir = (heroId: string) => {
    dispatch({ type: 'USE_SHIELD_ELIXIR', heroId });
    setFeedback({ kind: 'shield-elixir', heroId, nonce: Date.now() });
  };

  const run = state.expedition;

  const party = useMemo<Hero[]>(() => {
    return run ? run.formation.map((id) => state.roster.find((hero) => hero.id === id)).filter((hero): hero is Hero => Boolean(hero)) : [];
  }, [run, state.roster]);

  const activeHero = party.find((hero) => hero.id === activeHeroId) ?? party[0];

  const aliveEnemies = useMemo(() => {
    return run ? run.enemies.filter((enemy) => enemy.hp > 0) : [];
  }, [run]);

  if (!run) {
    return (
      <section className="empty-state">
        <div>
          <h2>尚未开始远征</h2>
          <p>请先在酒馆选择队员并完成整备。</p>
          <button className="primary" onClick={() => dispatch({ type: 'NAVIGATE', page: 'tavern' })}>返回酒馆</button>
        </div>
      </section>
    );
  }

  const selectedEnemy = aliveEnemies.find((enemy) => enemy.id === selectedEnemyId) ?? aliveEnemies[0];
  const nodes = nodesForMission(run.missionId);
  const node = nodes[run.nodeIndex];

  // 自动代理：根据当前战况为下一名可行动队员挑选最优动作。
  // 决策策略（与手动操作允许的合法动作完全一致）：
  //   1) 优先让可攻击的队员普攻血量最低的存活敌人；
  //   2) 若该队员有尚未使用的技能，则改用技能（单/群/治疗/减压按目标需求分发）；
  //   3) 若队员血量危急且尚未防御，则进入防御姿态；
  //   4) 没有任何可行动作时返回 null，外部据此停止自动循环。
  const decideAutoAction = (): GameAction | null => {
    const currentRun = state.expedition;
    if (!currentRun) return null;
    const liveEnemies = currentRun.enemies.filter((enemy) => enemy.hp > 0);
    const liveHeroes = currentRun.formation
      .map((id) => state.roster.find((hero) => hero.id === id))
      .filter((hero): hero is Hero => hero != null && hero.hp > 0);
    if (liveEnemies.length === 0 || liveHeroes.length === 0) return null;

    for (const hero of liveHeroes) {
      const heroIndex = currentRun.formation.indexOf(hero.id);

      // 技能：优先使用首个尚未使用、且对当前战况有意义的技能。
      const unusedSkill = hero.skills.find((skillId) => !currentRun.skillUses[skillUseKey(hero.id, skillId)]);
      if (unusedSkill) {
        const def = skillDefinitions[unusedSkill];
        if (def) {
          if (def.effect.type === 'pressure_recovery') {
            // 队伍平均压力偏高时才减压，避免浪费
            const avgPressure = liveHeroes.reduce((sum, h) => sum + h.pressure, 0) / liveHeroes.length;
            if (avgPressure >= 25) {
              return { type: 'USE_SKILL', heroId: hero.id, skillId: unusedSkill };
            }
          } else if (def.effect.type === 'heal_single') {
            const wounded = liveHeroes.some((h) => h.hp / h.maxHp < 0.7);
            if (wounded) {
              return { type: 'USE_SKILL', heroId: hero.id, skillId: unusedSkill };
            }
          } else {
            // 单/群体伤害技能：选择血量最低的存活敌人为目标
            const targetId = liveEnemies.reduce((lowest, enemy) => (enemy.hp < lowest.hp ? enemy : lowest), liveEnemies[0]).id;
            return { type: 'USE_SKILL', heroId: hero.id, enemyId: targetId, skillId: unusedSkill };
          }
        }
      }

      // 普攻：可攻击时打血量最低者
      const attackable = liveEnemies
        .filter((enemy) => canAttack(hero, enemy, heroIndex))
        .sort((a, b) => a.hp - b.hp);
      if (attackable.length > 0) {
        return { type: 'ATTACK', heroId: hero.id, enemyId: attackable[0].id };
      }

      // 危急防御：HP 低于 35% 且本场未防御
      if (hero.hp / hero.maxHp < 0.35 && !currentRun.defendBuffs[hero.id]) {
        return { type: 'DEFEND', heroId: hero.id };
      }
    }
    return null;
  };

  // 自动循环：开启后定时推进，遇到非法动作或战斗结束时自动停止。
  // 因为 effect 依赖 state.expedition，每次战斗状态变化都会重跑并重建 interval，
  // 闭包内拿到的 `state` 始终是最新一轮的快照，无需手动 ref 维护最新值。
  useEffect(() => {
    if (!autoBattle) return;
    const timer = window.setInterval(() => {
      const action = decideAutoAction();
      if (!action) {
        setAutoBattle(false);
        return;
      }
      dispatch(action);
    }, 700);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBattle, state.expedition]);

  // 每个存活敌人本轮实际会攻击的英雄（与 domain 的 resolveEnemyAction 完全对齐），
  // 仅用于战斗动画，不计算数值。
  const enemyCounters = useMemo(() => {
    const map: Record<string, string> = {};
    if (!run) return map;
    for (const enemy of run.enemies) {
      if (enemy.hp <= 0) continue;
      const intent = run.enemyIntents[enemy.id];
      const target = intent ? targetForIntent(party, intent, enemy) : undefined;
      if (target) map[enemy.id] = target.id;
    }
    return map;
  }, [run, party]);

  const commitAttack = (heroId: string, enemyId: string) => dispatch({ type: 'ATTACK', heroId, enemyId });
  const requestAttack = (heroId: string) => setAttackRequest((current) => ({ heroId, nonce: (current?.nonce ?? 0) + 1 }));

  const advisor = party.find((hero) => hero.id === advisorId) ?? party[0];

  const askAdvisor = async () => {
    if (!advisor || consulting) return;
    const enemyLine = aliveEnemies.map((enemy) => `${enemy.name} ${enemy.hp}/${enemy.maxHp}，攻击范围 ${enemy.attackMinRange}-${enemy.attackMaxRange}`).join('；');
    setConsulting(true);
    const result = await narrativeService.chatWithStatus(
      advisor,
      state,
      [],
      `队长想听你的战术建议。当前地点：${node.title}。敌方：${enemyLine}。请用两句以内说出最重要的风险和一个可执行建议。`
    );
    setConsultation(result.text);
    setConsulting(false);
  };

  return (
    <section className="page expedition-screen">
      <div className="expedition-card">
        <header className="expedition-header">
          <div className="expedition-brand">远征</div>
          <div className="expedition-header-divider" />
          <div className="expedition-header-region">{regionNameForMission(run.missionId)}</div>
          <div className="expedition-header-divider" />
          <div className="expedition-header-location">{node.title}</div>
          <div className="expedition-header-meta">
            <span>{dayLabel(state.day)}</span>
            <span>金币 {state.gold}</span>
            <span>节点 {run.nodeIndex + 1}/{nodes.length}</span>
          </div>
          <button className="expedition-retreat" onClick={() => dispatch({ type: 'RETREAT' })}>撤退</button>
        </header>

        <div className="expedition-stage">
          <Suspense fallback={<div className="phaser-loading">正在展开远征场景…</div>}>
            <BattleCanvasBoundary>
              <BattleCanvas
                key={`${run.missionId}-${run.nodeIndex}-${run.enemies.map((enemy) => enemy.id).join('-') || 'rest'}`}
                party={party}
                enemies={run.enemies}
                targetEnemyId={selectedEnemy?.id}
                onSelectEnemy={setSelectedEnemyId}
                nodeIndex={run.nodeIndex}
                backgroundPath={node.background}
                enemyIntents={run.enemyIntents}
                enemyCharge={run.enemyCharge}
                counters={enemyCounters}
                attackRequest={attackRequest}
                feedbackRequest={feedback}
                canHeroAttack={(hero, index, enemy) => canAttack(hero, enemy, index)}
                onAttack={commitAttack}
              />
            </BattleCanvasBoundary>
          </Suspense>
          <div className="expedition-stage-hint">点击角色发动攻击 · 点击敌人选择目标 · 金色轮廓表示可攻击</div>
        </div>

        <aside className="expedition-sidebar">
          <MiniMap currentNode={run.nodeIndex} nodes={nodes} regionName={regionNameForMission(run.missionId)} />
          <div className="expedition-nodeinfo">
            <span>当前节点</span>
            <strong>{node.kind === 'combat' ? `普通战斗 · 战力 ${12 + (aliveEnemies.length * 3)}` : `探索事件 · ${node.title}`}</strong>
          </div>
          <div className="expedition-tools">
            <span className="expedition-tools-label">补给</span>
            <div className="tools-grid">
              <span className="tool-item">绷带 × {run.supplies.bandage}</span>
              <span className="tool-item">镇定剂 × {run.supplies.sedative}</span>
              <span className="tool-item">火焰瓶 × {run.supplies.fireBomb}</span>
              <span className="tool-item">铁壁药丸 × {run.supplies.shieldElixir}</span>
            </div>
          </div>
        </aside>

        <div className="exp-hud">
          <div className="exp-hud-col hud-party">
            <div className="exp-hud-label">◆ 队伍</div>
            <div className="party-cards-container">
              {party.map((hero, index) => {
                const bonuses = equipmentBonuses(hero);
                const expectedDamage = attackDamage(hero, state.settings.pressureEnabled, state.hunger, index, party);
                const active = activeHero?.id === hero.id;
                return (
                  <button
                    key={hero.id}
                    className={`party-card ${active ? 'active' : ''} ${hero.hp <= 0 ? 'down' : ''}`}
                    onClick={() => setActiveHeroId(hero.id)}
                    title={`${hero.name} · HP ${hero.hp}/${hero.maxHp} · 压力 ${hero.pressure}/100`}
                  >
                    <div className="party-card-left">
                      <span className="party-avatar" style={{ background: hero.heroClass === 'vanguard' ? '#d88a5a' : hero.heroClass === 'ranger' ? '#7aa58c' : '#8f7ad8' }}>{hero.name[0]}</span>
                    </div>
                    <div className="party-card-right">
                      <div className="party-card-row">
                        <strong className="party-card-name">{hero.name}</strong>
                        <span className="party-card-level">Lv.{hero.level || 1}</span>
                      </div>
                      <div className="party-card-row hp-row">
                        <span className="party-class-icon">{hero.heroClass === 'vanguard' ? '🛡️' : hero.heroClass === 'ranger' ? '🏹' : hero.heroClass === 'mage' ? '🔮' : '💚'}</span>
                        <div className="hp-bar-container">
                          <div className="hp-bar-text">HP {hero.hp}/{hero.maxHp}</div>
                          <div className="party-card-hp-bar">
                            <div className="hp-bar-fill" style={{ width: `${Math.max(0, Math.min(100, (hero.hp / hero.maxHp) * 100))}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="exp-hud-divider" />

          <div className="exp-hud-col exp-hud-skills">
            <div className="exp-hud-label-skills">
              <span>技能选择：{activeHero?.name}</span>
              <div className="skills-diamonds">
                {(activeHero?.skills ?? []).slice(0, 2).map((skillId, index) => (
                  <span key={skillId} className={`diamond ${index === 0 ? 'active' : ''}`}>◆</span>
                ))}
              </div>
            </div>
            <div className="skill-deck">
              <div className="skill-deck-left">
                {activeHero ? (
                  <>
                    {activeHero.skills.slice(0, 2).map((skillId) => {
                      const def = skillDefinitions[skillId];
                      const used = run.skillUses[`${activeHero.id}:${skillId}`];
                      return (
                        <button
                          key={skillId}
                          className={`skill-square-btn ${used ? 'used' : 'active-skill'}`}
                          disabled={activeHero.hp <= 0 || used || !def}
                          onClick={() => useSkill(activeHero.id, skillId)}
                          title={def ? `${def.name} · ${def.description}` : '尚未掌握技能'}
                        >
                          <div className="skill-icon">✦</div>
                          <span className="skill-name-text">{def?.name ?? '—'}</span>
                        </button>
                      );
                    })}
                    {activeHero.skills.length < 2 && (
                      <button className="skill-square-btn locked" disabled>
                        <div className="skill-icon">🔒</div>
                        <span className="skill-name-text">未解锁</span>
                      </button>
                    )}
                    <button
                      className={`skill-square-btn ${run.defendBuffs[activeHero.id] ? 'used' : 'defend-skill'}`}
                      disabled={activeHero.hp <= 0 || run.defendBuffs[activeHero.id]}
                      onClick={() => useDefend(activeHero.id)}
                      title="进入防御姿态，本场战斗受到的伤害降低。"
                    >
                      <div className="skill-icon">🛡️</div>
                      <span className="skill-name-text">防御</span>
                    </button>
                  </>
                ) : (
                  <div className="no-hero-skills">未选定英雄</div>
                )}
              </div>
              <div className="skill-deck-right">
                <button
                  className="skill-action-square attack-btn"
                  disabled={!selectedEnemy || activeHero?.hp <= 0 || !canAttack(activeHero, selectedEnemy, party.indexOf(activeHero))}
                  onClick={() => {
                    if (activeHero && selectedEnemy) requestAttack(activeHero.id);
                  }}
                  title="普通攻击"
                >
                  <div className="action-icon">⚔</div>
                  <span className="action-label">普攻</span>
                </button>
                <button
                  className={`skill-action-square auto-btn ${autoBattle ? 'active' : ''}`}
                  disabled={aliveEnemies.length === 0}
                  onClick={() => setAutoBattle((on) => !on)}
                  title={autoBattle ? '停止自动代理' : '自动代理：由系统替你推进战斗'}
                >
                  <div className="action-icon">🔄</div>
                  <span className="action-label">{autoBattle ? '停止' : '自动'}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="exp-hud-divider" />

          <div className="exp-hud-col exp-hud-items">
            <div className="exp-hud-label">快捷道具</div>
            <div className="item-mini-row">
              {supplyItems.map((item) => {
                const count = run.supplies[item.key];
                const disabled = count < 1 || (activeHero && activeHero.hp <= 0);
                const onClick = () => {
                  if (!activeHero) return;
                  if (item.key === 'bandage') useBandage(activeHero.id);
                  else if (item.key === 'sedative') useSedative(activeHero.id);
                  else if (item.key === 'fireBomb') useFireBomb(activeHero.id);
                  else useShieldElixir(activeHero.id);
                };
                return (
                  <button
                    key={item.key}
                    className="item-square-btn"
                    disabled={disabled}
                    onClick={onClick}
                    title={`${item.label} · ${item.hint}`}
                  >
                    <img className="item-square-icon" src={item.icon} alt={item.label} />
                    {count > 0 ? (
                      <span className="item-square-badge">{count}</span>
                    ) : (
                      <span className="item-square-plus">+</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="exp-hud-divider" />

          <div className="exp-hud-col exp-hud-actions">
            <div className="exp-hud-actions-left">
              <button className={`action-icon-btn ${chatOpen ? 'active' : ''}`} onClick={() => setChatOpen((open) => !open)} title="开启队员对话">
                <span className="action-btn-icon">💬</span>
                <span className="action-btn-label">对话</span>
              </button>
              <button className={`action-icon-btn ${backpackOpen ? 'active' : ''}`} onClick={() => setBackpackOpen((open) => !open)} title="查看远征背包与装备">
                <span className="action-btn-icon">🎒</span>
                <span className="action-btn-label">背包</span>
              </button>
              <button className="action-icon-btn" onClick={() => state.log.length > 0 && alert(state.log.join('\n'))} title="查看详细战斗日志">
                <span className="action-btn-icon">📜</span>
                <span className="action-btn-label">日志</span>
              </button>
            </div>
            <div className="exp-hud-actions-right">
              <button
                className="exp-hud-main-action-btn"
                disabled={aliveEnemies.length > 0}
                onClick={() => { setFeedback(undefined); dispatch({ type: 'ADVANCE' }); }}
                title="推进"
              >
                <div className="compass-icon">🧭</div>
                <span>{run.nodeIndex === nodes.length - 1 ? '完成' : '前进'}</span>
              </button>
            </div>
          </div>

          <div className={`expedition-chat ${chatOpen ? 'open' : ''}`} aria-label="询问队员">
            <div className="chat-header">
              <strong>询问队员</strong>
              <button className="chat-close" onClick={() => setChatOpen(false)}>×</button>
            </div>
            <div className="chat-body">
              {party.filter((hero) => hero.hp > 0).map((hero) => (
                <div className="chat-line" key={hero.id}>
                  <span className="chat-avatar" style={{ background: hero.heroClass === 'vanguard' ? '#d88a5a' : hero.heroClass === 'ranger' ? '#7aa58c' : '#8f7ad8' }}>{hero.name[0]}</span>
                  <div className="chat-bubble">{`「${skillDetails[hero.id]?.hint ?? '我会听从队长的判断。'}」`}</div>
                </div>
              ))}
              <div className="chat-line chat-consult">
                <span className="chat-avatar chat-captain">队</span>
                <div className="chat-bubble chat-input-row">
                  <span className="chat-placeholder">队长想听听大家的想法…</span>
                  <button disabled={consulting || !state.settings.llmEnabled || !narrativeService.available} onClick={() => void askAdvisor()}>
                    {consulting ? '思考中…' : '征询'}
                  </button>
                </div>
                <div className="chat-bubble chat-consult-select">
                  <span className="chat-consult-name">咨询对象</span>
                  <div className="chat-consult-heroes">
                    {party.filter((hero) => hero.hp > 0).map((hero) => (
                      <button
                        key={hero.id}
                        className={advisor?.id === hero.id ? 'selected' : ''}
                        onClick={() => setAdvisorId(hero.id)}
                      >
                        {hero.name}
                      </button>
                    ))}
                  </div>
                  <span className="chat-consult-hint">
                    {state.settings.llmEnabled && narrativeService.available
                      ? '不会自动调用；由队长决定是否询问。'
                      : 'LLM 未连接；战斗仍可完全正常进行。'}
                  </span>
                </div>
                {consultation && (
                  <div className="chat-bubble chat-consult-result" role="status">
                    <span className="chat-consult-name">{advisor.name}的建议</span>
                    {consultation}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {backpackOpen && (
          <div className="backpack-overlay" role="dialog" aria-label="远征背包">
            <div className="backpack-panel">
              <div className="backpack-header">
                <strong>远征背包</strong>
                <button className="backpack-close" onClick={() => setBackpackOpen(false)}>×</button>
              </div>
              <div className="backpack-body">
                <div className="backpack-section">
                  <h4>补给品</h4>
                  <div className="backpack-grid">
                    {supplyItems.map(({ key, label, icon }) => {
                      // 远征背包展示的是本次携带的行囊（run.supplies），而非城镇库存；
                      // key 使用物品真实 id（fire-bomb / shield-elixir），与 itemDefinitions 一致。
                      const count = run.supplies[key] ?? 0;
                      return (
                        <div key={key} className={`backpack-item ${count < 1 ? 'empty' : ''}`}>
                          <span className="backpack-item-name"><img src={icon} alt="" className="backpack-item-icon" />{label}</span>
                          <span className="backpack-item-count">× {count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="backpack-section">
                  <h4>远征物资</h4>
                  <div className="backpack-grid">
                    {itemDefinitions
                      .filter((item) => item.kind === 'consumable' && (state.inventory[item.id] ?? 0) > 0)
                      .map((item) => (
                        <div key={item.id} className="backpack-item">
                          <span className="backpack-item-name">{item.name}</span>
                          <span className="backpack-item-count">× {state.inventory[item.id]}</span>
                        </div>
                      ))}
                    {itemDefinitions.filter((item) => item.kind === 'consumable' && (state.inventory[item.id] ?? 0) > 0).length === 0 && (
                      <div className="backpack-empty-note">暂无额外物资。</div>
                    )}
                  </div>
                </div>

                <div className="backpack-section">
                  <h4>装备（已持有）</h4>
                  <div className="backpack-grid">
                    {itemDefinitions
                      .filter((item) => item.kind === 'equipment' && (state.inventory[item.id] ?? 0) > 0)
                      .map((item) => {
                        const equippedCount = party.filter((hero) => Object.values(hero.equipment).includes(item.id)).length;
                        const total = state.inventory[item.id] ?? 0;
                        return (
                          <div key={item.id} className="backpack-item">
                            <span className="backpack-item-name">{item.name}</span>
                            <span className="backpack-item-meta">
                              持有 {total}{equippedCount > 0 ? ` · 装备中 ${equippedCount}` : ''}
                              {item.attack ? ` · 攻+${item.attack}` : ''}{item.defense ? ` · 防+${item.defense}` : ''}
                            </span>
                          </div>
                        );
                      })}
                    {itemDefinitions.filter((item) => item.kind === 'equipment' && (state.inventory[item.id] ?? 0) > 0).length === 0 && (
                      <div className="backpack-empty-note">暂无持有装备。</div>
                    )}
                  </div>
                </div>

                <div className="backpack-section">
                  <h4>队员当前装备</h4>
                  {party.map((hero) => (
                    <div key={hero.id} className="backpack-hero-equip">
                      <span className="backpack-hero-name">{hero.name}</span>
                      <div className="backpack-hero-slots">
                        {(['weapon', 'armor', 'accessory'] as const).map((slot) => {
                          const equippedId = hero.equipment[slot];
                          const item = equippedId ? itemById.get(equippedId) : undefined;
                          return (
                            <span key={slot} className={`backpack-slot ${item ? '' : 'empty'}`}>
                              {slot === 'weapon' ? '武器' : slot === 'armor' ? '护甲' : '饰品'}：{item?.name ?? '空'}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="backpack-scrim" onClick={() => setBackpackOpen(false)} />
          </div>
        )}

        <footer className="expedition-footer">
          {node.kind === 'event' && !run.eventResolved && node.event ? (
            <div className="expedition-event-choice">
              <div>
                <strong>{node.event.prompt}</strong>
                <p>选择会改变本次远征的收益或队伍状态。</p>
              </div>
              <div className="event-choice-actions">
                {node.event.choices.map((choice) => (
                  <button key={choice.id} className="event-choice" onClick={() => dispatch({ type: 'RESOLVE_EVENT', eventId: node.event!.id, choiceId: choice.id })}>
                    <strong>{choice.label}</strong>
                    <small>{choice.description}</small>
                    {choice.requirement && <em className="event-choice-requirement">{choice.requirement}</em>}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="expedition-log-single">
              <strong>最近记录</strong>
              <span className="log-divider"> · </span>
              <span className="log-text">{state.log[0] || '探索正在继续...'}</span>
            </div>
          )}
        </footer>
      </div>
    </section>
  );
}

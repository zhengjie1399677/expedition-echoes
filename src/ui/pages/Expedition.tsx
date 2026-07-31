import { useState, useMemo, Suspense, lazy } from 'react';
import type { GameState, GameAction, Hero, Enemy } from '../../domain/model';
import { heroClassNames, nodesForMission } from '../../content/gameContent';
import { experienceToNextLevel, pressureStage, canAttack, enemyCanAttack } from '../../domain/gameEngine';
import { narrativeService, playerPlaceholder } from '../../infrastructure/llm';
import { MiniMap } from '../components/MiniMap';

const BattleCanvas = lazy(() => import('../BattleCanvas').then((module) => ({ default: module.BattleCanvas })));

export interface ExpeditionProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

const skillDetails: Record<string, { name: string; hint: string }> = {
  lan: { name: '守望号令', hint: '全队压力 -8' },
  wu: { name: '贯风箭', hint: '无视距离，伤害 +3' },
  xingluo: { name: '星辉爆裂', hint: '全体敌人各受 6 伤害' },
};

const enemyTraitDetails: Record<NonNullable<Enemy['trait']>, { name: string; hint: string }> = {
  pack: { name: '群猎', hint: '两只以上狼存活时，狼群反击伤害提高。' },
  thorns: { name: '荆棘反震', hint: '攻击它的队员会额外积累压力。' },
  spores: { name: '毒孢侵蚀', hint: '反击会令目标额外积累压力。' },
  'rock-armor': { name: '岩甲', hint: '每次受到攻击时抵消 2 点伤害。' },
  'ancient-core': { name: '古核苏醒', hint: '生命降至一半后，反击伤害提高。' },
};

const pressureRemarks: Record<string, Partial<Record<'tense' | 'shaken' | 'critical', string>>> = {
  lan: { tense: '岚的目光一直停在出口。', shaken: '岚反复确认队形。', critical: '岚的声音比平时更低。' },
  wu: { tense: '雾的玩笑变得密了。', shaken: '雾已经数过三次退路。', critical: '雾难得安静下来。' },
  xingluo: { tense: '星罗捏紧了法杖。', shaken: '星罗的推演开始断断续续。', critical: '星罗的呼吸有些乱。' },
};

export function Expedition({ state, dispatch }: ExpeditionProps) {
  const [attackRequest, setAttackRequest] = useState<{ heroId: string; nonce: number }>();
  const [selectedEnemyId, setSelectedEnemyId] = useState<string>();
  const [advisorId, setAdvisorId] = useState('');
  const [consultation, setConsultation] = useState('');
  const [consulting, setConsulting] = useState(false);

  const run = state.expedition;

  const party = useMemo<Hero[]>(() => {
    return run ? run.formation.map((id) => state.roster.find((hero) => hero.id === id)).filter((hero): hero is Hero => Boolean(hero)) : [];
  }, [run, state.roster]);

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
      <header className="expedition-header">
        <div className="expedition-header-copy">
          <small>远征 · 节点 {run.nodeIndex + 1}/{nodes.length}</small>
          <strong>{node.title}</strong>
          <span>{node.description}</span>
        </div>
        <div className="expedition-progress" style={{ '--expedition-progress': `${(run.nodeIndex + 1) / nodes.length * 100}%` } as React.CSSProperties}>
          <span>{run.nodeIndex + 1}/{nodes.length}</span>
          <i />
        </div>
      </header>
      <div className="expedition-stage">
        <Suspense fallback={<div className="phaser-loading">正在展开远征场景…</div>}>
          <BattleCanvas
            key={`${run.missionId}-${run.nodeIndex}-${run.enemies.map((enemy) => enemy.id).join('-') || 'rest'}`}
            party={party}
            enemies={run.enemies}
            targetEnemyId={selectedEnemy?.id}
            onSelectEnemy={setSelectedEnemyId}
            nodeIndex={run.nodeIndex}
            backgroundPath={node.background}
            attackRequest={attackRequest}
            counterTargetId={selectedEnemy ? party.find((hero, index) => hero.hp > 0 && enemyCanAttack(selectedEnemy, index))?.id : undefined}
            canHeroAttack={(hero, index, enemy) => canAttack(hero, enemy, index)}
            onAttack={commitAttack}
          />
        </Suspense>
      </div>
      <aside className="expedition-sidebar">
        <MiniMap currentNode={run.nodeIndex} nodes={nodes} />
        <div className="expedition-tools">
          <span className="expedition-tools-label">远征补给</span>
          <span className="expedition-tool"><b>绷带</b><em>× {run.supplies.bandage}</em></span>
          <span className="expedition-tool"><b>镇定剂</b><em>× {run.supplies.sedative}</em></span>
        </div>
        <section className="tactical-consult" aria-label="队员战术咨询">
          <div>
            <small>队长主动咨询 · 可选</small>
            <strong>询问队员</strong>
          </div>
          <div className="tactical-consult-controls">
            {party.filter((hero) => hero.hp > 0).map((hero) => (
              <button
                key={hero.id}
                className={advisor?.id === hero.id ? 'selected' : ''}
                onClick={() => setAdvisorId(hero.id)}
              >
                {hero.name}
              </button>
            ))}
            <button
              className="consult-ask"
              disabled={!advisor || consulting || !state.settings.llmEnabled || !narrativeService.available}
              onClick={() => void askAdvisor()}
            >
              {consulting ? '思考中…' : '征询建议'}
            </button>
          </div>
          {consultation ? (
            <p>「{consultation}」</p>
          ) : (
            <span>
              {state.settings.llmEnabled && narrativeService.available ? '不会自动调用；由队长决定是否询问。' : 'LLM 未连接；战斗仍可完全正常进行。'}
            </span>
          )}
        </section>
        <button className="expedition-retreat" onClick={() => dispatch({ type: 'RETREAT' })}>撤退并返回城镇</button>
      </aside>
      <div className="expedition-hud">
        <div className="expedition-party">
          {party.map((hero, index) => {
            const nextLevelExperience = experienceToNextLevel(hero.level);
            const pressure = pressureStage(hero.morale);
            return (
              <article className={`exp-unit ${hero.hp <= 0 ? 'down' : ''}`} key={hero.id}>
                <div className="exp-unit-header">
                  <strong>{index === 0 ? '前排 · ' : ''}{hero.name}</strong>
                  <small>Lv.{hero.level} · {heroClassNames[hero.heroClass]} · 距离 {index + 1}</small>
                </div>
                <div className={`exp-bar ${hero.hp / hero.maxHp <= 0.3 ? 'critical' : ''}`}>
                  <i style={{ width: `${hero.hp / hero.maxHp * 100}%` }} />
                  <span>{hero.hp}/{hero.maxHp}</span>
                </div>
                <div className="exp-unit-meta">
                  {state.settings.moraleEnabled && (
                    <span
                      className={`pressure-state ${pressure.tone}`}
                      title={pressureRemarks[hero.id]?.[pressure.tone as 'tense' | 'shaken' | 'critical']}
                    >
                      压力 {hero.morale}/100 · {pressure.name}
                    </span>
                  )}
                  <span>EXP {hero.experience}/{nextLevelExperience}</span>
                </div>
                <div className="exp-mini-exp"><i style={{ width: `${hero.experience / nextLevelExperience * 100}%` }} /></div>
                <div className="exp-unit-actions">
                  <button className="attack" disabled={!selectedEnemy || hero.hp <= 0} onClick={() => requestAttack(hero.id)}>攻击</button>
                  {skillDetails[hero.id] && (
                    <button
                      className="skill"
                      title={skillDetails[hero.id].hint}
                      disabled={hero.hp <= 0 || run.skillUses[hero.id]}
                      onClick={() => dispatch({ type: 'USE_SKILL', heroId: hero.id, enemyId: selectedEnemy?.id })}
                    >
                      {run.skillUses[hero.id] ? '已施放' : skillDetails[hero.id].name}
                    </button>
                  )}
                  <button onClick={() => dispatch({ type: 'USE_BANDAGE', heroId: hero.id })}>绷带</button>
                  <button onClick={() => dispatch({ type: 'USE_SEDATIVE', heroId: hero.id })}>镇定</button>
                  {index < party.length - 1 && <button onClick={() => dispatch({ type: 'SWAP', index })}>换位</button>}
                </div>
              </article>
            );
          })}
        </div>
        <div className="expedition-enemies">
          {run.enemies.map((enemy, index) => (
            <button
              type="button"
              key={enemy.id}
              disabled={enemy.hp <= 0}
              className={`exp-enemy ${selectedEnemy?.id === enemy.id ? 'targeted' : ''}`}
              onClick={() => setSelectedEnemyId(enemy.id)}
            >
              <div className="exp-enemy-header">
                <strong>{index === 0 ? '前排 · ' : ''}{enemy.name}</strong>
                <small>攻击范围 {enemy.attackMinRange}–{enemy.attackMaxRange} · 意图：{party.find((hero, heroIndex) => hero.hp > 0 && enemyCanAttack(enemy, heroIndex))?.name ?? '暂无目标'}</small>
              </div>
              {enemy.trait && <span className="enemy-trait" title={enemyTraitDetails[enemy.trait].hint}>{enemyTraitDetails[enemy.trait].name} · {enemyTraitDetails[enemy.trait].hint}</span>}
              <div className={`exp-bar ${enemy.hp / enemy.maxHp <= 0.3 ? 'critical' : ''}`}>
                <i style={{ width: `${enemy.hp / enemy.maxHp * 100}%` }} />
                <span>{enemy.hp}/{enemy.maxHp}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
      <footer className={`expedition-footer ${node.kind === 'event' && !run.eventResolved ? 'expedition-event-footer' : ''}`}>
        {node.kind === 'event' && !run.eventResolved && node.event ? (
          <div className="expedition-event-choice">
            <div>
              <strong>{node.event.prompt}</strong>
              <p>选择会改变本次远征的收益或队伍状态。</p>
            </div>
            <div className="event-choice-actions">
              {node.event.choices.map((choice) => (
                <button
                  key={choice.id}
                  className="event-choice"
                  onClick={() => dispatch({ type: 'RESOLVE_EVENT', eventId: node.event!.id, choiceId: choice.id })}
                >
                  <strong>{choice.label}</strong>
                  <small>{choice.description}</small>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div>
              <strong>最近记录</strong>
              <p>{state.log[0]}</p>
            </div>
            {aliveEnemies.length === 0 && (
              <button className="primary" onClick={() => dispatch({ type: 'ADVANCE' })}>
                {run.nodeIndex === nodes.length - 1 ? '完成远征' : '前往下一节点'}
              </button>
            )}
          </>
        )}
      </footer>
    </section>
  );
}

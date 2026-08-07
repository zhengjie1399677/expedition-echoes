import { useState } from 'react';
import type { GameState, GameAction } from '../../domain/model';
import { missions, missionOpinions, materialName, rarityNames, rarityColors, regions, regionNameForMission, threatNames, nodesForMission, isMissionUnlocked, isChainGatedMission } from '../../content/gameContent';
import { HeroCard } from '../components/HeroCard';

export interface TavernProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export function Tavern({ state, dispatch }: TavernProps) {
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

  return (
    <section className="page tavern-page tavern-scene">
      <img className="tavern-background" src="/assets/world/tavern-hall-v2.webp" alt="有老板和冒险者客人的黄昏酒馆" />
      <button className="scene-hotspot tavernkeeper-hotspot" aria-label="与酒馆老板交谈，打开招募与整备" onClick={() => setRosterOpen(true)}>
        <span>酒馆老板</span>
      </button>
      <button className="scene-hotspot quest-board-hotspot" aria-label="查看公会任务板" onClick={() => { setBoardOpen(true); setPreviewMissionId(undefined); }}>
        <span>查看任务板</span>
      </button>

      {boardOpen && !previewMission && (
        <aside className="quest-dialog quest-list-dialog" aria-label="公会任务板">
          <header>
            <div>
              <small>公会任务板</small>
              <strong>选择远征委托</strong>
            </div>
            <button onClick={closeBoard}>关闭</button>
          </header>
          <div className="quest-dialog-list">
            {regions.map((region) => {
              // 事件链门控（M4 打磨 4）：未解锁的委托不出现在任务板（如推进链前的「回声余波」）。
              const regionMissions = region.missions
                .map((id) => missions.find((m) => m.id === id))
                .filter((m): m is NonNullable<typeof m> => Boolean(m))
                .filter((mission) => isMissionUnlocked(state, mission.id));
              if (regionMissions.length === 0) return null;
              const threat = state.regions[region.id] ?? region.threat;
              return (
                <div key={region.id} className="quest-region-group">
                  <div className="quest-region-header">
                    <strong>{region.name}</strong>
                    <span className={`threat-badge threat-${threat}`}>威胁：{threatNames[threat] ?? threat}</span>
                  </div>
                  <p className="quest-region-desc">{region.description}</p>
                  {regionMissions.map((mission) => (
                    <button key={mission.id} className="quest-dialog-card" onClick={() => setPreviewMissionId(mission.id)}>
                      <div>
                        <strong>{mission.title}</strong>
                        {isChainGatedMission(mission.id) && <em className="quest-chain-badge">事件链解锁</em>}
                        <span>{'◆'.repeat(mission.difficulty)}{'◇'.repeat(3 - mission.difficulty)}</span>
                      </div>
                      <p>{mission.summary}</p>
                      <small>{mission.reward} 金币 · 点击展开委托</small>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
          <footer>选择一张委托，查看完整内容。</footer>
        </aside>
      )}

      {boardOpen && previewMission && (
        <aside className={`quest-parchment ${acceptingMission ? 'accepting' : ''}`} aria-label={`${previewMission.title}任务详情`}>
          <button className="parchment-close" aria-label="关闭任务详情" onClick={closeBoard}>×</button>
          <div className="parchment-kicker">冒险者公会 · 正式委托</div>
          <h2>{previewMission.title}</h2>
          <div className="parchment-difficulty" aria-label={`难度 ${previewMission.difficulty}`}>
            {'◆'.repeat(previewMission.difficulty)}{'◇'.repeat(3 - previewMission.difficulty)}
          </div>
          <div className="parchment-rule" />
          <p className="parchment-summary">{previewMission.summary}</p>
          
          <section className="mission-opinions" aria-label="队员意见">
            <h3>队员意见</h3>
            {state.roster
              .filter((hero) => state.selectedHeroIds.includes(hero.id))
              .map((hero) => (
                <div key={hero.id}>
                  <strong>{hero.name}</strong>
                  <span>{missionOpinions[previewMission.id]?.[hero.id] ?? '我会听从队长的判断。'}</span>
                </div>
              ))}
          </section>

          <dl className="parchment-details">
            <div>
              <dt>委托报酬</dt>
              <dd>{previewMission.reward} 金币</dd>
            </div>
            {previewMission.materialRewards?.length ? (
              <div>
                <dt>材料报酬</dt>
                <dd className="parchment-materials">
                  {previewMission.materialRewards.map((r, i) => (
                    <span
                      key={i}
                      className={`rarity-badge rarity-${r.rarity}`}
                      style={{ borderColor: rarityColors[r.rarity], color: rarityColors[r.rarity] }}
                    >
                      {materialName(r.typeId)}·{rarityNames[r.rarity]} ×{r.count}
                    </span>
                  ))}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>行动区域</dt>
              <dd>{regionNameForMission(previewMission.id)}</dd>
            </div>
            <div>
              <dt>预计行程</dt>
              <dd>{nodesForMission(previewMission.id).filter((node) => node.kind === 'combat').length} 场遭遇</dd>
            </div>
          </dl>

          <div className="parchment-actions">
            <button onClick={() => setPreviewMissionId(undefined)}>返回任务板</button>
            <button
              className="accept-mission"
              disabled={state.missionAcceptedToday}
              onClick={acceptMission}
            >
              {state.missionAcceptedToday ? '今日已接取' : '接取任务'}
            </button>
          </div>
          {acceptingMission && (
            <div className="accepted-check" aria-live="polite">
              <strong>✓</strong>
              <span>任务已接取</span>
            </div>
          )}
        </aside>
      )}

      {rosterOpen && (
        <aside className="tavern-roster-drawer">
          <header>
            <div>
              <p className="eyebrow">酒馆老板 · 队伍整备</p>
              <strong>冒险者名册</strong>
            </div>
            <button onClick={() => setRosterOpen(false)}>关闭</button>
          </header>
          <p className="roster-summary">
            当前队伍：{state.selectedHeroIds.map((id) => state.roster.find((hero) => hero.id === id)?.name).join('、') || '尚未选择'}
          </p>
          <div className="roster">
            {state.roster.map((hero) => (
              <HeroCard
                key={hero.id}
                hero={hero}
                selected={state.selectedHeroIds.includes(hero.id)}
                dispatch={dispatch}
              />
            ))}
          </div>
        </aside>
      )}
    </section>
  );
}

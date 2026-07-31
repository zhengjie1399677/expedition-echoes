import type { GameState, GameAction } from '../../domain/model';
import { dayLabel } from '../../content/gameContent';

export interface DayReportOverlayProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export function DayReportOverlay({ state, dispatch }: DayReportOverlayProps) {
  const report = state.dayReport;
  if (!report) return null;
  const outcomeTitle = report.outcome === 'victory' ? '远征成果传回城镇' : report.outcome === 'retreat' ? '整备后迎来清晨' : report.outcome === 'defeated' ? '重整队伍的清晨' : '新的清晨';
  return (
    <div className="day-report-overlay" role="dialog" aria-modal="true" aria-label="次日晨报">
      <section className="day-report-sheet">
        <header>
          <small>第 {report.completedDay} 日结算 · {dayLabel(state.day)}</small>
          <h2>{outcomeTitle}</h2>
        </header>
        {report.missionTitle && <p className="day-report-mission">昨日委托：{report.missionTitle}</p>}
        <p className="day-report-news">{report.townNews}</p>
        <section className="day-report-recovery">
          <h3>夜间恢复</h3>
          {report.recovery.map((hero) => (
            <span key={hero.name}>
              {hero.name} · 生命 +{hero.hp} · 压力 -{hero.pressure}
              {hero.affinity ? ` · 好感 +${hero.affinity}` : ''}
            </span>
          ))}
        </section>
        <section className="day-report-reactions">
          <h3>队员晨语</h3>
          {report.reactions.map((reaction) => (
            <p key={reaction.heroId}>
              <strong>{reaction.name}</strong>「{reaction.line}」
            </p>
          ))}
        </section>
        <button className="primary" onClick={() => dispatch({ type: 'CLOSE_DAY_REPORT' })}>开始今天</button>
      </section>
    </div>
  );
}

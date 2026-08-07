import { useEffect, useReducer, useState } from 'react';
import { dayLabel } from '../content/gameContent';
import { createInitialGame, gameReducer } from '../domain/gameEngine';
import { warmExpeditionResources } from '../infrastructure/expeditionPreloader';
import { loadGame, saveGameDebounced, flushSaveGame } from '../infrastructure/storage';

// 导入页面与公共组件
import { Town } from './pages/Town';
import { Tavern } from './pages/Tavern';
import { Quarters } from './pages/Quarters';
import { Management } from './pages/Management';
import { Expedition } from './pages/Expedition';
import { Settings } from './pages/Settings';

import { BottomAdventureMenu } from './components/BottomAdventureMenu';
import { ExpeditionPrepOverlay } from './components/ExpeditionPrepOverlay';
import { DayReportOverlay } from './components/DayReportOverlay';
import { Settlement } from './components/Settlement';

export function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => loadGame() ?? createInitialGame());
  const [confirmRest, setConfirmRest] = useState(false);
  const [prepOpen, setPrepOpen] = useState(false);

  useEffect(() => {
    saveGameDebounced(state);
  }, [state]);

  useEffect(() => {
    window.addEventListener('beforeunload', flushSaveGame);
    return () => {
      window.removeEventListener('beforeunload', flushSaveGame);
      flushSaveGame();
    };
  }, []);

  useEffect(() => {
    warmExpeditionResources();
  }, []);

  const showAdventureMenu = state.page !== 'expedition' && state.page !== 'settings' && state.page !== 'settlement';
  return (
    <main className={`app-shell ${showAdventureMenu ? 'with-adventure-menu' : ''}`}>
      <header className="topbar">
        <button className="brand-home" onClick={() => dispatch({ type: 'NAVIGATE', page: 'town' })}>
          <span className="eyebrow">边境远征队 · 第一版</span>
          <strong>远征余响</strong>
        </button>
        <div className="topbar-actions">
          <div className="resource">
            <small>{state.page === 'town' ? '城镇据点' : '◆ 当前地点'}</small>
            <strong>
              {dayLabel(state.day)} · ◆ {state.gold} · 口粮 {state.food}
              {state.hunger > 0 ? ` · 饥饿${state.hunger}` : ''}
            </strong>
          </div>
          {state.page === 'settings' && (
            <button className="return-town" onClick={() => dispatch({ type: 'NAVIGATE', page: 'town' })}>返回城镇</button>
          )}
          <button
            className={`settings-entry ${state.page === 'settings' ? 'selected' : ''}`}
            aria-label="设置"
            title="设置"
            onClick={() => dispatch({ type: 'NAVIGATE', page: 'settings' })}
          >⚙</button>
        </div>
      </header>
      <div className="game-viewport">
        {state.page === 'town' && <Town state={state} dispatch={dispatch} onGateClick={() => setPrepOpen(true)} />}
        {state.page === 'management' && <Management state={state} dispatch={dispatch} />}
        {state.page === 'tavern' && <Tavern state={state} dispatch={dispatch} />}
        {state.page === 'quarters' && <Quarters state={state} dispatch={dispatch} onRestClick={() => setConfirmRest(true)} />}
        {state.page === 'expedition' && <Expedition state={state} dispatch={dispatch} />}
        {state.page === 'settings' && <Settings state={state} dispatch={dispatch} />}
        {state.page === 'settlement' && <Settlement state={state} dispatch={dispatch} />}
      </div>
      <BottomAdventureMenu state={state} dispatch={dispatch} />
      {state.dayReport && !state.dayReport.pending && <DayReportOverlay state={state} dispatch={dispatch} />}
      {confirmRest && (
        <div className="confirm-overlay" onClick={() => setConfirmRest(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p>上楼休息至次日？</p>
            <small>将结束今天并进入 {dayLabel(state.day + 1)}，新的一天可以再次接取任务。</small>
            <div className="confirm-actions">
              <button onClick={() => setConfirmRest(false)}>取消</button>
              <button
                className="confirm-yes"
                onClick={() => { dispatch({ type: 'REST_TO_NEXT_DAY' }); setConfirmRest(false); }}
              >确认休息</button>
            </div>
          </div>
        </div>
      )}
      {prepOpen && <ExpeditionPrepOverlay state={state} dispatch={dispatch} onClose={() => setPrepOpen(false)} />}
    </main>
  );
}

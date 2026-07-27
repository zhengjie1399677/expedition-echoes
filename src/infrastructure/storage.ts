import type { GameState } from '../domain/model';
const KEY = 'expedition-echoes.save.v3';
export function loadGame(): GameState | null { try {
  const raw = localStorage.getItem(KEY); if (!raw) return null;
  const state = JSON.parse(raw) as GameState & { expedition?: GameState['expedition'] & { enemy?: NonNullable<GameState['expedition']>['enemies'][number] } };
  if (state.version !== 3) return null;
  if (state.expedition && !Array.isArray(state.expedition.enemies)) {
    state.expedition = { ...state.expedition, enemies: state.expedition.enemy ? [state.expedition.enemy] : [] };
    delete state.expedition.enemy;
  }
  return state;
} catch { return null; } }
export function saveGame(state: GameState): void { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* iframe 可禁用存储，游戏仍可运行 */ } }
export function clearGame(): void { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

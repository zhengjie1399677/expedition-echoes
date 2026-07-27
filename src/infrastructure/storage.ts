import type { GameState } from '../domain/model';
const KEY = 'expedition-echoes.save.v4';
const LEGACY_KEY = 'expedition-echoes.save.v3';
export function loadGame(): GameState | null { try {
  localStorage.removeItem(LEGACY_KEY);
  const raw = localStorage.getItem(KEY); if (!raw) return null;
  const state = JSON.parse(raw) as GameState;
  return state.version === 4 ? state : null;
} catch { return null; } }
export function saveGame(state: GameState): void { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* iframe 可禁用存储，游戏仍可运行 */ } }
export function clearGame(): void { try { localStorage.removeItem(KEY); localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ } }

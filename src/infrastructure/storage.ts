import type { GameState, Hero } from '../domain/model';
import { initialInventory } from '../content/gameContent';
const KEY = 'expedition-echoes.save.v7';
const V6_KEY = 'expedition-echoes.save.v6';
const V5_KEY = 'expedition-echoes.save.v5';
const LEGACY_KEYS = ['expedition-echoes.save.v3', 'expedition-echoes.save.v4'];
type StoredHero = Omit<Hero, 'level' | 'experience' | 'equipment'> & Partial<Pick<Hero, 'level' | 'experience' | 'equipment'>>;
type StoredGame = Omit<GameState, 'version' | 'roster' | 'inventory'> & { version: number; roster: StoredHero[]; inventory?: Record<string, number> };
export function loadGame(): GameState | null { try {
  LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
  const raw = localStorage.getItem(KEY) ?? localStorage.getItem(V6_KEY) ?? localStorage.getItem(V5_KEY); if (!raw) return null;
  const parsed = JSON.parse(raw) as StoredGame;
  if (parsed.version < 5 || parsed.version > 7) return null;
  const migratedInventory = { ...initialInventory };
  if (!parsed.inventory && parsed.expedition) {
    migratedInventory.bandage = Math.max(0, migratedInventory.bandage - parsed.expedition.supplies.bandage);
    migratedInventory.sedative = Math.max(0, migratedInventory.sedative - parsed.expedition.supplies.sedative);
  }
  const state = {
    ...parsed,
    version: 7,
    inventory: parsed.inventory ?? migratedInventory,
    managementTab: parsed.managementTab ?? 'party',
    roster: parsed.roster.map((hero) => ({ ...hero, level: hero.level ?? 1, experience: hero.experience ?? 0, equipment: hero.equipment ?? {} })),
  } as GameState;
  if (parsed.version < 7) { localStorage.removeItem(V6_KEY); localStorage.removeItem(V5_KEY); }
  return state;
} catch { return null; } }
export function saveGame(state: GameState): void { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* iframe 可禁用存储，游戏仍可运行 */ } }
export function clearGame(): void { try { localStorage.removeItem(KEY); localStorage.removeItem(V6_KEY); localStorage.removeItem(V5_KEY); LEGACY_KEYS.forEach((key) => localStorage.removeItem(key)); } catch { /* ignore */ } }

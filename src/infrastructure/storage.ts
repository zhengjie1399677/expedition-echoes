import type { GameState, Hero } from '../domain/model';
import { initialInventory } from '../content/gameContent';
const KEY = 'expedition-echoes.save.v12';
const V11_KEY = 'expedition-echoes.save.v11';
const V10_KEY = 'expedition-echoes.save.v10';
const V9_KEY = 'expedition-echoes.save.v9';
const V8_KEY = 'expedition-echoes.save.v8';
const V7_KEY = 'expedition-echoes.save.v7';
const V6_KEY = 'expedition-echoes.save.v6';
const V5_KEY = 'expedition-echoes.save.v5';
const LEGACY_KEYS = ['expedition-echoes.save.v3', 'expedition-echoes.save.v4'];
type StoredHero = Omit<Hero, 'level' | 'experience' | 'equipment' | 'affinity' | 'preferredGiftTags'> & Partial<Pick<Hero, 'level' | 'experience' | 'equipment' | 'affinity' | 'preferredGiftTags'>>;
type StoredGame = Omit<GameState, 'version' | 'roster' | 'inventory' | 'materials' | 'hasAcceptedMission' | 'day' | 'missionAcceptedToday' | 'food' | 'hunger' | 'giftsGivenToday' | 'settlement'> & { version: number; roster: StoredHero[]; inventory?: Record<string, number>; materials?: Record<string, number>; hasAcceptedMission?: boolean; day?: number; missionAcceptedToday?: boolean; food?: number; hunger?: number; giftsGivenToday?: Record<string, number>; settlement?: GameState['settlement'] };
export function loadGame(): GameState | null { try {
  LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
  const raw = localStorage.getItem(KEY) ?? localStorage.getItem(V11_KEY) ?? localStorage.getItem(V10_KEY) ?? localStorage.getItem(V9_KEY) ?? localStorage.getItem(V8_KEY) ?? localStorage.getItem(V7_KEY) ?? localStorage.getItem(V6_KEY) ?? localStorage.getItem(V5_KEY); if (!raw) return null;
  const parsed = JSON.parse(raw) as StoredGame;
  if (parsed.version < 5 || parsed.version > 12) return null;
  const migratedInventory = { ...initialInventory };
  if (!parsed.inventory && parsed.expedition) {
    migratedInventory.bandage = Math.max(0, migratedInventory.bandage - parsed.expedition.supplies.bandage);
    migratedInventory.sedative = Math.max(0, migratedInventory.sedative - parsed.expedition.supplies.sedative);
  }
  const state = {
    ...parsed,
    version: 12,
    inventory: parsed.inventory ?? migratedInventory,
    managementTab: parsed.managementTab ?? 'party',
    materials: parsed.materials ?? {},
    hasAcceptedMission: parsed.hasAcceptedMission ?? false,
    day: parsed.day ?? 1,
    missionAcceptedToday: parsed.missionAcceptedToday ?? false,
    food: parsed.food ?? 5,
    hunger: parsed.hunger ?? 0,
    giftsGivenToday: parsed.giftsGivenToday ?? {},
    settlement: parsed.settlement ?? null,
    roster: parsed.roster.map((hero) => ({ ...hero, level: hero.level ?? 1, experience: hero.experience ?? 0, equipment: hero.equipment ?? {}, affinity: hero.affinity ?? 0, preferredGiftTags: hero.preferredGiftTags ?? [] })),
  } as GameState;
  // If we migrated from an older version, add default food of 0 to the expedition supplies if expedition exists
  if (state.expedition && state.expedition.supplies && state.expedition.supplies.food === undefined) {
    state.expedition.supplies.food = 0;
  }
  if (parsed.version < 12) { localStorage.removeItem(V11_KEY); localStorage.removeItem(V10_KEY); localStorage.removeItem(V9_KEY); localStorage.removeItem(V8_KEY); localStorage.removeItem(V7_KEY); localStorage.removeItem(V6_KEY); localStorage.removeItem(V5_KEY); }
  return state;
} catch { return null; } }
export function saveGame(state: GameState): void { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* iframe 可禁用存储，游戏仍可运行 */ } }
export function clearGame(): void { try { localStorage.removeItem(KEY); localStorage.removeItem(V11_KEY); localStorage.removeItem(V10_KEY); localStorage.removeItem(V9_KEY); localStorage.removeItem(V8_KEY); localStorage.removeItem(V7_KEY); localStorage.removeItem(V6_KEY); localStorage.removeItem(V5_KEY); LEGACY_KEYS.forEach((key) => localStorage.removeItem(key)); } catch { /* ignore */ } }

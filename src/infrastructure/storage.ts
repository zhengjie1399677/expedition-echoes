import type { GameState, Hero, Rarity } from '../domain/model';
import { initialHeroes, initialInventory } from '../content/gameContent';

const KEY = 'expedition-echoes.save.v12';
const V11_KEY = 'expedition-echoes.save.v11';
const V10_KEY = 'expedition-echoes.save.v10';
const V9_KEY = 'expedition-echoes.save.v9';
const V8_KEY = 'expedition-echoes.save.v8';
const V7_KEY = 'expedition-echoes.save.v7';
const V6_KEY = 'expedition-echoes.save.v6';
const V5_KEY = 'expedition-echoes.save.v5';
const LEGACY_KEYS = ['expedition-echoes.save.v3', 'expedition-echoes.save.v4'];
const SUPPORTED_VERSION_MIN = 5;
const SUPPORTED_VERSION_MAX = 12;

type StoredHero = Omit<Hero, 'level' | 'experience' | 'equipment' | 'affinity' | 'preferredGiftTags'> & Partial<Pick<Hero, 'level' | 'experience' | 'equipment' | 'affinity' | 'preferredGiftTags'>>;
type StoredGame = Omit<GameState, 'version' | 'roster' | 'inventory' | 'materials' | 'hasAcceptedMission' | 'day' | 'missionAcceptedToday' | 'food' | 'hunger' | 'giftsGivenToday' | 'settlement'> & {
  version: number;
  roster: StoredHero[];
  inventory?: Record<string, number>;
  materials?: Record<string, number>;
  hasAcceptedMission?: boolean;
  day?: number;
  missionAcceptedToday?: boolean;
  food?: number;
  hunger?: number;
  giftsGivenToday?: Record<string, number>;
  settlement?: GameState['settlement'];
};

// 数值字段统一兜底：非有限数退回默认值，避免 NaN 传染。
const num = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
// 拒绝可能触发原型污染的危险 key。
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isSafeKey = (key: string): boolean => !FORBIDDEN_KEYS.has(key) && !key.includes(':__proto__') && !key.startsWith('__proto__');

// 材料库存 key 形如 `${typeId}:${rarity}`，校验 rarity 是 0-4 的整数。
const cleanMaterials = (raw: unknown): Record<string, number> => {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = Object.create(null);
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue;
    const [typeId, rarityStr] = key.split(':');
    if (!typeId || !isSafeKey(typeId)) continue;
    const rarity = Number(rarityStr);
    if (!Number.isInteger(rarity) || rarity < 0 || rarity > 4) continue;
    out[`${typeId}:${rarity as Rarity}`] = Math.floor(value);
  }
  return out as Record<string, number>;
};
const cleanRecord = (raw: unknown): Record<string, number> => {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = Object.create(null);
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue;
    if (!isSafeKey(key)) continue;
    out[key] = Math.floor(value);
  }
  return out as Record<string, number>;
};
const cleanBooleanRecord = (raw: unknown): Record<string, boolean> => {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, boolean> = Object.create(null);
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) if (value === true && isSafeKey(key)) out[key] = true;
  return out;
};

export function loadGame(): GameState | null {
  // 优先清理已废弃的旧版存档 key。
  try {
    LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {
    // iframe 可禁用存储，忽略。
  }

  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY)
      ?? localStorage.getItem(V11_KEY)
      ?? localStorage.getItem(V10_KEY)
      ?? localStorage.getItem(V9_KEY)
      ?? localStorage.getItem(V8_KEY)
      ?? localStorage.getItem(V7_KEY)
      ?? localStorage.getItem(V6_KEY)
      ?? localStorage.getItem(V5_KEY);
  } catch (error) {
    console.warn('[storage] 读取 localStorage 失败，回退到新档。', error);
    return null;
  }
  if (!raw) return null;

  let parsed: StoredGame;
  try {
    parsed = JSON.parse(raw) as StoredGame;
  } catch (error) {
    console.warn('[storage] 存档 JSON 解析失败，已回退到新档。', error);
    return null;
  }

  if (parsed.version < SUPPORTED_VERSION_MIN || parsed.version > SUPPORTED_VERSION_MAX) {
    console.warn(`[storage] 存档版本 ${parsed.version} 不受支持（支持 ${SUPPORTED_VERSION_MIN}-${SUPPORTED_VERSION_MAX}）。`);
    return null;
  }

  try {
    const migratedInventory = { ...initialInventory };
    const supplies = parsed.expedition?.supplies;
    if (!parsed.inventory && parsed.expedition && supplies) {
      migratedInventory.bandage = Math.max(0, migratedInventory.bandage - num(supplies.bandage, 0));
      migratedInventory.sedative = Math.max(0, migratedInventory.sedative - num(supplies.sedative, 0));
    }

    const state: GameState = {
      version: 12,
      page: parsed.page ?? 'town',
      gold: num(parsed.gold, 100),
      roster: Array.isArray(parsed.roster)
        ? parsed.roster.map((hero) => ({
            ...hero,
            // 人物性格由内容表维护；旧存档保留成长数据，但更新到当前的人设版本。
            personality: initialHeroes.find((initial) => initial.id === hero.id)?.personality ?? hero.personality,
            level: num(hero.level, 1),
            experience: num(hero.experience, 0),
            equipment: hero.equipment ?? {},
            affinity: num(hero.affinity, 0),
            preferredGiftTags: Array.isArray(hero.preferredGiftTags) ? hero.preferredGiftTags : [],
          }))
        : [],
      inventory: cleanRecord(parsed.inventory ?? migratedInventory),
      selectedHeroIds: Array.isArray(parsed.selectedHeroIds) ? parsed.selectedHeroIds.filter((id): id is string => typeof id === 'string') : [],
      selectedMissionId: typeof parsed.selectedMissionId === 'string' ? parsed.selectedMissionId : '',
      managementTab: parsed.managementTab ?? 'party',
      expedition: parsed.expedition
            ? {
                ...parsed.expedition,
                supplies: {
                  food: num(parsed.expedition.supplies?.food, 0),
                  bandage: num(parsed.expedition.supplies?.bandage, 0),
                  sedative: num(parsed.expedition.supplies?.sedative, 0),
                },
                startSupplies: {
                  food: num(parsed.expedition.startSupplies?.food, parsed.expedition.supplies?.food ?? 0),
                  bandage: num(parsed.expedition.startSupplies?.bandage, parsed.expedition.supplies?.bandage ?? 0),
                  sedative: num(parsed.expedition.startSupplies?.sedative, parsed.expedition.supplies?.sedative ?? 0),
                },
                enemies: Array.isArray(parsed.expedition.enemies) ? parsed.expedition.enemies : [],
                gainedGold: num(parsed.expedition.gainedGold, 0),
                gainedMaterials: cleanMaterials(parsed.expedition.gainedMaterials),
                gainedExperience: num(parsed.expedition.gainedExperience, 0),
                eventResolved: parsed.expedition.eventResolved ?? false,
                skillUses: cleanBooleanRecord(parsed.expedition.skillUses),
              }
            : null,
      settings: {
        moraleEnabled: parsed.settings?.moraleEnabled ?? true,
        llmEnabled: parsed.settings?.llmEnabled ?? true,
      },
      log: Array.isArray(parsed.log) ? parsed.log.filter((line): line is string => typeof line === 'string').slice(0, 8) : [],
      materials: cleanMaterials(parsed.materials),
      hasAcceptedMission: parsed.hasAcceptedMission ?? false,
      day: num(parsed.day, 1),
      missionAcceptedToday: parsed.missionAcceptedToday ?? false,
      food: num(parsed.food, 5),
      hunger: num(parsed.hunger, 0),
      giftsGivenToday: cleanRecord(parsed.giftsGivenToday),
      settlement: parsed.settlement ?? null,
    };

    // 升级后清理旧版 key，避免下次再走迁移分支。
    if (parsed.version < 12) {
      [V11_KEY, V10_KEY, V9_KEY, V8_KEY, V7_KEY, V6_KEY, V5_KEY].forEach((key) => {
        try { localStorage.removeItem(key); } catch { /* ignore */ }
      });
    }
    return state;
  } catch (error) {
    console.warn('[storage] 存档字段迁移失败，已回退到新档。', error);
    return null;
  }
}

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (error) {
    // iframe 可禁用存储，游戏仍可运行；记录原因便于排查。
    console.warn('[storage] 写入 localStorage 失败，本次进度未持久化。', error);
  }
}

export function clearGame(): void {
  try {
    [KEY, V11_KEY, V10_KEY, V9_KEY, V8_KEY, V7_KEY, V6_KEY, V5_KEY, ...LEGACY_KEYS].forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.warn('[storage] 清理 localStorage 失败。', error);
  }
}

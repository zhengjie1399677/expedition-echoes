import type { GameState, Hero, Rarity, HeroClass, Enemy, DropEntry, EnemyIntent, ThreatLevel } from '../domain/model';
import { initialHeroes, initialInventory, regions, eventChains } from '../content/gameContent';

const KEY = 'expedition-echoes.save.v13';
const V12_KEY = 'expedition-echoes.save.v12';
const LEGACY_KEYS = ['expedition-echoes.save.v3', 'expedition-echoes.save.v4'];
// 迁移截止策略：仅保留最近一代旧档（v12）的读取与迁移；v5–v11 迁移链已下线。
// 设定迁移截止时间后可将 SUPPORTED_VERSION_MIN 直接提到 13 并删除 V12_KEY。
const SUPPORTED_VERSION_MIN = 12;
const SUPPORTED_VERSION_MAX = 13;

type StoredHero = Omit<Hero, 'level' | 'experience' | 'equipment' | 'affinity' | 'preferredGiftTags'> & Partial<Pick<Hero, 'level' | 'experience' | 'equipment' | 'affinity' | 'preferredGiftTags'>>;
type StoredGame = Omit<GameState, 'version' | 'roster' | 'inventory' | 'materials' | 'hasAcceptedMission' | 'day' | 'missionAcceptedToday' | 'food' | 'hunger' | 'giftsGivenToday' | 'regions' | 'eventChains' | 'settlement' | 'dayReport'> & {
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
  regions?: Record<string, unknown>;
  eventChains?: Record<string, unknown>;
  settlement?: GameState['settlement'];
  dayReport?: GameState['dayReport'];
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
// 区域威胁等级：只接受 0-3 整数；缺失/非法回退 0（新档用 regions 静态数据兜底，见 loadGame）。
const cleanThreatRecord = (raw: unknown): Record<string, ThreatLevel> => {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, ThreatLevel> = Object.create(null);
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 3) continue;
    if (!isSafeKey(key)) continue;
    out[key] = value as ThreatLevel;
  }
  return out;
};
// 事件链状态：缺字段时回退静态定义初始值；已有链保留进度。
const cleanEventChains = (raw: unknown): GameState['eventChains'] => {
  const defaults: GameState['eventChains'] = Object.fromEntries(
    eventChains.map((c) => [c.id, { currentNode: c.nodes[0]?.id ?? 'start', completed: false }]),
  );
  if (!raw || typeof raw !== 'object') return defaults;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isSafeKey(key) || !(key in defaults)) continue;
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    defaults[key] = {
      currentNode: typeof v.currentNode === 'string' ? v.currentNode : defaults[key].currentNode,
      completed: typeof v.completed === 'boolean' ? v.completed : false,
    };
  }
  return defaults;
};

function cleanDrop(raw: unknown): DropEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.typeId !== 'string') return null;
  const rarity = num(d.rarity, 0);
  if (rarity < 0 || rarity > 4) return null;
  return {
    typeId: d.typeId,
    rarity: rarity as Rarity,
    chance: num(d.chance, 0.5),
  };
}

function cleanEnemy(raw: unknown): Enemy | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== 'string' || typeof e.name !== 'string') return null;
  return {
    id: e.id,
    name: e.name,
    maxHp: num(e.maxHp, 10),
    hp: num(e.hp, 10),
    distance: num(e.distance, 1),
    attackMinRange: num(e.attackMinRange, 1),
    attackMaxRange: num(e.attackMaxRange, 1),
    damage: num(e.damage, 1),
    drops: Array.isArray(e.drops) ? e.drops.map(cleanDrop).filter(Boolean) as DropEntry[] : undefined,
    trait: (e.trait === 'pack' || e.trait === 'thorns' || e.trait === 'spores' || e.trait === 'rock-armor' || e.trait === 'ancient-core') ? e.trait : undefined,
    intents: Array.isArray(e.intents) ? e.intents.filter(cleanIntent) : undefined,
  };
}

// 意图池条目校验：只允许 attack/charge/guard/pressure 四类。
function cleanIntent(raw: unknown): raw is EnemyIntent {
  if (!raw || typeof raw !== 'object') return false;
  const i = raw as Record<string, unknown>;
  return i.type === 'attack' || i.type === 'charge' || i.type === 'guard' || i.type === 'pressure';
}

function cleanHero(raw: unknown): Hero | null {
  if (!raw || typeof raw !== 'object') return null;
  const h = raw as Record<string, unknown>;
  if (typeof h.id !== 'string' || typeof h.name !== 'string' || typeof h.heroClass !== 'string') return null;
  const heroClass = h.heroClass as HeroClass;
  if (heroClass !== 'vanguard' && heroClass !== 'ranger' && heroClass !== 'mage' && heroClass !== 'medic') return null;
  
  const base = initialHeroes.find((initial) => initial.id === h.id);
  
  return {
    id: h.id,
    name: h.name,
    heroClass,
    maxHp: num(h.maxHp, base?.maxHp ?? 20),
    hp: num(h.hp, base?.hp ?? 20),
    // 旧档（v12 及以下）字段为 morale，新档为 pressure；读取时兼容迁移。
    pressure: num(h.pressure, num(h.morale, 0)),
    gearLevel: num(h.gearLevel, 0),
    level: num(h.level, 1),
    experience: num(h.experience, 0),
    equipment: (h.equipment && typeof h.equipment === 'object') ? (h.equipment as any) : {},
    recruited: typeof h.recruited === 'boolean' ? h.recruited : false,
    personality: base?.personality ?? String(h.personality ?? ''),
    affinity: num(h.affinity, 0),
    preferredGiftTags: Array.isArray(h.preferredGiftTags) ? h.preferredGiftTags.filter((t): t is string => typeof t === 'string') : [],
    story: base?.story ?? String(h.story ?? ''),
    // 旧档（v13 及以前）使用单值 skillId；迁移为 skills 数组（首项保留原技能）。
    skills: Array.isArray((h as any).skills) && (h as any).skills.length > 0
      ? (h as any).skills.filter((s: unknown): s is string => typeof s === 'string')
      : (typeof (h as any).skillId === 'string' && (h as any).skillId ? [(h as any).skillId] : ((base as any)?.skills?.length ? (base as any).skills : [(base as any)?.skillId ?? ''].filter(Boolean))),
    reactions: (h.reactions && typeof h.reactions === 'object') ? (h.reactions as Hero['reactions']) : (base?.reactions ?? { victory: '', retreat: '', defeated: '', idle: '' }),
  };
}

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
      ?? localStorage.getItem(V12_KEY);
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

  if (!parsed || typeof parsed !== 'object') {
    console.warn('[storage] 存档数据格式非法，已回退至新档。');
    return null;
  }

  if (typeof parsed.version !== 'number' || !Number.isInteger(parsed.version) || parsed.version < SUPPORTED_VERSION_MIN || parsed.version > SUPPORTED_VERSION_MAX) {
    console.warn(`[storage] 存档版本 ${parsed.version} 不受支持（支持 ${SUPPORTED_VERSION_MIN}-${SUPPORTED_VERSION_MAX}）。`);
    return null;
  }

  try {
    const migratedInventory = { ...initialInventory };
    const supplies = (parsed.expedition && typeof parsed.expedition === 'object') ? parsed.expedition.supplies : null;
    if (!parsed.inventory && parsed.expedition && supplies) {
      migratedInventory.bandage = Math.max(0, migratedInventory.bandage - num(supplies.bandage, 0));
      migratedInventory.sedative = Math.max(0, migratedInventory.sedative - num(supplies.sedative, 0));
      migratedInventory['fire-bomb'] = Math.max(0, (migratedInventory['fire-bomb'] ?? 0) - num(supplies.fireBomb, 0));
      migratedInventory['shield-elixir'] = Math.max(0, (migratedInventory['shield-elixir'] ?? 0) - num(supplies.shieldElixir, 0));
    }

    const exp = (parsed.expedition && typeof parsed.expedition === 'object') ? parsed.expedition : null;
    const expSupplies = (exp && exp.supplies && typeof exp.supplies === 'object') ? exp.supplies : null;
    const expStartSupplies = (exp && exp.startSupplies && typeof exp.startSupplies === 'object') ? exp.startSupplies : null;

    const settingsObj = (parsed.settings && typeof parsed.settings === 'object') ? (parsed.settings as unknown as Record<string, unknown>) : {};

    // 补全在 initialHeroes 中存在但存档中缺失的新英雄（例如新加入的澄和砚）
    const loadedRoster = Array.isArray(parsed.roster)
      ? parsed.roster.map(cleanHero).filter(Boolean) as Hero[]
      : [];
    initialHeroes.forEach((initial) => {
      if (!loadedRoster.some((h) => h.id === initial.id)) {
        loadedRoster.push({
          ...initial,
          equipment: { ...initial.equipment },
          reactions: { ...initial.reactions },
        });
      }
    });

    const state: GameState = {
      version: 13,
      page: parsed.page ?? 'town',
      gold: num(parsed.gold, 100),
      roster: loadedRoster,
      inventory: cleanRecord(parsed.inventory ?? migratedInventory),
      selectedHeroIds: Array.isArray(parsed.selectedHeroIds) ? parsed.selectedHeroIds.filter((id): id is string => typeof id === 'string') : [],
      selectedMissionId: typeof parsed.selectedMissionId === 'string' ? parsed.selectedMissionId : '',
      managementTab: parsed.managementTab ?? 'party',
      expedition: exp
            ? {
                ...exp,
                supplies: {
                  food: num(expSupplies?.food, 0),
                  bandage: num(expSupplies?.bandage, 0),
                  sedative: num(expSupplies?.sedative, 0),
                  fireBomb: num(expSupplies?.fireBomb, 0),
                  shieldElixir: num(expSupplies?.shieldElixir, 0),
                },
                startSupplies: {
                  food: num(expStartSupplies?.food, expSupplies?.food ?? 0),
                  bandage: num(expStartSupplies?.bandage, expSupplies?.bandage ?? 0),
                  sedative: num(expStartSupplies?.sedative, expSupplies?.sedative ?? 0),
                  fireBomb: num(expStartSupplies?.fireBomb, expSupplies?.fireBomb ?? 0),
                  shieldElixir: num(expStartSupplies?.shieldElixir, expSupplies?.shieldElixir ?? 0),
                },
                enemies: Array.isArray(exp.enemies)
                  ? exp.enemies.map(cleanEnemy).filter(Boolean) as Enemy[]
                  : [],
                gainedGold: num(exp.gainedGold, 0),
                gainedMaterials: cleanMaterials(exp.gainedMaterials),
                gainedExperience: num(exp.gainedExperience, 0),
                eventResolved: exp.eventResolved ?? false,
                skillUses: cleanBooleanRecord(exp.skillUses),
                seenEvents: Array.isArray(exp.seenEvents) ? exp.seenEvents.filter((item): item is string => typeof item === 'string') : [],
                enemyIntents: (exp.enemyIntents && typeof exp.enemyIntents === 'object') ? exp.enemyIntents : {},
                enemyCharge: cleanRecord(exp.enemyCharge),
              }
            : null,
      settings: {
        // 旧档（v12 及以下）字段为 moraleEnabled，新档为 pressureEnabled；读取时兼容迁移。
        pressureEnabled: typeof settingsObj.pressureEnabled === 'boolean' ? settingsObj.pressureEnabled : (typeof settingsObj.moraleEnabled === 'boolean' ? settingsObj.moraleEnabled : true),
        llmEnabled: typeof settingsObj.llmEnabled === 'boolean' ? settingsObj.llmEnabled : true,
      },
      log: Array.isArray(parsed.log) ? parsed.log.filter((line): line is string => typeof line === 'string').slice(0, 8) : [],
      materials: cleanMaterials(parsed.materials),
      hasAcceptedMission: parsed.hasAcceptedMission ?? false,
      day: num(parsed.day, 1),
      missionAcceptedToday: parsed.missionAcceptedToday ?? false,
      food: num(parsed.food, 5),
      hunger: num(parsed.hunger, 0),
      giftsGivenToday: cleanRecord(parsed.giftsGivenToday),
      // 区域威胁：旧档无字段时回退静态默认值；新档读取已存等级（缺失区域补默认）
      regions: { ...Object.fromEntries(regions.map((r) => [r.id, r.threat])), ...cleanThreatRecord(parsed.regions) },
      // 事件链：旧档无字段时按静态定义初始化
      eventChains: cleanEventChains(parsed.eventChains),
      settlement: (parsed.settlement && typeof parsed.settlement === 'object') ? parsed.settlement : null,
      dayReport: (parsed.dayReport && typeof parsed.dayReport === 'object') ? parsed.dayReport : null,
    };

    // 升级后清理旧版 key，避免下次再走迁移分支。
    if (parsed.version < 13) {
      try { localStorage.removeItem(V12_KEY); } catch { /* ignore */ }
    }
    return state;
  } catch (error) {
    console.warn('[storage] 存档字段迁移失败，已回退到新档。', error);
    return null;
  }
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let latestStateToSave: GameState | null = null;

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (error) {
    // iframe 可禁用存储，游戏仍可运行；记录原因便于排查。
    console.warn('[storage] 写入 localStorage 失败，本次进度未持久化。', error);
  }
}

export function saveGameDebounced(state: GameState, delayMs = 400): void {
  latestStateToSave = state;
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    if (latestStateToSave) {
      saveGame(latestStateToSave);
      saveTimeout = null;
      latestStateToSave = null;
    }
  }, delayMs);
}

export function flushSaveGame(): void {
  if (saveTimeout && latestStateToSave) {
    clearTimeout(saveTimeout);
    saveGame(latestStateToSave);
    saveTimeout = null;
    latestStateToSave = null;
  }
}

export function clearGame(): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
    latestStateToSave = null;
  }
  try {
    [KEY, V12_KEY, ...LEGACY_KEYS].forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.warn('[storage] 清理 localStorage 失败。', error);
  }
}

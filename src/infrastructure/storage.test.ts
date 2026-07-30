import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '../domain/model';
import { createInitialGame } from '../domain/gameEngine';
import { clearGame, loadGame, saveGame } from './storage';

const KEY = 'expedition-echoes.save.v12';
const V5_KEY = 'expedition-echoes.save.v5';
const V11_KEY = 'expedition-echoes.save.v11';

// 用 Map 模拟 localStorage，避免互相污染。
const makeStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
    clear: () => map.clear(),
    _dump: () => map,
  };
};

describe('存档加载与迁移', () => {
  let storage: ReturnType<typeof makeStorage>;
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  beforeEach(() => {
    storage = makeStorage();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    warnSpy.mockClear();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('无存档时返回 null', () => {
    expect(loadGame()).toBeNull();
  });

  it('保存后能完整加载当前版本存档', () => {
    const state = createInitialGame();
    saveGame(state);
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe(12);
    expect(loaded?.gold).toBe(state.gold);
    expect(loaded?.roster.length).toBe(state.roster.length);
    expect(loaded?.selectedHeroIds).toEqual(state.selectedHeroIds);
  });

  it('JSON 解析失败时返回 null 并记录警告', () => {
    storage.setItem(KEY, '{not valid json');
    expect(loadGame()).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toContain('JSON');
  });

  it('版本号超出支持范围时拒绝加载', () => {
    storage.setItem(KEY, JSON.stringify({ ...createInitialGame(), version: 99 }));
    expect(loadGame()).toBeNull();
    expect(warnSpy.mock.calls.some((call) => String(call[0]).includes('版本'))).toBe(true);
  });

  it('旧版存档字段缺失时使用默认值兜底，不崩溃', () => {
    // 模拟 V5 旧档：缺 day/food/hunger/giftsGivenToday 等字段，expedition.supplies 也缺 food。
    const legacy = {
      version: 5,
      page: 'town',
      gold: 80,
      roster: [{ id: 'lan', name: '岚', heroClass: 'vanguard', maxHp: 32, hp: 32, morale: 0, gearLevel: 0, recruited: true, personality: '谨慎', affinity: 0 }],
      selectedHeroIds: ['lan'],
      selectedMissionId: 'border-echoes',
      managementTab: 'party',
      expedition: {
        missionId: 'border-echoes',
        nodeIndex: 0,
        formation: ['lan'],
        enemies: [],
        supplies: { bandage: 1, sedative: 0 }, // 缺 food
        startSupplies: { bandage: 1 }, // 缺 food/sedative
        gainedGold: 0,
        gainedMaterials: {},
        gainedExperience: 0,
      },
      settings: { moraleEnabled: true, llmEnabled: true },
      log: [],
      materials: {},
      hasAcceptedMission: true,
    };
    storage.setItem(V5_KEY, JSON.stringify(legacy));

    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe(12);
    expect(loaded?.day).toBe(1); // 缺失字段使用默认
    expect(loaded?.food).toBe(5);
    expect(loaded?.hunger).toBe(0);
    expect(loaded?.expedition?.supplies.food).toBe(0); // 缺失字段兜底为 0
    expect(loaded?.expedition?.supplies.bandage).toBe(1);
    expect(loaded?.expedition?.startSupplies.sedative).toBe(0);
    // 加载后旧版 key 应被清理
    expect(storage.getItem(V5_KEY)).toBeNull();
  });

  it('材料库存 key 异常时被过滤', () => {
    const state = createInitialGame();
    state.materials = {
      'ruin-shard:0': 3,
      '__proto__:0': 999, // 应被丢弃（rarity 校验通过但 __proto__ 已被 Object.entries 跳过）
      'ruin-shard:abc': 5, // rarity 非数字，应被丢弃
      'ruin-shard:9': 1, // rarity 越界，应被丢弃
      '': 7, // 空 key，应被丢弃
    };
    saveGame(state);
    const loaded = loadGame();
    expect(loaded?.materials).toEqual({ 'ruin-shard:0': 3 });
  });

  it('inventory 中非数字值被过滤', () => {
    const state = createInitialGame();
    state.inventory = { bandage: 2, bad: 'x' as unknown as number, negative: -1, ok: 3 };
    saveGame(state);
    const loaded = loadGame();
    expect(loaded?.inventory.bandage).toBe(2);
    expect(loaded?.inventory.ok).toBe(3);
    expect(loaded?.inventory.bad).toBeUndefined();
    expect(loaded?.inventory.negative).toBeUndefined();
  });

  it('roster 字段缺失时使用默认值', () => {
    const state = createInitialGame();
    // 模拟旧档 hero 缺 level/experience
    const stripped = state.roster.map((hero) => {
      const { level, experience, equipment, affinity, preferredGiftTags, ...rest } = hero;
      void level; void experience; void equipment; void affinity; void preferredGiftTags;
      return rest;
    });
    const legacy = { ...state, version: 11, roster: stripped };
    storage.setItem(V11_KEY, JSON.stringify(legacy));

    const loaded = loadGame();
    expect(loaded?.roster[0].level).toBe(1);
    expect(loaded?.roster[0].experience).toBe(0);
    expect(loaded?.roster[0].equipment).toEqual({});
    expect(loaded?.roster[0].affinity).toBe(0);
    expect(loaded?.roster[0].preferredGiftTags).toEqual([]);
  });

  it('clearGame 清除所有版本 key', () => {
    const state = createInitialGame();
    saveGame(state);
    storage.setItem(V11_KEY, '{"version":11}');
    storage.setItem(V5_KEY, '{"version":5}');
    expect(storage._dump().size).toBeGreaterThan(0);
    clearGame();
    expect(storage.getItem(KEY)).toBeNull();
    expect(storage.getItem(V11_KEY)).toBeNull();
    expect(storage.getItem(V5_KEY)).toBeNull();
  });

  it('保存的 GameState 类型完整', () => {
    const state: GameState = {
      ...createInitialGame(),
      materials: { 'ruin-shard:2': 1 },
      settlement: {
        outcome: 'victory',
        consumedSupplies: { food: 1, bandage: 0, sedative: 0 },
        lootGold: 50,
        lootMaterials: { 'ruin-shard:0': 2 },
        gainedExperience: 30,
      },
    };
    saveGame(state);
    const loaded = loadGame();
    expect(loaded?.materials['ruin-shard:2']).toBe(1);
    expect(loaded?.settlement?.outcome).toBe('victory');
    expect(loaded?.settlement?.lootMaterials['ruin-shard:0']).toBe(2);
  });
});

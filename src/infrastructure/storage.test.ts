import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '../domain/model';
import { createInitialGame } from '../domain/gameEngine';
import { clearGame, loadGame, saveGame, saveGameDebounced, flushSaveGame } from './storage';

const KEY = 'expedition-echoes.save.v14';
const V13_KEY = 'expedition-echoes.save.v13';
const V12_KEY = 'expedition-echoes.save.v12';
const V3_KEY = 'expedition-echoes.save.v3';

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
    expect(loaded?.version).toBe(14);
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
    // 模拟 v12 旧档：缺 day/food/hunger/giftsGivenToday 等字段，expedition.supplies 也缺 food。
    const legacy = {
      version: 12,
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
    storage.setItem(V12_KEY, JSON.stringify(legacy));

    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe(14);
    expect(loaded?.day).toBe(1); // 缺失字段使用默认
    expect(loaded?.food).toBe(5);
    expect(loaded?.hunger).toBe(0);
    // 旧档 morale 字段迁移为 pressure
    expect(loaded?.roster[0].pressure).toBe(0);
    // 旧档 settings.moraleEnabled 迁移为 pressureEnabled
    expect(loaded?.settings.pressureEnabled).toBe(true);
    expect(loaded?.expedition?.supplies.food).toBe(0); // 缺失字段兜底为 0
    expect(loaded?.expedition?.supplies.bandage).toBe(1);
    expect(loaded?.expedition?.startSupplies.sedative).toBe(0);
    // 加载后旧版 key 应被清理
    expect(storage.getItem(V12_KEY)).toBeNull();
  });

  it('v12 旧档（morale 字段）迁移到 v13 pressure 字段', () => {
    const legacy = {
      ...createInitialGame(),
      version: 12,
      roster: createInitialGame().roster.map((hero) => ({ ...hero, morale: 42 }) as Record<string, unknown>),
      settings: { moraleEnabled: false, llmEnabled: true },
    };
    // 移除新字段，模拟真实 v12 存档结构
    legacy.roster = (legacy.roster as Record<string, unknown>[]).map(({ pressure, ...rest }) => rest);
    storage.setItem(V12_KEY, JSON.stringify(legacy));

    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe(14);
    expect(loaded?.roster[0].pressure).toBe(42);
    expect((loaded?.roster[0] as unknown as Record<string, unknown>).morale).toBeUndefined();
    expect(loaded?.settings.pressureEnabled).toBe(false);
    // 迁移后旧版 key 被清理
    expect(storage.getItem(V12_KEY)).toBeNull();
  });

  it('v13 旧档迁移到 v14：缺少 lastExpedition 时视为无记录，不崩溃', () => {
    const legacy = {
      ...createInitialGame(),
      version: 13,
    };
    // 移除 v14 新增的可选字段，模拟真实 v13 存档结构
    const { lastExpedition: _removed, ...rest } = legacy;
    void _removed;
    storage.setItem(V13_KEY, JSON.stringify(rest));

    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe(14);
    // lastExpedition 是可选字段：旧档无记录 → undefined
    expect(loaded?.lastExpedition).toBeUndefined();
    // 其余字段正常迁移
    expect(loaded?.gold).toBe(100);
    // 迁移后旧版 key 被清理
    expect(storage.getItem(V13_KEY)).toBeNull();
  });

  it('v14 存档中的 lastExpedition 能完整保存并加载', () => {
    const state: GameState = {
      ...createInitialGame(),
      lastExpedition: {
        outcome: 'victory',
        missionId: 'border-echoes',
        choices: ['supply-room:scavenge'],
        goldGained: 50,
        materialsGained: 2,
        nodeReached: 6,
      },
    };
    saveGame(state);
    const loaded = loadGame();
    expect(loaded?.version).toBe(14);
    expect(loaded?.lastExpedition).toEqual({
      outcome: 'victory',
      missionId: 'border-echoes',
      choices: ['supply-room:scavenge'],
      goldGained: 50,
      materialsGained: 2,
      nodeReached: 6,
    });
  });

  it('lastExpedition 字段非法时回退为 undefined', () => {
    const state = { ...createInitialGame(), lastExpedition: { outcome: 'bogus', choices: 123 } as unknown as GameState['lastExpedition'] };
    saveGame(state);
    const loaded = loadGame();
    expect(loaded?.lastExpedition).toBeUndefined();
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
    const legacy = { ...state, version: 12, roster: stripped };
    storage.setItem(V12_KEY, JSON.stringify(legacy));

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
    storage.setItem(V13_KEY, '{"version":13}');
    storage.setItem(V12_KEY, '{"version":12}');
    storage.setItem(V3_KEY, '{"version":3}');
    expect(storage._dump().size).toBeGreaterThan(0);
    clearGame();
    expect(storage.getItem(KEY)).toBeNull();
    expect(storage.getItem(V13_KEY)).toBeNull();
    expect(storage.getItem(V12_KEY)).toBeNull();
    expect(storage.getItem(V3_KEY)).toBeNull();
  });

  it('保存的 GameState 类型完整', () => {
    const state: GameState = {
      ...createInitialGame(),
      materials: { 'ruin-shard:2': 1 },
      settlement: {
        outcome: 'victory',
        consumedSupplies: { food: 1, bandage: 0, sedative: 0, fireBomb: 0, shieldElixir: 0 },
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

  it('当存档中缺失 initialHeroes 的某个英雄时，加载时能自动补充', () => {
    const state = createInitialGame();
    // 过滤掉 'cheng' 和 'yan'
    state.roster = state.roster.filter((hero) => hero.id !== 'cheng' && hero.id !== 'yan');
    saveGame(state);
    
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    // 应该被自动补全
    expect(loaded?.roster.some((hero) => hero.id === 'cheng')).toBe(true);
    expect(loaded?.roster.some((hero) => hero.id === 'yan')).toBe(true);
  });

  describe('存档防抖 (Debounce)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('调用 saveGameDebounced 时不会立即写入 localStorage，时间推进后才写入，且多次调用只写最后一次', () => {
      const state1 = { ...createInitialGame(), gold: 500 };
      const state2 = { ...createInitialGame(), gold: 999 };

      saveGameDebounced(state1, 400);
      expect(storage.getItem(KEY)).toBeNull(); // 尚未写入

      // 200ms 后依然未写入
      vi.advanceTimersByTime(200);
      expect(storage.getItem(KEY)).toBeNull();

      // 在 400ms 内再次调用，重置计时器并更新写入内容
      saveGameDebounced(state2, 400);

      // 再过 300ms (累计 500ms)，因为重置了 400ms 计时器，所以应该仍然没有写入
      vi.advanceTimersByTime(300);
      expect(storage.getItem(KEY)).toBeNull();

      // 再过 100ms (累计 600ms，距第二次调用满 400ms)，触发写入，且内容是第二次的 state2
      vi.advanceTimersByTime(100);
      const loaded = loadGame();
      expect(loaded).not.toBeNull();
      expect(loaded?.gold).toBe(999);
    });

    it('调用 flushSaveGame 时应立刻写入最新的挂起状态，且清除后续定时器', () => {
      const state = { ...createInitialGame(), gold: 777 };

      saveGameDebounced(state, 400);
      expect(storage.getItem(KEY)).toBeNull();

      // 立即刷入
      flushSaveGame();
      const loaded = loadGame();
      expect(loaded).not.toBeNull();
      expect(loaded?.gold).toBe(777);

      // 清理存储以检查定时器是否被撤销
      storage.clear();

      // 推进 500ms，不应再次触发写入
      vi.advanceTimersByTime(500);
      expect(storage.getItem(KEY)).toBeNull();
    });
  });
});

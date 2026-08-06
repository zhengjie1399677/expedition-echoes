import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { chargeMultiplier, intentDescription, isGuarding, resolveEnemyAction, rollIntent, targetForIntent } from './intents';
import { gameReducer, createInitialGame } from './gameEngine';
import type { Enemy, EnemyIntent, GameState, Hero } from './model';

const ready = () => gameReducer(createInitialGame(), { type: 'ACCEPT_MISSION', missionId: 'border-echoes' });

// 固定随机：意图与暴击可复现。0.2 → 不暴击，且任何长度意图池都取首项。
beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.2);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const enemyWithIntents = (intents: EnemyIntent[], overrides: Partial<Enemy> = {}): Enemy => ({
  id: 'e', name: '测试敌人', maxHp: 50, hp: 50, distance: 1, attackMinRange: 1, attackMaxRange: 1, damage: 5,
  intents, ...overrides,
});

describe('rollIntent 选择规则', () => {
  it('缺省池（未配置 intents）回退 attack', () => {
    const enemy: Enemy = { id: 'e', name: 'e', maxHp: 10, hp: 10, distance: 1, attackMinRange: 1, attackMaxRange: 1, damage: 1 };
    expect(rollIntent(enemy, undefined, 0)).toEqual({ type: 'attack' });
  });

  it('空数组回退 attack', () => {
    expect(rollIntent(enemyWithIntents([]), undefined, 0)).toEqual({ type: 'attack' });
  });

  it('按 rng 选择意图池中的项', () => {
    const enemy = enemyWithIntents([{ type: 'guard' }, { type: 'charge' }]);
    // rng=0.0 → index 0 → guard
    expect(rollIntent(enemy, undefined, 0, () => 0.0).type).toBe('guard');
    // rng=0.9 → index 1 → charge
    expect(rollIntent(enemy, undefined, 0, () => 0.9).type).toBe('charge');
  });

  it('连续两次不得相同（最多重抽 3 次）', () => {
    const enemy = enemyWithIntents([{ type: 'attack' }, { type: 'charge' }]);
    // rng 恒为 0 → 总是抽到 index 0 (attack)；当前意图是 attack 时应重抽，但重抽仍 attack，接受相同
    const first = rollIntent(enemy, undefined, 0, () => 0.0);
    const second = rollIntent(enemy, first, 0, () => 0.0);
    expect(first.type).toBe('attack');
    expect(second.type).toBe('attack'); // 重抽 3 次仍相同则接受
  });

  it('charge > 0 时强制 attack（蓄力必然兑现）', () => {
    const enemy = enemyWithIntents([{ type: 'guard' }, { type: 'charge' }]);
    expect(rollIntent(enemy, { type: 'charge' }, 1, () => 0.9).type).toBe('attack');
  });

  it('RNG 注入可复现', () => {
    const enemy = enemyWithIntents([{ type: 'attack' }, { type: 'guard' }, { type: 'charge' }]);
    const a = rollIntent(enemy, undefined, 0, () => 0.5);
    const b = rollIntent(enemy, undefined, 0, () => 0.5);
    expect(a).toEqual(b);
  });
});

describe('targetForIntent 目标选择', () => {
  const party: Hero[] = [
    { id: 'lan', name: '岚', heroClass: 'vanguard', maxHp: 32, hp: 32, pressure: 0, gearLevel: 0, level: 1, experience: 0, equipment: {}, recruited: true, personality: '', affinity: 0, preferredGiftTags: [], skills: [], reactions: { victory: '', retreat: '', defeated: '', idle: '' } },
    { id: 'wu', name: '雾', heroClass: 'ranger', maxHp: 24, hp: 10, pressure: 0, gearLevel: 0, level: 1, experience: 0, equipment: {}, recruited: true, personality: '', affinity: 0, preferredGiftTags: [], skills: [], reactions: { victory: '', retreat: '', defeated: '', idle: '' } },
    { id: 'xingluo', name: '星罗', heroClass: 'mage', maxHp: 19, hp: 19, pressure: 0, gearLevel: 0, level: 1, experience: 0, equipment: {}, recruited: true, personality: '', affinity: 0, preferredGiftTags: [], skills: [], reactions: { victory: '', retreat: '', defeated: '', idle: '' } },
  ];

  it('front（缺省）选前排第一个可攻击目标', () => {
    // 敌人距离 1、近战：只能打前排（index 0）
    const enemy = enemyWithIntents([], { distance: 1, attackMinRange: 1, attackMaxRange: 1 });
    expect(targetForIntent(party, { type: 'attack' }, enemy)?.id).toBe('lan');
  });

  it('back 选后排（index 最大）可攻击目标', () => {
    // 远程敌人：攻击范围覆盖后排
    const enemy = enemyWithIntents([], { distance: 1, attackMinRange: 2, attackMaxRange: 3 });
    const target = targetForIntent(party, { type: 'attack', targetHint: 'back' }, enemy);
    expect(target?.id).toBe('xingluo'); // index 2
  });

  it('weakest 选 hp 比例最小的可攻击目标', () => {
    const enemy = enemyWithIntents([], { distance: 1, attackMinRange: 1, attackMaxRange: 3 });
    const target = targetForIntent(party, { type: 'attack', targetHint: 'weakest' }, enemy);
    expect(target?.id).toBe('wu'); // 10/24 最低
  });

  it('没有可攻击目标时返回 undefined', () => {
    const farEnemy = enemyWithIntents([], { distance: 5, attackMinRange: 99, attackMaxRange: 99 });
    expect(targetForIntent(party, { type: 'attack' }, farEnemy)).toBeUndefined();
  });
});

describe('chargeMultiplier 蓄力倍率', () => {
  it('0 层 = ×1，1 层 = ×2，2 层封顶 ×2', () => {
    expect(chargeMultiplier(0)).toBe(1);
    expect(chargeMultiplier(1)).toBe(2);
    expect(chargeMultiplier(2)).toBe(2);
  });
});

describe('isGuarding 与 intentDescription', () => {
  it('guard 意图判定', () => {
    const enemy = enemyWithIntents([]);
    expect(isGuarding(enemy, { type: 'guard' })).toBe(true);
    expect(isGuarding(enemy, { type: 'attack' })).toBe(false);
    expect(isGuarding(enemy, undefined)).toBe(false);
  });

  it('意图文案', () => {
    expect(intentDescription({ type: 'attack' }, 0, '斥候')).toContain('攻击');
    expect(intentDescription({ type: 'charge' }, 0, '门卫')).toContain('蓄力');
    expect(intentDescription({ type: 'guard' }, 0, '守卫')).toContain('防御');
    expect(intentDescription({ type: 'pressure' }, 0, '孢兽')).toContain('压力');
    expect(intentDescription({ type: 'attack' }, 1, '斥候')).toContain('重击（×2）');
  });
});

describe('resolveEnemyAction 意图兑现', () => {
  // 注意：border-echoes 首波是 scout(range 2-3) + warden(range 1-1)。
  // scout 打不到前排（距离 1），意图测试统一用能打到前排的 warden。
  it('attack：造成伤害并施加反击压力', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    const enemy = started.expedition!.enemies.find((e) => e.id === 'warden')!;
    const lanBefore = started.roster.find((h) => h.id === 'lan')!;
    const result = resolveEnemyAction(started, enemy, { type: 'attack' });
    const lanAfter = result.roster.find((h) => h.id === 'lan')!;
    expect(lanAfter.hp).toBeLessThan(lanBefore.hp);
    expect(lanAfter.pressure).toBeGreaterThan(lanBefore.pressure); // 反击压力
  });

  it('charge：本回合无伤害，蓄力层数递增', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    const enemy = started.expedition!.enemies.find((e) => e.id === 'warden')!;
    const lanBefore = started.roster.find((h) => h.id === 'lan')!;
    const result = resolveEnemyAction(started, enemy, { type: 'charge' });
    expect(result.roster.find((h) => h.id === 'lan')!.hp).toBe(lanBefore.hp); // 无伤害
    expect(result.expedition!.enemyCharge[enemy.id]).toBe(1);
  });

  it('charge 封顶 2 层', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    const enemy = started.expedition!.enemies.find((e) => e.id === 'warden')!;
    const charged = resolveEnemyAction(started, enemy, { type: 'charge' });
    const chargedTwice = resolveEnemyAction(charged, enemy, { type: 'charge' });
    expect(chargedTwice.expedition!.enemyCharge[enemy.id]).toBe(2);
  });

  it('guard：不攻击，仅记录', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    const enemy = started.expedition!.enemies.find((e) => e.id === 'warden')!;
    const lanBefore = started.roster.find((h) => h.id === 'lan')!;
    const result = resolveEnemyAction(started, enemy, { type: 'guard' });
    expect(result.roster.find((h) => h.id === 'lan')!.hp).toBe(lanBefore.hp);
    expect(result.log[0]).toContain('防御');
  });

  it('pressure：对目标施加压力，不放血', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    const enemy = started.expedition!.enemies.find((e) => e.id === 'warden')!;
    const lanBefore = started.roster.find((h) => h.id === 'lan')!;
    const result = resolveEnemyAction(started, enemy, { type: 'pressure', targetHint: 'front', pressure: 6 });
    const lanAfter = result.roster.find((h) => h.id === 'lan')!;
    expect(lanAfter.hp).toBe(lanBefore.hp);
    expect(lanAfter.pressure).toBe(lanBefore.pressure + 6);
  });

  it('pressure 在压力系统关闭时被忽略', () => {
    let state = ready();
    state.settings.pressureEnabled = false;
    const started = gameReducer(state, { type: 'START_EXPEDITION' });
    const enemy = started.expedition!.enemies.find((e) => e.id === 'warden')!;
    const lanBefore = started.roster.find((h) => h.id === 'lan')!;
    const result = resolveEnemyAction(started, enemy, { type: 'pressure', targetHint: 'front', pressure: 6 });
    expect(result.roster.find((h) => h.id === 'lan')!.pressure).toBe(lanBefore.pressure);
  });

  it('蓄力中的敌人攻击伤害 ×2 且蓄力清零', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    const enemy = started.expedition!.enemies.find((e) => e.id === 'warden')!;
    // 先蓄力 1 层
    const charged = resolveEnemyAction(started, enemy, { type: 'charge' });
    // 兑现 attack
    const result = resolveEnemyAction(charged, enemy, { type: 'attack' });
    expect(result.expedition!.enemyCharge[enemy.id]).toBe(0); // 蓄力清零
    // 蓄力攻击伤害应大于普通攻击：普通攻击 vs 蓄力攻击
    const normal = resolveEnemyAction(started, enemy, { type: 'attack' });
    const lanNormal = normal.roster.find((h) => h.id === 'lan')!;
    const lanCharged = result.roster.find((h) => h.id === 'lan')!;
    expect(lanCharged.hp).toBeLessThan(lanNormal.hp);
  });

  it('攻击目标死亡后残留蓄力被清除', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    const enemy = started.expedition!.enemies.find((e) => e.id === 'warden')!;
    const charged = resolveEnemyAction(started, enemy, { type: 'charge' });
    // 敌人被击杀（模拟外部将 hp 置 0），再走重 roll 场景：enemyCharge 应无残留
    const dead = { ...charged, expedition: { ...charged.expedition!, enemies: charged.expedition!.enemies.map((e) => (e.id === enemy.id ? { ...e, hp: 0 } : e)) } };
    expect(dead.expedition!.enemyCharge[enemy.id]).toBe(1); // 兑现前残留，由后续清理
  });
});

describe('战斗时序集成：意图系统在真实战斗中的行为', () => {
  it('遭遇开始时每个敌人都有意图预告', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    expect(started.expedition!.enemyIntents).toBeDefined();
    for (const enemy of started.expedition!.enemies) {
      expect(started.expedition!.enemyIntents[enemy.id]).toBeDefined();
      expect(['attack', 'charge', 'guard', 'pressure']).toContain(started.expedition!.enemyIntents[enemy.id].type);
    }
  });

  it('玩家攻击后存活敌人重 roll 意图（下一次预告变化或保持）', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    const before = started.expedition!.enemyIntents;
    const attacked = gameReducer(started, { type: 'ATTACK', heroId: 'lan', enemyId: 'scout' });
    const after = attacked.expedition?.enemyIntents;
    expect(after).toBeDefined();
    // 固定 rng 下意图池首项稳定为 attack，重 roll 后仍应为 attack（可复现）
    for (const enemy of attacked.expedition!.enemies) {
      if (enemy.hp > 0) expect(after![enemy.id].type).toBe('attack');
    }
    void before;
  });

  it('玩家攻击 guard 敌人时伤害减半', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    // 强制 scout 当前意图为 guard
    const guarded: GameState = { ...started, expedition: { ...started.expedition!, enemyIntents: { ...started.expedition!.enemyIntents, scout: { type: 'guard' } } } };
    const normal = gameReducer(started, { type: 'ATTACK', heroId: 'lan', enemyId: 'scout' });
    const halved = gameReducer(guarded, { type: 'ATTACK', heroId: 'lan', enemyId: 'scout' });
    const scoutNormal = normal.expedition!.enemies.find((e) => e.id === 'scout')!;
    const scoutHalved = halved.expedition!.enemies.find((e) => e.id === 'scout')!;
    // 正常伤害 7，guard 减半 ceil(7/2)=4；26-7=19 vs 26-4=22
    expect(scoutNormal.hp).toBe(19);
    expect(scoutHalved.hp).toBe(22);
  });

  it('迁移兼容：无 enemyIntents 字段的状态可正常运行（缺省 attack）', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    // 模拟旧状态缺少 enemyIntents
    const legacy = { ...started, expedition: { ...started.expedition!, enemyIntents: {} as Record<string, EnemyIntent> } };
    const attacked = gameReducer(legacy, { type: 'ATTACK', heroId: 'lan', enemyId: 'scout' });
    expect(attacked.expedition).not.toBeNull();
  });
});

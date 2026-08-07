import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { gameReducer, createInitialGame } from './gameEngine';

const ready = () => gameReducer(createInitialGame(), { type: 'ACCEPT_MISSION', missionId: 'border-echoes' });

// 固定随机：0.2 → 不暴击（≥0.12）且 rollIntent 全取意图池首项（attack），保证敌人行为确定。
beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.2);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('战术道具与暴击机制测试', () => {
  it('暴击机制：12% 几率下触发 1.5 倍伤害', () => {
    // 1. Mock Math.random() to return 0.05 (trigger critical hit)
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.05);
    
    let state = ready();
    // Give hero enough health to survive any counter-attacks
    state.roster = state.roster.map(h => ({ ...h, hp: 99, maxHp: 99 }));
    let started = gameReducer(state, { type: 'START_EXPEDITION', supplies: { food: 1, bandage: 0, sedative: 0 } });
    
    // Regular attack. Lan base damage is 8 (gear level 0: attack=6, spear weapon equipped gives +2 attack = 8).
    // Enemy scout trait is not rock-armor, so damage reduction is 0.
    // 1.5x of 8 is 12.
    const critAttack = gameReducer(started, { type: 'ATTACK', heroId: 'lan', enemyId: 'scout' });
    const scoutAfterCrit = critAttack.expedition?.enemies.find(e => e.id === 'scout')!;
    // Scout initial hp is 26. 26 - 11 = 15.
    expect(scoutAfterCrit.hp).toBe(15);
    expect(critAttack.log[0]).toContain('暴击！');

    // 2. Mock Math.random() to return 0.50 (no critical hit)
    randomSpy.mockReturnValue(0.50);
    const regularAttack = gameReducer(started, { type: 'ATTACK', heroId: 'lan', enemyId: 'scout' });
    const scoutAfterRegular = regularAttack.expedition?.enemies.find(e => e.id === 'scout')!;
    // 26 - 7 = 19.
    expect(scoutAfterRegular.hp).toBe(19);
    expect(regularAttack.log[0]).not.toContain('暴击！');

    randomSpy.mockRestore();
  });

  it('火焰瓶：无视防御造成 8 点真实伤害，正确消耗且能打败敌人并触发结算', () => {
    let state = ready();
    // Add fire-bomb to town inventory
    state.inventory['fire-bomb'] = 10;
    
    let started = gameReducer(state, { type: 'START_EXPEDITION', supplies: { food: 1, bandage: 0, sedative: 0, fireBomb: 2 } });
    expect(started.expedition?.supplies.fireBomb).toBe(2);
    expect(started.inventory['fire-bomb']).toBe(8);

    // Scout has 26 HP. Fire bomb deals 8 damage.
    const usedOne = gameReducer(started, { type: 'USE_FIRE_BOMB', heroId: 'lan', enemyId: 'scout' });
    expect(usedOne.expedition?.supplies.fireBomb).toBe(1);
    const scout = usedOne.expedition?.enemies.find(e => e.id === 'scout')!;
    expect(scout.hp).toBe(18);
    expect(usedOne.log[0]).toContain('投掷火焰瓶');

    // Let's set scout HP to 5 and throw the second fire bomb to kill it
    let nearDeathState = {
      ...usedOne,
      expedition: {
        ...usedOne.expedition!,
        enemies: usedOne.expedition!.enemies.map(e => e.id === 'scout' ? { ...e, hp: 5 } : e)
      }
    };
    const killedOne = gameReducer(nearDeathState, { type: 'USE_FIRE_BOMB', heroId: 'lan', enemyId: 'scout' });
    const scoutDead = killedOne.expedition?.enemies.find(e => e.id === 'scout')!;
    expect(scoutDead.hp).toBe(0);
    
    // If warden is also dead, it triggers end of combat. Let's make all enemies dead:
    let allNearDeathState = {
      ...usedOne,
      expedition: {
        ...usedOne.expedition!,
        enemies: usedOne.expedition!.enemies.map(e => ({ ...e, hp: 5 }))
      }
    };
    // Kill scout (first enemy)
    const killedScout = gameReducer(allNearDeathState, { type: 'USE_FIRE_BOMB', heroId: 'lan', enemyId: 'scout' });
    // Scout is dead but Warden is still alive (5 HP). So combat is not over.
    expect(killedScout.expedition?.enemies.every(e => e.hp <= 0)).toBe(false);

    // Now kill Warden (second enemy) using another fire bomb (let's add 1 fireBomb supply for mock testing)
    let oneLeftState = {
      ...killedScout,
      expedition: {
        ...killedScout.expedition!,
        supplies: {
          ...killedScout.expedition!.supplies,
          fireBomb: 1
        }
      }
    };
    const combatOver = gameReducer(oneLeftState, { type: 'USE_FIRE_BOMB', heroId: 'lan', enemyId: 'warden' });
    // Combat is over because all enemies are dead.
    expect(combatOver.expedition?.enemies.every(e => e.hp <= 0)).toBe(true);
    expect(combatOver.expedition?.gainedGold).toBeGreaterThan(0);
  });

  it('铁壁药丸：防御力提升并正确消耗，伤害减免 3 点，进入新节点时自动清除', () => {
    let state = ready();
    state.inventory['shield-elixir'] = 10;
    
    let started = gameReducer(state, { type: 'START_EXPEDITION', supplies: { food: 2, bandage: 0, sedative: 0, shieldElixir: 1 } });
    expect(started.expedition?.supplies.shieldElixir).toBe(1);
    expect(started.inventory['shield-elixir']).toBe(9);

    // Apply shield elixir to Lan
    const used = gameReducer(started, { type: 'USE_SHIELD_ELIXIR', heroId: 'lan' });
    expect(used.expedition?.supplies.shieldElixir).toBe(0);
    expect(used.expedition?.shieldBuffs.lan).toBe(true);
    expect(used.log[0]).toContain('服下铁壁药丸');

    // Lan is Vanguard (index 0). Base HP is 32.
    // Enemy warden attacks Lan. Warden damage is 5.
    // Lan has gear level 0 (defense = 0), spear equipped (+0 defense).
    // Lan is Vanguard at front row, damageRed is 1.
    // Shield elixir bonus is 3.
    // incomingDmg = Math.max(1, 5 - 0 - 1 (vanguard red) - 3 (shield elixir)) = Math.max(1, 1) = 1.
    // So Lan takes exactly 1 damage (instead of 4 damage).
    // Let's test this by attacking warden to trigger counterattack.
    // We will set warden HP high to survive player attack.
    let prepCombat = {
      ...used,
      roster: used.roster.map(h => h.id === 'lan' ? { ...h, hp: 32 } : h),
      expedition: {
        ...used.expedition!,
        enemies: used.expedition!.enemies.map(e => e.id === 'warden' ? { ...e, hp: 50 } : e)
      }
    };
    // Mock random to prevent critical hit
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const attacked = gameReducer(prepCombat, { type: 'ATTACK', heroId: 'lan', enemyId: 'warden' });
    const lan = attacked.roster.find(h => h.id === 'lan')!;
    expect(lan.hp).toBe(31); // 32 - 1 = 31 (takes 1 damage)

    // Without shield elixir (control test)
    let prepCombatNoShield = {
      ...started,
      roster: started.roster.map(h => h.id === 'lan' ? { ...h, hp: 32 } : h),
      expedition: {
        ...started.expedition!,
        enemies: started.expedition!.enemies.map(e => e.id === 'warden' ? { ...e, hp: 50 } : e)
      }
    };
    const attackedNoShield = gameReducer(prepCombatNoShield, { type: 'ATTACK', heroId: 'lan', enemyId: 'warden' });
    const lanNoShield = attackedNoShield.roster.find(h => h.id === 'lan')!;
    expect(lanNoShield.hp).toBe(28); // 32 - 4 = 28 (takes 4 damage)

    // Verify shield buffs are cleared on ADVANCE
    let beatEnemies = {
      ...attacked,
      expedition: {
        ...attacked.expedition!,
        enemies: attacked.expedition!.enemies.map(e => ({ ...e, hp: 0 }))
      }
    };
    const nextNode = gameReducer(beatEnemies, { type: 'ADVANCE' });
    expect(nextNode.expedition?.shieldBuffs.lan).toBeUndefined();

    randomSpy.mockRestore();
  });
});

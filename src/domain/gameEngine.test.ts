import { describe, expect, it } from 'vitest';
import { attackDamage, canAttack, createInitialGame, gameReducer } from './gameEngine';

describe('职业攻击距离', () => {
  const state = createInitialGame();
  const vanguard = state.roster.find((hero) => hero.id === 'lan')!;
  const mage = state.roster.find((hero) => hero.id === 'xingluo')!;
  it('先锋只能攻击距离 1', () => { expect(canAttack(vanguard, { id: 'a', name: '目标', hp: 1, maxHp: 1, range: 1, damage: 1 })).toBe(true); expect(canAttack(vanguard, { id: 'a', name: '目标', hp: 1, maxHp: 1, range: 2, damage: 1 })).toBe(false); });
  it('术士无法攻击贴身目标', () => { expect(canAttack(mage, { id: 'a', name: '目标', hp: 1, maxHp: 1, range: 1, damage: 1 })).toBe(false); expect(canAttack(mage, { id: 'a', name: '目标', hp: 1, maxHp: 1, range: 3, damage: 1 })).toBe(true); });
});

describe('士气与装备', () => {
  it('动摇降低 2 点攻击，关闭士气后不生效', () => { const hero = { ...createInitialGame().roster[0], morale: 50, gearLevel: 1 }; expect(attackDamage(hero, true)).toBe(6); expect(attackDamage(hero, false)).toBe(8); });
  it('装备只能在有足够金币时升级', () => { const initial = createInitialGame(); const upgraded = gameReducer(initial, { type: 'UPGRADE_GEAR', heroId: 'lan' }); expect(upgraded.roster[0].gearLevel).toBe(1); expect(upgraded.gold).toBe(70); });
});

describe('完整远征状态', () => {
  it('两人以上可以进入首个战斗节点', () => { const started = gameReducer(createInitialGame(), { type: 'START_EXPEDITION' }); expect(started.page).toBe('expedition'); expect(started.expedition?.nodeIndex).toBe(0); expect(started.expedition?.enemy?.id).toBe('scout'); });
  it('击败敌人前不能前进', () => { const started = gameReducer(createInitialGame(), { type: 'START_EXPEDITION' }); const blocked = gameReducer(started, { type: 'ADVANCE' }); expect(blocked.expedition?.nodeIndex).toBe(0); });
  it('绷带会治疗指定角色并消耗数量', () => { let state = gameReducer(createInitialGame(), { type: 'START_EXPEDITION' }); state = { ...state, roster: state.roster.map((hero) => hero.id === 'lan' ? { ...hero, hp: 10 } : hero) }; const healed = gameReducer(state, { type: 'USE_BANDAGE', heroId: 'lan' }); expect(healed.roster[0].hp).toBe(19); expect(healed.expedition?.supplies.bandage).toBe(2); });
});

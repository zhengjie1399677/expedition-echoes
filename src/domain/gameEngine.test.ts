import { describe, expect, it } from 'vitest';
import { attackDamage, availableItemCount, canAttack, createInitialGame, enemyCanAttack, equipmentBonuses, experienceToNextLevel, gainExperience, gameReducer } from './gameEngine';
import type { Enemy } from './model';

const target = (distance: number): Enemy => ({ id: 'a', name: '目标', hp: 1, maxHp: 1, distance, attackMinRange: 1, attackMaxRange: 3, damage: 1 });

describe('双方攻击距离', () => {
  const state = createInitialGame();
  const vanguard = state.roster.find((hero) => hero.id === 'lan')!;
  const mage = state.roster.find((hero) => hero.id === 'xingluo')!;
  it('先锋只能攻击距离 1', () => { expect(canAttack(vanguard, target(1))).toBe(true); expect(canAttack(vanguard, target(2))).toBe(false); });
  it('队员站位会增加实际攻击距离', () => { expect(canAttack(vanguard, target(1), 0)).toBe(true); expect(canAttack(vanguard, target(1), 1)).toBe(false); expect(canAttack(mage, target(1), 1)).toBe(true); });
  it('术士无法攻击贴身目标', () => { expect(canAttack(mage, target(1))).toBe(false); expect(canAttack(mage, target(3))).toBe(true); });
  it('近战怪物只能攻击前排', () => { const enemy = { ...target(1), attackMinRange: 1, attackMaxRange: 1 }; expect(enemyCanAttack(enemy, 0)).toBe(true); expect(enemyCanAttack(enemy, 1)).toBe(false); });
  it('远程怪物只攻击覆盖范围内的站位', () => { const enemy = { ...target(2), attackMinRange: 2, attackMaxRange: 3 }; expect(enemyCanAttack(enemy, 0)).toBe(true); expect(enemyCanAttack(enemy, 1)).toBe(true); expect(enemyCanAttack(enemy, 2)).toBe(false); });
});

describe('士气与装备', () => {
  it('动摇降低 2 点攻击，关闭士气后不生效', () => { const hero = { ...createInitialGame().roster[0], morale: 50, gearLevel: 1 }; expect(attackDamage(hero, true)).toBe(6); expect(attackDamage(hero, false)).toBe(8); });
  it('装备只能在有足够金币时升级', () => { const initial = createInitialGame(); const upgraded = gameReducer(initial, { type: 'UPGRADE_GEAR', heroId: 'lan' }); expect(upgraded.roster[0].gearLevel).toBe(1); expect(upgraded.gold).toBe(70); });
});

describe('等级与经验', () => {
  it('一级升二级需要 30 经验', () => { expect(experienceToNextLevel(1)).toBe(30); });
  it('升级会保留溢出经验并提高、补充生命', () => { const hero = { ...createInitialGame().roster[0], hp: 20 }; const leveled = gainExperience(hero, 35); expect(leveled.level).toBe(2); expect(leveled.experience).toBe(5); expect(leveled.maxHp).toBe(35); expect(leveled.hp).toBe(23); });
  it('击败敌人时出征队伍全员获得经验', () => { const started = gameReducer(createInitialGame(), { type: 'START_EXPEDITION' }); const weakened = { ...started, expedition: { ...started.expedition!, enemies: started.expedition!.enemies.map((enemy, index) => index === 0 ? { ...enemy, hp: 1 } : enemy) } }; const result = gameReducer(weakened, { type: 'ATTACK', heroId: 'lan', enemyId: 'scout' }); const party = result.roster.filter((hero) => result.expedition!.formation.includes(hero.id)); expect(party.every((hero) => hero.experience > 0)).toBe(true); });
});

describe('队伍、背包与装备', () => {
  it('可以调整出征站位顺序', () => { const state = createInitialGame(); const moved = gameReducer(state, { type: 'MOVE_PARTY', index: 0, direction: 1 }); expect(moved.selectedHeroIds).toEqual(['wu', 'lan', 'xingluo']); });
  it('装备会占用背包数量并提供属性', () => { const state = createInitialGame(); const equipped = gameReducer(state, { type: 'EQUIP_ITEM', heroId: 'lan', itemId: 'vanguard-spear' }); const lan = equipped.roster.find((hero) => hero.id === 'lan')!; expect(lan.equipment.weapon).toBe('vanguard-spear'); expect(equipmentBonuses(lan).attack).toBe(2); expect(availableItemCount(equipped, 'vanguard-spear')).toBe(0); });
  it('职业不匹配时不能装备专属武器', () => { const state = createInitialGame(); const result = gameReducer(state, { type: 'EQUIP_ITEM', heroId: 'wu', itemId: 'vanguard-spear' }); expect(result.roster.find((hero) => hero.id === 'wu')?.equipment.weapon).toBeUndefined(); });
  it('远征携带背包补给，撤退时返还剩余数量', () => { const initial = createInitialGame(); const started = gameReducer(initial, { type: 'START_EXPEDITION' }); expect(started.inventory.bandage).toBe(2); expect(started.expedition?.supplies.bandage).toBe(3); const retreated = gameReducer(started, { type: 'RETREAT' }); expect(retreated.inventory.bandage).toBe(5); expect(retreated.expedition).toBeNull(); });
});

describe('完整远征状态', () => {
  it('两人以上可以进入首个多敌人战斗节点', () => { const started = gameReducer(createInitialGame(), { type: 'START_EXPEDITION' }); expect(started.page).toBe('expedition'); expect(started.expedition?.nodeIndex).toBe(0); expect(started.expedition?.enemies.map((enemy) => enemy.id)).toEqual(['scout', 'warden']); });
  it('首战先锋在前排可以攻击，远程斥候不能反击前排', () => { const started = gameReducer(createInitialGame(), { type: 'START_EXPEDITION' }); const scout = started.expedition!.enemies[0]; const vanguard = started.roster.find((hero) => hero.id === 'lan')!; expect(canAttack(vanguard, scout, 0)).toBe(true); expect(enemyCanAttack(scout, 0)).toBe(false); expect(enemyCanAttack(scout, 1)).toBe(true); });
  it('攻击会伤害指定敌人而非默认目标', () => { const started = gameReducer(createInitialGame(), { type: 'START_EXPEDITION' }); const attacked = gameReducer(started, { type: 'ATTACK', heroId: 'lan', enemyId: 'warden' }); expect(attacked.expedition?.enemies.find((enemy) => enemy.id === 'warden')?.hp).toBeLessThan(34); expect(attacked.expedition?.enemies.find((enemy) => enemy.id === 'scout')?.hp).toBe(26); });
  it('可连续击败两个敌人并进入下一节点', () => { const started = gameReducer(createInitialGame(), { type: 'START_EXPEDITION' }); const weakened = { ...started, expedition: { ...started.expedition!, enemies: started.expedition!.enemies.map((enemy) => ({ ...enemy, hp: 1 })) } }; const firstDown = gameReducer(weakened, { type: 'ATTACK', heroId: 'lan', enemyId: 'scout' }); const secondDown = gameReducer(firstDown, { type: 'ATTACK', heroId: 'lan', enemyId: 'warden' }); expect(secondDown.expedition?.enemies.every((enemy) => enemy.hp === 0)).toBe(true); const advanced = gameReducer(secondDown, { type: 'ADVANCE' }); expect(advanced.expedition?.nodeIndex).toBe(1); });
  it('接受任务会更新当前任务', () => { const state = gameReducer(createInitialGame(), { type: 'ACCEPT_MISSION', missionId: 'rusted-patrol' }); expect(state.selectedMissionId).toBe('rusted-patrol'); });
  it('远征会保存接受的任务并使用其首个敌人波次', () => { const accepted = gameReducer(createInitialGame(), { type: 'ACCEPT_MISSION', missionId: 'rusted-patrol' }); const started = gameReducer(accepted, { type: 'START_EXPEDITION' }); expect(started.expedition?.missionId).toBe('rusted-patrol'); expect(started.expedition?.enemies.map((enemy) => enemy.id)).toEqual(['warden', 'scout']); });
  it('击败敌人前不能前进', () => { const started = gameReducer(createInitialGame(), { type: 'START_EXPEDITION' }); const blocked = gameReducer(started, { type: 'ADVANCE' }); expect(blocked.expedition?.nodeIndex).toBe(0); });
  it('换位会交换当前位与后一位，且第一位仍代表靠近敌方的前排', () => { const started = gameReducer(createInitialGame(), { type: 'START_EXPEDITION' }); const before = started.expedition!.formation; const swapped = gameReducer(started, { type: 'SWAP', index: 0 }); expect(swapped.expedition?.formation).toEqual([before[1], before[0], ...before.slice(2)]); });
  it('绷带会治疗指定角色并消耗数量', () => { let state = gameReducer(createInitialGame(), { type: 'START_EXPEDITION' }); state = { ...state, roster: state.roster.map((hero) => hero.id === 'lan' ? { ...hero, hp: 10 } : hero) }; const healed = gameReducer(state, { type: 'USE_BANDAGE', heroId: 'lan' }); expect(healed.roster[0].hp).toBe(19); expect(healed.expedition?.supplies.bandage).toBe(2); });
});

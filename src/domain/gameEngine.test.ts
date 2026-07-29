import { describe, expect, it } from 'vitest';
import { attackDamage, availableItemCount, canAttack, createInitialGame, enemyCanAttack, equipmentBonuses, experienceToNextLevel, gainExperience, gameReducer } from './gameEngine';
import type { Enemy, GameState } from './model';
import { affinityStage } from '../content/gameContent';

const target = (distance: number): Enemy => ({ id: 'a', name: '目标', hp: 1, maxHp: 1, distance, attackMinRange: 1, attackMaxRange: 3, damage: 1 });
// 远征前必须先接取任务，统一用 border-echoes 作为默认委托。
const ready = () => gameReducer(createInitialGame(), { type: 'ACCEPT_MISSION', missionId: 'border-echoes' });

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
  it('击败敌人时出征队伍全员获得经验', () => { const started = gameReducer(ready(), { type: 'START_EXPEDITION' }); const weakened = { ...started, expedition: { ...started.expedition!, enemies: started.expedition!.enemies.map((enemy, index) => index === 0 ? { ...enemy, hp: 1 } : enemy) } }; const result = gameReducer(weakened, { type: 'ATTACK', heroId: 'lan', enemyId: 'scout' }); const party = result.roster.filter((hero) => result.expedition!.formation.includes(hero.id)); expect(party.every((hero) => hero.experience > 0)).toBe(true); });
});

describe('队伍、背包与装备', () => {
  it('可以调整出征站位顺序', () => { const state = createInitialGame(); const moved = gameReducer(state, { type: 'MOVE_PARTY', index: 0, direction: 1 }); expect(moved.selectedHeroIds).toEqual(['wu', 'lan', 'xingluo']); });
  it('装备会占用背包数量并提供属性', () => { const state = createInitialGame(); const equipped = gameReducer(state, { type: 'EQUIP_ITEM', heroId: 'lan', itemId: 'vanguard-spear' }); const lan = equipped.roster.find((hero) => hero.id === 'lan')!; expect(lan.equipment.weapon).toBe('vanguard-spear'); expect(equipmentBonuses(lan).attack).toBe(2); expect(availableItemCount(equipped, 'vanguard-spear')).toBe(0); });
  it('职业不匹配时不能装备专属武器', () => { const state = createInitialGame(); const result = gameReducer(state, { type: 'EQUIP_ITEM', heroId: 'wu', itemId: 'vanguard-spear' }); expect(result.roster.find((hero) => hero.id === 'wu')?.equipment.weapon).toBeUndefined(); });
  it('远征携带背包补给，撤退时返还剩余数量', () => { const started = gameReducer(ready(), { type: 'START_EXPEDITION' }); expect(started.inventory.bandage).toBe(2); expect(started.expedition?.supplies.bandage).toBe(3); const retreated = gameReducer(started, { type: 'RETREAT' }); expect(retreated.inventory.bandage).toBe(5); expect(retreated.expedition).toBeNull(); });
});

describe('出城前置条件', () => {
  it('未接取任务时不能出城，会提示接取', () => {
    const blocked = gameReducer(createInitialGame(), { type: 'START_EXPEDITION' });
    expect(blocked.page).toBe('town');
    expect(blocked.expedition).toBeNull();
    expect(blocked.log[0]).toContain('接取');
  });
  it('接取任务后标记 hasAcceptedMission 并允许出城', () => {
    const accepted = gameReducer(createInitialGame(), { type: 'ACCEPT_MISSION', missionId: 'border-echoes' });
    expect(accepted.hasAcceptedMission).toBe(true);
    const started = gameReducer(accepted, { type: 'START_EXPEDITION' });
    expect(started.page).toBe('expedition');
    expect(started.expedition?.nodeIndex).toBe(0);
  });
});

describe('完整远征状态', () => {
  it('两人以上可以进入首个多敌人战斗节点', () => { const started = gameReducer(ready(), { type: 'START_EXPEDITION' }); expect(started.page).toBe('expedition'); expect(started.expedition?.nodeIndex).toBe(0); expect(started.expedition?.enemies.map((enemy) => enemy.id)).toEqual(['scout', 'warden']); });
  it('首战先锋在前排可以攻击，远程斥候不能反击前排', () => { const started = gameReducer(ready(), { type: 'START_EXPEDITION' }); const scout = started.expedition!.enemies[0]; const vanguard = started.roster.find((hero) => hero.id === 'lan')!; expect(canAttack(vanguard, scout, 0)).toBe(true); expect(enemyCanAttack(scout, 0)).toBe(false); expect(enemyCanAttack(scout, 1)).toBe(true); });
  it('攻击会伤害指定敌人而非默认目标', () => { const started = gameReducer(ready(), { type: 'START_EXPEDITION' }); const attacked = gameReducer(started, { type: 'ATTACK', heroId: 'lan', enemyId: 'warden' }); expect(attacked.expedition?.enemies.find((enemy) => enemy.id === 'warden')?.hp).toBeLessThan(34); expect(attacked.expedition?.enemies.find((enemy) => enemy.id === 'scout')?.hp).toBe(26); });
  it('可连续击败两个敌人并进入下一节点', () => { const started = gameReducer(ready(), { type: 'START_EXPEDITION' }); const weakened = { ...started, expedition: { ...started.expedition!, enemies: started.expedition!.enemies.map((enemy) => ({ ...enemy, hp: 1 })) } }; const firstDown = gameReducer(weakened, { type: 'ATTACK', heroId: 'lan', enemyId: 'scout' }); const secondDown = gameReducer(firstDown, { type: 'ATTACK', heroId: 'lan', enemyId: 'warden' }); expect(secondDown.expedition?.enemies.every((enemy) => enemy.hp === 0)).toBe(true); const advanced = gameReducer(secondDown, { type: 'ADVANCE' }); expect(advanced.expedition?.nodeIndex).toBe(1); });
  it('接受任务会更新当前任务', () => { const state = gameReducer(createInitialGame(), { type: 'ACCEPT_MISSION', missionId: 'rusted-patrol' }); expect(state.selectedMissionId).toBe('rusted-patrol'); });
  it('远征会保存接受的任务并使用其首个敌人波次', () => { const accepted = gameReducer(createInitialGame(), { type: 'ACCEPT_MISSION', missionId: 'rusted-patrol' }); const started = gameReducer(accepted, { type: 'START_EXPEDITION' }); expect(started.expedition?.missionId).toBe('rusted-patrol'); expect(started.expedition?.enemies.map((enemy) => enemy.id)).toEqual(['warden', 'scout']); });
  it('击败敌人前不能前进', () => { const started = gameReducer(ready(), { type: 'START_EXPEDITION' }); const blocked = gameReducer(started, { type: 'ADVANCE' }); expect(blocked.expedition?.nodeIndex).toBe(0); });
  it('换位会交换当前位与后一位，且第一位仍代表靠近敌方的前排', () => { const started = gameReducer(ready(), { type: 'START_EXPEDITION' }); const before = started.expedition!.formation; const swapped = gameReducer(started, { type: 'SWAP', index: 0 }); expect(swapped.expedition?.formation).toEqual([before[1], before[0], ...before.slice(2)]); });
  it('绷带会治疗指定角色并消耗数量', () => { let state = gameReducer(ready(), { type: 'START_EXPEDITION' }); state = { ...state, roster: state.roster.map((hero) => hero.id === 'lan' ? { ...hero, hp: 10 } : hero) }; const healed = gameReducer(state, { type: 'USE_BANDAGE', heroId: 'lan' }); expect(healed.roster[0].hp).toBe(19); expect(healed.expedition?.supplies.bandage).toBe(2); });
  it('完成远征会发放任务材料奖励并重置接取状态', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    const atLastNode: GameState = { ...started, expedition: { ...started.expedition!, nodeIndex: 4, enemies: [] } };
    const completed = gameReducer(atLastNode, { type: 'ADVANCE' });
    expect(completed.page).toBe('town');
    expect(completed.expedition).toBeNull();
    expect(completed.hasAcceptedMission).toBe(false);
    // border-echoes 材料奖励：遗迹碎片·普通 ×2
    expect(completed.materials['ruin-shard:0']).toBe(2);
  });
  it('撤退会重置接取状态', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    const retreated = gameReducer(started, { type: 'RETREAT' });
    expect(retreated.hasAcceptedMission).toBe(false);
    expect(retreated.expedition).toBeNull();
  });
});

describe('材料出售与装备打造', () => {
  it('出售材料会减少库存并增加金币', () => {
    const withMaterials: GameState = { ...createInitialGame(), materials: { 'ruin-shard:0': 5 } };
    const sold = gameReducer(withMaterials, { type: 'SELL_MATERIAL', typeId: 'ruin-shard', rarity: 0, count: 2 });
    expect(sold.materials['ruin-shard:0']).toBe(3);
    expect(sold.gold).toBe(100 + 2);
  });
  it('出售数量超过库存时只出售实际库存', () => {
    const withMaterials = { ...createInitialGame(), materials: { 'rust-iron:1': 2 } };
    const sold = gameReducer(withMaterials, { type: 'SELL_MATERIAL', typeId: 'rust-iron', rarity: 1, count: 5 });
    expect(sold.materials['rust-iron:1']).toBe(0);
    expect(sold.gold).toBe(100 + 10);
  });
  it('材料不足时不能打造', () => {
    const initial = createInitialGame();
    const result = gameReducer(initial, { type: 'CRAFT_ITEM', recipeId: 'craft-spear' });
    expect(result.inventory['vanguard-spear'] ?? 0).toBe(initial.inventory['vanguard-spear'] ?? 0);
    expect(result.gold).toBe(initial.gold);
  });
  it('金币不足时不能打造', () => {
    const withMaterials = { ...createInitialGame(), materials: { 'ruin-shard:0': 3, 'rust-iron:0': 2 }, gold: 10 };
    const result = gameReducer(withMaterials, { type: 'CRAFT_ITEM', recipeId: 'craft-spear' });
    expect(result.inventory['vanguard-spear'] ?? 0).toBe(withMaterials.inventory['vanguard-spear'] ?? 0);
    expect(result.gold).toBe(10);
  });
  it('材料与金币充足时打造装备入背包并消耗材料金币', () => {
    const withResources: GameState = { ...createInitialGame(), materials: { 'ruin-shard:0': 3, 'rust-iron:0': 2 }, gold: 100 };
    const crafted = gameReducer(withResources, { type: 'CRAFT_ITEM', recipeId: 'craft-spear' });
    expect(crafted.inventory['vanguard-spear']).toBe((withResources.inventory['vanguard-spear'] ?? 0) + 1);
    expect(crafted.materials['ruin-shard:0']).toBe(0);
    expect(crafted.materials['rust-iron:0']).toBe(0);
    expect(crafted.gold).toBe(80);
  });
});

describe('每日任务限制', () => {
  it('每天只能接取一次任务，重复接取会被拒绝', () => {
    const first = gameReducer(createInitialGame(), { type: 'ACCEPT_MISSION', missionId: 'border-echoes' });
    expect(first.missionAcceptedToday).toBe(true);
    const second = gameReducer(first, { type: 'ACCEPT_MISSION', missionId: 'rusted-patrol' });
    expect(second.selectedMissionId).toBe(first.selectedMissionId);
    expect(second.missionAcceptedToday).toBe(true);
    expect(second.log[0]).toContain('休息至次日');
  });
  it('休息至次日会推进天数并重置每日限制', () => {
    const accepted = gameReducer(createInitialGame(), { type: 'ACCEPT_MISSION', missionId: 'border-echoes' });
    expect(accepted.day).toBe(1);
    const nextDay = gameReducer(accepted, { type: 'REST_TO_NEXT_DAY' });
    expect(nextDay.day).toBe(2);
    expect(nextDay.missionAcceptedToday).toBe(false);
    const acceptAgain = gameReducer(nextDay, { type: 'ACCEPT_MISSION', missionId: 'rusted-patrol' });
    expect(acceptAgain.selectedMissionId).toBe('rusted-patrol');
    expect(acceptAgain.missionAcceptedToday).toBe(true);
  });
  it('远征完成后仍不能再次接取任务，需休息至次日', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    const atLastNode: GameState = { ...started, expedition: { ...started.expedition!, nodeIndex: 4, enemies: [] } };
    const completed = gameReducer(atLastNode, { type: 'ADVANCE' });
    expect(completed.hasAcceptedMission).toBe(false);
    expect(completed.missionAcceptedToday).toBe(true);
    const blocked = gameReducer(completed, { type: 'ACCEPT_MISSION', missionId: 'rusted-patrol' });
    expect(blocked.selectedMissionId).toBe(completed.selectedMissionId);
    expect(blocked.log[0]).toContain('休息至次日');
  });
  it('远征途中无法休息至次日', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    const blocked = gameReducer(started, { type: 'REST_TO_NEXT_DAY' });
    expect(blocked.day).toBe(1);
    expect(blocked.log[0]).toContain('远征途中');
  });
});

describe('食物消耗与饥饿', () => {
  it('进入战斗节点消耗食物，休息节点不消耗', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    expect(started.food).toBe(4);
    const atNode1: GameState = { ...started, expedition: { ...started.expedition!, enemies: [] } };
    const restNode = gameReducer(atNode1, { type: 'ADVANCE' });
    expect(restNode.food).toBe(4);
    const atNode2: GameState = { ...restNode, expedition: { ...restNode.expedition!, enemies: [] } };
    const combatNode = gameReducer(atNode2, { type: 'ADVANCE' });
    expect(combatNode.food).toBe(3);
  });
  it('食物不足时进入战斗节点增加饥饿层数但不死档', () => {
    const noFood: GameState = { ...ready(), food: 0, hunger: 0 };
    const started = gameReducer(noFood, { type: 'START_EXPEDITION' });
    expect(started.food).toBe(0);
    expect(started.hunger).toBe(1);
    const atNode1: GameState = { ...started, expedition: { ...started.expedition!, enemies: [] } };
    const restNode = gameReducer(atNode1, { type: 'ADVANCE' });
    expect(restNode.hunger).toBe(1);
    const atNode2: GameState = { ...restNode, expedition: { ...restNode.expedition!, enemies: [] } };
    const combatNode = gameReducer(atNode2, { type: 'ADVANCE' });
    expect(combatNode.hunger).toBe(2);
    expect(combatNode.expedition).not.toBeNull();
  });
  it('饥饿层数降低攻击力', () => {
    const hero = createInitialGame().roster[0];
    const base = attackDamage(hero, true, 0);
    const hungry = attackDamage(hero, true, 3);
    expect(hungry).toBe(Math.max(1, base - 3));
  });
  it('休息至次日补足食物并清除饥饿', () => {
    const hungry: GameState = { ...createInitialGame(), food: 1, hunger: 3, missionAcceptedToday: true };
    const rested = gameReducer(hungry, { type: 'REST_TO_NEXT_DAY' });
    expect(rested.food).toBe(5);
    expect(rested.hunger).toBe(0);
  });
});

describe('礼物与好感', () => {
  it('送普通礼物加 2 好感并消耗库存', () => {
    const base = createInitialGame();
    const state: GameState = { ...base, inventory: { ...base.inventory, wildflower: 1 } };
    const result = gameReducer(state, { type: 'GIVE_GIFT', heroId: 'lan', giftId: 'wildflower' });
    expect(result.roster.find((h) => h.id === 'lan')!.affinity).toBe(2);
    expect(result.inventory.wildflower).toBe(0);
  });
  it('送偏好礼物加 5 好感', () => {
    // 岚偏好 ['文化','贵重']，旧诗集 tags ['文化'] 命中偏好
    const base = createInitialGame();
    const state: GameState = { ...base, inventory: { ...base.inventory, 'old-book': 1 } };
    const result = gameReducer(state, { type: 'GIVE_GIFT', heroId: 'lan', giftId: 'old-book' });
    expect(result.roster.find((h) => h.id === 'lan')!.affinity).toBe(5);
  });
  it('每个英雄每天只能收一次礼物', () => {
    const base = createInitialGame();
    const state: GameState = { ...base, inventory: { ...base.inventory, wildflower: 3 } };
    const first = gameReducer(state, { type: 'GIVE_GIFT', heroId: 'lan', giftId: 'wildflower' });
    expect(first.roster.find((h) => h.id === 'lan')!.affinity).toBe(2);
    const second = gameReducer(first, { type: 'GIVE_GIFT', heroId: 'lan', giftId: 'wildflower' });
    expect(second.roster.find((h) => h.id === 'lan')!.affinity).toBe(2);
    expect(second.log[0]).toContain('送过');
  });
  it('休息至次日重置每日送礼限制', () => {
    const base = createInitialGame();
    const state: GameState = { ...base, inventory: { ...base.inventory, wildflower: 3 }, giftsGivenToday: { lan: 1 } };
    const rested = gameReducer(state, { type: 'REST_TO_NEXT_DAY' });
    expect(rested.giftsGivenToday).toEqual({});
    const gift = gameReducer(rested, { type: 'GIVE_GIFT', heroId: 'lan', giftId: 'wildflower' });
    expect(gift.roster.find((h) => h.id === 'lan')!.affinity).toBe(2);
  });
  it('好感阶段按阈值划分', () => {
    expect(affinityStage(0).name).toBe('陌生');
    expect(affinityStage(19).name).toBe('陌生');
    expect(affinityStage(20).name).toBe('熟悉');
    expect(affinityStage(50).name).toBe('信赖');
    expect(affinityStage(80).name).toBe('羁绊');
  });
});

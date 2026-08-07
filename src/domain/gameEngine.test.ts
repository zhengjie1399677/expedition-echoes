import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attackDamage, availableItemCount, canAttack, createInitialGame, enemyCanAttack, equipmentBonuses, experienceToNextLevel, gainExperience, gameReducer, pressureStage } from './gameEngine';
import type { Enemy, GameState } from './model';
import { affinityStage, nodesForMission } from '../content/gameContent';

// 意图系统与掉落引入随机性：固定 Math.random = 0.2 保证
// 1) 不触发暴击（阈值 0.12）；2) rollIntent 对任意意图池长度都取第一个意图（attack）。
// 所有敌人意图池首项均为 attack，使现有精确断言稳定可复现。
beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.2);
});
afterEach(() => {
  vi.restoreAllMocks();
});

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

describe('压力与装备', () => {
  it('压力阶段在阈值处明确变化', () => { expect(pressureStage(0).name).toBe('沉着'); expect(pressureStage(30).name).toBe('紧绷'); expect(pressureStage(50).name).toBe('动摇'); expect(pressureStage(75).name).toBe('临界'); });
  it('动摇降低 2 点攻击，关闭压力后不生效', () => { const hero = { ...createInitialGame().roster[0], pressure: 50, gearLevel: 1 }; expect(attackDamage(hero, true)).toBe(6); expect(attackDamage(hero, false)).toBe(8); });
  it('装备只能在有足够金币时升级', () => { const initial = createInitialGame(); const upgraded = gameReducer(initial, { type: 'UPGRADE_GEAR', heroId: 'lan' }); expect(upgraded.roster[0].gearLevel).toBe(1); expect(upgraded.gold).toBe(70); });
});

describe('day transition feedback', () => {
  it('turns a completed expedition into a next-day report and applies overnight recovery', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    const completed = gameReducer({ ...started, expedition: { ...started.expedition!, nodeIndex: 6, enemies: [] } }, { type: 'ADVANCE' });
    const wounded = { ...completed, roster: completed.roster.map((hero) => hero.id === 'lan' ? { ...hero, hp: 10, pressure: 30 } : hero) };
    const nextDay = gameReducer(wounded, { type: 'REST_TO_NEXT_DAY' });
    const lan = nextDay.roster.find((hero) => hero.id === 'lan')!;
    expect(nextDay.page).toBe('town');
    expect(nextDay.dayReport?.outcome).toBe('victory');
    // border-echoes 属于 border-ruins（威胁 2）：胜利后新闻引用区域平息
    expect(nextDay.dayReport?.townNews).toContain('平息');
    expect(lan.hp).toBe(28);
    expect(lan.pressure).toBe(14);
    expect(lan.affinity).toBe(wounded.roster.find((hero) => hero.id === 'lan')!.affinity + 1);
  });
});

describe('角色主动技能', () => {
  it('岚的守望号令会降低全队压力，且每场只能使用一次', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    const pressured = { ...started, roster: started.roster.map((hero) => started.expedition!.formation.includes(hero.id) ? { ...hero, pressure: 20 } : hero) };
    const used = gameReducer(pressured, { type: 'USE_SKILL', heroId: 'lan' });
    expect(used.roster.filter((hero) => used.expedition!.formation.includes(hero.id)).every((hero) => hero.pressure === 12)).toBe(true);
    expect(used.expedition?.skillUses['lan:guardians-order']).toBe(true);
    // 同一技能本场再次使用被拦截，压力不变。
    expect(gameReducer(used, { type: 'USE_SKILL', heroId: 'lan', skillId: 'guardians-order' }).roster[0].pressure).toBe(12);
  });
  it('雾与星罗的技能会造成伤害，但不绕开普通攻击的击杀结算', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    const wuUsed = gameReducer(started, { type: 'USE_SKILL', heroId: 'wu', enemyId: 'scout' });
    expect(wuUsed.expedition?.enemies.find((enemy) => enemy.id === 'scout')?.hp).toBeLessThan(started.expedition!.enemies.find((enemy) => enemy.id === 'scout')!.hp);
    const nearlyDefeated = { ...started, expedition: { ...started.expedition!, enemies: started.expedition!.enemies.map((enemy) => ({ ...enemy, hp: 1 })) } };
    const xingluoUsed = gameReducer(nearlyDefeated, { type: 'USE_SKILL', heroId: 'xingluo' });
    expect(xingluoUsed.expedition?.enemies.every((enemy) => enemy.hp === 1)).toBe(true);
  });
});

describe('等级与经验', () => {
  it('一级升二级需要 30 经验', () => { expect(experienceToNextLevel(1)).toBe(30); });
  it('升级会保留溢出经验并提高、补充生命', () => { const hero = { ...createInitialGame().roster[0], hp: 20 }; const leveled = gainExperience(hero, 35); expect(leveled.level).toBe(2); expect(leveled.experience).toBe(5); expect(leveled.maxHp).toBe(37); expect(leveled.hp).toBe(25); });
  it('每级基础攻击 +2，升级带来的伤害差距可感知', () => { const base = createInitialGame().roster[0]; const lv1 = attackDamage({ ...base, level: 1 }, false); const lv3 = attackDamage({ ...base, level: 3 }, false); expect(lv1).toBe(7); expect(lv3 - lv1).toBe(4); });
  it('一次跨越多级升级会按级累加最大生命', () => { const hero = createInitialGame().roster[0]; const leveled = gainExperience(hero, 75); expect(leveled.level).toBe(3); expect(leveled.maxHp).toBe(42); expect(leveled.experience).toBe(0); });
  it('击败敌人时出征队伍全员获得经验', () => { const started = gameReducer(ready(), { type: 'START_EXPEDITION' }); const weakened = { ...started, expedition: { ...started.expedition!, enemies: started.expedition!.enemies.map((enemy, index) => index === 0 ? { ...enemy, hp: 1 } : enemy) } }; const result = gameReducer(weakened, { type: 'ATTACK', heroId: 'lan', enemyId: 'scout' }); const party = result.roster.filter((hero) => result.expedition!.formation.includes(hero.id)); expect(party.every((hero) => hero.experience > 0)).toBe(true); });
});

describe('队伍、背包与装备', () => {
  it('中央广场购买会扣除金币并将合法商品放入背包', () => {
    const initial = createInitialGame();
    const bought = gameReducer(initial, { type: 'BUY_ITEM', itemId: 'echo-charm' });
    expect(bought.gold).toBe(68);
    expect(bought.inventory['echo-charm']).toBe(2);
    expect(gameReducer({ ...initial, gold: 0 }, { type: 'BUY_ITEM', itemId: 'echo-charm' }).inventory['echo-charm']).toBe(1);
  });
  it('补给商消耗品可按价目购买（bandage 8g、sedative 20g），金币不足时购买被拦截', () => {
    const initial = createInitialGame();
    const bandaged = gameReducer(initial, { type: 'BUY_ITEM', itemId: 'bandage' });
    expect(bandaged.gold).toBe(92);
    expect(bandaged.inventory['bandage']).toBe(6);
    const sedated = gameReducer(bandaged, { type: 'BUY_ITEM', itemId: 'sedative' });
    expect(sedated.gold).toBe(72);
    expect(sedated.inventory['sedative']).toBe(3);
    const broke = gameReducer({ ...initial, gold: 5 }, { type: 'BUY_ITEM', itemId: 'sedative' });
    expect(broke.gold).toBe(5);
    expect(broke.inventory['sedative']).toBe(2);
  });
  it('可以调整出征站位顺序', () => { const state = createInitialGame(); const moved = gameReducer(state, { type: 'MOVE_PARTY', index: 0, direction: 1 }); expect(moved.selectedHeroIds).toEqual(['wu', 'lan', 'xingluo']); });
  it('装备会占用背包数量并提供属性', () => { const state = createInitialGame(); const equipped = gameReducer(state, { type: 'EQUIP_ITEM', heroId: 'lan', itemId: 'vanguard-spear' }); const lan = equipped.roster.find((hero) => hero.id === 'lan')!; expect(lan.equipment.weapon).toBe('vanguard-spear'); expect(equipmentBonuses(lan).attack).toBe(2); expect(availableItemCount(equipped, 'vanguard-spear')).toBe(0); });
  it('职业不匹配时不能装备专属武器', () => { const state = createInitialGame(); const result = gameReducer(state, { type: 'EQUIP_ITEM', heroId: 'wu', itemId: 'vanguard-spear' }); expect(result.roster.find((hero) => hero.id === 'wu')?.equipment.weapon).toBeUndefined(); });
  it('装备品质分级：普通/优良/稀有提供明显不同的攻击加成', () => {
    const base = createInitialGame().roster[0];
    expect(equipmentBonuses({ ...base, equipment: { weapon: 'vanguard-spear' } }).attack).toBe(2);
    expect(equipmentBonuses({ ...base, equipment: { weapon: 'vanguard-spear-fine' } }).attack).toBe(4);
    expect(equipmentBonuses({ ...base, equipment: { weapon: 'vanguard-spear-rare' } }).attack).toBe(6);
  });
  it('打造优良装备会消耗高稀有材料与金币并产出对应装备', () => {
    const withResources: GameState = { ...createInitialGame(), materials: { 'ruin-shard:1': 3, 'rust-iron:1': 1 }, gold: 100 };
    const crafted = gameReducer(withResources, { type: 'CRAFT_ITEM', recipeId: 'craft-spear-fine' });
    expect(crafted.inventory['vanguard-spear-fine']).toBe(1);
    expect(crafted.materials['ruin-shard:1']).toBe(0);
    expect(crafted.materials['rust-iron:1']).toBe(0);
    expect(crafted.gold).toBe(60);
  });
  it('高 tier 装备仍受职业限制约束', () => {
    const state: GameState = { ...createInitialGame(), inventory: { ...createInitialGame().inventory, 'vanguard-spear-fine': 1 } };
    const result = gameReducer(state, { type: 'EQUIP_ITEM', heroId: 'wu', itemId: 'vanguard-spear-fine' });
    expect(result.roster.find((hero) => hero.id === 'wu')?.equipment.weapon).toBeUndefined();
  });
  it('远征携带背包补给，撤退时返还剩余数量', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION', supplies: { food: 0, bandage: 3, sedative: 1 } });
    expect(started.inventory.bandage).toBe(2);
    expect(started.expedition?.supplies.bandage).toBe(3);
    const retreated = gameReducer(started, { type: 'RETREAT' });
    expect(retreated.inventory.bandage).toBe(5);
    expect(retreated.page).toBe('settlement');
    expect(retreated.settlement?.outcome).toBe('retreat');
    expect(retreated.expedition).toBeNull();
  });
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
  it('林地异变会使用独立地图、营地与首领圣所背景', () => {
    const nodes = nodesForMission('forest-disturbance');
    expect(nodes.map((node) => node.background)).toEqual([
      '/assets/world/forest-v1/forest-road-v1.png',
      '/assets/world/forest-v1/forest-camp-v1.png',
      '/assets/world/forest-v1/forest-road-v1.png',
      '/assets/world/forest-v1/herb-grove-v1.png',
      '/assets/world/forest-v1/forest-camp-v1.png',
      '/assets/world/forest-v1/echo-trap-v1.png',
      '/assets/world/forest-v1/grove-sanctuary-v1.png',
    ]);
  });
  it('林地任务生成具有唯一实例 ID 的狼群', () => {
    const accepted = gameReducer(createInitialGame(), { type: 'ACCEPT_MISSION', missionId: 'forest-disturbance' });
    const started = gameReducer(accepted, { type: 'START_EXPEDITION' });
    expect(started.expedition?.enemies.map((enemy) => enemy.id)).toEqual(['ash-wolf', 'ash-wolf-2']);
    expect(started.expedition?.enemies.every((enemy) => enemy.trait === 'pack')).toBe(true);
  });
  it('击败敌人前不能前进', () => { const started = gameReducer(ready(), { type: 'START_EXPEDITION' }); const blocked = gameReducer(started, { type: 'ADVANCE' }); expect(blocked.expedition?.nodeIndex).toBe(0); });
  it('绷带会治疗指定角色并消耗数量', () => { let state = gameReducer(ready(), { type: 'START_EXPEDITION' }); state = { ...state, roster: state.roster.map((hero) => hero.id === 'lan' ? { ...hero, hp: 10 } : hero) }; const healed = gameReducer(state, { type: 'USE_BANDAGE', heroId: 'lan' }); expect(healed.roster[0].hp).toBe(19); expect(healed.expedition?.supplies.bandage).toBe(2); });
  it('完成远征会发放任务材料奖励并重置接取状态', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    const atLastNode: GameState = { ...started, expedition: { ...started.expedition!, nodeIndex: 6, enemies: [] } };
    const completed = gameReducer(atLastNode, { type: 'ADVANCE' });
    expect(completed.page).toBe('settlement');
    expect(completed.settlement?.outcome).toBe('victory');
    expect(completed.expedition).toBeNull();
    expect(completed.hasAcceptedMission).toBe(false);
    // border-echoes 材料奖励：遗迹碎片·普通 ×2
    expect(completed.materials['ruin-shard:0']).toBe(2);
  });
  it('撤退会重置接取状态', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    const retreated = gameReducer(started, { type: 'RETREAT' });
    expect(retreated.hasAcceptedMission).toBe(false);
    expect(retreated.page).toBe('settlement');
    expect(retreated.settlement?.outcome).toBe('retreat');
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

describe('远征事件扩展（A2 新事件）', () => {
  // 事件节点的 eventResolved 初始为 false；手动跳节点时需显式设置。
  const atEvent = (started: GameState, nodeIndex: number, extra: Partial<NonNullable<GameState['expedition']>> = {}) => ({
    ...started,
    expedition: { ...started.expedition!, nodeIndex, eventResolved: false, enemies: [], ...extra },
  });

  it('坍塌通道：选择清理碎石触发额外战斗（risk_fight）', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION', supplies: { food: 4, bandage: 0, sedative: 0 } });
    const fought = gameReducer(atEvent(started, 4), { type: 'RESOLVE_EVENT', eventId: 'collapsed-passage', choiceId: 'risk_fight' });
    expect(fought.expedition?.enemies.length).toBeGreaterThan(0);
    expect(fought.expedition?.seenEvents).toContain('collapsed-passage');
  });

  it('坍塌通道：选择绕路消耗食物并休整（recover）', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION', supplies: { food: 4, bandage: 0, sedative: 0 } });
    const recovered = gameReducer(atEvent(started, 4), { type: 'RESOLVE_EVENT', eventId: 'collapsed-passage', choiceId: 'recover' });
    expect(recovered.expedition?.enemies.length).toBe(0);
    expect(recovered.expedition?.eventResolved).toBe(true);
  });

  it('游商帐篷：出售材料换金币（bargain）', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION', supplies: { food: 4, bandage: 0, sedative: 0 } });
    // 节点 5 是游商帐篷；预置 2 份遗迹碎片到本次收益
    const sold = gameReducer(atEvent(started, 5, { gainedMaterials: { 'ruin-shard:0': 2 } }), { type: 'RESOLVE_EVENT', eventId: 'traveling-merchant', choiceId: 'bargain' });
    expect(sold.expedition?.gainedGold).toBe(24);
    expect(sold.expedition?.gainedMaterials['ruin-shard:0']).toBe(0);
  });

  it('药草丛：谨慎采摘治疗最虚弱队员（aid_hero）', () => {
    const accepted = gameReducer(createInitialGame(), { type: 'ACCEPT_MISSION', missionId: 'forest-disturbance' });
    const started = gameReducer(accepted, { type: 'START_EXPEDITION', supplies: { food: 4, bandage: 0, sedative: 0 } });
    // 林地线节点 3 是药草丛；把星罗血量压低
    const wounded = { ...atEvent(started, 3), roster: started.roster.map((h) => (h.id === 'xingluo' ? { ...h, hp: 5 } : h)) };
    const healed = gameReducer(wounded, { type: 'RESOLVE_EVENT', eventId: 'herb-grove', choiceId: 'aid_hero' });
    const xingluo = healed.roster.find((h) => h.id === 'xingluo')!;
    expect(xingluo.hp).toBe(17); // 5 + 12
  });

  it('回声陷阱：快速通过压力大幅上升（track + pressureCost）', () => {
    const accepted = gameReducer(createInitialGame(), { type: 'ACCEPT_MISSION', missionId: 'forest-disturbance' });
    const started = gameReducer(accepted, { type: 'START_EXPEDITION', supplies: { food: 4, bandage: 0, sedative: 0 } });
    // 林地线节点 5 是回声陷阱
    const tracked = gameReducer(atEvent(started, 5), { type: 'RESOLVE_EVENT', eventId: 'echo-trap', choiceId: 'track' });
    expect(tracked.expedition?.gainedGold).toBe(12);
    expect(tracked.roster.find((h) => h.id === 'lan')!.pressure).toBeGreaterThanOrEqual(12);
  });

  it('一次性事件同一远征不重复出现', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION', supplies: { food: 4, bandage: 0, sedative: 0 } });
    const again = gameReducer(atEvent(started, 4, { seenEvents: ['collapsed-passage'] }), { type: 'RESOLVE_EVENT', eventId: 'collapsed-passage', choiceId: 'risk_fight' });
    expect(again.expedition?.enemies.length).toBe(0); // 未触发（已被拒绝）
    expect(again.log[0]).toContain('已经处理过');
  });
});

describe('远征选择事实与次日新闻（M4 打磨 1：选择有后果）', () => {
  // 事件节点的 eventResolved 初始为 false；手动跳节点时需显式设置。
  const atEvent = (started: GameState, nodeIndex: number, extra: Partial<NonNullable<GameState['expedition']>> = {}) => ({
    ...started,
    expedition: { ...started.expedition!, nodeIndex, eventResolved: false, enemies: [], ...extra },
  });

  it('RESOLVE_EVENT 记录选择，结算写入 lastExpedition，次日新闻引用后清空', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION', supplies: { food: 4, bandage: 0, sedative: 0 } });
    // 节点 1 是废弃补给室，选择翻找药箱（scavenge）
    const scavenged = gameReducer(atEvent(started, 1), { type: 'RESOLVE_EVENT', eventId: 'supply-room', choiceId: 'scavenge' });
    expect(scavenged.expedition?.choiceHistory).toContain('supply-room:scavenge');

    const atLast: GameState = { ...scavenged, expedition: { ...scavenged.expedition!, nodeIndex: 6, enemies: [], eventResolved: true } };
    const completed = gameReducer(atLast, { type: 'ADVANCE' });
    expect(completed.lastExpedition?.outcome).toBe('victory');
    expect(completed.lastExpedition?.missionId).toBe('border-echoes');
    expect(completed.lastExpedition?.choices).toContain('supply-room:scavenge');
    expect(completed.lastExpedition?.nodeReached).toBe(6);

    const nextDay = gameReducer(completed, { type: 'REST_TO_NEXT_DAY' });
    // 新闻 = 基础模板（威胁 2 胜利 → 平息）+ 选择引用句（箱柜）
    expect(nextDay.dayReport?.townNews).toContain('平息');
    expect(nextDay.dayReport?.townNews).toContain('箱柜');
    // 消费后清空，避免隔日重复引用
    expect(nextDay.lastExpedition).toBeUndefined();
  });

  it('撤退写入 retreat-at-node 标记，次日新闻引用撤退位置', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION', supplies: { food: 4, bandage: 0, sedative: 0 } });
    // 节点 2 是回声长廊（0 起算），撤退标记为 1 起算的节点序号 3
    const atNode2 = { ...started, expedition: { ...started.expedition!, nodeIndex: 2, enemies: [], eventResolved: true } };
    const retreated = gameReducer(atNode2, { type: 'RETREAT' });
    expect(retreated.settlement?.outcome).toBe('retreat');
    expect(retreated.lastExpedition?.outcome).toBe('retreat');
    expect(retreated.lastExpedition?.choices).toContain('retreat-at-node-3');
    expect(retreated.lastExpedition?.nodeReached).toBe(2);

    const nextDay = gameReducer(retreated, { type: 'REST_TO_NEXT_DAY' });
    expect(nextDay.dayReport?.townNews).toContain('提前撤回');
    expect(nextDay.dayReport?.townNews).toContain('回声长廊');
    expect(nextDay.lastExpedition).toBeUndefined();
  });

  it('无事件选择的胜利远征：lastExpedition 存在但 choices 为空，新闻不追加引用句', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION' });
    const atLast: GameState = { ...started, expedition: { ...started.expedition!, nodeIndex: 6, enemies: [] } };
    const completed = gameReducer(atLast, { type: 'ADVANCE' });
    expect(completed.lastExpedition?.outcome).toBe('victory');
    expect(completed.lastExpedition?.choices).toEqual([]);
    const nextDay = gameReducer(completed, { type: 'REST_TO_NEXT_DAY' });
    // 威胁 2 胜利基础模板，无选择引用
    expect(nextDay.dayReport?.townNews).toContain('平息');
    expect(nextDay.lastExpedition).toBeUndefined();
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
    const atLastNode: GameState = { ...started, expedition: { ...started.expedition!, nodeIndex: 6, enemies: [] } };
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
    const started = gameReducer(ready(), { type: 'START_EXPEDITION', supplies: { food: 4, bandage: 0, sedative: 0 } });
    expect(started.food).toBe(1); // 5 - 4
    expect(started.expedition?.supplies.food).toBe(3); // 4 - 1 (consumed entering node 0)
    
    const atNode1: GameState = { ...started, expedition: { ...started.expedition!, enemies: [] } };
    const restNode = gameReducer(atNode1, { type: 'ADVANCE' });
    expect(restNode.expedition?.supplies.food).toBe(3); // rest node doesn't consume
    
    const resolvedEvent = gameReducer(restNode, { type: 'RESOLVE_EVENT', eventId: 'supply-room', choiceId: 'recover' });
    const atNode2: GameState = { ...resolvedEvent, expedition: { ...resolvedEvent.expedition!, enemies: [] } };
    const combatNode = gameReducer(atNode2, { type: 'ADVANCE' });
    expect(combatNode.expedition?.supplies.food).toBe(2); // combat node consumes 1
  });
  it('食物不足时进入战斗节点增加饥饿层数但不死档', () => {
    const noFood: GameState = { ...ready(), food: 0, hunger: 0 };
    const started = gameReducer(noFood, { type: 'START_EXPEDITION', supplies: { food: 0, bandage: 0, sedative: 0 } });
    expect(started.food).toBe(0);
    expect(started.hunger).toBe(1);
    const atNode1: GameState = { ...started, expedition: { ...started.expedition!, enemies: [] } };
    const restNode = gameReducer(atNode1, { type: 'ADVANCE' });
    expect(restNode.hunger).toBe(1);
    const resolvedEvent = gameReducer(restNode, { type: 'RESOLVE_EVENT', eventId: 'supply-room', choiceId: 'recover' });
    const atNode2: GameState = { ...resolvedEvent, expedition: { ...resolvedEvent.expedition!, enemies: [] } };
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

describe('行囊整备、职业被动与全败结算新规则', () => {
  it('出征行囊携带数量限制与库存校验', () => {
    // 1. 超限（大于 10 格）应被拒绝
    const state = ready();
    const overLimit = gameReducer(state, { type: 'START_EXPEDITION', supplies: { food: 5, bandage: 5, sedative: 1 } });
    expect(overLimit.page).toBe('town');
    expect(overLimit.log[0]).toContain('空间不足');

    // 2. 超出库存应被拒绝
    const overStock = gameReducer(state, { type: 'START_EXPEDITION', supplies: { food: 10, bandage: 0, sedative: 0 } });
    expect(overStock.page).toBe('town');
    expect(overStock.log[0]).toContain('超过了城镇库存');
  });

  it('先锋被动坚守：前排受到伤害降低 1 并反击贴身敌人 2 伤害', () => {
    const started = gameReducer(ready(), { type: 'START_EXPEDITION', supplies: { food: 2, bandage: 0, sedative: 0 } });
    // 先锋 lan 在 index 0，hp = 32
    // 敌方 scout (distance 1, range 2-3) 无法攻击 lan，但 warden (distance 1, range 1-1) 攻击 lan
    // 守卫攻击力为 5，坚守触发：伤害减少 1，实际受到 5 - 1 = 4 点伤害，hp 变为 28
    // 且触发反击对 warden 造成 2 点伤害，warden hp 变为 34 - 2 = 32
    const attacked = gameReducer(started, { type: 'ATTACK', heroId: 'lan', enemyId: 'scout' });
    const lan = attacked.roster.find(h => h.id === 'lan')!;
    expect(lan.hp).toBe(28);
    const scout = attacked.expedition?.enemies.find(e => e.id === 'scout')!;
    expect(scout.hp).toBe(19); // 26 - 7 (normal attack)
    const warden = attacked.expedition?.enemies.find(e => e.id === 'warden')!;
    expect(warden.hp).toBe(32); // 34 - 2 (counterattack)
    expect(attacked.log.some(l => l.includes('触发「坚守」进行了贴身反击'))).toBe(true);
  });

  it('游侠被动锐眼：后排时伤害 +2 且无攻击范围限制', () => {
    let state = ready();
    // 调整队伍，让雾（游侠）在后排
    state = gameReducer(state, { type: 'MOVE_PARTY', index: 0, direction: 1 }); // roster order: wu, lan, xingluo. so wu at front, lan in middle (index 1)
    // 重新排序：把游侠雾放到 index 1。
    // 先开始远征
    const started = gameReducer(state, { type: 'START_EXPEDITION' });
    const scout = started.expedition!.enemies.find(e => e.id === 'scout')!;
    const wu = started.roster.find(h => h.id === 'wu')!;
    // 雾（ranger）在 index 1 应该能够攻击 scout，且伤害 +2
    expect(canAttack(wu, scout, 1)).toBe(true);
    const backrowDamage = attackDamage(wu, false, 0, 1, []); // 6 + 2 = 8
    expect(backrowDamage).toBe(8);
  });

  it('术士被动共鸣：相邻有存活队友伤害 +2，孤立无援伤害 -1', () => {
    const base = createInitialGame();
    const mage = base.roster.find(h => h.id === 'xingluo')!;
    const lan = base.roster.find(h => h.id === 'lan')!;
    // 1. 相邻有存活队友 (Mage at index 1, Lan at index 0)
    const partyWithNeighbor = [lan, mage];
    const dmgWithNeighbor = attackDamage(mage, false, 0, 1, partyWithNeighbor); // 8 + 2 = 10
    expect(dmgWithNeighbor).toBe(10);

    // 2. 孤立无援 (Mage at index 2, Lan dead at index 1)
    const deadLan = { ...lan, hp: 0 };
    const partyIsolated = [mage, deadLan]; // mage is at index 0, deadLan is at index 1
    const dmgIsolated = attackDamage(mage, false, 0, 0, partyIsolated); // 8 - 1 = 7
    expect(dmgIsolated).toBe(7);
  });

  it('队伍全灭失败进入失败结算，不保留战利品且返还剩余行囊补给', () => {
    let state = gameReducer(ready(), { type: 'START_EXPEDITION', supplies: { food: 2, bandage: 3, sedative: 1 } });
    // 记录敌人列表，把敌人的伤害改为 99 以秒杀玩家，并削弱玩家 HP（星罗设为已阵亡，只有前排两人参战）
    state.roster = state.roster.map(h => h.id === 'xingluo' ? { ...h, hp: 0 } : { ...h, hp: 1 });
    state.expedition!.enemies = state.expedition!.enemies.map(e => ({ ...e, damage: 99 }));
    
    // 玩家进行一次攻击，会引发敌方存活单位反击，秒杀所有存活玩家英雄
    const result = gameReducer(state, { type: 'ATTACK', heroId: 'lan', enemyId: 'scout' });
    expect(result.page).toBe('settlement');
    expect(result.settlement?.outcome).toBe('defeated');
    // 失败不带回任何金币和材料
    expect(result.settlement?.lootGold).toBe(0);
    expect(result.settlement?.lootMaterials).toEqual({});
    // 返还剩余的补给品：绷带 3，镇定剂 1，食物 1 (消耗了 1 个，余 1 个)
    expect(result.inventory.bandage).toBe(5); // 2 + 3
    expect(result.inventory.sedative).toBe(2); // 1 + 1
    expect(result.food).toBe(4); // 3 + 1
  });
});


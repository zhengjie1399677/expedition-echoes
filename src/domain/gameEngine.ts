import { baseAttack, enemies, expeditionNodes, initialHeroes, initialInventory, itemDefinitions, missions } from '../content/gameContent';
import type { Enemy, EquipmentSlot, GameAction, GameState, Hero } from './model';

const enemyById = (id: string): Enemy => ({ ...enemies.find((enemy) => enemy.id === id)! });
const addLog = (state: GameState, message: string): GameState => ({ ...state, log: [message, ...state.log].slice(0, 8) });
const editHero = (state: GameState, id: string, edit: (hero: Hero) => Hero): GameState => ({ ...state, roster: state.roster.map((hero) => hero.id === id ? edit(hero) : hero) });

export function createInitialGame(): GameState {
  return { version: 7, page: 'town', gold: 100, roster: initialHeroes.map((hero) => ({ ...hero, equipment: { ...hero.equipment } })), inventory: { ...initialInventory }, selectedHeroIds: ['lan', 'wu', 'xingluo'], selectedMissionId: missions[0].id, managementTab: 'party', expedition: null, settings: { moraleEnabled: true, llmEnabled: true }, log: ['酒馆已经备好第一份远征契约。'] };
}

export const experienceToNextLevel = (level: number): number => 15 + Math.max(1, level) * 15;
export const enemyExperienceReward = (enemy: Enemy): number => 8 + Math.ceil(enemy.maxHp / 8);

export function gainExperience(hero: Hero, amount: number): Hero {
  let level = Math.max(1, hero.level);
  let experience = Math.max(0, hero.experience) + Math.max(0, amount);
  let levelsGained = 0;
  while (experience >= experienceToNextLevel(level)) {
    experience -= experienceToNextLevel(level);
    level += 1;
    levelsGained += 1;
  }
  if (levelsGained === 0) return { ...hero, level, experience };
  const healthGain = levelsGained * 3;
  return { ...hero, level, experience, maxHp: hero.maxHp + healthGain, hp: Math.min(hero.maxHp + healthGain, hero.hp + healthGain) };
}

export function equipmentBonuses(hero: Hero): { attack: number; defense: number } {
  return Object.values(hero.equipment).reduce((bonuses, itemId) => {
    const item = itemDefinitions.find((candidate) => candidate.id === itemId);
    return { attack: bonuses.attack + (item?.attack ?? 0), defense: bonuses.defense + (item?.defense ?? 0) };
  }, { attack: 0, defense: 0 });
}

export function availableItemCount(state: GameState, itemId: string): number {
  const equippedCount = state.roster.filter((hero) => Object.values(hero.equipment).includes(itemId)).length;
  return Math.max(0, (state.inventory[itemId] ?? 0) - equippedCount);
}

export function canAttack(hero: Hero, enemy: Enemy, formationIndex = 0): boolean {
  if (hero.hp <= 0 || enemy.hp <= 0) return false;
  const targetDistance = enemy.distance + formationIndex;
  if (hero.heroClass === 'vanguard') return targetDistance === 1;
  if (hero.heroClass === 'mage') return targetDistance >= 2 && targetDistance <= 3;
  return targetDistance >= 1 && targetDistance <= 2;
}

export function attackDamage(hero: Hero, moraleEnabled: boolean): number {
  return Math.max(1, baseAttack[hero.heroClass] + hero.gearLevel + Math.max(0, hero.level - 1) + equipmentBonuses(hero).attack - (moraleEnabled && hero.morale >= 50 ? 2 : 0));
}

export function enemyCanAttack(enemy: Enemy, formationIndex: number): boolean {
  const targetDistance = enemy.distance + formationIndex;
  return targetDistance >= enemy.attackMinRange && targetDistance <= enemy.attackMaxRange;
}

function returnExpeditionSupplies(state: GameState): GameState {
  if (!state.expedition) return state;
  return {
    ...state,
    inventory: {
      ...state.inventory,
      bandage: (state.inventory.bandage ?? 0) + state.expedition.supplies.bandage,
      sedative: (state.inventory.sedative ?? 0) + state.expedition.supplies.sedative,
    },
  };
}

function enterNode(state: GameState, nodeIndex: number): GameState {
  const node = expeditionNodes[nodeIndex];
  if (!state.expedition || !node) return state;
  if (node.kind === 'rest') {
    const roster = state.roster.map((hero) => state.expedition!.formation.includes(hero.id) ? { ...hero, hp: Math.min(hero.maxHp, hero.hp + 5), morale: Math.max(0, hero.morale - 12) } : hero);
    return addLog({ ...state, roster, expedition: { ...state.expedition, nodeIndex, enemies: [] } }, `${node.title}：${node.description}`);
  }
  const mission = missions.find((item) => item.id === state.expedition!.missionId) ?? missions[0];
  const enemyIds = mission.enemyWaves[nodeIndex] ?? node.enemyIds;
  return addLog({ ...state, expedition: { ...state.expedition, nodeIndex, enemies: enemyIds.map(enemyById) } }, `${node.title}：${node.description}`);
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'NAVIGATE': return { ...state, page: action.page };
    case 'OPEN_MANAGEMENT': return { ...state, page: 'management', managementTab: action.tab };
    case 'ACCEPT_MISSION': {
      const mission = missions.find((item) => item.id === action.missionId);
      return mission ? addLog({ ...state, selectedMissionId: mission.id }, `已接受任务：${mission.title}。`) : state;
    }
    case 'TOGGLE_PARTY': {
      const hero = state.roster.find((item) => item.id === action.heroId);
      if (!hero?.recruited) return addLog(state, '需要先招募这名队员。');
      if (state.selectedHeroIds.includes(action.heroId)) return { ...state, selectedHeroIds: state.selectedHeroIds.filter((id) => id !== action.heroId) };
      if (state.selectedHeroIds.length >= 3) return addLog(state, '首版远征最多派出三人。');
      return { ...state, selectedHeroIds: [...state.selectedHeroIds, action.heroId] };
    }
    case 'MOVE_PARTY': {
      const targetIndex = action.index + action.direction;
      if (action.index < 0 || targetIndex < 0 || action.index >= state.selectedHeroIds.length || targetIndex >= state.selectedHeroIds.length) return state;
      const selectedHeroIds = [...state.selectedHeroIds];
      [selectedHeroIds[action.index], selectedHeroIds[targetIndex]] = [selectedHeroIds[targetIndex], selectedHeroIds[action.index]];
      return { ...state, selectedHeroIds };
    }
    case 'EQUIP_ITEM': {
      const hero = state.roster.find((item) => item.id === action.heroId);
      const item = itemDefinitions.find((candidate) => candidate.id === action.itemId && candidate.kind === 'equipment');
      if (!hero || !item?.slot) return state;
      if (item.allowedClasses && !item.allowedClasses.includes(hero.heroClass)) return addLog(state, `${hero.name}无法使用${item.name}。`);
      const alreadyEquipped = hero.equipment[item.slot] === item.id;
      if (!alreadyEquipped && availableItemCount(state, item.id) < 1) return addLog(state, `${item.name}没有可用数量。`);
      return addLog(editHero(state, hero.id, (target) => ({ ...target, equipment: { ...target.equipment, [item.slot as EquipmentSlot]: item.id } })), `${hero.name}装备了${item.name}。`);
    }
    case 'UNEQUIP_ITEM': {
      const hero = state.roster.find((item) => item.id === action.heroId);
      if (!hero?.equipment[action.slot]) return state;
      const equipment = { ...hero.equipment };
      const itemName = itemDefinitions.find((item) => item.id === equipment[action.slot])?.name ?? '装备';
      delete equipment[action.slot];
      return addLog(editHero(state, hero.id, (target) => ({ ...target, equipment })), `${hero.name}卸下了${itemName}。`);
    }
    case 'RECRUIT': {
      if (state.gold < 25) return addLog(state, '金币不足，无法招募。');
      const hero = state.roster.find((item) => item.id === action.heroId);
      if (!hero || hero.recruited) return state;
      return addLog(editHero({ ...state, gold: state.gold - 25 }, hero.id, (item) => ({ ...item, recruited: true })), `${hero.name}签下了远征契约。`);
    }
    case 'UPGRADE_GEAR': {
      const hero = state.roster.find((item) => item.id === action.heroId);
      const cost = 30 + (hero?.gearLevel ?? 0) * 20;
      if (!hero || hero.gearLevel >= 3 || state.gold < cost) return addLog(state, '当前无法升级装备。');
      return addLog(editHero({ ...state, gold: state.gold - cost }, hero.id, (item) => ({ ...item, gearLevel: item.gearLevel + 1 })), `${hero.name}的装备提升至 ${hero.gearLevel + 1} 级。`);
    }
    case 'START_EXPEDITION': {
      if (state.selectedHeroIds.length < 2) return addLog(state, '至少选择两名队员。');
      const bandage = Math.min(3, state.inventory.bandage ?? 0);
      const sedative = Math.min(1, state.inventory.sedative ?? 0);
      const prepared: GameState = {
        ...state,
        page: 'expedition',
        inventory: { ...state.inventory, bandage: (state.inventory.bandage ?? 0) - bandage, sedative: (state.inventory.sedative ?? 0) - sedative },
        roster: state.roster.map((hero) => state.selectedHeroIds.includes(hero.id) ? { ...hero, hp: hero.maxHp, morale: 0 } : hero),
        expedition: { missionId: state.selectedMissionId, nodeIndex: 0, formation: [...state.selectedHeroIds], enemies: [], supplies: { bandage, sedative } },
      };
      return enterNode(prepared, 0);
    }
    case 'ATTACK': {
      if (!state.expedition?.enemies.some((enemy) => enemy.hp > 0)) return state;
      const hero = state.roster.find((item) => item.id === action.heroId);
      const enemy = state.expedition.enemies.find((item) => item.id === action.enemyId && item.hp > 0) ?? state.expedition.enemies.find((item) => item.hp > 0)!;
      const heroIndex = state.expedition.formation.indexOf(action.heroId);
      const targetDistance = enemy.distance + Math.max(0, heroIndex);
      if (!hero || heroIndex < 0 || !canAttack(hero, enemy, heroIndex)) return addLog(state, `${hero?.name ?? '队员'}无法攻击距离 ${targetDistance} 的目标。`);
      const damage = attackDamage(hero, state.settings.moraleEnabled);
      const nextEnemy = { ...enemy, hp: Math.max(0, enemy.hp - damage) };
      let next: GameState = { ...state, expedition: { ...state.expedition, enemies: state.expedition.enemies.map((item) => item.id === enemy.id ? nextEnemy : item) } };
      const defeatedEnemy = enemy.hp > 0 && nextEnemy.hp === 0;
      const experienceReward = defeatedEnemy ? enemyExperienceReward(enemy) : 0;
      const previousLevels = new Map(next.roster.map((item) => [item.id, item.level]));
      if (experienceReward > 0) {
        const formation = new Set(next.expedition!.formation);
        next = { ...next, roster: next.roster.map((item) => formation.has(item.id) ? gainExperience(item, experienceReward) : item) };
      }
      const leveledHeroes = next.roster.filter((item) => item.level > (previousLevels.get(item.id) ?? item.level)).map((item) => `${item.name}升至 ${item.level} 级`);
      const experienceLog = defeatedEnemy ? `全队获得 ${experienceReward} 经验${leveledHeroes.length > 0 ? `，${leveledHeroes.join('、')}` : ''}。` : '';
      const defeatedAll = next.expedition!.enemies.every((item) => item.hp <= 0);
      if (defeatedAll) return addLog({ ...next, gold: next.gold + 12 * state.expedition.enemies.length }, `${hero.name}结束了战斗，队伍获得战利品。${experienceLog}`);
      for (const attacker of next.expedition!.enemies.filter((item) => item.hp > 0)) {
        const targetIndex = next.expedition!.formation.findIndex((id, index) => next.roster.find((item) => item.id === id)!.hp > 0 && enemyCanAttack(attacker, index));
        if (targetIndex < 0) continue;
        const targetId = next.expedition!.formation[targetIndex];
        next = editHero(next, targetId, (target) => ({ ...target, hp: Math.max(0, target.hp - Math.max(1, attacker.damage - equipmentBonuses(target).defense)), morale: state.settings.moraleEnabled ? Math.min(100, target.morale + 11) : target.morale }));
      }
      return addLog(next, `${hero.name}对${enemy.name}造成 ${damage} 点伤害。${experienceLog}存活敌人随后进行了反击。`);
    }
    case 'SWAP': {
      if (!state.expedition || action.index < 0 || action.index >= state.expedition.formation.length - 1) return state;
      const formation = [...state.expedition.formation]; [formation[action.index], formation[action.index + 1]] = [formation[action.index + 1], formation[action.index]];
      return addLog({ ...state, expedition: { ...state.expedition, formation } }, '队伍调整了前后站位。');
    }
    case 'USE_BANDAGE': {
      if (!state.expedition || state.expedition.supplies.bandage < 1) return addLog(state, '绷带已经用完。');
      const hero = state.roster.find((item) => item.id === action.heroId);
      if (!hero || hero.hp <= 0 || hero.hp >= hero.maxHp) return addLog(state, '这名队员现在不需要绷带。');
      const healed = editHero(state, hero.id, (item) => ({ ...item, hp: Math.min(item.maxHp, item.hp + 9) }));
      return addLog({ ...healed, expedition: { ...healed.expedition!, supplies: { ...healed.expedition!.supplies, bandage: healed.expedition!.supplies.bandage - 1 } } }, `${hero.name}使用绷带恢复了生命。`);
    }
    case 'USE_SEDATIVE': {
      if (!state.expedition || !state.settings.moraleEnabled || state.expedition.supplies.sedative < 1) return addLog(state, '当前无法使用镇定剂。');
      const hero = state.roster.find((item) => item.id === action.heroId);
      if (!hero || hero.morale === 0) return addLog(state, '这名队员目前很冷静。');
      const calmed = editHero(state, hero.id, (item) => ({ ...item, morale: Math.max(0, item.morale - 25) }));
      return addLog({ ...calmed, expedition: { ...calmed.expedition!, supplies: { ...calmed.expedition!.supplies, sedative: calmed.expedition!.supplies.sedative - 1 } } }, `${hero.name}的士气压力下降了。`);
    }
    case 'ADVANCE': {
      if (!state.expedition || state.expedition.enemies.some((enemy) => enemy.hp > 0)) return addLog(state, '需要先解决当前遭遇。');
      const nextIndex = state.expedition.nodeIndex + 1;
      if (nextIndex >= expeditionNodes.length) {
        const reward = missions.find((mission) => mission.id === state.expedition!.missionId)?.reward ?? 45;
        const returned = returnExpeditionSupplies(state);
        return addLog({ ...returned, page: 'town', gold: returned.gold + reward, expedition: null }, `远征完成，全队带回 ${reward} 金币。`);
      }
      return enterNode(state, nextIndex);
    }
    case 'RETREAT': {
      const returned = returnExpeditionSupplies(state);
      return addLog({ ...returned, page: 'town', expedition: null }, '队伍提前撤回城镇。');
    }
    case 'TOGGLE_MORALE': return { ...state, settings: { ...state.settings, moraleEnabled: !state.settings.moraleEnabled } };
    case 'TOGGLE_LLM': return { ...state, settings: { ...state.settings, llmEnabled: !state.settings.llmEnabled } };
    case 'RESET': return createInitialGame();
  }
}

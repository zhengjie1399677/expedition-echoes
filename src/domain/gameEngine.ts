import { baseAttack, enemies, expeditionNodes, initialHeroes } from '../content/gameContent';
import type { Enemy, GameAction, GameState, Hero } from './model';

const enemyById = (id: string): Enemy => ({ ...enemies.find((enemy) => enemy.id === id)! });
const addLog = (state: GameState, message: string): GameState => ({ ...state, log: [message, ...state.log].slice(0, 8) });
const editHero = (state: GameState, id: string, edit: (hero: Hero) => Hero): GameState => ({ ...state, roster: state.roster.map((hero) => hero.id === id ? edit(hero) : hero) });

export function createInitialGame(): GameState {
  return { version: 2, page: 'tavern', gold: 100, roster: initialHeroes.map((hero) => ({ ...hero })), selectedHeroIds: ['lan', 'wu', 'xingluo'], expedition: null, settings: { moraleEnabled: true, llmEnabled: true }, log: ['酒馆已经备好第一份远征契约。'] };
}

export function canAttack(hero: Hero, enemy: Enemy, formationIndex = 0): boolean {
  if (hero.hp <= 0 || enemy.hp <= 0) return false;
  const targetDistance = enemy.distance + formationIndex;
  if (hero.heroClass === 'vanguard') return targetDistance === 1;
  if (hero.heroClass === 'mage') return targetDistance >= 2 && targetDistance <= 3;
  return targetDistance >= 1 && targetDistance <= 2;
}

export function attackDamage(hero: Hero, moraleEnabled: boolean): number {
  return Math.max(1, baseAttack[hero.heroClass] + hero.gearLevel - (moraleEnabled && hero.morale >= 50 ? 2 : 0));
}

export function enemyCanAttack(enemy: Enemy, formationIndex: number): boolean {
  const targetDistance = enemy.distance + formationIndex;
  return targetDistance >= enemy.attackMinRange && targetDistance <= enemy.attackMaxRange;
}

function enterNode(state: GameState, nodeIndex: number): GameState {
  const node = expeditionNodes[nodeIndex];
  if (!state.expedition || !node) return state;
  if (node.kind === 'rest') {
    const roster = state.roster.map((hero) => state.expedition!.formation.includes(hero.id) ? { ...hero, hp: Math.min(hero.maxHp, hero.hp + 5), morale: Math.max(0, hero.morale - 12) } : hero);
    return addLog({ ...state, roster, expedition: { ...state.expedition, nodeIndex, enemy: null } }, `${node.title}：${node.description}`);
  }
  return addLog({ ...state, expedition: { ...state.expedition, nodeIndex, enemy: enemyById(node.enemyId) } }, `${node.title}：${node.description}`);
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'NAVIGATE': return { ...state, page: action.page };
    case 'TOGGLE_PARTY': {
      const hero = state.roster.find((item) => item.id === action.heroId);
      if (!hero?.recruited) return addLog(state, '需要先招募这名队员。');
      if (state.selectedHeroIds.includes(action.heroId)) return { ...state, selectedHeroIds: state.selectedHeroIds.filter((id) => id !== action.heroId) };
      if (state.selectedHeroIds.length >= 3) return addLog(state, '首版远征最多派出三人。');
      return { ...state, selectedHeroIds: [...state.selectedHeroIds, action.heroId] };
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
      const prepared: GameState = { ...state, page: 'expedition', roster: state.roster.map((hero) => state.selectedHeroIds.includes(hero.id) ? { ...hero, hp: hero.maxHp, morale: 0 } : hero), expedition: { nodeIndex: 0, formation: [...state.selectedHeroIds], enemy: null, supplies: { bandage: 3, sedative: 1 } } };
      return enterNode(prepared, 0);
    }
    case 'ATTACK': {
      if (!state.expedition?.enemy) return state;
      const hero = state.roster.find((item) => item.id === action.heroId);
      const enemy = state.expedition.enemy;
      const heroIndex = state.expedition.formation.indexOf(action.heroId);
      const targetDistance = enemy.distance + Math.max(0, heroIndex);
      if (!hero || heroIndex < 0 || !canAttack(hero, enemy, heroIndex)) return addLog(state, `${hero?.name ?? '队员'}无法攻击距离 ${targetDistance} 的目标。`);
      const damage = attackDamage(hero, state.settings.moraleEnabled);
      const nextEnemy = { ...enemy, hp: Math.max(0, enemy.hp - damage) };
      let next: GameState = { ...state, expedition: { ...state.expedition, enemy: nextEnemy } };
      if (nextEnemy.hp === 0) return addLog({ ...next, gold: next.gold + 12 }, `${hero.name}击败了${enemy.name}，获得 12 金币。`);
      const targetIndex = state.expedition.formation.findIndex((id, index) => {
        const target = next.roster.find((item) => item.id === id)!;
        return target.hp > 0 && enemyCanAttack(enemy, index);
      });
      if (targetIndex < 0) return addLog(next, `${hero.name}造成 ${damage} 点伤害，${enemy.name}的攻击范围内没有目标。`);
      const targetId = state.expedition.formation[targetIndex];
      const targetName = next.roster.find((item) => item.id === targetId)?.name;
      next = editHero(next, targetId, (target) => ({ ...target, hp: Math.max(0, target.hp - enemy.damage), morale: state.settings.moraleEnabled ? Math.min(100, target.morale + 11) : target.morale }));
      return addLog(next, `${hero.name}造成 ${damage} 点伤害，${enemy.name}反击了范围内的${targetName}。`);
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
      if (!state.expedition || state.expedition.enemy?.hp) return addLog(state, '需要先解决当前遭遇。');
      const nextIndex = state.expedition.nodeIndex + 1;
      if (nextIndex >= expeditionNodes.length) return addLog({ ...state, page: 'tavern', gold: state.gold + 45, expedition: null }, '远征完成，全队带回 45 金币。');
      return enterNode(state, nextIndex);
    }
    case 'RETREAT': return addLog({ ...state, page: 'tavern', expedition: null }, '队伍提前撤回酒馆。');
    case 'TOGGLE_MORALE': return { ...state, settings: { ...state.settings, moraleEnabled: !state.settings.moraleEnabled } };
    case 'TOGGLE_LLM': return { ...state, settings: { ...state.settings, llmEnabled: !state.settings.llmEnabled } };
    case 'RESET': return createInitialGame();
  }
}

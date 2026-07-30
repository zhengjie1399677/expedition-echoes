import { itemById, itemDefinitions } from '../content/gameContent';
import type { EquipmentSlot, GameAction, GameState } from './model';
import { addLog, editHero } from './shared';
import { availableItemCount } from './combat';
import { BALANCE } from './config';

export function partyReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'TOGGLE_PARTY': {
      const hero = state.roster.find((item) => item.id === action.heroId);
      if (!hero?.recruited) return addLog(state, '需要先招募这名队员。');
      if (state.selectedHeroIds.includes(action.heroId)) return { ...state, selectedHeroIds: state.selectedHeroIds.filter((id) => id !== action.heroId) };
      if (state.selectedHeroIds.length >= BALANCE.partyMaxSize) return addLog(state, `首版远征最多派出 ${BALANCE.partyMaxSize} 人。`);
      return { ...state, selectedHeroIds: [...state.selectedHeroIds, action.heroId] };
    }
    case 'MOVE_PARTY': {
      const targetIndex = action.index + action.direction;
      if (action.index < 0 || targetIndex < 0 || action.index >= state.selectedHeroIds.length || targetIndex >= state.selectedHeroIds.length) {
        return addLog(state, '队员位置无法调整。');
      }
      const selectedHeroIds = [...state.selectedHeroIds];
      [selectedHeroIds[action.index], selectedHeroIds[targetIndex]] = [selectedHeroIds[targetIndex], selectedHeroIds[action.index]];
      return { ...state, selectedHeroIds };
    }
    case 'EQUIP_ITEM': {
      const hero = state.roster.find((item) => item.id === action.heroId);
      const item = itemDefinitions.find((candidate) => candidate.id === action.itemId && candidate.kind === 'equipment');
      if (!hero) return addLog(state, '未找到这名队员。');
      if (!item?.slot) return addLog(state, '未找到该装备。');
      if (item.allowedClasses && !item.allowedClasses.includes(hero.heroClass)) return addLog(state, `${hero.name}无法使用${item.name}。`);
      const alreadyEquipped = hero.equipment[item.slot] === item.id;
      if (!alreadyEquipped && availableItemCount(state, item.id) < 1) return addLog(state, `${item.name}没有可用数量。`);
      return addLog(editHero(state, hero.id, (target) => ({ ...target, equipment: { ...target.equipment, [item.slot as EquipmentSlot]: item.id } })), `${hero.name}装备了${item.name}。`);
    }
    case 'UNEQUIP_ITEM': {
      const hero = state.roster.find((item) => item.id === action.heroId);
      if (!hero) return addLog(state, '未找到这名队员。');
      if (!hero.equipment[action.slot]) return addLog(state, `${hero.name}该槽位未装备物品。`);
      const equipment = { ...hero.equipment };
      const equippedId = equipment[action.slot];
      const itemName = (equippedId && itemById.get(equippedId)?.name) ?? '装备';
      delete equipment[action.slot];
      return addLog(editHero(state, hero.id, (target) => ({ ...target, equipment })), `${hero.name}卸下了${itemName}。`);
    }
    case 'RECRUIT': {
      if (state.gold < BALANCE.recruitCost) return addLog(state, '金币不足，无法招募。');
      const hero = state.roster.find((item) => item.id === action.heroId);
      if (!hero) return addLog(state, '未找到这名队员。');
      if (hero.recruited) return addLog(state, `${hero.name}已经签约。`);
      return addLog(editHero({ ...state, gold: state.gold - BALANCE.recruitCost }, hero.id, (item) => ({ ...item, recruited: true })), `${hero.name}签下了远征契约。`);
    }
    case 'UPGRADE_GEAR': {
      const hero = state.roster.find((item) => item.id === action.heroId);
      const cost = BALANCE.upgradeBaseCost + (hero?.gearLevel ?? 0) * BALANCE.upgradeCostPerLevel;
      if (!hero || hero.gearLevel >= BALANCE.gearLevelCap || state.gold < cost) return addLog(state, '当前无法升级装备。');
      return addLog(editHero({ ...state, gold: state.gold - cost }, hero.id, (item) => ({ ...item, gearLevel: item.gearLevel + 1 })), `${hero.name}的装备提升至 ${hero.gearLevel + 1} 级。`);
    }
    default: return state;
  }
}

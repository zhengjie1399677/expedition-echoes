import { craftingRecipes, itemDefinitions, materialName, materialSellPrices, rarityNames } from '../content/gameContent';
import type { Enemy, GameAction, GameState, MaterialInventory, Rarity } from './model';
import { addLog } from './shared';

// 材料库存与掉落工具。key 形如 `${typeId}:${rarity}`，避免在多处拼字符串。
export const materialKey = (typeId: string, rarity: Rarity) => `${typeId}:${rarity}`;
export const describeMaterial = (typeId: string, rarity: Rarity) => `${materialName(typeId)}·${rarityNames[rarity]}`;
export const addMaterials = (inventory: MaterialInventory, gains: { typeId: string; rarity: Rarity; count?: number }[]): MaterialInventory => {
  const next = { ...inventory };
  for (const g of gains) {
    const key = materialKey(g.typeId, g.rarity);
    next[key] = (next[key] ?? 0) + (g.count ?? 1);
  }
  return next;
};
// 遍历当前波次敌人的掉落表，按 chance 独立结算。
export const rollDrops = (enemyList: Enemy[]): { typeId: string; rarity: Rarity }[] => {
  const drops: { typeId: string; rarity: Rarity }[] = [];
  for (const enemy of enemyList) {
    if (!enemy.drops) continue;
    for (const drop of enemy.drops) if (Math.random() < drop.chance) drops.push({ typeId: drop.typeId, rarity: drop.rarity });
  }
  return drops;
};

export function economyReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SELL_MATERIAL': {
      const count = Math.max(0, action.count);
      if (count === 0) return addLog(state, '出售数量必须大于 0。');
      const key = materialKey(action.typeId, action.rarity);
      const owned = state.materials[key] ?? 0;
      const actual = Math.min(count, owned);
      if (actual === 0) return addLog(state, '该材料没有库存可出售。');
      const gain = actual * materialSellPrices[action.rarity];
      const materials = { ...state.materials, [key]: owned - actual };
      return addLog({ ...state, materials, gold: state.gold + gain }, `出售 ${describeMaterial(action.typeId, action.rarity)} ×${actual}，获得 ${gain} 金币。`);
    }
    case 'CRAFT_ITEM': {
      const recipe = craftingRecipes.find((item) => item.id === action.recipeId);
      if (!recipe) return state;
      if (state.gold < recipe.goldCost) return addLog(state, '金币不足以支付打造费用。');
      const missing = recipe.materials.find((m) => (state.materials[materialKey(m.typeId, m.rarity)] ?? 0) < m.count);
      if (missing) return addLog(state, `${describeMaterial(missing.typeId, missing.rarity)} 库存不足，无法打造。`);
      const materials = { ...state.materials };
      for (const m of recipe.materials) {
        const key = materialKey(m.typeId, m.rarity);
        materials[key] = (materials[key] ?? 0) - m.count;
      }
      const resultItem = itemDefinitions.find((item) => item.id === recipe.resultItemId);
      const inventory = { ...state.inventory, [recipe.resultItemId]: (state.inventory[recipe.resultItemId] ?? 0) + 1 };
      return addLog({ ...state, materials, inventory, gold: state.gold - recipe.goldCost }, `打造完成：${resultItem?.name ?? recipe.resultItemId} 已加入背包。`);
    }
    default: return state;
  }
}

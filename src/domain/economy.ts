import { craftingRecipes, giftDefinitions, itemDefinitions, marketPrices, materialName, materialSellPrices, missions, rarityNames } from '../content/gameContent';
import type { Enemy, GameAction, GameState, MaterialInventory, Rarity, SettlementState } from './model';
import { addLog, returnExpeditionSupplies } from './shared';

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

// 把库存 key 解析回结构化对象，统一处理越界/异常值，避免 as any。
export function parseRarityKey(key: string): { typeId: string; rarity: Rarity; count: number } | null {
  const [typeId, rarityStr] = key.split(':');
  const rarity = Number(rarityStr);
  if (!typeId || !Number.isInteger(rarity) || rarity < 0 || rarity > 4) return null;
  return { typeId, rarity: rarity as Rarity, count: 0 };
}



// 把 expedition.gainedMaterials 的 key 形式转成结构化列表，便于 addMaterials 复用。
export function materialsFromInventory(inventory: MaterialInventory): { typeId: string; rarity: Rarity; count: number }[] {
  const out: { typeId: string; rarity: Rarity; count: number }[] = [];
  for (const [key, count] of Object.entries(inventory)) {
    const parsed = parseRarityKey(key);
    if (parsed && count > 0) out.push({ typeId: parsed.typeId, rarity: parsed.rarity, count });
  }
  return out;
}

// 遍历当前波次敌人的掉落表，按 chance 独立结算。
export const rollDrops = (enemyList: Enemy[]): { typeId: string; rarity: Rarity }[] => {
  const drops: { typeId: string; rarity: Rarity }[] = [];
  for (const enemy of enemyList) {
    if (!enemy.drops) continue;
    for (const drop of enemy.drops) if (Math.random() < drop.chance) drops.push({ typeId: drop.typeId, rarity: drop.rarity });
  }
  return drops;
};

// 远征结算公共逻辑：撤销 expedition、返还剩余补给、发放战利品、设置 settlement 页面。
// 用于 ADVANCE（胜利）、RETREAT（撤退）、ATTACK 全灭（失败）三种结束流程，避免三处重复。
export function settleExpedition(
  state: GameState,
  outcome: SettlementState['outcome'],
  lootGold: number,
  lootMaterials: MaterialInventory,
  gainedExperience: number,
  logMessage: string,
): GameState {
  if (!state.expedition) return state;
  const consumed = {
    food: state.expedition.startSupplies.food - state.expedition.supplies.food,
    bandage: state.expedition.startSupplies.bandage - state.expedition.supplies.bandage,
    sedative: state.expedition.startSupplies.sedative - state.expedition.supplies.sedative,
    fireBomb: state.expedition.startSupplies.fireBomb - state.expedition.supplies.fireBomb,
    shieldElixir: state.expedition.startSupplies.shieldElixir - state.expedition.supplies.shieldElixir,
  };
  const settlement: SettlementState = { outcome, consumedSupplies: consumed, lootGold, lootMaterials, gainedExperience };
  const missionTitle = missions.find((mission) => mission.id === state.expedition!.missionId)?.title;
  const returned = returnExpeditionSupplies(state);
  const next: GameState = {
    ...returned,
    gold: returned.gold + lootGold,
    materials: addMaterials(returned.materials, materialsFromInventory(lootMaterials)),
    page: 'settlement',
    settlement,
    dayReport: { completedDay: state.day, outcome, missionTitle, townNews: '', recovery: [], reactions: [] },
    expedition: null,
    hasAcceptedMission: false,
  };
  return addLog(next, logMessage);
}

export function economyReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'BUY_ITEM': {
      const price = marketPrices[action.itemId];
      const item = itemDefinitions.find((entry) => entry.id === action.itemId);
      const gift = giftDefinitions.find((entry) => entry.id === action.itemId);
      if (!price || (!item && !gift)) return addLog(state, '该商品暂不在中央广场出售。');
      if (state.gold < price) return addLog(state, '金币不足，暂时买不起这件商品。');
      const name = item?.name ?? gift!.name;
      return addLog({ ...state, gold: state.gold - price, inventory: { ...state.inventory, [action.itemId]: (state.inventory[action.itemId] ?? 0) + 1 } }, `在中央广场购入${name}，花费 ${price} 金币。`);
    }
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
      if (!recipe) return addLog(state, '未找到该打造配方。');
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

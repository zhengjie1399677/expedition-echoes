export type Page = 'town' | 'tavern' | 'quarters' | 'management' | 'expedition' | 'settings';
export type HeroClass = 'vanguard' | 'ranger' | 'mage' | 'medic';
export type EquipmentSlot = 'weapon' | 'armor' | 'accessory';
export type HeroEquipment = Partial<Record<EquipmentSlot, string>>;
export type ManagementTab = 'party' | 'inventory' | 'equipment' | 'craft';

// 材料稀有度：0 普通 / 1 精良 / 2 稀有 / 3 史诗 / 4 传说
export type Rarity = 0 | 1 | 2 | 3 | 4;
export interface MaterialType { id: string; name: string }
export interface DropEntry { typeId: string; rarity: Rarity; chance: number }
export interface MaterialReward { typeId: string; rarity: Rarity; count: number }
// 材料库存 key 形如 `${typeId}:${rarity}`，值为数量
export type MaterialInventory = Record<string, number>;
// 装备打造配方：消耗材料与金币，产出已有装备入背包
export interface CraftingRecipe {
  id: string; resultItemId: string; materials: MaterialReward[]; goldCost: number;
}

export interface Hero {
  id: string; name: string; heroClass: HeroClass; maxHp: number; hp: number;
  morale: number; gearLevel: number; level: number; experience: number;
  equipment: HeroEquipment; recruited: boolean; personality: string; affinity: number; preferredGiftTags: string[];
}
export interface Enemy {
  id: string; name: string; maxHp: number; hp: number; distance: number;
  attackMinRange: number; attackMaxRange: number; damage: number;
  drops?: DropEntry[];
}
export interface Mission {
  id: string; title: string; summary: string; difficulty: 1 | 2 | 3;
  reward: number; enemyWaves: Record<number, string[]>;
  materialRewards?: MaterialReward[];
}
export interface ItemDefinition {
  id: string; name: string; kind: 'consumable' | 'equipment'; description: string;
  slot?: EquipmentSlot; attack?: number; defense?: number; allowedClasses?: HeroClass[];
}
export interface Supplies { bandage: number; sedative: number }
export interface Expedition { missionId: string; nodeIndex: number; formation: string[]; enemies: Enemy[]; supplies: Supplies }
export interface GameSettings { moraleEnabled: boolean; llmEnabled: boolean }
export interface GameState {
  version: 11; page: Page; gold: number; roster: Hero[]; inventory: Record<string, number>;
  selectedHeroIds: string[]; selectedMissionId: string; managementTab: ManagementTab;
  expedition: Expedition | null; settings: GameSettings; log: string[];
  materials: MaterialInventory; hasAcceptedMission: boolean;
  day: number; missionAcceptedToday: boolean;
  food: number; hunger: number;
  giftsGivenToday: Record<string, number>;
}
export type GameAction =
  | { type: 'NAVIGATE'; page: Page } | { type: 'RECRUIT'; heroId: string }
  | { type: 'OPEN_MANAGEMENT'; tab: ManagementTab }
  | { type: 'TOGGLE_PARTY'; heroId: string } | { type: 'UPGRADE_GEAR'; heroId: string }
  | { type: 'START_EXPEDITION' } | { type: 'ATTACK'; heroId: string; enemyId?: string }
  | { type: 'ACCEPT_MISSION'; missionId: string }
  | { type: 'MOVE_PARTY'; index: number; direction: -1 | 1 }
  | { type: 'EQUIP_ITEM'; heroId: string; itemId: string }
  | { type: 'UNEQUIP_ITEM'; heroId: string; slot: EquipmentSlot }
  | { type: 'SELL_MATERIAL'; typeId: string; rarity: Rarity; count: number }
  | { type: 'CRAFT_ITEM'; recipeId: string }
  | { type: 'SWAP'; index: number } | { type: 'USE_BANDAGE'; heroId: string }
  | { type: 'USE_SEDATIVE'; heroId: string } | { type: 'ADVANCE' }
  | { type: 'RETREAT' } | { type: 'TOGGLE_MORALE' } | { type: 'TOGGLE_LLM' }
  | { type: 'REST_TO_NEXT_DAY' } | { type: 'GIVE_GIFT'; heroId: string; giftId: string } | { type: 'RESET' };

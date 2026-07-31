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
  story?: string;
  skillId: string;
  reactions: Record<'victory' | 'retreat' | 'defeated' | 'idle', string>;
}
export interface Enemy {
  id: string; name: string; maxHp: number; hp: number; distance: number;
  attackMinRange: number; attackMaxRange: number; damage: number;
  drops?: DropEntry[];
  trait?: 'pack' | 'thorns' | 'spores' | 'rock-armor' | 'ancient-core';
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
export interface ExpeditionEventChoice {
  id: string;
  label: string;
  description: string;
  effect: 'recover' | 'scavenge' | 'track';
}
export interface ExpeditionEvent {
  id: string;
  prompt: string;
  choices: ExpeditionEventChoice[];
}
export interface ExpeditionNode {
  kind: 'combat' | 'event';
  title: string;
  description: string;
  background?: string;
  enemyIds?: string[];
  event?: ExpeditionEvent;
}
export interface Supplies { bandage: number; sedative: number; food: number; fireBomb: number; shieldElixir: number }
export interface Expedition {
  missionId: string;
  nodeIndex: number;
  formation: string[];
  enemies: Enemy[];
  supplies: Supplies;
  startSupplies: Supplies;
  gainedGold: number;
  gainedMaterials: MaterialInventory;
  gainedExperience: number;
  eventResolved: boolean;
  skillUses: Record<string, boolean>;
  shieldBuffs: Record<string, boolean>;
}
export interface GameSettings { moraleEnabled: boolean; llmEnabled: boolean }
export interface SettlementState {
  outcome: 'victory' | 'retreat' | 'defeated';
  consumedSupplies: { food: number; bandage: number; sedative: number; fireBomb: number; shieldElixir: number };
  lootGold: number;
  lootMaterials: MaterialInventory;
  gainedExperience: number;
}
export interface DayReport {
  completedDay: number;
  outcome?: SettlementState['outcome'];
  missionTitle?: string;
  townNews: string;
  recovery: { name: string; hp: number; pressure: number; affinity: number }[];
  reactions: { heroId: string; name: string; line: string }[];
}
export interface GameState {
  version: 12; page: Page | 'settlement'; gold: number; roster: Hero[]; inventory: Record<string, number>;
  selectedHeroIds: string[]; selectedMissionId: string; managementTab: ManagementTab;
  expedition: Expedition | null; settings: GameSettings; log: string[];
  materials: MaterialInventory; hasAcceptedMission: boolean;
  day: number; missionAcceptedToday: boolean;
  food: number; hunger: number;
  giftsGivenToday: Record<string, number>;
  settlement: SettlementState | null;
  dayReport: DayReport | null;
}
export type GameAction =
  | { type: 'NAVIGATE'; page: Page } | { type: 'RECRUIT'; heroId: string }
  | { type: 'OPEN_MANAGEMENT'; tab: ManagementTab }
  | { type: 'TOGGLE_PARTY'; heroId: string } | { type: 'UPGRADE_GEAR'; heroId: string }
  | { type: 'START_EXPEDITION'; supplies?: { food: number; bandage: number; sedative: number; fireBomb?: number; shieldElixir?: number } } | { type: 'ATTACK'; heroId: string; enemyId?: string }
  | { type: 'USE_SKILL'; heroId: string; enemyId?: string }
  | { type: 'ACCEPT_MISSION'; missionId: string }
  | { type: 'MOVE_PARTY'; index: number; direction: -1 | 1 }
  | { type: 'EQUIP_ITEM'; heroId: string; itemId: string }
  | { type: 'UNEQUIP_ITEM'; heroId: string; slot: EquipmentSlot }
  | { type: 'SELL_MATERIAL'; typeId: string; rarity: Rarity; count: number }
  | { type: 'BUY_ITEM'; itemId: string }
  | { type: 'CRAFT_ITEM'; recipeId: string }
  | { type: 'SWAP'; index: number } | { type: 'USE_BANDAGE'; heroId: string }
  | { type: 'USE_SEDATIVE'; heroId: string } | { type: 'ADVANCE' }
  | { type: 'RESOLVE_EVENT'; eventId: string; choiceId: string }
  | { type: 'RETREAT' } | { type: 'TOGGLE_MORALE' } | { type: 'TOGGLE_LLM' }
  | { type: 'REST_TO_NEXT_DAY' } | { type: 'GIVE_GIFT'; heroId: string; giftId: string } | { type: 'RESET' }
  | { type: 'CLOSE_SETTLEMENT' } | { type: 'CLOSE_DAY_REPORT' }
  | { type: 'USE_FIRE_BOMB'; heroId: string; enemyId?: string }
  | { type: 'USE_SHIELD_ELIXIR'; heroId: string };

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  effect: {
    type: 'morale_recovery' | 'single_damage' | 'all_damage' | 'heal_single';
    value: number;
  };
}

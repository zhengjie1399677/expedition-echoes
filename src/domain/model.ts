export type Page = 'town' | 'tavern' | 'quarters' | 'management' | 'expedition' | 'settings';
export type HeroClass = 'vanguard' | 'ranger' | 'mage' | 'medic';
export type EquipmentSlot = 'weapon' | 'armor' | 'accessory';
export type HeroEquipment = Partial<Record<EquipmentSlot, string>>;
export type ManagementTab = 'party' | 'inventory' | 'equipment';

export interface Hero {
  id: string; name: string; heroClass: HeroClass; maxHp: number; hp: number;
  morale: number; gearLevel: number; level: number; experience: number;
  equipment: HeroEquipment; recruited: boolean; personality: string;
}
export interface Enemy {
  id: string; name: string; maxHp: number; hp: number; distance: number;
  attackMinRange: number; attackMaxRange: number; damage: number;
}
export interface Mission {
  id: string; title: string; summary: string; difficulty: 1 | 2 | 3;
  reward: number; enemyWaves: Record<number, string[]>;
}
export interface ItemDefinition {
  id: string; name: string; kind: 'consumable' | 'equipment'; description: string;
  slot?: EquipmentSlot; attack?: number; defense?: number; allowedClasses?: HeroClass[];
}
export interface Supplies { bandage: number; sedative: number }
export interface Expedition { missionId: string; nodeIndex: number; formation: string[]; enemies: Enemy[]; supplies: Supplies }
export interface GameSettings { moraleEnabled: boolean; llmEnabled: boolean }
export interface GameState {
  version: 7; page: Page; gold: number; roster: Hero[]; inventory: Record<string, number>;
  selectedHeroIds: string[]; selectedMissionId: string; managementTab: ManagementTab;
  expedition: Expedition | null; settings: GameSettings; log: string[];
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
  | { type: 'SWAP'; index: number } | { type: 'USE_BANDAGE'; heroId: string }
  | { type: 'USE_SEDATIVE'; heroId: string } | { type: 'ADVANCE' }
  | { type: 'RETREAT' } | { type: 'TOGGLE_MORALE' } | { type: 'TOGGLE_LLM' }
  | { type: 'RESET' };

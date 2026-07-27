export type Page = 'town' | 'tavern' | 'quarters' | 'expedition' | 'settings';
export type HeroClass = 'vanguard' | 'ranger' | 'mage' | 'medic';

export interface Hero {
  id: string; name: string; heroClass: HeroClass; maxHp: number; hp: number;
  morale: number; gearLevel: number; recruited: boolean; personality: string;
}
export interface Enemy {
  id: string; name: string; maxHp: number; hp: number; distance: number;
  attackMinRange: number; attackMaxRange: number; damage: number;
}
export interface Supplies { bandage: number; sedative: number }
export interface Expedition { nodeIndex: number; formation: string[]; enemy: Enemy | null; supplies: Supplies }
export interface GameSettings { moraleEnabled: boolean; llmEnabled: boolean }
export interface GameState {
  version: 3; page: Page; gold: number; roster: Hero[]; selectedHeroIds: string[];
  expedition: Expedition | null; settings: GameSettings; log: string[];
}
export type GameAction =
  | { type: 'NAVIGATE'; page: Page } | { type: 'RECRUIT'; heroId: string }
  | { type: 'TOGGLE_PARTY'; heroId: string } | { type: 'UPGRADE_GEAR'; heroId: string }
  | { type: 'START_EXPEDITION' } | { type: 'ATTACK'; heroId: string }
  | { type: 'SWAP'; index: number } | { type: 'USE_BANDAGE'; heroId: string }
  | { type: 'USE_SEDATIVE'; heroId: string } | { type: 'ADVANCE' }
  | { type: 'RETREAT' } | { type: 'TOGGLE_MORALE' } | { type: 'TOGGLE_LLM' }
  | { type: 'RESET' };

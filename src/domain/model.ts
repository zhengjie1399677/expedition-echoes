export type Page = 'town' | 'tavern' | 'quarters' | 'management' | 'expedition' | 'settings';
export type HeroClass = 'vanguard' | 'ranger' | 'mage' | 'medic';
export type EquipmentSlot = 'weapon' | 'armor' | 'accessory';
export type HeroEquipment = Partial<Record<EquipmentSlot, string>>;
export type ManagementTab = 'party' | 'inventory' | 'equipment' | 'craft';

// 稀有度（材料与装备共用）：0 普通 / 1 优良 / 2 稀有 / 3 史诗 / 4 传说
export type Rarity = 0 | 1 | 2 | 3 | 4;
// 区域威胁等级：0 平静 / 1 异动 / 2 危险 / 3 失控
export type ThreatLevel = 0 | 1 | 2 | 3;
export interface Region {
  id: string;
  name: string;
  threat: ThreatLevel;
  description: string;         // 区域一句话状态（供传闻/新闻使用）
  missions: string[];          // 属于该区域的任务 ID（任务板按区域分组）
}
// 战斗意图：敌人行动前的威胁预告（读题→解题）
export type EnemyIntentType = 'attack' | 'charge' | 'guard' | 'pressure';
export interface EnemyIntent {
  type: EnemyIntentType;
  targetHint?: 'front' | 'back' | 'weakest'; // 缺省 front
  damage?: number;    // 覆盖默认伤害（charge 的下一回合倍率见 COMBAT_INTENT_SYSTEM §5）
  pressure?: number;  // pressure 意图施加的额外压力
}
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
  pressure: number; gearLevel: number; level: number; experience: number;
  equipment: HeroEquipment; recruited: boolean; personality: string; affinity: number; preferredGiftTags: string[];
  story?: string;
  // 每名英雄可携带多个主动技能（GDD 原设计为单技能，现扩展为每英雄最多 2 个）。
  // 旧档的 skillId 会在 storage 迁移时并入 skills 首项；读取/回退均以 skills[0] 为主技能。
  skills: string[];
  reactions: Record<'victory' | 'retreat' | 'defeated' | 'idle', string>;
}
export interface Enemy {
  id: string; name: string; maxHp: number; hp: number; distance: number;
  attackMinRange: number; attackMaxRange: number; damage: number;
  drops?: DropEntry[];
  trait?: 'pack' | 'thorns' | 'spores' | 'rock-armor' | 'ancient-core';
  intents?: EnemyIntent[]; // 意图池；缺省视为 [{ type: 'attack' }]
}
export interface Mission {
  id: string; title: string; summary: string; difficulty: 1 | 2 | 3;
  reward: number; enemyWaves: Record<number, string[]>;
  materialRewards?: MaterialReward[];
}
export interface ItemDefinition {
  id: string; name: string; kind: 'consumable' | 'equipment'; description: string;
  slot?: EquipmentSlot; attack?: number; defense?: number; allowedClasses?: HeroClass[];
  rarity?: Rarity;
}
export interface ExpeditionEventChoice {
  id: string;
  label: string;
  description: string;
  effect: 'recover' | 'scavenge' | 'track' | 'risk_fight' | 'aid_hero' | 'bargain';
  // 效果参数（可选，缺省用 BALANCE 默认值）
  pressureCost?: number;   // 该选择施加的压力
  hpGain?: number;         // 该选择恢复的 HP（用于 aid_hero 单角色）
  goldGain?: number;       // track/bargain 的金币
  material?: { typeId: string; rarity: Rarity; count: number };
  requirement?: string;    // 前置条件描述（如"需要镇定剂"）
  consumes?: Partial<Supplies>; // 选择该选项需消耗的行囊补给（如"绕路休整"消耗 1 份食物）
}
export interface ExpeditionEvent {
  id: string;
  title: string;          // 事件标题（补 title 用于 UI 层级）
  prompt: string;
  background?: string;    // 事件专属背景图（可选）
  choices: ExpeditionEventChoice[];
  once?: boolean;         // 是否为一次性事件（同一远征不重复出现）
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
  // 技能使用记录：键为 `${heroId}:${skillId}`，每名英雄的每个技能每场遭遇限用一次。
  skillUses: Record<string, boolean>;
  shieldBuffs: Record<string, boolean>;
  // 防御姿态记录：键为 heroId，普通防御每场遭遇限用一次（与铁壁药丸的减伤叠加）。
  defendBuffs: Record<string, boolean>;
  seenEvents: string[]; // 本次远征已遇到的一次性事件（once: true 不重复出现）
  enemyIntents: Record<string, EnemyIntent>; // enemyId -> 当前预告的意图
  enemyCharge: Record<string, number>;       // enemyId -> 蓄力层数（charge 意图积累）
}
export interface GameSettings { pressureEnabled: boolean; llmEnabled: boolean }
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
  // 结算瞬间写入的"占位"晨报（仅用于给 REST_TO_NEXT_DAY 传递昨日结果上下文）。
  // pending=true 时 UI 不展示；休息后生成完整晨报时置为 false。
  pending?: boolean;
}
// 事件链状态（M3）：链 ID -> 当前节点。节点推进由明确状态条件触发，LLM 只建议不决定。
export interface EventChainState {
  currentNode: string;        // 当前节点（见 gameContent 的 eventChains 定义）
  completed: boolean;         // 链是否已结束
}
export interface GameState {
  version: 13; page: Page | 'settlement'; gold: number; roster: Hero[]; inventory: Record<string, number>;
  selectedHeroIds: string[]; selectedMissionId: string; managementTab: ManagementTab;
  expedition: Expedition | null; settings: GameSettings; log: string[];
  materials: MaterialInventory; hasAcceptedMission: boolean;
  day: number; missionAcceptedToday: boolean;
  food: number; hunger: number;
  giftsGivenToday: Record<string, number>;
  regions: Record<string, ThreatLevel>; // 区域 ID -> 当前威胁等级（M3 目标框架）
  eventChains: Record<string, EventChainState>; // 事件链 ID -> 状态
  settlement: SettlementState | null;
  dayReport: DayReport | null;
}
export type GameAction =
  | { type: 'NAVIGATE'; page: Page } | { type: 'RECRUIT'; heroId: string }
  | { type: 'OPEN_MANAGEMENT'; tab: ManagementTab }
  | { type: 'TOGGLE_PARTY'; heroId: string } | { type: 'UPGRADE_GEAR'; heroId: string }
  | { type: 'START_EXPEDITION'; supplies?: { food: number; bandage: number; sedative: number; fireBomb?: number; shieldElixir?: number } } | { type: 'ATTACK'; heroId: string; enemyId?: string }
  | { type: 'USE_SKILL'; heroId: string; enemyId?: string; skillId?: string }
  | { type: 'ACCEPT_MISSION'; missionId: string }
  | { type: 'MOVE_PARTY'; index: number; direction: -1 | 1 }
  | { type: 'EQUIP_ITEM'; heroId: string; itemId: string }
  | { type: 'UNEQUIP_ITEM'; heroId: string; slot: EquipmentSlot }
  | { type: 'SELL_MATERIAL'; typeId: string; rarity: Rarity; count: number }
  | { type: 'BUY_ITEM'; itemId: string }
  | { type: 'CRAFT_ITEM'; recipeId: string }
  | { type: 'USE_BANDAGE'; heroId: string }
  | { type: 'USE_SEDATIVE'; heroId: string } | { type: 'ADVANCE' }
  | { type: 'RESOLVE_EVENT'; eventId: string; choiceId: string }
  | { type: 'RETREAT' } | { type: 'TOGGLE_PRESSURE' } | { type: 'TOGGLE_LLM' }
  | { type: 'REST_TO_NEXT_DAY' } | { type: 'GIVE_GIFT'; heroId: string; giftId: string } | { type: 'RESET' }
  | { type: 'CLOSE_SETTLEMENT' } | { type: 'CLOSE_DAY_REPORT' }
  | { type: 'USE_FIRE_BOMB'; heroId: string; enemyId?: string }
  | { type: 'USE_SHIELD_ELIXIR'; heroId: string }
  | { type: 'DEFEND'; heroId: string }
  | { type: 'ESCALATE_REGION'; regionId: string }
  | { type: 'ADVANCE_EVENT_CHAIN'; chainId: string };

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  effect: {
    type: 'pressure_recovery' | 'single_damage' | 'all_damage' | 'heal_single';
    value: number;
  };
}

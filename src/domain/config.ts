// 全局平衡常量集中点：所有"魔法数字"统一在此声明，便于策划调整与单元测试覆盖。
// 之前散落在 combat/expedition/party 等文件中的硬编码值，均改为引用本文件的常量。

export const BALANCE = {
  // 经验与升级
  experienceBase: 15, // 经验公式基础值
  experiencePerLevel: 15, // 经验公式每级增量
  enemyExperienceBase: 8, // 击杀敌人经验基础值
  enemyExperiencePerHp: 8, // 击杀敌人经验按 maxHp 折算的分母
  levelUpHealthGain: 3, // 每升一级增加的最大生命
  // 职业被动
  rangerBackRowDamageBonus: 2, // 游侠后排伤害加成
  mageNeighborDamageBonus: 2, // 术士相邻队友伤害加成
  mageIsolatedDamagePenalty: 1, // 术士孤立伤害惩罚
  // 士气与饥饿
  moraleDamageReduction: 2, // 高士气减伤
  moraleThreshold: 50, // 触发减伤的士气阈值
  hungerDamagePenaltyPerStack: 1, // 每层饥饿减伤
  counterattackMoraleGain: 11, // 被反击后士气增长
  moraleCap: 100, // 士气上限
  // 先锋被动
  vanguardDamageReduction: 1, // 先锋前排减伤
  vanguardCounterattackDamage: 2, // 先锋贴身反击伤害
  // 战斗奖励
  lootGoldPerEnemy: 12, // 每击败一个敌人的金币奖励
  // 远征节点
  restNodeHpRecover: 5, // 休息节点生命恢复
  restNodeMoraleRecover: 12, // 休息节点士气降低
  // 远征补给
  bandageHealAmount: 9, // 绷带治疗量
  sedativeMoraleReduce: 25, // 镇定剂降低士气
  // 招募与升级
  recruitCost: 25, // 招募英雄金币
  upgradeBaseCost: 30, // 装备升级基础金币
  upgradeCostPerLevel: 20, // 装备升级每级增量
  gearLevelCap: 3, // 装备等级上限
  // 远征限制
  partyMaxSize: 3, // 队伍最大人数
  partyMinSize: 2, // 队伍最小人数
  suppliesCap: 10, // 出征行囊上限
  // 默认奖励
  missionDefaultReward: 45, // 任务无 reward 字段时的默认金币奖励
} as const;

export type BalanceConfig = typeof BALANCE;

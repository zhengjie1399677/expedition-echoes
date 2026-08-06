// 全局平衡常量集中点：所有"魔法数字"统一在此声明，便于策划调整与单元测试覆盖。
// 之前散落在 combat/expedition/party 等文件中的硬编码值，均改为引用本文件的常量。

export const BALANCE = {
  // 经验与升级
  experienceBase: 15, // 经验公式基础值
  experiencePerLevel: 15, // 经验公式每级增量
  enemyExperienceBase: 8, // 击杀敌人经验基础值
  enemyExperiencePerHp: 8, // 击杀敌人经验按 maxHp 折算的分母
  levelUpHealthGain: 5, // 每升一级增加的最大生命
  levelUpAttackGain: 2, // 每升一级增加的基础攻击
  // 职业被动
  rangerBackRowDamageBonus: 2, // 游侠后排伤害加成
  mageNeighborDamageBonus: 2, // 术士相邻队友伤害加成
  mageIsolatedDamagePenalty: 1, // 术士孤立伤害惩罚
  // 压力与饥饿
  pressureDamageReduction: 2, // 高压力减伤
  pressureThreshold: 50, // 触发减伤的压力阈值
  hungerDamagePenaltyPerStack: 1, // 每层饥饿减伤
  counterattackPressureGain: 11, // 被反击后压力增长
  pressureCap: 100, // 压力上限
  // 先锋被动
  vanguardDamageReduction: 1, // 先锋前排减伤
  vanguardCounterattackDamage: 2, // 先锋贴身反击伤害
  // 战斗奖励
  lootGoldPerEnemy: 12, // 每击败一个敌人的金币奖励
  // 战斗意图
  chargeMaxLayers: 2, // 蓄力层数上限（伤害 ×2 封顶）
  chargeMultiplierPerLayer: 1, // 每层蓄力的伤害倍率增量（1 层 = ×2）
  guardDamageHalved: true, // guard 意图生效期间玩家伤害减半
  // 远征节点
  restNodeHpRecover: 5, // 休息节点生命恢复
  restNodePressureRecover: 12, // 休息节点压力降低
  // 远征补给
  bandageHealAmount: 9, // 绷带治疗量
  sedativePressureReduce: 25, // 镇定剂降低压力
  shieldElixirDamageReduction: 3, // 铁壁药丸减伤
  defendDamageReduction: 4, // 普通防御姿态减伤（与铁壁药丸叠加）
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

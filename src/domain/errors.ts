/**
 * Expedition Echoes / 远征余响 - 统一错误基类与异常层
 */

/**
 * 游戏异常统一基类
 * 继承自原生 Error，保留完整的堆栈轨迹，并支持自定义错误码和元数据。
 */
export class GameError extends Error {
  /** 错误唯一编码，便于 UI 或日志进行国际化与分类处理 */
  public readonly code: string;
  /** 错误发生的时间戳 */
  public readonly timestamp: number;
  /** 可选的附加元数据，用于携带上下文调试信息 */
  public readonly details?: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    
    // 显式修正类名
    this.name = this.constructor.name;
    this.code = code;
    this.timestamp = Date.now();
    this.details = details;

    // 显式修复 TypeScript 下继承内置 Error 类时的原型链问题
    Object.setPrototypeOf(this, new.target.prototype);

    // 捕获堆栈轨迹（在 V8 引擎如 Chrome/Node 环境下有效）
    interface V8ErrorConstructor extends ErrorConstructor {
      captureStackTrace?: (targetObject: object, constructorOpt?: Function) => void;
    }
    const errConst = Error as V8ErrorConstructor;
    if (typeof errConst.captureStackTrace === 'function') {
      errConst.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * -------------------------------------------------------------
 * 1. 核心领域规则异常层 (Core Domain Logic Errors)
 * -------------------------------------------------------------
 */

/**
 * 领域逻辑错误基类
 * 代表违反游戏玩法、规则计算或引擎核心约定的行为。
 */
export class DomainError extends GameError {
  constructor(message: string, code = 'DOMAIN_ERROR', details?: unknown) {
    super(message, code, details);
  }
}

/**
 * 领域动作校验异常
 * 例如：未接任务便试图出征、在冷却/次数限制内重复执行特定 Action、携带物资超限等。
 */
export class DomainActionValidationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'DOMAIN_ACTION_VALIDATION_ERROR', details);
  }
}

/**
 * 领域战斗规则异常
 * 例如：攻击超出攻击距离、对已死亡的目标发起攻击、在错误的站位释放职业技能等。
 */
export class DomainCombatError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'DOMAIN_COMBAT_ERROR', details);
  }
}

/**
 * 领域经济/整备系统异常
 * 例如：金币不足、材料库存不足、试图打造不存在的配方等。
 */
export class DomainEconomyError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'DOMAIN_ECONOMY_ERROR', details);
  }
}

/**
 * 领域远征流程异常
 * 例如：未击败当前节点所有敌人便试图前进、远征状态为空时执行远征专用 Action 等。
 */
export class DomainExpeditionError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'DOMAIN_EXPEDITION_ERROR', details);
  }
}


/**
 * -------------------------------------------------------------
 * 2. 外部基础设施异常层 (Infrastructure Layer Errors)
 * -------------------------------------------------------------
 */

/**
 * 基础设施错误基类
 * 代表读写存储、网络通信、模型服务或第三方插件接口等外部环境异常。
 */
export class InfrastructureError extends GameError {
  constructor(message: string, code = 'INFRASTRUCTURE_ERROR', details?: unknown) {
    super(message, code, details);
  }
}

/**
 * 基础设施存档持久化异常
 * 例如：JSON 解析失败、存档版本过旧且不满足最低升级要求、localStorage 写入失败（额度超限）等。
 */
export class InfrastructureStorageError extends InfrastructureError {
  constructor(message: string, details?: unknown) {
    super(message, 'INFRASTRUCTURE_STORAGE_ERROR', details);
  }
}

/**
 * 基础设施大语言模型 (LLM) 服务与网络连接异常
 * 例如：Mobile Tavern 插件未就绪、SillyTavern 接口响应超时、网络连接中断等。
 */
export class InfrastructureLlmProviderError extends InfrastructureError {
  constructor(message: string, details?: unknown) {
    super(message, 'INFRASTRUCTURE_LLM_PROVIDER_ERROR', details);
  }
}

/**
 * 基础设施叙事协议解析异常
 * 例如：LLM 返回的 XML 回复标签格式严重损坏、解析语义校验后发现非法指令等。
 */
export class InfrastructureNarrativeProtocolError extends InfrastructureError {
  constructor(message: string, details?: unknown) {
    super(message, 'INFRASTRUCTURE_NARRATIVE_PROTOCOL_ERROR', details);
  }
}

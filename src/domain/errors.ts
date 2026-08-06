/**
 * Expedition Echoes / 远征余响 - 统一错误基类与异常层
 *
 * 说明（2026-08-06 清理）：此前定义的领域层异常类（DomainError 及子类、
 * InfrastructureStorageError、InfrastructureNarrativeProtocolError）在生产代码中
 * 零引用，仅被测试实例化验证，属未接入的"为将来写的"死代码，已删除。
 * 当前仅保留被基础设施层实际使用的链路：
 *   GameError（基类）→ InfrastructureError → InfrastructureLlmProviderError
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
 * 基础设施错误基类
 * 代表读写存储、网络通信、模型服务或第三方插件接口等外部环境异常。
 */
export class InfrastructureError extends GameError {
  constructor(message: string, code = 'INFRASTRUCTURE_ERROR', details?: unknown) {
    super(message, code, details);
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

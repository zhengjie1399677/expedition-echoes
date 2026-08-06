import { describe, expect, it } from 'vitest';
import {
  GameError,
  InfrastructureError,
  InfrastructureLlmProviderError,
} from './errors';

describe('游戏统一异常层 (Errors Layer) - 保留生产引用类校验', () => {
  describe('GameError 基类校验', () => {
    it('应正确保存基础属性：message, code, timestamp, details', () => {
      const details = { resource: 'gold', current: 10, required: 50 };
      const error = new GameError('金币不足', 'INSUFFICIENT_FUNDS', details);

      expect(error.message).toBe('金币不足');
      expect(error.code).toBe('INSUFFICIENT_FUNDS');
      expect(error.name).toBe('GameError');
      expect(typeof error.timestamp).toBe('number');
      expect(error.timestamp).toBeLessThanOrEqual(Date.now());
      expect(error.details).toEqual(details);
      expect(error.stack).toBeDefined();
    });

    it('应保持正确的原型链继承关系', () => {
      const error = new GameError('通用错误', 'GENERIC_ERROR');
      expect(error instanceof Error).toBe(true);
      expect(error instanceof GameError).toBe(true);
    });
  });

  describe('InfrastructureError 基础设施异常校验', () => {
    it('继承链应正常工作', () => {
      const err = new InfrastructureError('系统接口错误');
      expect(err instanceof Error).toBe(true);
      expect(err instanceof GameError).toBe(true);
      expect(err instanceof InfrastructureError).toBe(true);
      expect(err.code).toBe('INFRASTRUCTURE_ERROR');
    });

    it('子类 InfrastructureLlmProviderError 应有正确的默认 code 和类型判断', () => {
      const err = new InfrastructureLlmProviderError('LLM 请求超时');
      expect(err instanceof InfrastructureError).toBe(true);
      expect(err instanceof InfrastructureLlmProviderError).toBe(true);
      expect(err.code).toBe('INFRASTRUCTURE_LLM_PROVIDER_ERROR');
    });
  });
});

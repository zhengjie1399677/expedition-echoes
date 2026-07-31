import { describe, expect, it } from 'vitest';
import {
  GameError,
  DomainError,
  DomainActionValidationError,
  DomainCombatError,
  DomainEconomyError,
  DomainExpeditionError,
  InfrastructureError,
  InfrastructureStorageError,
  InfrastructureLlmProviderError,
  InfrastructureNarrativeProtocolError,
} from './errors';

describe('游戏统一异常层 (Errors Layer) - 命名统一后校验', () => {
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

  describe('DomainError 领域逻辑异常校验', () => {
    it('继承链应正常工作', () => {
      const err = new DomainError('领域规则错误');
      expect(err instanceof Error).toBe(true);
      expect(err instanceof GameError).toBe(true);
      expect(err instanceof DomainError).toBe(true);
      expect(err.code).toBe('DOMAIN_ERROR');
    });

    it('子类 DomainActionValidationError 应有正确的默认 code 和类型判断', () => {
      const err = new DomainActionValidationError('非法出征条件', { reason: 'No accepted mission' });
      expect(err instanceof GameError).toBe(true);
      expect(err instanceof DomainError).toBe(true);
      expect(err instanceof DomainActionValidationError).toBe(true);
      expect(err.code).toBe('DOMAIN_ACTION_VALIDATION_ERROR');
      expect(err.details).toEqual({ reason: 'No accepted mission' });
    });

    it('子类 DomainCombatError 应有正确的默认 code 和类型判断', () => {
      const err = new DomainCombatError('目标超出射程');
      expect(err instanceof DomainCombatError).toBe(true);
      expect(err.code).toBe('DOMAIN_COMBAT_ERROR');
    });

    it('子类 DomainEconomyError 应有正确的默认 code 和类型判断', () => {
      const err = new DomainEconomyError('打造配方不存在');
      expect(err instanceof DomainEconomyError).toBe(true);
      expect(err.code).toBe('DOMAIN_ECONOMY_ERROR');
    });

    it('子类 DomainExpeditionError 应有正确的默认 code 和类型判断', () => {
      const err = new DomainExpeditionError('无法探索下一个节点');
      expect(err instanceof DomainExpeditionError).toBe(true);
      expect(err.code).toBe('DOMAIN_EXPEDITION_ERROR');
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

    it('子类 InfrastructureStorageError 应有正确的默认 code 和类型判断', () => {
      const err = new InfrastructureStorageError('读取存档失败', { key: 'save_v12' });
      expect(err instanceof InfrastructureError).toBe(true);
      expect(err instanceof InfrastructureStorageError).toBe(true);
      expect(err.code).toBe('INFRASTRUCTURE_STORAGE_ERROR');
      expect(err.details).toEqual({ key: 'save_v12' });
    });

    it('子类 InfrastructureLlmProviderError 应有正确的默认 code 和类型判断', () => {
      const err = new InfrastructureLlmProviderError('LLM 请求超时');
      expect(err instanceof InfrastructureLlmProviderError).toBe(true);
      expect(err.code).toBe('INFRASTRUCTURE_LLM_PROVIDER_ERROR');
    });

    it('子类 InfrastructureNarrativeProtocolError 应有正确的默认 code 和类型判断', () => {
      const err = new InfrastructureNarrativeProtocolError('XML 格式损毁');
      expect(err instanceof InfrastructureNarrativeProtocolError).toBe(true);
      expect(err.code).toBe('INFRASTRUCTURE_NARRATIVE_PROTOCOL_ERROR');
    });
  });
});

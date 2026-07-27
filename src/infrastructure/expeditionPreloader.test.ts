import { describe, expect, it } from 'vitest';
import { shouldPreloadExpedition } from './expeditionPreloader';

describe('远征资源后台预热策略', () => {
  it('普通网络允许预热', () => {
    expect(shouldPreloadExpedition()).toBe(true);
    expect(shouldPreloadExpedition({ effectiveType: '4g' })).toBe(true);
  });
  it('省流量模式不进行预热', () => {
    expect(shouldPreloadExpedition({ saveData: true, effectiveType: '4g' })).toBe(false);
  });
  it('低速网络不争抢带宽', () => {
    expect(shouldPreloadExpedition({ effectiveType: '2g' })).toBe(false);
    expect(shouldPreloadExpedition({ effectiveType: 'slow-2g' })).toBe(false);
  });
});

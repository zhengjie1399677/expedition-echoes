// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from './logger';

// createLogger 返回对象的方法均会写入模块级 currentLevel；每个用例前重置为默认 info，
// 避免测试间互相污染（setLevel 是唯一修改通道）。
const resetLevel = (): void => {
  createLogger('reset').setLevel('info');
};

describe('createLogger 日志工具', () => {
  beforeEach(() => {
    localStorage.clear();
    resetLevel();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('返回包含 debug/info/warn/error/setLevel 的对象且可调用', () => {
    const logger = createLogger('test');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.setLevel).toBe('function');
    // 调用不抛错
    expect(() => logger.info('no-op')).not.toThrow();
  });

  it('默认级别 info：info/warn/error 输出，debug 被抑制', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logger = createLogger('test');

    logger.debug('debug-msg');
    logger.info('info-msg');
    logger.warn('warn-msg');
    logger.error('error-msg');

    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('setLevel 控制输出：silent 全部抑制，debug 全部放行', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logger = createLogger('test');

    logger.setLevel('silent');
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logger.setLevel('debug');
    logger.debug('d2');
    logger.info('i2');
    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledTimes(1);
  });

  it('输出包含时间戳/级别/命名空间前缀与消息文本', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const logger = createLogger('my-namespace');

    logger.info('hello world');

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const [formatted] = infoSpy.mock.calls[0];
    expect(String(formatted)).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3} \[INFO\] \[my-namespace\] hello world$/);
  });

  it('边界：空消息仍输出带前缀的空文本', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const logger = createLogger('edge');

    logger.info('');

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const [formatted, extra] = infoSpy.mock.calls[0];
    expect(String(formatted)).toMatch(/\[INFO\] \[edge\] $/);
    expect(extra).toBe('');
  });

  it('多参数：extra 作为第二个参数透传', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const logger = createLogger('edge');

    logger.info('with-extra', { gold: 5 });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy.mock.calls[0][1]).toEqual({ gold: 5 });
  });

  it('extra 缺省时第二参数为空字符串', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    createLogger('x').error('boom');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][1]).toBe('');
  });

  it('setLevel 到 warn 后 info 被抑制、warn 仍输出', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logger = createLogger('test');

    logger.setLevel('warn');
    logger.info('suppressed');
    logger.warn('visible');

    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

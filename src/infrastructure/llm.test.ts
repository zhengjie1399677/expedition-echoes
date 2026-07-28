import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialGame } from '../domain/gameEngine';
import { narrativeService } from './llm';

const values = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
};

describe('narrative provider adapters', () => {
  beforeEach(() => {
    values.clear();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorageMock });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('uses the Mobile-Tavern bridge in auto mode', async () => {
    const chat = vi.fn().mockResolvedValue({ text: '“欢迎回来。”' });
    Object.assign(window, { MobileTavernPlugin: { llm: { chat } } });
    const state = createInitialGame();
    const hero = state.roster[0];

    const result = await narrativeService.chat(hero, state, [], '今天过得怎么样？');

    expect(result).toBe('欢迎回来。');
    expect(chat).toHaveBeenCalledOnce();
    expect(chat.mock.calls[0][0].messages.at(-1)).toEqual({ role: 'user', content: '今天过得怎么样？' });
  });

  it('uses SillyTavern generateRaw when selected', async () => {
    const generateRaw = vi.fn().mockResolvedValue('夜里很安静。');
    Object.assign(window, { SillyTavern: { getContext: () => ({ generateRaw }) } });
    narrativeService.provider = 'sillytavern';
    const state = createInitialGame();

    const result = await narrativeService.chat(state.roster[0], state, [], '还没睡吗？');

    expect(result).toBe('夜里很安静。');
    expect(generateRaw).toHaveBeenCalledOnce();
  });
});

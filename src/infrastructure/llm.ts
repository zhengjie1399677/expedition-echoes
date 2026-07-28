import type { GameState, Hero } from '../domain/model';

export type NarrativeProvider = 'auto' | 'mobile-tavern' | 'sillytavern';
export interface NarrativeMessage { role: 'user' | 'assistant'; content: string }
interface PromptMessage { role: 'system' | 'user' | 'assistant'; content: string }
interface MobileTavernLlm {
  chat(options: { messages: PromptMessage[]; sampling?: { temperature?: number; max_tokens?: number } }): Promise<{ text: string }>;
}
interface SillyTavernContext {
  generateRaw(options: { systemPrompt?: string; prompt: string | PromptMessage[] }): Promise<string>;
}

declare global {
  interface Window {
    MobileTavernPlugin?: { llm?: MobileTavernLlm };
    SillyTavern?: { getContext(): SillyTavernContext };
  }
}

const providerKey = 'expedition-inn:narrative-provider';
const fallback = ['今晚先休息吧。明天的路不会因为焦虑就缩短。', '装备已经检查过两遍，剩下的事留给明天。', '至少在这里，每个人都知道彼此的名字。'];
const providerNames = { auto: '自动选择', 'mobile-tavern': 'Mobile-Tavern', sillytavern: 'SillyTavern', offline: '离线对白' } as const;
const cleanReply = (text: string): string => text.trim().replace(/^["“]+|["”]+$/g, '').trim();
const systemPrompt = (hero: Hero) => [
  `你正在扮演中文幻想冒险游戏中的角色“${hero.name}”。`,
  `性格：${hero.personality}。`,
  '地点是角色自己的宿舍，处于远征后的日常时间。',
  '自然回应玩家，保持角色身份和已有对话连续性。',
  '回复一到三句中文对白，不写旁白、动作括号、选项或数值，不替玩家说话。',
].join('\n');
const mobileTavernAvailable = () => typeof window !== 'undefined' && Boolean(window.MobileTavernPlugin?.llm);
const sillyTavernAvailable = () => typeof window !== 'undefined' && Boolean(window.SillyTavern?.getContext);
const resolveProvider = (requested: NarrativeProvider): Exclude<NarrativeProvider, 'auto'> | 'offline' => {
  if (requested === 'mobile-tavern') return mobileTavernAvailable() ? 'mobile-tavern' : 'offline';
  if (requested === 'sillytavern') return sillyTavernAvailable() ? 'sillytavern' : 'offline';
  if (mobileTavernAvailable()) return 'mobile-tavern';
  if (sillyTavernAvailable()) return 'sillytavern';
  return 'offline';
};

export const narrativeService = {
  get provider(): NarrativeProvider {
    if (typeof localStorage === 'undefined') return 'auto';
    const saved = localStorage.getItem(providerKey);
    if (saved === 'host') return 'mobile-tavern';
    return saved === 'mobile-tavern' || saved === 'sillytavern' ? saved : 'auto';
  },
  set provider(value: NarrativeProvider) {
    if (typeof localStorage !== 'undefined') localStorage.setItem(providerKey, value);
  },
  get available() { return resolveProvider(this.provider) !== 'offline'; },
  status(requested?: NarrativeProvider) {
    const selected = requested ?? narrativeService.provider;
    const active = resolveProvider(selected);
    return { requested: selected, active, available: active !== 'offline', label: providerNames[active], mobileTavernAvailable: mobileTavernAvailable(), sillyTavernAvailable: sillyTavernAvailable() };
  },
  async chat(hero: Hero, state: GameState, history: NarrativeMessage[], playerText: string): Promise<string> {
    if (!state.settings.llmEnabled) return fallback[(history.length + state.log.length) % fallback.length];
    const active = resolveProvider(this.provider);
    const messages: PromptMessage[] = [
      { role: 'system', content: systemPrompt(hero) },
      { role: 'user', content: `游戏近况：${state.log[0] ?? '队伍正在城镇休整。'}` },
      ...history.slice(-10),
      { role: 'user', content: playerText },
    ];
    try {
      if (active === 'mobile-tavern') {
        const result = await window.MobileTavernPlugin!.llm!.chat({ messages, sampling: { temperature: 0.8, max_tokens: 220 } });
        return cleanReply(result.text) || fallback[0];
      }
      if (active === 'sillytavern') {
        const result = await window.SillyTavern!.getContext().generateRaw({ systemPrompt: systemPrompt(hero), prompt: messages.slice(1) });
        return cleanReply(result) || fallback[0];
      }
    } catch {
      return '刚才有些走神……能再说一次吗？';
    }
    return fallback[(history.length + state.log.length) % fallback.length];
  },
};

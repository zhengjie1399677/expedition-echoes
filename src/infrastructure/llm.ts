import type { GameState, Hero } from '../domain/model';
interface HostLlm { chat(options: { messages: Array<{ role: string; content: string }> }): Promise<{ text: string }> }
declare global { interface Window { MobileTavernPlugin?: { llm?: HostLlm } } }
const fallback = ['今晚先休息吧。明天的路不会因为焦虑就缩短。', '装备已经检查过两遍，剩下的事留给明天。', '至少在这里，每个人都知道彼此的名字。'];
export const narrativeService = {
  get available() { return Boolean(window.MobileTavernPlugin?.llm); },
  async campLine(hero: Hero, state: GameState): Promise<string> {
    const host = window.MobileTavernPlugin?.llm;
    if (!host || !state.settings.llmEnabled) return fallback[state.log.length % fallback.length];
    try {
      const result = await host.chat({ messages: [
        { role: 'system', content: '为中文小队冒险游戏写一句自然的营地对白。只写对白，不修改游戏数值或状态。' },
        { role: 'user', content: `角色：${hero.name}。性格：${hero.personality}。最近发生：${state.log[0]}` },
      ] });
      return result.text.trim() || fallback[0];
    } catch { return fallback[1]; }
  },
};

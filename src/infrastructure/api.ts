import { InfrastructureLlmProviderError } from '../domain/errors';
import type { NarrativeMessage } from './llm';

export interface LlmApiConfig {
  /** LLM 接口端点，支持标准的 OpenAI Chat Completions 协议（例如本地 Ollama 或 Llama.cpp 端点） */
  endpoint: string;
  /** API 密钥令牌，若调用本地无需认证的模型可为空 */
  apiKey: string;
  /** 使用的模型名称名称，例如 'qwen2.5:7b', 'llama3' */
  model: string;
  /** 超时阀值（毫秒） */
  timeoutMs: number;
}

const CONFIG_KEY = 'expedition-inn:direct-llm-config';

const DEFAULT_CONFIG: LlmApiConfig = {
  endpoint: 'http://localhost:11434/v1/chat/completions',
  apiKey: '',
  model: 'qwen2.5:7b',
  timeoutMs: 15000,
};

/**
 * 获取当前的 LLM API 配置
 */
export function getLlmApiConfig(): LlmApiConfig {
  try {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        endpoint: typeof parsed.endpoint === 'string' ? parsed.endpoint : DEFAULT_CONFIG.endpoint,
        apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : DEFAULT_CONFIG.apiKey,
        model: typeof parsed.model === 'string' ? parsed.model : DEFAULT_CONFIG.model,
        timeoutMs: typeof parsed.timeoutMs === 'number' ? parsed.timeoutMs : DEFAULT_CONFIG.timeoutMs,
      };
    }
  } catch {
    // 忽略部分隔离 iframe 禁用本地存储的情况
  }
  return DEFAULT_CONFIG;
}

/**
 * 持久化保存 LLM API 配置
 */
export function saveLlmApiConfig(config: LlmApiConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // 忽略部分隔离 iframe 禁用本地存储的情况
  }
}

/**
 * 核心系统独立接口调用：直接向配置的大模型 API 发起标准 HTTP POST 请求
 * 
 * @param systemPrompt 系统角色设定
 * @param history 历史消息记录
 * @param playerText 玩家本次对话输入
 * @returns 模型返回的纯文本对白
 * @throws {InfrastructureLlmProviderError} 当网络异常、响应不符规范或超时时抛出统一异常
 */
export async function callDirectLlmApi(
  systemPrompt: string,
  history: NarrativeMessage[],
  playerText: string
): Promise<string> {
  const config = getLlmApiConfig();
  
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(msg => ({ role: msg.role, content: msg.content })),
    { role: 'user', content: playerText }
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.8,
        max_tokens: 220,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      throw new InfrastructureLlmProviderError(
        `LLM API 响应状态异常 (HTTP ${response.status})`,
        { status: response.status, responseText }
      );
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    if (typeof reply !== 'string') {
      throw new InfrastructureLlmProviderError(
        'LLM API 返回的数据不满足 OpenAI 格式规范',
        { responseData: data }
      );
    }

    return reply;
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    // 如果已经属于统一异常，直接向下传递
    if (error instanceof InfrastructureLlmProviderError) {
      throw error;
    }
    
    const isTimeout = error.name === 'AbortError';
    const message = isTimeout 
      ? `LLM API 请求超时 (超过了设定的 ${config.timeoutMs}ms)`
      : `LLM API 网络请求失败: ${error.message || error}`;
      
    throw new InfrastructureLlmProviderError(message, { originalError: error });
  }
}

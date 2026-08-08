import { useState } from 'react';
import type { GameState, GameAction } from '../../domain/model';
import { narrativeService } from '../../infrastructure/llm';
import type { NarrativeProvider } from '../../infrastructure/llm';
import { getLlmApiConfig, saveLlmApiConfig } from '../../infrastructure/api';
import { clearGame } from '../../infrastructure/storage';

export interface SettingsProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export function Settings({ state, dispatch }: SettingsProps) {
  const [provider, setProvider] = useState<NarrativeProvider>(() => narrativeService.provider);
  const [apiConfig, setApiConfig] = useState(() => getLlmApiConfig());
  const connection = narrativeService.status(provider);
  
  const changeProvider = (value: NarrativeProvider) => {
    narrativeService.provider = value;
    setProvider(value);
  };

  const handleConfigChange = (key: keyof typeof apiConfig, value: string | number) => {
    const updated = { ...apiConfig, [key]: value };
    setApiConfig(updated);
    saveLlmApiConfig(updated);
  };

  return (
    <section className="settings-page">
      <p className="eyebrow">设置 · 游戏规则</p>
      <h2>按你想要的节奏游玩。</h2>
      <div className="setting-card">
        <div>
          <strong>压力系统</strong>
          <p>开启后，受击与冒险会增加压力；达到 50 时进入“动摇”，攻击降低 2 点。</p>
        </div>
        <button
          className={`toggle-btn ${state.settings.pressureEnabled ? 'active' : ''}`}
          onClick={() => dispatch({ type: 'TOGGLE_PRESSURE' })}
        >
          {state.settings.pressureEnabled ? '已开启' : '已关闭'}
        </button>
      </div>
      <div className="setting-card">
        <div>
          <strong>真实角色聊天</strong>
          <p>当前：{connection.label}。自动模式优先使用 Mobile-Tavern 插件桥接，其次使用 SillyTavern；均不可用时使用离线对白。</p>
          <small>Mobile-Tavern {connection.mobileTavernAvailable ? '已连接' : '未连接'} · SillyTavern {connection.sillyTavernAvailable ? '已连接' : '未连接'}</small>
        </div>
        <div className="llm-controls">
          <select
            aria-label="聊天接口"
            value={provider}
            onChange={(event) => changeProvider(event.target.value as NarrativeProvider)}
          >
            <option value="auto">自动选择</option>
            <option value="mobile-tavern">Mobile-Tavern</option>
            <option value="sillytavern">SillyTavern</option>
            <option value="direct">独立API(如Ollama)</option>
          </select>
          <button
            className={`toggle-btn ${state.settings.llmEnabled ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_LLM' })}
          >
            {state.settings.llmEnabled ? '已开启' : '已关闭'}
          </button>
        </div>
      </div>

      <div className="setting-card">
        <div>
          <strong>下载 Mobile-Tavern（Android）</strong>
          <p>手机端 AI 聊天宿主，安装后在游戏内选择「Mobile-Tavern」即可启用真实角色聊天；自动模式会优先使用它。</p>
          <small>测试包（debug）· 版本 1.7.10 · 约 201 MB</small>
        </div>
        <a
          className="download-btn"
          href="https://neural-node.xyz/downloads/mobile-tavern-1.7.10.apk"
          download="mobile-tavern-1.7.10.apk"
        >
          下载 APK
        </a>
      </div>

      {provider === 'direct' && (
        <div className="setting-card api-config-card">
          <div className="api-config-form">
            <h3>独立 API 配置 (支持兼容 OpenAI 的接口)</h3>
            <p className="api-config-desc">配置本地运行的 Ollama、Llama.cpp 或其他第三方模型 API。</p>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="api-endpoint">API 端点 (Endpoint)</label>
                <input
                  id="api-endpoint"
                  type="text"
                  value={apiConfig.endpoint}
                  onChange={(e) => handleConfigChange('endpoint', e.target.value)}
                  placeholder="http://localhost:11434/v1/chat/completions"
                />
              </div>
              <div className="form-group">
                <label htmlFor="api-key">API 密钥 (ApiKey - 可选)</label>
                <input
                  id="api-key"
                  type="password"
                  value={apiConfig.apiKey}
                  onChange={(e) => handleConfigChange('apiKey', e.target.value)}
                  placeholder="本地调用留空即可"
                />
              </div>
              <div className="form-group">
                <label htmlFor="api-model">模型名称 (Model)</label>
                <input
                  id="api-model"
                  type="text"
                  value={apiConfig.model}
                  onChange={(e) => handleConfigChange('model', e.target.value)}
                  placeholder="qwen2.5:7b"
                />
              </div>
              <div className="form-group">
                <label htmlFor="api-timeout">超时时间 (Timeout - 毫秒)</label>
                <input
                  id="api-timeout"
                  type="number"
                  value={apiConfig.timeoutMs}
                  onChange={(e) => handleConfigChange('timeoutMs', Number(e.target.value) || 15000)}
                  placeholder="15000"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="setting-card danger">
        <div>
          <strong>重置本地存档</strong>
          <p>清除招募、装备升级与设置，恢复初始状态。</p>
        </div>
        <button
          className="reset-btn"
          onClick={() => {
            clearGame();
            dispatch({ type: 'RESET' });
          }}
        >
          重置
        </button>
      </div>
    </section>
  );
}

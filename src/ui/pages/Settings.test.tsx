// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Settings } from './Settings';
import { createInitialGame } from '../../domain/gameEngine';
import { getLlmApiConfig } from '../../infrastructure/api';

describe('Settings 页面组件', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('点击“压力系统”和“真实角色聊天”的开关时，应分别派发 (dispatch) TOGGLE_MORALE / TOGGLE_LLM Actions', () => {
    const dispatch = vi.fn();
    const state = createInitialGame(); // 默认 moraleEnabled: true, llmEnabled: true

    render(<Settings state={state} dispatch={dispatch} />);

    const toggles = screen.getAllByRole('button', { name: '已开启' });
    expect(toggles.length).toBe(2);

    // 点击压力系统开关
    fireEvent.click(toggles[0]);
    expect(dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_MORALE' });

    // 点击真实角色聊天开关
    fireEvent.click(toggles[1]);
    expect(dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_LLM' });
  });

  it('选择“独立API(如Ollama)”后，应正确渲染 API 端点、密钥、模型和超时的配置表单', () => {
    const dispatch = vi.fn();
    const state = createInitialGame();

    render(<Settings state={state} dispatch={dispatch} />);

    // 默认是 auto，没有独立配置表单
    expect(screen.queryByText(/独立 API 配置/)).toBeNull();

    // 切换到 direct
    const select = screen.getByLabelText('聊天接口');
    fireEvent.change(select, { target: { value: 'direct' } });

    expect(screen.getByText(/独立 API 配置/)).toBeDefined();
    expect(screen.getByLabelText(/API 端点/)).toBeDefined();
    expect(screen.getByLabelText(/API 密钥/)).toBeDefined();
    expect(screen.getByLabelText(/模型名称/)).toBeDefined();
    expect(screen.getByLabelText(/超时时间/)).toBeDefined();
  });

  it('修改 API 表单输入时，应能实时修改 API 配置状态，并持久化保存到 localStorage', () => {
    const dispatch = vi.fn();
    const state = createInitialGame();

    render(<Settings state={state} dispatch={dispatch} />);

    const select = screen.getByLabelText('聊天接口');
    fireEvent.change(select, { target: { value: 'direct' } });

    const endpointInput = screen.getByLabelText(/API 端点/) as HTMLInputElement;
    const modelInput = screen.getByLabelText(/模型名称/) as HTMLInputElement;

    // 修改输入值
    fireEvent.change(endpointInput, { target: { value: 'http://test-server:1234/v1' } });
    fireEvent.change(modelInput, { target: { value: 'test-model:latest' } });

    // 验证状态和本地配置保存
    const savedConfig = getLlmApiConfig();
    expect(savedConfig.endpoint).toBe('http://test-server:1234/v1');
    expect(savedConfig.model).toBe('test-model:latest');
  });
});

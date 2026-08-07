// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { HeroCard } from './HeroCard';
import { createInitialGame } from '../../domain/gameEngine';
import { heroClassNames } from '../../content/gameContent';

describe('HeroCard 组件（冒烟）', () => {
  afterEach(() => {
    cleanup();
  });

  it('冒烟：渲染英雄信息（名称/等级/职业/性格/属性）', () => {
    const dispatch = vi.fn();
    const hero = createInitialGame().roster.find((item) => item.id === 'lan')!;

    render(<HeroCard hero={hero} selected={false} dispatch={dispatch} />);

    // 名称同时出现在头像首字与标题区，可能命中多次
    expect(screen.getAllByText(hero.name).length).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(`Lv\\.${hero.level}`))).toBeDefined();
    expect(screen.getByText(new RegExp(heroClassNames[hero.heroClass]))).toBeDefined();
    expect(screen.getByText(hero.personality)).toBeDefined();
    expect(screen.getByText(new RegExp(`生命 ${hero.maxHp}`))).toBeDefined();
    // 经验条 aria-label 形如 "岚经验 0/30"
    expect(screen.getByLabelText(new RegExp(`${hero.name}经验 0/`))).toBeDefined();
  });

  it('已招募英雄：点击「编入队伍」派发 TOGGLE_PARTY，点击「装备升级」派发 UPGRADE_GEAR', () => {
    const dispatch = vi.fn();
    const hero = { ...createInitialGame().roster.find((item) => item.id === 'lan')!, recruited: true };

    render(<HeroCard hero={hero} selected={false} dispatch={dispatch} />);

    fireEvent.click(screen.getByRole('button', { name: '编入队伍' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_PARTY', heroId: hero.id });

    fireEvent.click(screen.getByRole('button', { name: /装备升级/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'UPGRADE_GEAR', heroId: hero.id });
  });

  it('已编入队伍时按钮文案为「已编入队伍」', () => {
    const dispatch = vi.fn();
    const hero = { ...createInitialGame().roster.find((item) => item.id === 'lan')!, recruited: true };

    render(<HeroCard hero={hero} selected={true} dispatch={dispatch} />);

    expect(screen.getByRole('button', { name: '已编入队伍' })).toBeDefined();
  });

  it('装备等级已满（gearLevel >= 3）时升级按钮禁用', () => {
    const dispatch = vi.fn();
    const hero = {
      ...createInitialGame().roster.find((item) => item.id === 'lan')!,
      recruited: true,
      gearLevel: 3,
    };

    render(<HeroCard hero={hero} selected={false} dispatch={dispatch} />);

    const upgradeButton = screen.getByRole('button', { name: /装备升级/ }) as HTMLButtonElement;
    expect(upgradeButton.disabled).toBe(true);
  });

  it('未招募英雄：显示「招募」并派发 RECRUIT', () => {
    const dispatch = vi.fn();
    const hero = { ...createInitialGame().roster.find((item) => item.id === 'lan')!, recruited: false };

    render(<HeroCard hero={hero} selected={false} dispatch={dispatch} />);

    fireEvent.click(screen.getByRole('button', { name: /招募/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'RECRUIT', heroId: hero.id });
  });
});

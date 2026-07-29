import type { Enemy, GameState, Hero } from './model';
import { enemies } from '../content/gameContent';

// 多个 feature 共享的纯工具：日志、英雄编辑、敌人查表。
export const enemyById = (id: string): Enemy => ({ ...enemies.find((enemy) => enemy.id === id)! });
export const addLog = (state: GameState, message: string): GameState => ({ ...state, log: [message, ...state.log].slice(0, 8) });
export const editHero = (state: GameState, id: string, edit: (hero: Hero) => Hero): GameState => ({ ...state, roster: state.roster.map((hero) => hero.id === id ? edit(hero) : hero) });

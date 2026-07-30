import type { Enemy, GameState, Hero } from './model';
import { enemies } from '../content/gameContent';

// 多个 feature 共享的纯工具：日志、英雄编辑、敌人查表。
// 找不到时返回一个占位敌人，避免 undefined 在调用方传播。
const PLACEHOLDER_ENEMY: Enemy = { id: '__unknown__', name: '未知敌人', maxHp: 1, hp: 1, distance: 1, attackMinRange: 1, attackMaxRange: 1, damage: 0 };
export const enemyById = (id: string): Enemy => {
  const found = enemies.find((enemy) => enemy.id === id);
  return found ? { ...found } : PLACEHOLDER_ENEMY;
};
export const addLog = (state: GameState, message: string): GameState => ({ ...state, log: [message, ...state.log].slice(0, 8) });
export const editHero = (state: GameState, id: string, edit: (hero: Hero) => Hero): GameState => ({ ...state, roster: state.roster.map((hero) => hero.id === id ? edit(hero) : hero) });

export function returnExpeditionSupplies(state: GameState): GameState {
  if (!state.expedition) return state;
  return {
    ...state,
    food: state.food + state.expedition.supplies.food,
    inventory: {
      ...state.inventory,
      bandage: (state.inventory.bandage ?? 0) + state.expedition.supplies.bandage,
      sedative: (state.inventory.sedative ?? 0) + state.expedition.supplies.sedative,
    },
  };
}

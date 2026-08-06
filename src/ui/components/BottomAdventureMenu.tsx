import type { GameState, GameAction } from '../../domain/model';

export interface BottomAdventureMenuProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export function BottomAdventureMenu({ state, dispatch }: BottomAdventureMenuProps) {
  if (state.page === 'expedition' || state.page === 'settings' || state.page === 'settlement') return null;
  const entries = [
    { id: 'town', label: '城镇', glyph: '◇', active: state.page === 'town', action: () => dispatch({ type: 'NAVIGATE', page: 'town' }) },
    { id: 'party', label: '队伍', glyph: 'Ⅲ', active: state.page === 'management' && state.managementTab === 'party', action: () => dispatch({ type: 'OPEN_MANAGEMENT', tab: 'party' }) },
    { id: 'equipment', label: '角色', glyph: '♙', active: state.page === 'management' && state.managementTab === 'equipment', action: () => dispatch({ type: 'OPEN_MANAGEMENT', tab: 'equipment' }) },
    { id: 'inventory', label: '背包', glyph: '▣', active: state.page === 'management' && state.managementTab === 'inventory', action: () => dispatch({ type: 'OPEN_MANAGEMENT', tab: 'inventory' }) },
    { id: 'craft', label: '打造', glyph: '⚒', active: state.page === 'management' && state.managementTab === 'craft', action: () => dispatch({ type: 'OPEN_MANAGEMENT', tab: 'craft' }) },
  ];
  return (
    <nav className="adventure-menu" aria-label="冒险菜单">
      {entries.map((entry) => (
        <button key={entry.id} className={entry.active ? 'active' : ''} onClick={entry.action}>
          <span className="menu-glyph">{entry.glyph}</span>
          <strong className="menu-label">{entry.label}</strong>
        </button>
      ))}
    </nav>
  );
}

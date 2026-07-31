import type { Hero, GameAction } from '../../domain/model';
import { heroClassNames, heroClassDescriptions } from '../../content/gameContent';
import { experienceToNextLevel } from '../../domain/gameEngine';

export interface HeroCardProps {
  hero: Hero;
  selected: boolean;
  dispatch: React.Dispatch<GameAction>;
}

export function HeroCard({ hero, selected, dispatch }: HeroCardProps) {
  const upgradeCost = 30 + hero.gearLevel * 20;
  const nextLevelExperience = experienceToNextLevel(hero.level);
  return (
    <article className={`hero-card ${selected ? 'is-selected' : ''}`}>
      <div className="portrait">{hero.name.slice(0, 1)}</div>
      <div className="hero-info">
        <div className="hero-title">
          <strong>{hero.name}</strong>
          <span>Lv.{hero.level} · {heroClassNames[hero.heroClass]}</span>
        </div>
        <p>{hero.personality}</p>
        <small>{heroClassDescriptions[hero.heroClass]}</small>
        <div className="stats">
          <span>生命 {hero.maxHp}</span>
          <span>装备 +{hero.gearLevel}</span>
        </div>
        <div className="hero-exp" aria-label={`${hero.name}经验 ${hero.experience}/${nextLevelExperience}`}>
          <i style={{ width: `${hero.experience / nextLevelExperience * 100}%` }} />
          <span>EXP {hero.experience}/{nextLevelExperience}</span>
        </div>
        <div className="button-row">
          {!hero.recruited ? (
            <button onClick={() => dispatch({ type: 'RECRUIT', heroId: hero.id })}>招募 · 25 金币</button>
          ) : (
            <>
              <button
                className={selected ? 'active' : ''}
                onClick={() => dispatch({ type: 'TOGGLE_PARTY', heroId: hero.id })}
              >
                {selected ? '已编入队伍' : '编入队伍'}
              </button>
              <button
                disabled={hero.gearLevel >= 3}
                onClick={() => dispatch({ type: 'UPGRADE_GEAR', heroId: hero.id })}
              >
                装备升级 · {upgradeCost}
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

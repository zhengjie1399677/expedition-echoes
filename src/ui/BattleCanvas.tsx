import { useEffect, useRef } from 'react';
import * as Phaser from 'phaser';
import type { Enemy, EnemyIntent, Hero } from '../domain/model';
import { intentDescription } from '../domain/intents';

interface BattleCanvasProps {
  party: Hero[];
  enemies: Enemy[];
  targetEnemyId?: string;
  nodeIndex: number;
  backgroundPath?: string;
  enemyIntents?: Record<string, EnemyIntent>;
  enemyCharge?: Record<string, number>;
  // 每个存活敌人本轮实际会攻击的英雄（由 domain 的 targetForIntent 推导，纯展示，不计算数值）。
  counters?: Record<string, string>;
  canHeroAttack: (hero: Hero, index: number, enemy: Enemy) => boolean;
  onAttack: (heroId: string, enemyId: string) => void;
  onSelectEnemy: (enemyId: string) => void;
  attackRequest?: { heroId: string; nonce: number };
  feedbackRequest?: { kind: 'attack' | 'skill' | 'bandage' | 'sedative' | 'fire-bomb' | 'shield-elixir' | 'enemy-hit'; heroId: string; enemyId?: string; nonce: number; subKind?: 'damage' | 'buff' | 'heal'; skillName?: string };
}

const getAssetUrl = (path: string): string => {
  const base = import.meta.env.BASE_URL || '/';
  const prefix = '/' + 'assets/';
  if (path.startsWith(prefix)) {
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${cleanBase}${path}`;
  }
  return path;
};

const ACTORS: Record<string, string> = {
  lan: '/assets/pixel/lan-vanguard-idle-v2.png',
  wu: '/assets/pixel/wu-archer-idle-v3.png',
  xingluo: '/assets/pixel/xingluo-mage-idle-v3.png',
  cheng: '/assets/pixel/cheng-medic-idle-v2.png',
  yan: '/assets/actors-v2/yan-idle-v2.png',
  scout: '/assets/actors-v2/scout-idle-v2.png',
  warden: '/assets/enemies/ruins-v1/warden-idle-v1.png',
  gatekeeper: '/assets/enemies/ruins-v1/gatekeeper-idle-v1.png',
  'ash-wolf': '/assets/enemies/forest-v1/ash-wolf-v1.png',
  'thorn-stag': '/assets/enemies/forest-v1/thorn-stag-v1.png',
  'spore-beast': '/assets/enemies/forest-v1/spore-beast-v3.png',
  'rock-lizard': '/assets/enemies/forest-v1/rock-lizard-v1.png',
  'grove-guardian': '/assets/enemies/forest-v1/grove-guardian-v1.png',
};

const ACTION_ACTORS: Record<string, string> = {
  lan: '/assets/pixel/lan-vanguard-attack-v1.png',
  wu: '/assets/pixel/wu-archer-attack-v1.png',
  xingluo: '/assets/pixel/xingluo-mage-cast-v1.png',
  cheng: '/assets/pixel/cheng-medic-cast-v2.png',
  // 医师 yan 暂无独立攻击帧，复用医师施法帧（二者皆医师），避免回退到先锋兰的攻击姿势。
  yan: '/assets/pixel/cheng-medic-cast-v2.png',
};

const CHARACTER_HEIGHTS: Record<string, number> = {
  lan: 0.3, wu: 0.31, xingluo: 0.31, cheng: 0.31, yan: 0.33, scout: 0.32,
  warden: 0.28, gatekeeper: 0.36, // 守卫矮壮、门卫高大
  'ash-wolf': 0.2, 'thorn-stag': 0.31, 'spore-beast': 0.28, 'rock-lizard': 0.22, 'grove-guardian': 0.48,
};
const IDLE_FOOT_ORIGIN_Y: Record<string, number> = {
  lan: 1, wu: 0.933, xingluo: 0.969, cheng: 0.96, yan: 0.97, scout: 0.974,
  warden: 0.97, gatekeeper: 0.985,
  'ash-wolf': 0.96, 'thorn-stag': 0.96, 'spore-beast': 0.96, 'rock-lizard': 0.96, 'grove-guardian': 0.96,
};
const ACTION_FOOT_ORIGIN_Y: Record<string, number> = { lan: 0.918, wu: 0.929, xingluo: 0.944, cheng: 0.945 };
type CombatVisual = Phaser.GameObjects.Image | Phaser.GameObjects.Container;
const actorIdForEnemy = (enemy: Enemy) => enemy.id.replace(/-\d+$/, '');
const visualWidth = (visual: CombatVisual) => visual instanceof Phaser.GameObjects.Container ? visual.getBounds().width : visual.displayWidth;
function setVisualTint(visual: CombatVisual, tint?: number) {
  const apply = (image: Phaser.GameObjects.Image) => tint === undefined ? image.clearTint() : image.setTint(tint);
  if (visual instanceof Phaser.GameObjects.Container) visual.list.forEach((child) => { if (child instanceof Phaser.GameObjects.Image) apply(child); }); else apply(visual);
}

class ExpeditionBattleScene extends Phaser.Scene {
  private party: Hero[];
  private enemies: Enemy[];
  private targetEnemyId?: string;
  private nodeIndex: number;
  private backgroundPath?: string;
  private canHeroAttack: BattleCanvasProps['canHeroAttack'];
  private onAttack: BattleCanvasProps['onAttack'];
  private onSelectEnemy: BattleCanvasProps['onSelectEnemy'];
  private enemyIntents: Record<string, EnemyIntent> = {};
  private enemyCharge: Record<string, number> = {};
  private counters: Record<string, string> = {};
  private enemyIntentLabels = new Map<string, Phaser.GameObjects.Text>();
  private heroSprites = new Map<string, CombatVisual>();
  private heroShadows = new Map<string, Phaser.GameObjects.Ellipse>();
  private heroLabels = new Map<string, Phaser.GameObjects.Text>();
  private enemySprite?: Phaser.GameObjects.Image;
  private enemySprites = new Map<string, Phaser.GameObjects.Image>();
  private busy = false;
  private formationKey = '';

  constructor(props: BattleCanvasProps) {
    super('expedition-battle');
    this.party = props.party;
    this.enemies = props.enemies;
    this.targetEnemyId = props.targetEnemyId;
    this.nodeIndex = props.nodeIndex;
    this.backgroundPath = props.backgroundPath;
    this.canHeroAttack = props.canHeroAttack;
    this.onAttack = props.onAttack;
    this.onSelectEnemy = props.onSelectEnemy;
    this.enemyIntents = props.enemyIntents ?? {};
    this.enemyCharge = props.enemyCharge ?? {};
    this.counters = props.counters ?? {};
  }

  preload() {
    this.load.image('battle-bg', getAssetUrl(this.backgroundPath ?? '/assets/world/ruins-road-battle-v2.webp'));
    Object.entries(ACTORS).forEach(([key, path]) => this.load.image(`actor-${key}`, getAssetUrl(path)));
    Object.entries(ACTION_ACTORS).forEach(([key, path]) => this.load.image(`actor-action-${key}`, getAssetUrl(path)));
  }

  create() {
    const { width, height } = this.scale;
    const background = this.add.image(width / 2, height / 2, 'battle-bg');
    const scale = Math.max(width / background.width, height / background.height);
    background.setScale(scale).setDepth(-20);

    this.add.rectangle(width / 2, height - 34, width, 92, 0x241810, 0.06).setDepth(8);
    Object.keys(ACTORS).forEach((key) => this.textures.get(`actor-${key}`).setFilter(Phaser.Textures.FilterMode.NEAREST));
    Object.keys(ACTION_ACTORS).forEach((key) => this.textures.get(`actor-action-${key}`).setFilter(Phaser.Textures.FilterMode.NEAREST));
    this.createAmbientDust(width, height);
    this.createParty(width, height);
    this.createEnemy(width, height);

    this.add.text(24, 22, `第 ${this.nodeIndex + 1} 幕`, {
      fontFamily: '"Noto Serif SC", serif', fontSize: '13px', color: '#c6b577',
      backgroundColor: '#231710bb', padding: { x: 10, y: 6 },
    }).setDepth(20);
    this.add.text(width / 2, height - 26, '点击角色发动攻击 · 金色轮廓表示当前可攻击', {
      fontFamily: '"Noto Serif SC", serif', fontSize: '12px', color: '#fff0bf', stroke: '#1c140e', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(20);
  }

  updateState(props: BattleCanvasProps) {
    const nextFormationKey = props.party.map((hero) => hero.id).join('|');
    const formationChanged = this.formationKey !== '' && this.formationKey !== nextFormationKey;
    this.party = props.party;
    this.enemies = props.enemies;
    this.targetEnemyId = props.targetEnemyId;
    this.canHeroAttack = props.canHeroAttack;
    this.onAttack = props.onAttack;
    this.onSelectEnemy = props.onSelectEnemy;
    this.enemyIntents = props.enemyIntents ?? {};
    this.enemyCharge = props.enemyCharge ?? {};
    this.counters = props.counters ?? {};
    this.refreshEnemyIntents();
    if (formationChanged) this.syncFormation();
    this.formationKey = nextFormationKey;
    this.heroSprites.forEach((sprite, id) => {
      const hero = this.party.find((item) => item.id === id);
      if (hero) sprite.setAlpha(hero.hp <= 0 ? 0.35 : 1);
    });
    this.enemySprites.forEach((sprite, id) => {
      const enemy = this.enemies.find((item) => item.id === id);
      if (enemy) sprite.setAlpha(enemy.hp <= 0 ? .22 : 1).setTint(id === this.targetEnemyId ? 0xffdd82 : 0xffffff);
    });
    this.enemySprite = this.enemySprites.get(this.targetEnemyId ?? '') ?? this.enemySprites.get(this.enemies.find((item) => item.hp > 0)?.id ?? '');
  }

  // 敌人头顶的"威胁预告"：只读 domain 算好的 enemyIntents/enemyCharge，不做任何数值计算。
  // 颜色与 expedition.css 的 .enemy-intent 体系对应（attack 默认 / charge 红 / guard 蓝 / pressure 紫）。
  private refreshEnemyIntents() {
    this.enemySprites.forEach((sprite, id) => {
      const enemy = this.enemies.find((item) => item.id === id);
      const intent = this.enemyIntents[id];
      let label = this.enemyIntentLabels.get(id);
      if (!enemy || !intent || enemy.hp <= 0) {
        if (label) { label.destroy(); this.enemyIntentLabels.delete(id); }
        return;
      }
      if (!label) {
        label = this.add.text(sprite.x, 0, '', {
          fontFamily: '"Noto Serif SC", serif', fontSize: '13px', color: '#f7e7bd',
          backgroundColor: '#3a2110b8', padding: { x: 8, y: 4 }, align: 'center',
        }).setOrigin(0.5, 1).setDepth(21);
        this.enemyIntentLabels.set(id, label);
      }
      const charge = this.enemyCharge[id] ?? 0;
      const typeColor: Record<EnemyIntent['type'], string> = {
        attack: '#f7e7bd', charge: '#ffd9a8', guard: '#d5ecff', pressure: '#ecd7ff',
      };
      const bg: Record<EnemyIntent['type'], string> = {
        attack: '#3a2110b8', charge: '#7a2a1ac7', guard: '#224058c7', pressure: '#4a2658c7',
      };
      label.setText(intentDescription(intent, charge, enemy.name));
      label.setColor(typeColor[intent.type]);
      label.setBackgroundColor(bg[intent.type]);
      label.setPosition(sprite.x, sprite.y - sprite.displayHeight * 0.98);
    });
  }

  requestAttack(heroId: string) {
    const index = this.party.findIndex((hero) => hero.id === heroId);
    const hero = this.party[index];
    const sprite = this.heroSprites.get(heroId);
    if (hero && sprite) this.performAttack(hero, index, sprite, sprite.x);
  }

  private createParty(width: number, height: number) {
    const positions = this.partyPositions(width, height);
    this.party.forEach((hero, index) => {
      const position = positions[index];
      const texture = this.textures.get(`actor-${hero.id}`);
      const sourceImg = texture ? texture.getSourceImage() : null;
      const imgHeight = sourceImg && sourceImg.height > 0 ? sourceImg.height : 32;
      const spriteScale = (height * (CHARACTER_HEIGHTS[hero.id] ?? 0.3)) / imgHeight;
      const sprite: CombatVisual = this.add.image(position.x, position.y, `actor-${hero.id}`).setOrigin(0.5, IDLE_FOOT_ORIGIN_Y[hero.id] ?? 1).setDepth(5 - index).setScale(spriteScale);
      sprite.setAlpha(hero.hp <= 0 ? 0.35 : 1).setInteractive({ useHandCursor: true });
      sprite.setData('baseScaleX', sprite.scaleX).setData('baseScaleY', sprite.scaleY);
      this.heroSprites.set(hero.id, sprite);
      const shadow = this.add.ellipse(position.x, position.y + 2, visualWidth(sprite) * 0.42, 12, 0x020706, 0.36).setDepth(1);
      this.heroShadows.set(hero.id, shadow);
      const available = () => {
        const enemy = this.enemies.find((item) => item.id === this.targetEnemyId) ?? this.enemies.find((item) => item.hp > 0);
        return !!enemy && this.canHeroAttack(hero, this.party.findIndex((item) => item.id === hero.id), enemy) && hero.hp > 0;
      };
      sprite.on('pointerover', () => {
        setVisualTint(sprite, available() ? 0xffe7a0 : 0xa6adb0);
      });
      sprite.on('pointerout', () => {
        setVisualTint(sprite);
      });
      sprite.on('pointerdown', () => this.performAttack(hero, this.party.findIndex((item) => item.id === hero.id), sprite, sprite.x));
      const label = this.add.text(position.x, position.y + 7, hero.name, {
        fontFamily: '"Noto Serif SC", serif', fontSize: '14px', color: '#f4e7bf',
        backgroundColor: '#241812dd', padding: { x: 8, y: 4 },
      }).setOrigin(0.5, 0).setDepth(10);
      this.heroLabels.set(hero.id, label);
      this.playIdle(sprite, index);
    });
    this.formationKey = this.party.map((hero) => hero.id).join('|');
  }

  private partyPositions(width = this.scale.width, height = this.scale.height) {
    return [{ x: width * .4, y: height * .81 }, { x: width * .27, y: height * .81 }, { x: width * .16, y: height * .81 }];
  }

  private playIdle(sprite: CombatVisual, index = 0) {
    const baseScaleX = sprite.getData('baseScaleX') as number;
    const baseScaleY = sprite.getData('baseScaleY') as number;
    this.tweens.killTweensOf(sprite);
    this.tweens.add({ targets: sprite, scaleX: baseScaleX * 1.012, scaleY: baseScaleY * .988, duration: 1000 + index * 120, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  private syncFormation() {
    const positions = this.partyPositions();
    this.party.forEach((hero, index) => {
      const position = positions[index];
      const sprite = this.heroSprites.get(hero.id);
      const shadow = this.heroShadows.get(hero.id);
      const label = this.heroLabels.get(hero.id);
      if (sprite) {
        this.tweens.killTweensOf(sprite);
        this.tweens.add({ targets: sprite, x: position.x, duration: 420, ease: 'Sine.InOut', onComplete: () => this.playIdle(sprite, index) });
        sprite.setDepth(5 - index);
      }
      if (shadow) this.tweens.add({ targets: shadow, x: position.x, duration: 360, ease: 'Sine.InOut' });
      if (label) this.tweens.add({ targets: label, x: position.x, duration: 360, ease: 'Sine.InOut' });
    });
  }

  private createEnemy(width: number, height: number) {
    const primaryEnemy = this.enemies[0];
    if (!primaryEnemy) {
      this.add.text(width * 0.73, height * 0.48, '暂时安全\n风穿过断裂的石柱。', {
        align: 'center', fontFamily: '"Noto Serif SC", serif', fontSize: '23px', color: '#ead28f',
      }).setOrigin(0.5).setDepth(10);
      return;
    }
    const primaryActorId = actorIdForEnemy(primaryEnemy);
    const key = this.textures.exists(`actor-${primaryActorId}`) ? `actor-${primaryActorId}` : 'actor-scout';
    const sprite = this.add.image(width * 0.68, height * 0.81, key).setOrigin(0.5, IDLE_FOOT_ORIGIN_Y[primaryActorId] ?? IDLE_FOOT_ORIGIN_Y.scout).setDepth(4).setInteractive({ useHandCursor: true });
    sprite.setScale((height * (CHARACTER_HEIGHTS[primaryActorId] ?? 0.27)) / sprite.height).setAlpha(primaryEnemy.hp <= 0 ? 0.25 : 1);
    sprite.on('pointerdown', () => this.onSelectEnemy(primaryEnemy.id));
    this.enemySprites.set(primaryEnemy.id, sprite);
    this.enemySprite = sprite;
    this.add.ellipse(width * 0.68, height * 0.81 + 2, sprite.displayWidth * 0.44, 11, 0x07110e, 0.32).setDepth(1);
    this.add.text(width * 0.68, height * 0.81 + 7, primaryEnemy.name, {
      fontFamily: '"Noto Serif SC", serif', fontSize: '15px', color: '#f2b49f',
      backgroundColor: '#321e20df', padding: { x: 9, y: 5 },
    }).setOrigin(0.5, 0).setDepth(10);
    this.enemies.slice(1).forEach((enemy, index) => {
      const x = width * (0.79 + index * 0.11);
      const actorId = actorIdForEnemy(enemy);
      const actorKey = this.textures.exists(`actor-${actorId}`) ? `actor-${actorId}` : 'actor-scout';
      const actor = this.add.image(x, height * .81, actorKey).setOrigin(.5, IDLE_FOOT_ORIGIN_Y[actorId] ?? IDLE_FOOT_ORIGIN_Y.scout).setDepth(3 - index).setInteractive({ useHandCursor: true });
      actor.setScale((height * (CHARACTER_HEIGHTS[actorId] ?? .25)) / actor.height).setAlpha(enemy.hp <= 0 ? .22 : 1);
      actor.on('pointerdown', () => this.onSelectEnemy(enemy.id));
      this.enemySprites.set(enemy.id, actor);
      this.add.ellipse(x, height * .81 + 2, actor.displayWidth * .42, 10, 0x07110e, .28).setDepth(1);
    });
    this.enemySprite = this.enemySprites.get(this.targetEnemyId ?? '') ?? sprite;
  }

  private performAttack(hero: Hero, index: number, sprite: CombatVisual, originX: number) {
    const enemy = this.enemies.find((item) => item.id === this.targetEnemyId && item.hp > 0) ?? this.enemies.find((item) => item.hp > 0);
    if (this.busy || !enemy || !this.enemySprite) return;
    if (!this.canHeroAttack(hero, index, enemy)) {
      this.showFloatingText(sprite.x, sprite.y - sprite.displayHeight * 0.65, '超出攻击范围', '#b9c2bd');
      this.cameras.main.shake(90, 0.0015);
      this.onAttack(hero.id, enemy.id);
      return;
    }
    this.busy = true;
    this.tweens.killTweensOf(sprite);
    if (hero.id === 'wu') {
      this.performArrowAttack(hero, index, sprite);
      return;
    }
    if (hero.id === 'xingluo') {
      this.performMagicAttack(hero, index, sprite);
      return;
    }
    const targetX = this.enemySprite.x - this.enemySprite.displayWidth * 0.28;
    const baseScaleX = sprite.getData('baseScaleX') as number;
    const baseScaleY = sprite.getData('baseScaleY') as number;
    if (sprite instanceof Phaser.GameObjects.Image) {
      const actionKey = ACTION_ACTORS[hero.id] ? `actor-action-${hero.id}` : 'actor-action-lan';
      const originY = ACTION_FOOT_ORIGIN_Y[hero.id] ?? ACTION_FOOT_ORIGIN_Y.lan;
      sprite.setTexture(actionKey).setOrigin(0.5, originY);
    }
    const attackParts = sprite instanceof Phaser.GameObjects.Container ? sprite.getData('attackParts') as Phaser.GameObjects.Image[] : [];
    this.tweens.add({ targets: attackParts, angle: -12, duration: 130, ease: 'Quad.Out' });
    this.tweens.add({
      targets: sprite, x: targetX, scaleX: baseScaleX * 1.12, scaleY: baseScaleY * .9, duration: 330, ease: 'Cubic.In',
      onComplete: () => {
        this.resolveAttack(hero, enemy, 'melee');
        this.tweens.add({
          targets: sprite, x: originX, scaleX: baseScaleX, scaleY: baseScaleY, duration: 430, ease: 'Cubic.Out',
          onComplete: () => {
            if (sprite instanceof Phaser.GameObjects.Image) {
              const actorKey = ACTORS[hero.id] ? `actor-${hero.id}` : 'actor-lan';
              const originY = IDLE_FOOT_ORIGIN_Y[hero.id] ?? 1;
              sprite.setTexture(actorKey).setOrigin(0.5, originY);
            }
            this.tweens.add({ targets: attackParts, angle: 0, duration: 150 });
            this.playIdle(sprite, index);
            this.busy = false;
          },
        });
      },
    });
  }

  private performArrowAttack(hero: Hero, index: number, sprite: CombatVisual) {
    const enemy = this.enemies.find((item) => item.id === this.targetEnemyId && item.hp > 0) ?? this.enemies.find((item) => item.hp > 0);
    if (!enemy || !this.enemySprite) { this.busy = false; return; }
    if (sprite instanceof Phaser.GameObjects.Image) sprite.setTexture('actor-action-wu').setOrigin(.5, ACTION_FOOT_ORIGIN_Y.wu);
    // The attack pose uses a wider transparent canvas than the idle pose.
    // These normalized coordinates point at the bow grip / nocked arrow.
    const startX = sprite.x + sprite.displayWidth * .25;
    const startY = sprite.y - sprite.displayHeight * .64;
    const endX = this.enemySprite.x - this.enemySprite.displayWidth * .18;
    const endY = this.enemySprite.y - this.enemySprite.displayHeight * .55;
    const bowGlow = this.add.circle(startX, startY, 10, 0xffdc83, .85).setDepth(16).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: bowGlow, scale: 2.4, alpha: 0, duration: 280, onComplete: () => bowGlow.destroy() });
    this.time.delayedCall(170, () => {
      const arrow = this.add.container(startX, startY).setDepth(19);
      const shaft = this.add.rectangle(0, 0, 54, 3, 0xffe4a4).setOrigin(.82, .5);
      const head = this.add.triangle(10, 0, 0, -7, 15, 0, 0, 7, 0xfff3c4);
      arrow.add([shaft, head]);
      arrow.setRotation(Math.atan2(endY - startY, endX - startX));
      const trail = this.add.graphics().setDepth(17).setBlendMode(Phaser.BlendModes.ADD);
      trail.lineStyle(5, 0xffcc68, .55).lineBetween(startX, startY, endX, endY);
      this.tweens.add({ targets: trail, alpha: 0, duration: 360, onComplete: () => trail.destroy() });
      this.tweens.add({
        targets: arrow, x: endX, y: endY, duration: 260, ease: 'Cubic.In',
        onComplete: () => {
          arrow.destroy();
          this.resolveAttack(hero, enemy, 'arrow');
          this.restoreHeroAfterAttack(hero, index, sprite, 260);
        },
      });
    });
  }

  private performMagicAttack(hero: Hero, index: number, sprite: CombatVisual) {
    const enemy = this.enemies.find((item) => item.id === this.targetEnemyId && item.hp > 0) ?? this.enemies.find((item) => item.hp > 0);
    if (!enemy || !this.enemySprite) { this.busy = false; return; }
    if (sprite instanceof Phaser.GameObjects.Image) sprite.setTexture('actor-action-xingluo').setOrigin(.5, ACTION_FOOT_ORIGIN_Y.xingluo);
    const castX = sprite.x + sprite.displayWidth * .28;
    const castY = sprite.y - sprite.displayHeight * .58;
    const endX = this.enemySprite.x - this.enemySprite.displayWidth * .18;
    const endY = this.enemySprite.y - this.enemySprite.displayHeight * .52;
    const sigilBack = this.add.star(castX, castY, 8, 22, 46, 0x69cfe9, .2).setDepth(16).setBlendMode(Phaser.BlendModes.ADD);
    const sigilFront = this.add.star(castX, castY, 4, 15, 38, 0xffd978, .3).setDepth(17).setAngle(45).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: sigilBack, angle: 80, scale: 1.18, alpha: .08, duration: 620, ease: 'Sine.Out' });
    this.tweens.add({ targets: sigilFront, angle: -35, scale: .82, alpha: .12, duration: 620, ease: 'Sine.Out' });
    const star = this.add.star(castX, castY, 6, 8, 19, 0xd9f8ff, 1).setDepth(19).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: star, scale: 1.45, angle: 90, duration: 280, ease: 'Back.Out' });
    this.time.delayedCall(300, () => {
      this.tweens.add({
        targets: star, x: endX, y: endY, angle: 360, scale: .75, duration: 390, ease: 'Sine.In',
        onUpdate: () => {
          if (Math.random() > .58) {
            const mote = this.add.circle(star.x, star.y, 2 + Math.random() * 3, Math.random() > .35 ? 0x9fe8ff : 0xffdc76, .9).setDepth(18);
            this.tweens.add({ targets: mote, scale: 0, alpha: 0, y: mote.y + (Math.random() - .5) * 30, duration: 240, onComplete: () => mote.destroy() });
          }
        },
        onComplete: () => {
          star.destroy();
          sigilBack.destroy();
          sigilFront.destroy();
          this.resolveAttack(hero, enemy, 'magic');
          this.restoreHeroAfterAttack(hero, index, sprite, 300);
        },
      });
    });
  }

  private restoreHeroAfterAttack(hero: Hero, index: number, sprite: CombatVisual, delay: number) {
    this.time.delayedCall(delay, () => {
      if (sprite instanceof Phaser.GameObjects.Image) sprite.setTexture(`actor-${hero.id}`).setOrigin(.5, IDLE_FOOT_ORIGIN_Y[hero.id] ?? 1);
      this.playIdle(sprite, index);
      this.busy = false;
    });
  }

  private resolveAttack(hero: Hero, enemy: Enemy, kind: 'melee' | 'arrow' | 'magic') {
    this.impact(this.enemySprite!, kind);
    this.onAttack(hero.id, enemy.id);
    // 等攻击者回到待机位再播放反击，避免反击 tween 打断返回动画导致场景卡死。
    this.time.delayedCall(kind === 'melee' ? 480 : 340, () => this.enemyCounter());
  }

  private impact(target: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite, kind: 'melee' | 'arrow' | 'magic' = 'melee') {
    target.setTint(0xff8a73);
    this.cameras.main.shake(kind === 'magic' ? 220 : 180, kind === 'arrow' ? 0.005 : 0.009);

    const impactX = target.x - target.displayWidth * 0.18;
    const impactY = target.y - target.displayHeight * 0.52;
    const flash = this.add.circle(impactX, impactY, kind === 'magic' ? 13 : 24, kind === 'magic' ? 0xc8f4ff : 0xfff4c2, 1).setDepth(18).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: flash, scale: kind === 'magic' ? 3 : 4.5, alpha: 0, duration: 230, ease: 'Cubic.Out', onComplete: () => flash.destroy() });

    const ring = this.add.graphics().setPosition(impactX, impactY).setDepth(17).setBlendMode(Phaser.BlendModes.ADD);
    ring.lineStyle(kind === 'magic' ? 2 : 7, kind === 'magic' ? 0x8ce9ff : 0xffd36a, kind === 'magic' ? .7 : .95).strokeCircle(0, 0, kind === 'magic' ? 20 : 30);
    this.tweens.add({ targets: ring, scale: kind === 'magic' ? 2.2 : 3.2, alpha: 0, duration: 340, ease: 'Quad.Out', onComplete: () => ring.destroy() });

    if (kind !== 'arrow') {
      const slash = this.add.graphics().setPosition(impactX, impactY).setDepth(19).setBlendMode(Phaser.BlendModes.ADD);
      if (kind === 'magic') {
        for (let ray = 0; ray < 8; ray += 1) {
          const angle = Math.PI * 2 * ray / 8;
          slash.lineStyle(ray % 2 === 0 ? 4 : 2, ray % 2 === 0 ? 0xbff5ff : 0xffd873, .9)
            .lineBetween(Math.cos(angle) * 12, Math.sin(angle) * 12, Math.cos(angle) * (ray % 2 === 0 ? 62 : 43), Math.sin(angle) * (ray % 2 === 0 ? 62 : 43));
        }
      } else {
        slash.lineStyle(10, 0xfff8d5, 0.95).lineBetween(-58, 48, 58, -48);
        slash.lineStyle(4, 0xffbd55, 0.9).lineBetween(-70, 36, 48, -62);
        slash.lineStyle(3, 0xff7352, 0.75).lineBetween(-42, 64, 72, -30);
      }
      this.tweens.add({ targets: slash, scale: kind === 'magic' ? 1.35 : 1.25, angle: kind === 'magic' ? 28 : 0, alpha: 0, duration: 260, ease: 'Quad.Out', onComplete: () => slash.destroy() });
    }

    for (let index = 0; index < 14; index += 1) {
      const angle = Math.PI * 2 * index / 14 + Math.random() * 0.18;
      const distance = 55 + Math.random() * 75;
      const sparkColor = kind === 'magic' ? (index % 3 === 0 ? 0xa8ecff : 0xffdc72) : (index % 3 === 0 ? 0xff7255 : 0xffd772);
      const spark = this.add.rectangle(impactX, impactY, 4 + Math.random() * 7, 2 + Math.random() * 3, sparkColor, 1)
        .setDepth(18).setRotation(angle).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: spark,
        x: impactX + Math.cos(angle) * distance,
        y: impactY + Math.sin(angle) * distance,
        scaleX: 0.2,
        alpha: 0,
        duration: 260 + Math.random() * 180,
        ease: 'Cubic.Out',
        onComplete: () => spark.destroy(),
      });
    }

    const baseScaleX = target.scaleX;
    const baseScaleY = target.scaleY;
    this.tweens.add({ targets: target, x: target.x + 38, scaleX: baseScaleX * .8, scaleY: baseScaleY * 1.15, angle: 9, duration: 85, yoyo: true, repeat: 1, ease: 'Back.Out', onComplete: () => { target.clearTint(); target.setAngle(0); target.setScale(baseScaleX, baseScaleY); } });
    this.showFloatingText(target.x, target.y - target.displayHeight * 0.72, '命中', '#ffe49a');
  }

  // 反击表现：对每一个"本轮会行动"的存活敌人，按 domain 已算好的实际目标（this.counters）
  // 播放突进动画。不再只表现单体、也不再用前排第一人硬套——画面与数值结算一致。
  private enemyCounter() {
    const surviving = this.enemies.filter((item) => item.hp > 0);
    surviving.forEach((enemy, index) => {
      const enemySprite = this.enemySprites.get(enemy.id);
      const heroId = this.counters[enemy.id];
      const target = heroId ? this.heroSprites.get(heroId) : undefined;
      if (!enemySprite || !target) return;
      // 错开多个敌人的突进，避免重叠成一团。
      this.time.delayedCall(index * 90, () => this.lungeAt(enemySprite, target));
    });
  }

  private lungeAt(enemySprite: Phaser.GameObjects.Image, target: CombatVisual) {
    const startX = enemySprite.x;
    this.tweens.add({
      targets: enemySprite, x: target.x + target.displayWidth * 0.3, duration: 190, ease: 'Cubic.In',
      onComplete: () => {
        this.cameras.main.shake(110, 0.004);
        setVisualTint(target, 0xff8877);
        const targetX = target.x;
        const baseScaleX = target.getData('baseScaleX') as number;
        const baseScaleY = target.getData('baseScaleY') as number;
        this.tweens.killTweensOf(target);
        this.tweens.add({
          targets: target, x: targetX - 22, angle: -7, scaleX: baseScaleX * .86, scaleY: baseScaleY * 1.08,
          duration: 90, yoyo: true, repeat: 1, ease: 'Quad.Out',
          onComplete: () => {
            const heroIndex = this.party.findIndex((hero) => this.heroSprites.get(hero.id) === target);
            target.setPosition(targetX, target.y).setAngle(0).setScale(baseScaleX, baseScaleY);
            setVisualTint(target);
            if (heroIndex >= 0) this.playIdle(target, heroIndex);
          },
        });
        this.tweens.add({ targets: enemySprite, x: startX, duration: 280, ease: 'Cubic.Out' });
      },
    });
  }

  // 按钮反馈：技能/道具/火焰瓶等点击时播放视觉表现（飘字/闪光/震动）。
  // 数据事实由 domain 层决定，这里只做表现，不改变任何数值。
  playFeedback(feedback: NonNullable<BattleCanvasProps['feedbackRequest']>) {
    const { kind, heroId } = feedback;
    const heroSprite = this.heroSprites.get(heroId);
    const enemy = this.enemies.find((item) => item.id === feedback.enemyId && item.hp > 0)
      ?? this.enemies.find((item) => item.hp > 0)
      ?? this.enemies[0];
    const heroX = heroSprite ? heroSprite.x : this.scale.width * 0.3;
    const heroY = heroSprite ? heroSprite.y - (heroSprite.displayHeight ?? 90) * 0.7 : this.scale.height * 0.45;

    switch (kind) {
      case 'bandage':
        this.showFloatingText(heroX, heroY, '包扎', '#7fe0a0');
        if (heroSprite) this.tweens.add({ targets: heroSprite, scaleX: heroSprite.scaleX * 1.06, scaleY: heroSprite.scaleY * 0.96, duration: 120, yoyo: true });
        break;
      case 'sedative':
        this.showFloatingText(heroX, heroY, '镇定', '#8fd4ff');
        this.cameras.main.flash(120, 140, 190, 255);
        break;
      case 'shield-elixir':
        this.showFloatingText(heroX, heroY, '铁壁', '#d8b3ff');
        if (heroSprite) this.tweens.add({ targets: heroSprite, angle: 4, duration: 90, yoyo: true, repeat: 2 });
        break;
      case 'fire-bomb':
        if (enemy) {
          const enemySprite = this.enemySprites.get(enemy.id) ?? this.enemySprite;
          if (enemySprite) {
            this.impact(enemySprite, 'melee');
            this.showFloatingText(enemySprite.x, enemySprite.y - enemySprite.displayHeight * 0.6, '火焰瓶！', '#ff9a5c');
          }
        }
        break;
      case 'skill': {
        // 区分 buff/heal/damage：施法者始终有本体反馈（动作帧/法阵/技能名飘字），
        // 仅 damage 型才冲击目标；buff/heal 不再误伤敌方。
        const subKind: 'damage' | 'buff' | 'heal' = feedback.subKind ?? 'damage';
        const skillName = feedback.skillName ?? '技能';
        const hero = this.party.find((h) => h.id === heroId);
        const tintMap: Record<typeof subKind, number> = { damage: 0x69cfe9, buff: 0x8ce9ff, heal: 0x7fe0a0 };
        const labelMap: Record<typeof subKind, string> = { damage: '#8ce9ff', buff: '#8ce9ff', heal: '#7fe0a0' };
        if (hero && heroSprite) {
          this.playCasterCast(hero, heroSprite, tintMap[subKind], `${skillName}！`, labelMap[subKind]);
        } else if (heroSprite) {
          this.showFloatingText(heroSprite.x, heroSprite.y - heroSprite.displayHeight * 0.7, `${skillName}！`, labelMap[subKind]);
        }
        if (subKind === 'damage' && enemy) {
          const enemySprite = this.enemySprites.get(enemy.id) ?? this.enemySprite;
          if (enemySprite) {
            this.impact(enemySprite, 'magic');
            this.showFloatingText(enemySprite.x, enemySprite.y - enemySprite.displayHeight * 0.6, '技能！', '#8ce9ff');
          }
        }
        break;
      }
      case 'enemy-hit':
        if (enemy) {
          const enemySprite = this.enemySprites.get(enemy.id) ?? this.enemySprite;
          if (enemySprite) {
            this.impact(enemySprite, 'melee');
          }
        }
        break;
      case 'attack':
      default:
        break; // 攻击反馈已由 performAttack 动画负责，这里不重复
    }
  }

  // 技能施法者本体反馈：切换动作帧、色调闪烁、缩放顿挫、法阵与技能名飘字，确保
  // 玩家能清晰看到是「谁」在施法。buff/heal 型不冲击敌方，damage 型由调用方另行叠加 impact。
  private playCasterCast(hero: Hero, sprite: CombatVisual, tintColor: number, label: string, labelColor: string) {
    if (!sprite) return;
    const baseScaleX = sprite.getData('baseScaleX') as number;
    const baseScaleY = sprite.getData('baseScaleY') as number;
    const heroIndex = this.party.findIndex((h) => h.id === hero.id);
    if (sprite instanceof Phaser.GameObjects.Image) {
      const actionKey = ACTION_ACTORS[hero.id] ? `actor-action-${hero.id}` : 'actor-action-lan';
      const originY = ACTION_FOOT_ORIGIN_Y[hero.id] ?? IDLE_FOOT_ORIGIN_Y[hero.id] ?? 1;
      sprite.setTexture(actionKey).setOrigin(0.5, originY);
    }
    setVisualTint(sprite, tintColor);
    this.tweens.add({ targets: sprite, scaleX: baseScaleX * 1.16, scaleY: baseScaleY * 0.88, duration: 160, yoyo: true, repeat: 1, ease: 'Quad.Out' });
    const sigilX = sprite.x + sprite.displayWidth * 0.2;
    const sigilY = sprite.y - sprite.displayHeight * 0.58;
    const sigil = this.add.star(sigilX, sigilY, 6, 12, 30, tintColor, 0.4).setDepth(17).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: sigil, angle: 120, scale: 1.25, alpha: 0, duration: 540, ease: 'Quad.Out', onComplete: () => sigil.destroy() });
    this.showFloatingText(sprite.x, sprite.y - sprite.displayHeight * 0.7, label, labelColor);
    this.time.delayedCall(460, () => {
      if (sprite instanceof Phaser.GameObjects.Image) {
        const actorKey = ACTORS[hero.id] ? `actor-${hero.id}` : 'actor-lan';
        sprite.setTexture(actorKey).setOrigin(0.5, IDLE_FOOT_ORIGIN_Y[hero.id] ?? 1);
      }
      setVisualTint(sprite);
      if (heroIndex >= 0) this.playIdle(sprite, heroIndex);
    });
  }

  private showFloatingText(x: number, y: number, value: string, color: string) {
    const text = this.add.text(x, y, value, {
      fontFamily: '"Noto Serif SC", serif', fontSize: '18px', fontStyle: 'bold', color,
      stroke: '#10110f', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: text, y: y - 55, alpha: 0, duration: 750, onComplete: () => text.destroy() });
  }

  private createAmbientDust(width: number, height: number) {
    for (let index = 0; index < 24; index += 1) {
      const mote = this.add.circle(Math.random() * width, Math.random() * height, 1 + Math.random() * 2, 0xffe2a0, 0.12 + Math.random() * 0.22).setDepth(7);
      this.tweens.add({
        targets: mote, x: mote.x + 30 + Math.random() * 80, y: mote.y - 40 - Math.random() * 90,
        alpha: 0, duration: 3500 + Math.random() * 4500, delay: Math.random() * 2500,
        repeat: -1,
      });
    }
  }
}

export function BattleCanvas(props: BattleCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<ExpeditionBattleScene | null>(null);
  const lastFeedbackNonceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    // React 19 StrictMode 在 dev 下会 mount→cleanup→mount，若在首次 mount 同步 new Phaser.Game，
    // cleanup 销毁的全局渲染器/WebGL 上下文与紧随其后的二次构造会产生竞态抛错，
    // 进而导致整页卸载出现黑屏。延迟到微任务可让 StrictMode 的首轮 cleanup 先执行完毕再创建。
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || !hostRef.current) return;
      const scene = new ExpeditionBattleScene(props);
      sceneRef.current = scene;
      gameRef.current = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostRef.current,
        width: 1440,
        height: 650,
        transparent: true,
        scene,
        render: { antialias: true, pixelArt: false },
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      });
    });
    return () => {
      cancelled = true;
      if (gameRef.current) { gameRef.current.destroy(true); gameRef.current = null; }
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    // 拆分依赖：之前用整个 props，每次父组件 render 都会触发 scene.updateState；
    // 现在仅依赖真正影响场景渲染的字段，减少 Phaser scene 内部重建。
    // 注意：enemyIntents / enemyCharge / counters 必须一并传入并加入依赖，
    // 否则 updateState 内部会以 `?? {}` 覆盖，导致威胁预告与反击动画在首轮行动后失效。
    sceneRef.current?.updateState({
      party: props.party,
      enemies: props.enemies,
      targetEnemyId: props.targetEnemyId,
      nodeIndex: props.nodeIndex,
      canHeroAttack: props.canHeroAttack,
      onAttack: props.onAttack,
      onSelectEnemy: props.onSelectEnemy,
      enemyIntents: props.enemyIntents,
      enemyCharge: props.enemyCharge,
      counters: props.counters,
    });
  }, [props.party, props.enemies, props.targetEnemyId, props.nodeIndex, props.canHeroAttack, props.onAttack, props.onSelectEnemy, props.enemyIntents, props.enemyCharge, props.counters]);

  useEffect(() => {
    if (props.attackRequest) sceneRef.current?.requestAttack(props.attackRequest.heroId);
  }, [props.attackRequest]);

  useEffect(() => {
    const req = props.feedbackRequest;
    if (!req || !sceneRef.current) return;
    if (lastFeedbackNonceRef.current === req.nonce) return;
    // 守卫：旧节点的反馈若 heroId 已不在当前编队（战斗→事件 key 切换时状态未清），
    // 直接丢弃，避免在事件节点凭空飘出战斗技能字。
    if (req.heroId && !props.party.some((h) => h.id === req.heroId)) return;
    lastFeedbackNonceRef.current = req.nonce;
    sceneRef.current.playFeedback(req);
  }, [props.feedbackRequest, props.party]);

  return <div className="phaser-battle-shell" ref={hostRef} aria-label="远征战斗场景" role="img" tabIndex={0} />;
}

import { useEffect, useRef } from 'react';
import * as Phaser from 'phaser';
import type { Enemy, Hero } from '../domain/model';

interface BattleCanvasProps {
  party: Hero[];
  enemies: Enemy[];
  targetEnemyId?: string;
  nodeIndex: number;
  backgroundPath?: string;
  counterTargetId?: string;
  canHeroAttack: (hero: Hero, index: number, enemy: Enemy) => boolean;
  onAttack: (heroId: string, enemyId: string) => void;
  onSelectEnemy: (enemyId: string) => void;
  attackRequest?: { heroId: string; nonce: number };
}

const ACTORS: Record<string, string> = {
  lan: '/assets/pixel/lan-vanguard-idle-v2.png',
  wu: '/assets/pixel/wu-archer-idle-v3.png',
  xingluo: '/assets/pixel/xingluo-mage-idle-v3.png',
  scout: '/assets/actors-v2/scout-idle-v2.png',
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
};

const LAN_RIG_PARTS: Record<string, string> = {
  torso: '/assets/rigs/lan-vanguard-v1/parts/part-01.png', head: '/assets/rigs/lan-vanguard-v1/parts/part-02.png', rearLeg: '/assets/rigs/lan-vanguard-v1/parts/part-03.png', rearArm: '/assets/rigs/lan-vanguard-v1/parts/part-04.png', frontArm: '/assets/rigs/lan-vanguard-v1/parts/part-05.png', frontLeg: '/assets/rigs/lan-vanguard-v1/parts/part-06.png', shield: '/assets/rigs/lan-vanguard-v1/parts/part-07.png', scarfMain: '/assets/rigs/lan-vanguard-v1/parts/part-08.png', scarfMid: '/assets/rigs/lan-vanguard-v1/parts/part-09.png', scarfTip: '/assets/rigs/lan-vanguard-v1/parts/part-10.png', spear: '/assets/rigs/lan-vanguard-v1/parts/part-11.png',
};

const CHARACTER_HEIGHTS: Record<string, number> = {
  lan: 0.3, wu: 0.31, xingluo: 0.31, scout: 0.32,
  'ash-wolf': 0.2, 'thorn-stag': 0.31, 'spore-beast': 0.28, 'rock-lizard': 0.22, 'grove-guardian': 0.48,
};
const IDLE_FOOT_ORIGIN_Y: Record<string, number> = {
  lan: 1, wu: 0.933, xingluo: 0.969, scout: 0.974,
  'ash-wolf': 0.96, 'thorn-stag': 0.96, 'spore-beast': 0.96, 'rock-lizard': 0.96, 'grove-guardian': 0.96,
};
const ACTION_FOOT_ORIGIN_Y: Record<string, number> = { lan: 0.918, wu: 0.929, xingluo: 0.944 };
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
  private counterTargetId?: string;
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
    this.counterTargetId = props.counterTargetId;
  }

  preload() {
    this.load.image('battle-bg', this.backgroundPath ?? '/assets/world/ruins-road-battle-v2.png');
    Object.entries(ACTORS).forEach(([key, path]) => this.load.image(`actor-${key}`, path));
    Object.entries(ACTION_ACTORS).forEach(([key, path]) => this.load.image(`actor-action-${key}`, path));
  }

  create() {
    const { width, height } = this.scale;
    const background = this.add.image(width / 2, height / 2, 'battle-bg');
    const scale = Math.max(width / background.width, height / background.height);
    background.setScale(scale).setDepth(-20);

    this.add.rectangle(width / 2, height / 2, width, height, 0x3a2a1a, 0.05).setDepth(-19);
    this.add.rectangle(width / 2, height - 34, width, 92, 0x241810, 0.12).setDepth(8);
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
    this.counterTargetId = props.counterTargetId;
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
      const sprite: CombatVisual = this.add.image(position.x, position.y, `actor-${hero.id}`).setOrigin(0.5, IDLE_FOOT_ORIGIN_Y[hero.id] ?? 1).setDepth(5 - index).setScale((height * (CHARACTER_HEIGHTS[hero.id] ?? 0.3)) / this.textures.get(`actor-${hero.id}`).getSourceImage().height);
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

  private createLanPuppet(x: number, groundY: number, targetHeight: number, depth: number) {
    const root = this.add.container(x, groundY).setDepth(depth).setSize(620, 760);
    const part = (key: string, px: number, py: number, ox = .5, oy = 1) => this.add.image(px, py, `lan-rig-${key}`).setOrigin(ox, oy);
    const scarfMain = part('scarfMain', -116, -385, .2, .5), scarfMid = part('scarfMid', -72, -352, .18, .5), scarfTip = part('scarfTip', -34, -323, .15, .5);
    const rearLeg = part('rearLeg', -40, 0), frontLeg = part('frontLeg', 44, 0), rearArm = part('rearArm', -65, -275, .5, .14), torso = part('torso', 0, -162), head = part('head', -12, -450);
    const spear = part('spear', 104, -266, .5, .5), frontArm = part('frontArm', 63, -275, .5, .14), shield = part('shield', 112, -300, .5, .5);
    root.add([scarfMain, scarfMid, scarfTip, rearLeg, frontLeg, rearArm, torso, head, spear, frontArm, shield]);
    root.setScale(targetHeight / 650); root.setData('attackParts', [spear, frontArm, shield]);
    [[scarfMain, 2.1, 1700], [scarfMid, 3.5, 1450], [scarfTip, 5.2, 1250]].forEach(([item, angle, duration]) => this.tweens.add({ targets: item as Phaser.GameObjects.Image, angle: angle as number, duration: duration as number, yoyo: true, repeat: -1, ease: 'Sine.InOut' }));
    return root;
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
    if (sprite instanceof Phaser.GameObjects.Image) sprite.setTexture('actor-action-lan').setOrigin(.5, ACTION_FOOT_ORIGIN_Y.lan);
    const attackParts = sprite instanceof Phaser.GameObjects.Container ? sprite.getData('attackParts') as Phaser.GameObjects.Image[] : [];
    this.tweens.add({ targets: attackParts, angle: -12, duration: 130, ease: 'Quad.Out' });
    this.tweens.add({
      targets: sprite, x: targetX, scaleX: baseScaleX * 1.12, scaleY: baseScaleY * .9, duration: 330, ease: 'Cubic.In',
      onComplete: () => {
        this.resolveAttack(hero, enemy, 'melee');
        this.tweens.add({
          targets: sprite, x: originX, scaleX: baseScaleX, scaleY: baseScaleY, duration: 430, ease: 'Cubic.Out',
          onComplete: () => {
            if (sprite instanceof Phaser.GameObjects.Image) sprite.setTexture('actor-lan').setOrigin(.5, IDLE_FOOT_ORIGIN_Y.lan);
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
    // Wait until the attacker has returned to idle. Otherwise a counter against
    // that same hero can cancel the return tween and leave the scene busy forever.
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

  private enemyCounter() {
    const enemy = this.enemies.find((item) => item.id === this.targetEnemyId) ?? this.enemies.find((item) => item.hp > 0);
    if (!this.enemySprite || !enemy || enemy.hp <= 0) return;
    const target = this.counterTargetId ? this.heroSprites.get(this.counterTargetId) : undefined;
    if (!target) return;
    const startX = this.enemySprite.x;
    this.tweens.add({
      targets: this.enemySprite, x: target.x + target.displayWidth * 0.3, duration: 190, ease: 'Cubic.In',
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
          onComplete: () => { target.setPosition(targetX, target.y).setAngle(0).setScale(baseScaleX, baseScaleY); setVisualTint(target); this.playIdle(target, this.party.findIndex((hero) => hero.id === this.counterTargetId)); },
        });
        this.tweens.add({ targets: this.enemySprite, x: startX, duration: 280, ease: 'Cubic.Out' });
      },
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

  useEffect(() => {
    if (!hostRef.current) return;
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
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    // 拆分依赖：之前用整个 props，每次父组件 render 都会触发 scene.updateState；
    // 现在仅依赖真正影响场景渲染的字段，减少 Phaser scene 内部重建。
    sceneRef.current?.updateState({
      party: props.party,
      enemies: props.enemies,
      targetEnemyId: props.targetEnemyId,
      nodeIndex: props.nodeIndex,
      counterTargetId: props.counterTargetId,
      canHeroAttack: props.canHeroAttack,
      onAttack: props.onAttack,
      onSelectEnemy: props.onSelectEnemy,
    });
  }, [props.party, props.enemies, props.targetEnemyId, props.nodeIndex, props.counterTargetId, props.canHeroAttack, props.onAttack, props.onSelectEnemy]);

  useEffect(() => {
    if (props.attackRequest) sceneRef.current?.requestAttack(props.attackRequest.heroId);
  }, [props.attackRequest]);

  return <div className="phaser-battle-shell" ref={hostRef} aria-label="远征战斗场景" role="img" tabIndex={0} />;
}

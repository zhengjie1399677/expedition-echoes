import { useEffect, useRef } from 'react';
import * as Phaser from 'phaser';
import type { Enemy, Hero } from '../domain/model';

interface BattleCanvasProps {
  party: Hero[];
  enemies: Enemy[];
  targetEnemyId?: string;
  nodeIndex: number;
  counterTargetId?: string;
  canHeroAttack: (hero: Hero, index: number, enemy: Enemy) => boolean;
  onAttack: (heroId: string, enemyId: string) => void;
  onSelectEnemy: (enemyId: string) => void;
  attackRequest?: { heroId: string; nonce: number };
}

const ACTORS: Record<string, string> = {
  lan: '/assets/pixel/lan-vanguard-idle-v2.png',
  wu: '/assets/actors-v2/wu-idle-v2.png',
  xingluo: '/assets/actors-v2/xingluo-idle-v2.png',
  scout: '/assets/actors-v2/scout-idle-v2.png',
};

const LAN_RIG_PARTS: Record<string, string> = {
  torso: '/assets/rigs/lan-vanguard-v1/parts/part-01.png', head: '/assets/rigs/lan-vanguard-v1/parts/part-02.png', rearLeg: '/assets/rigs/lan-vanguard-v1/parts/part-03.png', rearArm: '/assets/rigs/lan-vanguard-v1/parts/part-04.png', frontArm: '/assets/rigs/lan-vanguard-v1/parts/part-05.png', frontLeg: '/assets/rigs/lan-vanguard-v1/parts/part-06.png', shield: '/assets/rigs/lan-vanguard-v1/parts/part-07.png', scarfMain: '/assets/rigs/lan-vanguard-v1/parts/part-08.png', scarfMid: '/assets/rigs/lan-vanguard-v1/parts/part-09.png', scarfTip: '/assets/rigs/lan-vanguard-v1/parts/part-10.png', spear: '/assets/rigs/lan-vanguard-v1/parts/part-11.png',
};

const CHARACTER_HEIGHTS: Record<string, number> = { lan: 0.3, wu: 0.318, xingluo: 0.285, scout: 0.32 };
type CombatVisual = Phaser.GameObjects.Image | Phaser.GameObjects.Container;
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
    this.canHeroAttack = props.canHeroAttack;
    this.onAttack = props.onAttack;
    this.onSelectEnemy = props.onSelectEnemy;
    this.counterTargetId = props.counterTargetId;
    const nextFormationKey = this.party.map((hero) => hero.id).join('|');
    if (this.formationKey && this.formationKey !== nextFormationKey) this.syncFormation();
    this.formationKey = nextFormationKey;
  }

  preload() {
    this.load.image('battle-bg', '/assets/world/ruins-road-battle-v2.png');
    Object.entries(ACTORS).forEach(([key, path]) => this.load.image(`actor-${key}`, path));
  }

  create() {
    const { width, height } = this.scale;
    const background = this.add.image(width / 2, height / 2, 'battle-bg');
    const scale = Math.max(width / background.width, height / background.height);
    background.setScale(scale).setDepth(-20);

    this.add.rectangle(width / 2, height / 2, width, height, 0x294b55, 0.04).setDepth(-19);
    this.add.rectangle(width / 2, height - 34, width, 92, 0x17342e, 0.1).setDepth(8);
    this.createAmbientDust(width, height);
    this.createParty(width, height);
    this.createEnemy(width, height);

    this.add.text(24, 22, `第 ${this.nodeIndex + 1} 幕`, {
      fontFamily: '"Noto Serif SC", serif', fontSize: '13px', color: '#c6b577',
      backgroundColor: '#0b1714bb', padding: { x: 10, y: 6 },
    }).setDepth(20);
    this.add.text(width / 2, height - 26, '点击角色发动攻击 · 金色轮廓表示当前可攻击', {
      fontFamily: '"Noto Serif SC", serif', fontSize: '12px', color: '#aebfb7',
    }).setOrigin(0.5).setDepth(20);
  }

  updateState(props: BattleCanvasProps) {
    this.party = props.party;
    this.enemies = props.enemies;
    this.targetEnemyId = props.targetEnemyId;
    this.canHeroAttack = props.canHeroAttack;
    this.onAttack = props.onAttack;
    this.onSelectEnemy = props.onSelectEnemy;
    this.counterTargetId = props.counterTargetId;
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
      const sprite: CombatVisual = this.add.image(position.x, position.y, `actor-${hero.id}`).setOrigin(0.5, 1).setDepth(5 - index).setScale((height * (CHARACTER_HEIGHTS[hero.id] ?? 0.3)) / this.textures.get(`actor-${hero.id}`).getSourceImage().height);
      sprite.setAlpha(hero.hp <= 0 ? 0.35 : 1).setInteractive({ useHandCursor: true });
      sprite.setData('baseScaleX', sprite.scaleX).setData('baseScaleY', sprite.scaleY);
      this.heroSprites.set(hero.id, sprite);
      const shadow = this.add.ellipse(position.x, position.y - 4, visualWidth(sprite) * 0.52, 24, 0x020706, 0.62).setDepth(1);
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
      const label = this.add.text(position.x, position.y - 8, hero.name, {
        fontFamily: '"Noto Serif SC", serif', fontSize: '14px', color: '#f4e7bf',
        backgroundColor: '#10221ddd', padding: { x: 8, y: 4 },
      }).setOrigin(0.5, 1).setDepth(10);
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
    const key = this.textures.exists(`actor-${primaryEnemy.id}`) ? `actor-${primaryEnemy.id}` : 'actor-scout';
    const sprite = this.add.image(width * 0.68, height * 0.81, key).setOrigin(0.5, 1).setDepth(4).setInteractive({ useHandCursor: true });
    sprite.setScale((height * (CHARACTER_HEIGHTS[primaryEnemy.id] ?? 0.27)) / sprite.height).setAlpha(primaryEnemy.hp <= 0 ? 0.25 : 1);
    sprite.on('pointerdown', () => this.onSelectEnemy(primaryEnemy.id));
    this.enemySprites.set(primaryEnemy.id, sprite);
    this.enemySprite = sprite;
    this.add.ellipse(width * 0.68, height * 0.81, sprite.displayWidth * 0.58, 16, 0x17372b, 0.38).setDepth(1);
    this.add.text(width * 0.68, height * 0.79, primaryEnemy.name, {
      fontFamily: '"Noto Serif SC", serif', fontSize: '15px', color: '#f2b49f',
      backgroundColor: '#321e20df', padding: { x: 9, y: 5 },
    }).setOrigin(0.5, 1).setDepth(10);
    this.enemies.slice(1).forEach((enemy, index) => {
      const x = width * (0.79 + index * 0.11);
      const actorKey = this.textures.exists(`actor-${enemy.id}`) ? `actor-${enemy.id}` : 'actor-scout';
      const actor = this.add.image(x, height * .81, actorKey).setOrigin(.5, 1).setDepth(3 - index).setInteractive({ useHandCursor: true });
      actor.setScale((height * (CHARACTER_HEIGHTS[enemy.id] ?? .25)) / actor.height).setAlpha(enemy.hp <= 0 ? .22 : 1);
      actor.on('pointerdown', () => this.onSelectEnemy(enemy.id));
      this.enemySprites.set(enemy.id, actor);
      this.add.ellipse(x, height * .81, actor.displayWidth * .5, 13, 0x17372b, .28).setDepth(1);
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
    const targetX = this.enemySprite.x - this.enemySprite.displayWidth * 0.28;
    const baseScaleX = sprite.getData('baseScaleX') as number;
    const baseScaleY = sprite.getData('baseScaleY') as number;
    const attackParts = sprite instanceof Phaser.GameObjects.Container ? sprite.getData('attackParts') as Phaser.GameObjects.Image[] : [];
    this.tweens.add({ targets: attackParts, angle: -12, duration: 130, ease: 'Quad.Out' });
    this.tweens.add({
      targets: sprite, x: targetX, scaleX: baseScaleX * 1.12, scaleY: baseScaleY * .9, duration: 330, ease: 'Cubic.In',
      onComplete: () => {
        this.impact(this.enemySprite!);
        this.onAttack(hero.id, enemy.id);
        this.time.delayedCall(140, () => this.enemyCounter());
        this.tweens.add({
          targets: sprite, x: originX, scaleX: baseScaleX, scaleY: baseScaleY, duration: 430, ease: 'Cubic.Out',
          onComplete: () => { this.tweens.add({ targets: attackParts, angle: 0, duration: 150 }); this.playIdle(sprite, index); this.busy = false; },
        });
      },
    });
  }

  private impact(target: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite) {
    target.setTint(0xff8a73);
    this.cameras.main.shake(130, 0.006);
    const flash = this.add.circle(target.x - target.displayWidth * 0.18, target.y - target.displayHeight * 0.52, 28, 0xffd36a, 0.9).setDepth(15);
    this.tweens.add({ targets: flash, scale: 3.4, alpha: 0, duration: 260, onComplete: () => flash.destroy() });
    const baseScaleX = target.scaleX;
    const baseScaleY = target.scaleY;
    this.tweens.add({ targets: target, x: target.x + 32, scaleX: baseScaleX * .84, scaleY: baseScaleY * 1.12, angle: 7, duration: 120, yoyo: true, repeat: 1, ease: 'Quad.Out', onComplete: () => { target.clearTint(); target.setAngle(0); target.setScale(baseScaleX, baseScaleY); } });
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
        this.time.delayedCall(120, () => setVisualTint(target));
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
      width: 1200,
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
    sceneRef.current?.updateState(props);
  }, [props]);

  useEffect(() => {
    if (props.attackRequest) sceneRef.current?.requestAttack(props.attackRequest.heroId);
  }, [props.attackRequest]);

  return <div className="phaser-battle-shell" ref={hostRef} aria-label="远征战斗场景" />;
}

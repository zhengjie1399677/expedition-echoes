import { useEffect, useRef } from 'react';
import * as Phaser from 'phaser';
import type { Enemy, Hero } from '../domain/model';

interface BattleCanvasProps {
  party: Hero[];
  enemy: Enemy | null;
  nodeIndex: number;
  counterTargetId?: string;
  canHeroAttack: (hero: Hero, index: number) => boolean;
  onAttack: (heroId: string) => void;
}

const ACTORS: Record<string, string> = {
  lan: '/assets/actors/lan-v1.png',
  wu: '/assets/actors/wu-v1.png',
  xingluo: '/assets/actors/xingluo-v1.png',
  scout: '/assets/actors/scout-v1.png',
};

class ExpeditionBattleScene extends Phaser.Scene {
  private party: Hero[];
  private enemy: Enemy | null;
  private nodeIndex: number;
  private canHeroAttack: BattleCanvasProps['canHeroAttack'];
  private onAttack: BattleCanvasProps['onAttack'];
  private counterTargetId?: string;
  private heroSprites = new Map<string, Phaser.GameObjects.Image>();
  private enemySprite?: Phaser.GameObjects.Image;
  private busy = false;

  constructor(props: BattleCanvasProps) {
    super('expedition-battle');
    this.party = props.party;
    this.enemy = props.enemy;
    this.nodeIndex = props.nodeIndex;
    this.canHeroAttack = props.canHeroAttack;
    this.onAttack = props.onAttack;
    this.counterTargetId = props.counterTargetId;
  }

  preload() {
    this.load.image('battle-bg', '/assets/ruins-battle-v1.png');
    Object.entries(ACTORS).forEach(([key, path]) => this.load.image(`actor-${key}`, path));
  }

  create() {
    const { width, height } = this.scale;
    const background = this.add.image(width / 2, height / 2, 'battle-bg');
    const scale = Math.max(width / background.width, height / background.height);
    background.setScale(scale).setDepth(-20);

    this.add.rectangle(width / 2, height / 2, width, height, 0x07100d, 0.12).setDepth(-19);
    this.add.rectangle(width / 2, height - 45, width, 180, 0x07100d, 0.58).setDepth(8);
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
    this.enemy = props.enemy;
    this.canHeroAttack = props.canHeroAttack;
    this.onAttack = props.onAttack;
    this.counterTargetId = props.counterTargetId;
    this.heroSprites.forEach((sprite, id) => {
      const hero = this.party.find((item) => item.id === id);
      if (hero) sprite.setAlpha(hero.hp <= 0 ? 0.35 : 1);
    });
    if (this.enemySprite && this.enemy) this.enemySprite.setAlpha(this.enemy.hp <= 0 ? 0.25 : 1);
  }

  private createParty(width: number, height: number) {
    const positions = [
      { x: width * 0.43, y: height * 0.9, h: height * 0.76 },
      { x: width * 0.27, y: height * 0.88, h: height * 0.68 },
      { x: width * 0.13, y: height * 0.86, h: height * 0.61 },
    ];
    this.party.forEach((hero, index) => {
      const position = positions[index];
      const sprite = this.add.image(position.x, position.y, `actor-${hero.id}`).setOrigin(0.5, 1).setDepth(5 - index);
      sprite.setScale(position.h / sprite.height).setAlpha(hero.hp <= 0 ? 0.35 : 1).setInteractive({ useHandCursor: true });
      this.heroSprites.set(hero.id, sprite);
      this.add.ellipse(position.x, position.y - 4, sprite.displayWidth * 0.52, 24, 0x020706, 0.62).setDepth(1);
      const available = () => !!this.enemy && this.canHeroAttack(hero, index) && hero.hp > 0;
      sprite.on('pointerover', () => {
        sprite.setTint(available() ? 0xffe7a0 : 0xa6adb0);
        this.tweens.add({ targets: sprite, y: position.y - 7, duration: 130 });
      });
      sprite.on('pointerout', () => {
        sprite.clearTint();
        this.tweens.add({ targets: sprite, y: position.y, duration: 150 });
      });
      sprite.on('pointerdown', () => this.performAttack(hero, index, sprite, position.x));
      this.tweens.add({
        targets: sprite, y: position.y - 4, duration: 1500 + index * 170,
        yoyo: true, repeat: -1, ease: 'Sine.InOut',
      });
      this.add.text(position.x, position.y - 8, hero.name, {
        fontFamily: '"Noto Serif SC", serif', fontSize: '14px', color: '#f4e7bf',
        backgroundColor: '#10221ddd', padding: { x: 8, y: 4 },
      }).setOrigin(0.5, 1).setDepth(10);
    });
  }

  private createEnemy(width: number, height: number) {
    if (!this.enemy) {
      this.add.text(width * 0.73, height * 0.48, '暂时安全\n风穿过断裂的石柱。', {
        align: 'center', fontFamily: '"Noto Serif SC", serif', fontSize: '23px', color: '#ead28f',
      }).setOrigin(0.5).setDepth(10);
      return;
    }
    const key = this.textures.exists(`actor-${this.enemy.id}`) ? `actor-${this.enemy.id}` : 'actor-scout';
    const sprite = this.add.image(width * 0.78, height * 0.89, key).setOrigin(0.5, 1).setDepth(4);
    sprite.setScale((height * 0.78) / sprite.height).setAlpha(this.enemy.hp <= 0 ? 0.25 : 1);
    this.enemySprite = sprite;
    this.add.ellipse(width * 0.78, height * 0.89, sprite.displayWidth * 0.58, 27, 0x020706, 0.7).setDepth(1);
    this.tweens.add({ targets: sprite, y: sprite.y - 5, angle: 0.35, duration: 1850, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.add.text(width * 0.78, height * 0.87, this.enemy.name, {
      fontFamily: '"Noto Serif SC", serif', fontSize: '15px', color: '#f2b49f',
      backgroundColor: '#321e20df', padding: { x: 9, y: 5 },
    }).setOrigin(0.5, 1).setDepth(10);
  }

  private performAttack(hero: Hero, index: number, sprite: Phaser.GameObjects.Image, originX: number) {
    if (this.busy || !this.enemy || !this.enemySprite) return;
    if (!this.canHeroAttack(hero, index)) {
      this.showFloatingText(sprite.x, sprite.y - sprite.displayHeight * 0.65, '超出攻击范围', '#b9c2bd');
      this.cameras.main.shake(90, 0.0015);
      return;
    }
    this.busy = true;
    this.tweens.killTweensOf(sprite);
    const targetX = this.enemySprite.x - this.enemySprite.displayWidth * 0.28;
    this.tweens.add({
      targets: sprite, x: targetX, y: sprite.y - 8, duration: 220, ease: 'Cubic.In',
      onComplete: () => {
        this.impact(this.enemySprite!);
        this.onAttack(hero.id);
        this.time.delayedCall(140, () => this.enemyCounter());
        this.tweens.add({
          targets: sprite, x: originX, duration: 330, ease: 'Cubic.Out',
          onComplete: () => { this.busy = false; },
        });
      },
    });
  }

  private impact(target: Phaser.GameObjects.Image) {
    target.setTint(0xffffff);
    this.cameras.main.shake(130, 0.006);
    const flash = this.add.circle(target.x - target.displayWidth * 0.18, target.y - target.displayHeight * 0.52, 28, 0xffd36a, 0.9).setDepth(15);
    this.tweens.add({ targets: flash, scale: 3.4, alpha: 0, duration: 260, onComplete: () => flash.destroy() });
    this.tweens.add({ targets: target, x: target.x + 18, duration: 55, yoyo: true, repeat: 2, onComplete: () => target.clearTint() });
    this.showFloatingText(target.x, target.y - target.displayHeight * 0.72, '命中', '#ffe49a');
  }

  private enemyCounter() {
    if (!this.enemySprite || !this.enemy || this.enemy.hp <= 0) return;
    const target = this.counterTargetId ? this.heroSprites.get(this.counterTargetId) : undefined;
    if (!target) return;
    const startX = this.enemySprite.x;
    this.tweens.add({
      targets: this.enemySprite, x: target.x + target.displayWidth * 0.3, duration: 190, ease: 'Cubic.In',
      onComplete: () => {
        this.cameras.main.shake(110, 0.004);
        target.setTint(0xff8877);
        this.time.delayedCall(120, () => target.clearTint());
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

  return <div className="phaser-battle-shell" ref={hostRef} aria-label="远征战斗场景" />;
}

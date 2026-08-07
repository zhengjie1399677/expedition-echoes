// 远征战斗关键纹理预载清单（与 src/ui/BattleCanvas.tsx 的 ACTORS / ACTION_ACTORS / 战斗背景对齐，
// 以代码实际引用为准，避免预载与运行时失配）：
// - 战斗背景：默认遗迹战场 + 森林任务战斗节点背景
// - 英雄待机帧：pixel 人偶（lan/wu/xingluo/cheng）+ 插图（yan/scout）
// - 英雄动作帧：attack/cast（cheng 与 yan 共用医师施法帧）
// - 敌人：遗迹守卫/门卫 + 森林五怪（ash-wolf/thorn-stag/spore-beast/rock-lizard/grove-guardian）
// 另保留少量非战斗页面背景/立绘预热（宿舍、酒馆、宿舍立绘）。
const EXPEDITION_ASSETS = [
  // 战斗背景
  '/assets/world/ruins-road-battle-v2.webp',
  '/assets/world/forest-v1/forest-road-v1.png',
  '/assets/world/forest-v1/grove-sanctuary-v1.png',
  // 英雄待机帧
  '/assets/pixel/lan-vanguard-idle-v2.png',
  '/assets/pixel/wu-archer-idle-v3.png',
  '/assets/pixel/xingluo-mage-idle-v3.png',
  '/assets/pixel/cheng-medic-idle-v2.png',
  '/assets/actors-v2/yan-idle-v2.png',
  '/assets/actors-v2/scout-idle-v2.png',
  // 英雄动作帧（attack / cast）
  '/assets/pixel/lan-vanguard-attack-v1.png',
  '/assets/pixel/wu-archer-attack-v1.png',
  '/assets/pixel/xingluo-mage-cast-v1.png',
  '/assets/pixel/cheng-medic-cast-v2.png',
  // 敌人：遗迹
  '/assets/enemies/ruins-v1/warden-idle-v1.png',
  '/assets/enemies/ruins-v1/gatekeeper-idle-v1.png',
  // 敌人：森林
  '/assets/enemies/forest-v1/ash-wolf-v1.png',
  '/assets/enemies/forest-v1/thorn-stag-v1.png',
  '/assets/enemies/forest-v1/spore-beast-v3.png',
  '/assets/enemies/forest-v1/rock-lizard-v1.png',
  '/assets/enemies/forest-v1/grove-guardian-v1.png',
  // 非战斗页面预热（宿舍、酒馆、宿舍立绘）
  '/assets/portraits-dorm/yan-dorm-v2.png',
  '/assets/portraits-dorm/cheng-dorm-v2.png',
  '/assets/world/quarters-hall-v1.webp',
  '/assets/world/quarters-dorm-v1.webp',
  '/assets/world/tavern-hall-v2.webp',
];

interface NetworkInformation { saveData?: boolean; effectiveType?: string }
interface NavigatorWithConnection extends Navigator { connection?: NetworkInformation }
export function shouldPreloadExpedition(connection?: NetworkInformation): boolean {
  if (!connection) return true;
  return !connection.saveData && connection.effectiveType !== 'slow-2g' && connection.effectiveType !== '2g';
}

function onIdle(callback: () => void, timeout = 4000): () => void {
  const idleApi = window as unknown as {
    requestIdleCallback?: (task: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (idleApi.requestIdleCallback) {
    const handle = idleApi.requestIdleCallback(() => callback(), { timeout });
    return () => idleApi.cancelIdleCallback?.(handle);
  }
  const handle = globalThis.setTimeout(callback, Math.min(timeout, 1800));
  return () => globalThis.clearTimeout(handle);
}

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    image.fetchPriority = 'low';
    image.decoding = 'async';
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = src;
  });
}

export function warmExpeditionResources(): () => void {
  const connection = (navigator as NavigatorWithConnection).connection;
  if (!shouldPreloadExpedition(connection)) return () => undefined;

  let cancelled = false;
  let cancelScheduled: () => void = () => undefined;
  const queue = [...EXPEDITION_ASSETS];

  const loadNextAsset = () => {
    if (cancelled) return;
    const next = queue.shift();
    if (!next) {
      cancelScheduled = onIdle(() => {
        if (!cancelled) void import('../ui/BattleCanvas');
      }, 6000);
      return;
    }
    void preloadImage(next).finally(() => {
      if (!cancelled) cancelScheduled = onIdle(loadNextAsset, 3500);
    });
  };

  const beginAfterPageLoad = () => { cancelScheduled = onIdle(loadNextAsset, 3000); };
  if (document.readyState === 'complete') beginAfterPageLoad();
  else window.addEventListener('load', beginAfterPageLoad, { once: true });

  return () => {
    cancelled = true;
    cancelScheduled();
    window.removeEventListener('load', beginAfterPageLoad);
  };
}

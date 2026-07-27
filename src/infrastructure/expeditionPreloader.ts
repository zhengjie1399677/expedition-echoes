const EXPEDITION_ASSETS = [
  '/assets/ruins-battle-v1.png',
  '/assets/actors/lan-v1.png',
  '/assets/actors/wu-v1.png',
  '/assets/actors/xingluo-v1.png',
  '/assets/actors/scout-v1.png',
  '/assets/animations/lan-attack-v1.png',
  '/assets/animations/scout-defeat-v1.png',
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

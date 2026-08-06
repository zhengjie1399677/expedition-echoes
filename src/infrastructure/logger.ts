// 轻量日志工具：无外部依赖，输出到 console，带时间戳/级别/命名空间。
// 可通过 localStorage['logLevel'] = 'debug'|'info'|'warn'|'error'|'silent' 调整级别，
// 方便排查报错时打开详细日志，生产环境可降级为 warn 避免噪声。

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

function readLevel(): LogLevel {
  try {
    const stored = typeof localStorage !== 'undefined' ? (localStorage.getItem('logLevel') as LogLevel | null) : null;
    if (stored && stored in LEVEL_PRIORITY) return stored;
  } catch {
    // localStorage 不可用时降级到默认级别。
  }
  return 'info';
}

let currentLevel: LogLevel = readLevel();

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

function format(level: LogLevel, namespace: string, message: string): string {
  const ts = new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
  return `${ts} [${level.toUpperCase()}] [${namespace}] ${message}`;
}

export interface Logger {
  debug(message: string, extra?: unknown): void;
  info(message: string, extra?: unknown): void;
  warn(message: string, extra?: unknown): void;
  error(message: string, extra?: unknown): void;
  setLevel(level: LogLevel): void;
}

export function createLogger(namespace: string): Logger {
  return {
    debug(message, extra) {
      if (shouldLog('debug')) console.debug(format('debug', namespace, message), extra ?? '');
    },
    info(message, extra) {
      if (shouldLog('info')) console.info(format('info', namespace, message), extra ?? '');
    },
    warn(message, extra) {
      if (shouldLog('warn')) console.warn(format('warn', namespace, message), extra ?? '');
    },
    error(message, extra) {
      if (shouldLog('error')) console.error(format('error', namespace, message), extra ?? '');
    },
    setLevel(level) {
      currentLevel = level;
    },
  };
}

export const logger = createLogger('app');

export type { LogLevel };

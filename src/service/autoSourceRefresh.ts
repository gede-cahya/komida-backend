import { mangaService } from './mangaService';

type AutoSourceRefreshStatus = {
  enabled: boolean;
  running: boolean;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastDurationMs: number | null;
  intervalMinutes: number;
  startupDelaySeconds: number;
  runCount: number;
  successCount: number;
  failureCount: number;
  nextRunAt: string | null;
};

const AUTO_SOURCE_REFRESH_ENABLED = process.env.AUTO_SOURCE_REFRESH_ENABLED !== 'false';
const configuredIntervalMs = process.env.AUTO_SOURCE_REFRESH_INTERVAL_MS
  ? Number(process.env.AUTO_SOURCE_REFRESH_INTERVAL_MS)
  : Number(process.env.AUTO_SOURCE_REFRESH_MINUTES || 60) * 60 * 1000;
const AUTO_SOURCE_REFRESH_INTERVAL_MS = Math.max(5 * 60 * 1000, configuredIntervalMs || 60 * 60 * 1000);
const AUTO_SOURCE_REFRESH_STARTUP_DELAY_MS = Math.max(0, Number(process.env.AUTO_SOURCE_REFRESH_STARTUP_DELAY_MS || 10_000));

const autoSourceRefreshStatus: AutoSourceRefreshStatus = {
  enabled: AUTO_SOURCE_REFRESH_ENABLED,
  running: false,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastSuccessAt: null,
  lastError: null,
  lastDurationMs: null,
  intervalMinutes: Math.round(AUTO_SOURCE_REFRESH_INTERVAL_MS / 60_000),
  startupDelaySeconds: Math.round(AUTO_SOURCE_REFRESH_STARTUP_DELAY_MS / 1000),
  runCount: 0,
  successCount: 0,
  failureCount: 0,
  nextRunAt: AUTO_SOURCE_REFRESH_ENABLED
    ? new Date(Date.now() + AUTO_SOURCE_REFRESH_STARTUP_DELAY_MS).toISOString()
    : null,
};

let autoSourceRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleNextAutoSourceRefresh(delayMs = AUTO_SOURCE_REFRESH_INTERVAL_MS) {
  if (!AUTO_SOURCE_REFRESH_ENABLED) return;

  if (autoSourceRefreshTimer) {
    clearTimeout(autoSourceRefreshTimer);
  }

  autoSourceRefreshStatus.nextRunAt = new Date(Date.now() + delayMs).toISOString();
  autoSourceRefreshTimer = setTimeout(() => {
    void runAutoSourceRefresh('scheduled');
  }, delayMs);
}

async function runAutoSourceRefresh(reason: 'startup' | 'scheduled' | 'manual' = 'scheduled') {
  if (!AUTO_SOURCE_REFRESH_ENABLED && reason !== 'manual') return autoSourceRefreshStatus;

  if (autoSourceRefreshStatus.running) {
    console.log(`[AutoSource] Skip ${reason}: refresh already running`);
    return autoSourceRefreshStatus;
  }

  const started = Date.now();
  autoSourceRefreshStatus.running = true;
  autoSourceRefreshStatus.lastStartedAt = new Date(started).toISOString();
  autoSourceRefreshStatus.lastError = null;
  autoSourceRefreshStatus.runCount++;
  autoSourceRefreshStatus.nextRunAt = null;

  console.log(`[AutoSource] Starting ${reason} popular cache refresh...`);

  try {
    await mangaService.updatePopularCache();
    const finished = Date.now();
    autoSourceRefreshStatus.lastFinishedAt = new Date(finished).toISOString();
    autoSourceRefreshStatus.lastSuccessAt = autoSourceRefreshStatus.lastFinishedAt;
    autoSourceRefreshStatus.lastDurationMs = finished - started;
    autoSourceRefreshStatus.successCount++;
    console.log(`[AutoSource] Completed ${reason} refresh in ${autoSourceRefreshStatus.lastDurationMs}ms`);
  } catch (error: any) {
    const finished = Date.now();
    autoSourceRefreshStatus.lastFinishedAt = new Date(finished).toISOString();
    autoSourceRefreshStatus.lastDurationMs = finished - started;
    autoSourceRefreshStatus.lastError = error?.message || String(error);
    autoSourceRefreshStatus.failureCount++;
    console.error(`[AutoSource] Failed ${reason} refresh:`, error);
  } finally {
    autoSourceRefreshStatus.running = false;
    if (reason !== 'manual') {
      scheduleNextAutoSourceRefresh();
    }
  }

  return autoSourceRefreshStatus;
}

function startAutoSourceRefresh() {
  scheduleNextAutoSourceRefresh(AUTO_SOURCE_REFRESH_STARTUP_DELAY_MS);
}

export { autoSourceRefreshStatus, runAutoSourceRefresh, scheduleNextAutoSourceRefresh, startAutoSourceRefresh };

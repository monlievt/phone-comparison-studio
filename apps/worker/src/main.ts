// apps/worker/src/main.ts
// Worker Daemon Entrypoint. Starts SQLite migrations, queue poller, Autopilot hourly scheduler, and daily cleanup.

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadEnv, loadAiConfig, openDb, JobQueue } from '@phone-studio/core';
import { LlmRouter } from '@phone-studio/ai';
import { HttpPublisher, FolderDropPublisher, ManualPublisher, Publisher } from '@phone-studio/publisher';
import { RemotionRenderService } from './render-service.js';
import { PipelineOrchestrator } from './orchestrator.js';
import { WorkerRunner } from './runner.js';
import { AutopilotController } from './autopilot.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '../../..');

function createPublisher(env: ReturnType<typeof loadEnv>, dataDir: string): Publisher | undefined {
  if (env.PUBLISH_MODE === 'folder' && env.YTAGENT_WATCH_DIR) {
    return new FolderDropPublisher({
      watchDir: env.YTAGENT_WATCH_DIR,
      channelName: env.YTAGENT_CHANNEL_NAME ?? 'phone-studio',
      ytagentBaseUrl: env.YTAGENT_BASE_URL,
    });
  }
  if (env.PUBLISH_MODE === 'http' && env.YTAGENT_BASE_URL) {
    return new HttpPublisher({
      baseUrl: env.YTAGENT_BASE_URL,
      channelName: env.YTAGENT_CHANNEL_NAME ?? 'phone-studio',
    });
  }
  if (env.PUBLISH_MODE === 'manual') {
    return new ManualPublisher(join(dataDir, 'exports'));
  }
  return undefined;
}

async function main(): Promise<void> {
  console.log('==============================================');
  console.log('  Phone Comparison Studio — Worker Service    ');
  console.log('==============================================');

  // 1. Load configuration and environment
  const env = loadEnv();
  const configDir = join(ROOT_DIR, 'config');
  const aiConfig = loadAiConfig(configDir);

  // 2. Open DB and run migrations
  const dataDir = env.DATA_DIR.startsWith('/')
    ? env.DATA_DIR
    : join(ROOT_DIR, env.DATA_DIR.replace(/^\.\//, ''));
  console.log(`[worker] Using database at: ${dataDir}/app.db`);
  const db = openDb(dataDir);

  // 3. Initialize services
  const queue = new JobQueue(db);

  const dailyLimits = {
    'groq-free': env.GROQ_DAILY_LIMIT || 1000,
    'gemini-pro': env.GEMINI_DAILY_LIMIT && env.GEMINI_DAILY_LIMIT > 0 ? env.GEMINI_DAILY_LIMIT : 1500,
    'gemini-flash': env.GEMINI_DAILY_LIMIT && env.GEMINI_DAILY_LIMIT > 0 ? env.GEMINI_DAILY_LIMIT : 1500,
  };

  const router = new LlmRouter({
    db,
    aiConfig,
    apiKeys: {
      gemini: env.GEMINI_API_KEY,
      groq: env.GROQ_API_KEY,
    },
    dailyLimits,
  });

  const publisher = createPublisher(env, dataDir);

  const renderService = new RemotionRenderService(
    join(ROOT_DIR, 'packages/video/src/index.ts'),
    join(dataDir, 'renders')
  );

  const autopilot = new AutopilotController(db, queue, dataDir, dailyLimits);

  const orchestrator = new PipelineOrchestrator({
    db,
    queue,
    router,
    publisher,
    renderService,
    autopilot,
    dataDir,
    configDir,
    videoPublicDir: join(ROOT_DIR, 'packages/video/public'),
  });

  const runner = new WorkerRunner({
    queue,
    orchestrator,
    pollIntervalMs: 2000,
    maxGeneralConcurrency: 2,
    maxRenderConcurrency: 1, // Strict render lock
  });

  // 4. Start Autopilot hourly scheduler & daily cleanup timer
  const runAutopilotTick = async () => {
    try {
      const res = await autopilot.runSchedulerTick();
      console.log(`[autopilot] Tick result: ${res.action}${res.reason ? ` (${res.reason})` : ''}`);
    } catch (err) {
      console.error('[autopilot] Scheduler tick error:', err);
    }
  };

  // Run initial autopilot check 10s after worker startup, then every 60 minutes
  const initialTickTimer = setTimeout(runAutopilotTick, 10_000);
  const hourlyTimer = setInterval(runAutopilotTick, 60 * 60 * 1000);
  const cleanupTimer = setInterval(() => {
    queue.enqueue('cleanup');
  }, 24 * 60 * 60 * 1000);

  // 5. Graceful shutdown handlers
  const shutdown = () => {
    console.log('\n[worker] Received shutdown signal. Closing gracefully...');
    clearTimeout(initialTickTimer);
    clearInterval(hourlyTimer);
    clearInterval(cleanupTimer);
    runner.stop();
    setTimeout(() => {
      db.close();
      process.exit(0);
    }, 1000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // 6. Start the worker polling loop
  runner.start();
}

main().catch((err) => {
  console.error('[worker] Fatal error in main:', err);
  process.exit(1);
});

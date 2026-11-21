// apps/worker/src/main.ts
// Worker Daemon Entrypoint. Starts SQLite migrations, queue poller, and orchestrator.

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadEnv, loadAiConfig, openDb, JobQueue } from '@phone-studio/core';
import { LlmRouter } from '@phone-studio/ai';
import { HttpPublisher } from '@phone-studio/publisher';
import { RemotionRenderService } from './render-service.js';
import { PipelineOrchestrator } from './orchestrator.js';
import { WorkerRunner } from './runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '../../..');

async function main(): Promise<void> {
  console.log('==============================================');
  console.log('  Phone Comparison Studio — Worker Service    ');
  console.log('==============================================');

  // 1. Load configuration and environment
  const env = loadEnv();
  const aiConfig = loadAiConfig(join(ROOT_DIR, 'config'));

  // 2. Open DB and run migrations
  const dataDir = join(ROOT_DIR, env.DATA_DIR.replace(/^\.\//, ''));
  console.log(`[worker] Using database at: ${dataDir}/app.db`);
  const db = openDb(dataDir);

  // 3. Initialize services
  const queue = new JobQueue(db);

  const router = new LlmRouter({
    db,
    aiConfig,
    apiKeys: {
      gemini: env.GEMINI_API_KEY,
      groq: env.GROQ_API_KEY,
    },
    dailyLimits: {
      'groq-free': env.GROQ_DAILY_LIMIT,
      'gemini-pro': env.GEMINI_DAILY_LIMIT ?? 1500,
      'gemini-flash': 1500,
    },
  });

  const publisher = env.YTAGENT_BASE_URL
    ? new HttpPublisher({
        baseUrl: env.YTAGENT_BASE_URL,
        channelName: env.YTAGENT_CHANNEL_NAME ?? 'phone-studio',
      })
    : undefined;

  const renderService = new RemotionRenderService(
    join(ROOT_DIR, 'packages/video/src/index.ts'),
    join(ROOT_DIR, 'data/renders')
  );

  const orchestrator = new PipelineOrchestrator({
    db,
    queue,
    router,
    publisher,
    renderService,
  });

  const runner = new WorkerRunner({
    queue,
    orchestrator,
    pollIntervalMs: 2000,
  });

  // 4. Graceful shutdown handlers
  const shutdown = () => {
    console.log('\n[worker] Received shutdown signal. Closing gracefully...');
    runner.stop();
    setTimeout(() => {
      db.close();
      process.exit(0);
    }, 1000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // 5. Start the worker polling loop
  runner.start();
}

main().catch((err) => {
  console.error('[worker] Fatal error in main:', err);
  process.exit(1);
});

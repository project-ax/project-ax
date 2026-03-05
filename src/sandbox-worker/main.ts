// src/sandbox-worker/main.ts — Entry point for sandbox worker pods.
//
// Starts the NATS-based sandbox worker that claims tool tasks from the queue
// and executes them in the local workspace.

import { startWorker } from './worker.js';

startWorker().catch((err) => {
  console.error('[sandbox-worker] fatal:', err);
  process.exit(1);
});

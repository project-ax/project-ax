// src/pool-controller/main.ts — Entry point for the pool controller process.
//
// Starts the reconciliation loop and metrics server.
// Handles SIGTERM/SIGINT for graceful shutdown.

import { createPoolController } from './controller.js';
import { createPoolK8sClient, type TierConfig } from './k8s-client.js';
import { createPoolMetrics, startMetricsServer } from './metrics.js';

async function main(): Promise<void> {
  const k8sClient = await createPoolK8sClient();
  const metrics = createPoolMetrics();

  const natsUrl = process.env.NATS_URL ?? 'nats://nats.ax.svc.cluster.local:4222';
  const image = process.env.K8S_POD_IMAGE ?? 'ax/agent:latest';
  const reconcileIntervalMs = parseInt(process.env.RECONCILE_INTERVAL_MS ?? '5000', 10);

  const tiers: TierConfig[] = [
    {
      tier: 'light',
      minReady: parseInt(process.env.LIGHT_MIN_READY ?? '2', 10),
      maxReady: parseInt(process.env.LIGHT_MAX_READY ?? '10', 10),
      template: {
        image,
        command: ['node', 'dist/sandbox-worker/main.js'],
        cpu: '1',
        memory: '2Gi',
        tier: 'light',
        natsUrl,
        workspaceRoot: '/workspace',
      },
    },
    {
      tier: 'heavy',
      minReady: parseInt(process.env.HEAVY_MIN_READY ?? '0', 10),
      maxReady: parseInt(process.env.HEAVY_MAX_READY ?? '3', 10),
      template: {
        image,
        command: ['node', 'dist/sandbox-worker/main.js'],
        cpu: '4',
        memory: '16Gi',
        tier: 'heavy',
        natsUrl,
        workspaceRoot: '/workspace',
        nodeSelector: { 'cloud.google.com/compute-class': 'Performance' },
      },
    },
  ];

  const controller = createPoolController({
    tiers,
    reconcileIntervalMs,
    k8sClient,
    metrics,
  });

  const metricsServer = startMetricsServer(metrics);

  controller.start();
  console.log('[pool-controller] started');

  // Graceful shutdown
  const shutdown = () => {
    console.log('[pool-controller] shutting down...');
    controller.stop();
    metricsServer.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[pool-controller] fatal:', err);
  process.exit(1);
});

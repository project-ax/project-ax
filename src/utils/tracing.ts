// src/utils/tracing.ts — OpenTelemetry SDK initialization (lazy-loaded)
import { trace, diag, DiagConsoleLogger, DiagLogLevel, type Tracer } from '@opentelemetry/api';
import { getLogger } from '../logger.js';

let initialized = false;
let sdkInstance: { shutdown(): Promise<void> } | null = null;

/**
 * Starts the OTel SDK if OTEL_EXPORTER_OTLP_ENDPOINT is set.
 * Lazy-loads the heavy SDK packages so there's zero import cost when tracing
 * is disabled.
 *
 * Langfuse setup requires:
 *   OTEL_EXPORTER_OTLP_ENDPOINT=https://cloud.langfuse.com/api
 *   LANGFUSE_PUBLIC_KEY=pk-...
 *   LANGFUSE_SECRET_KEY=sk-...
 *
 * Or for any generic OTLP backend:
 *   OTEL_EXPORTER_OTLP_ENDPOINT=https://your-collector:4318
 *   OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer token"
 */
export async function initTracing(): Promise<void> {
  if (initialized || !isTracingEnabled()) return;
  initialized = true;

  const logger = getLogger();
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT!;

  // Enable OTel diagnostic logging when OTEL_DEBUG is set
  if (process.env.OTEL_DEBUG) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  // Build OTLP headers — auto-configure Langfuse auth if keys are present
  const headers: Record<string, string> = {};
  const langfusePublic = process.env.LANGFUSE_PUBLIC_KEY;
  const langfuseSecret = process.env.LANGFUSE_SECRET_KEY;
  if (langfusePublic && langfuseSecret) {
    const encoded = Buffer.from(`${langfusePublic}:${langfuseSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${encoded}`;
    logger.info('tracing_init', { endpoint, auth: 'langfuse' });
  } else if (process.env.OTEL_EXPORTER_OTLP_HEADERS) {
    // Parse standard OTel header format: "key=value,key2=value2"
    for (const pair of process.env.OTEL_EXPORTER_OTLP_HEADERS.split(',')) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx > 0) {
        headers[pair.slice(0, eqIdx).trim()] = pair.slice(eqIdx + 1).trim();
      }
    }
    logger.info('tracing_init', { endpoint, auth: 'headers' });
  } else {
    logger.info('tracing_init', { endpoint, auth: 'none' });
  }

  try {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');

    const exporter = new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
      headers,
    });

    const sdk = new NodeSDK({
      serviceName: process.env.OTEL_SERVICE_NAME ?? 'ax',
      traceExporter: exporter,
    });

    sdk.start();
    sdkInstance = sdk;
    logger.info('tracing_started', { serviceName: process.env.OTEL_SERVICE_NAME ?? 'ax' });
  } catch (err) {
    logger.error('tracing_init_failed', { error: (err as Error).message });
  }
}

/** Flushes pending spans and shuts down the OTel SDK. Call during server stop. */
export async function shutdownTracing(): Promise<void> {
  if (!sdkInstance) return;
  try {
    await sdkInstance.shutdown();
  } catch {
    // Best-effort — process is exiting anyway
  }
  sdkInstance = null;
}

/** Returns the shared AX tracer. No-op tracer when SDK is not registered. */
export function getTracer(): Tracer {
  return trace.getTracer('ax');
}

/** True when the OTLP endpoint env var is set. */
export function isTracingEnabled(): boolean {
  return !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
}

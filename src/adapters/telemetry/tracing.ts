// Dependencies
import { register } from 'node:module'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify'
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'
import {
  SpanStatusCode,
  trace,
  type Span,
  type Tracer,
} from '@opentelemetry/api'

const SERVICE_NAME = 'passhub-aggregator'

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT

export const tracingEnabled = Boolean(endpoint)

const sdk = tracingEnabled
  ? new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: SERVICE_NAME,
        [ATTR_SERVICE_VERSION]: process.env.SERVICE_VERSION ?? 'dev',
      }),

      traceExporter: new OTLPTraceExporter(),
      instrumentations: [
        new FastifyInstrumentation({
          requestHook: (span, info) => {
            span.updateName(`HTTP ${info.request.method} ${info.request.url}`)
          },
        }),
        new UndiciInstrumentation(),

        new PgInstrumentation({ enhancedDatabaseReporting: false }),
      ],
    })
  : null

export const startTracing = (): void => {
  if (!tracingEnabled) return

  register('@opentelemetry/instrumentation/hook.mjs', import.meta.url)
  sdk?.start()
}

export const stopTracing = async (): Promise<void> => {
  await sdk?.shutdown()
}

export const flushTracing = async (): Promise<void> => {
  if (!tracingEnabled) return
  const provider = (
    sdk as unknown as { _tracerProvider?: { forceFlush: () => Promise<void> } }
  )?._tracerProvider

  await provider?.forceFlush().catch(() => undefined)
}

const tracer: Tracer = trace.getTracer(SERVICE_NAME)

export const withSpan = async <T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>,
): Promise<T> => {
  const span = tracer.startSpan(name, { attributes })
  try {
    const result = await fn(span)
    span.setStatus({ code: SpanStatusCode.OK })
    return result
  } catch (err) {
    span.recordException(err as Error)
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err),
    })
    throw err
  } finally {
    span.end()
  }
}
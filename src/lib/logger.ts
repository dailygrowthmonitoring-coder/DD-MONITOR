/** Structured JSON logger. Every ingest carries a traceId (= email_message_id) end-to-end. */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  ts: string;
  level: LogLevel;
  scope: string;
  msg: string;
  traceId?: string;
  [key: string]: unknown;
}

function emit(
  level: LogLevel,
  scope: string,
  msg: string,
  ctx?: Record<string, unknown>,
  traceId?: string,
): void {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg,
    ...(traceId !== undefined ? { traceId } : {}),
    ...ctx,
  };
  process.stdout.write(JSON.stringify(entry) + '\n');
}

export const logger = {
  /** Low-level diagnostic information. */
  debug(scope: string, msg: string, ctx?: Record<string, unknown>, traceId?: string): void {
    emit('debug', scope, msg, ctx, traceId);
  },
  /** Normal operational events. */
  info(scope: string, msg: string, ctx?: Record<string, unknown>, traceId?: string): void {
    emit('info', scope, msg, ctx, traceId);
  },
  /** Non-fatal anomalies that should be investigated. */
  warn(scope: string, msg: string, ctx?: Record<string, unknown>, traceId?: string): void {
    emit('warn', scope, msg, ctx, traceId);
  },
  /** Errors that require immediate attention. Always include the caught value in ctx. */
  error(scope: string, msg: string, ctx?: Record<string, unknown>, traceId?: string): void {
    emit('error', scope, msg, ctx, traceId);
  },
};

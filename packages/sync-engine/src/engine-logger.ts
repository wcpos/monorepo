export type SyncEngineLogMeta = { context: Record<string, unknown> };

export interface SyncEngineLogger {
	warn(message: string, meta: SyncEngineLogMeta): void;
}

const defaultLogger: SyncEngineLogger = {
	warn: (message, meta) => console.warn(message, meta),
};
let currentLogger = defaultLogger;

/**
 * Process-wide on purpose, replacing the engine's former app logger import so
 * the published package has no runtime dependency on @wcpos/utils.
 * A host sets it once before creating engines; null restores console warnings.
 */
export function setSyncEngineLogger(logger: SyncEngineLogger | null): void {
	currentLogger = logger ?? defaultLogger;
}

export function engineWarn(message: string, meta: SyncEngineLogMeta): void {
	currentLogger.warn(message, meta);
}

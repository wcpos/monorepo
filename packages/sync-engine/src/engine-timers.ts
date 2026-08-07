export type EngineTimers = {
	setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
	clearTimeout(handle: ReturnType<typeof setTimeout>): void;
	setInterval(callback: () => void, intervalMs: number): ReturnType<typeof setInterval>;
	clearInterval(handle: ReturnType<typeof setInterval>): void;
	unref(handle: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>): void;
};

export const systemTimers: EngineTimers = {
	setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
	clearTimeout: (handle) => globalThis.clearTimeout(handle),
	setInterval: (callback, intervalMs) => globalThis.setInterval(callback, intervalMs),
	clearInterval: (handle) => globalThis.clearInterval(handle),
	unref: (handle) => (handle as unknown as { unref?: () => void }).unref?.(),
};

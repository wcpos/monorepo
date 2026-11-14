import { afterEach, describe, expect, it, vi } from 'vitest';

import { engineWarn, setSyncEngineLogger } from './engine-logger';

const message = 'Refund parent seed failed after order ingestion';
const meta = { context: { parentRemoteId: '42', error: 'Error: seed failed' } };

afterEach(() => {
	setSyncEngineLogger(null);
	vi.restoreAllMocks();
});

describe('engine logger', () => {
	it('forwards to console.warn by default', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		engineWarn(message, meta);
		expect(warn).toHaveBeenCalledExactlyOnceWith(message, meta);
	});

	it('forwards the exact message and meta to the set logger', () => {
		const warn = vi.fn();
		setSyncEngineLogger({ warn });
		engineWarn(message, meta);
		expect(warn).toHaveBeenCalledExactlyOnceWith(message, meta);
		expect(warn.mock.calls[0][1]).toBe(meta);
	});

	it('restores console.warn when set to null', () => {
		const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const warn = vi.fn();
		setSyncEngineLogger({ warn });
		setSyncEngineLogger(null);
		engineWarn(message, meta);
		expect(consoleWarn).toHaveBeenCalledExactlyOnceWith(message, meta);
		expect(warn).not.toHaveBeenCalled();
	});

	it('resolves the logger at call time for an existing caller', () => {
		const caller = () => engineWarn(message, meta);
		const warn = vi.fn();
		setSyncEngineLogger({ warn });
		caller();
		expect(warn).toHaveBeenCalledExactlyOnceWith(message, meta);
	});
});

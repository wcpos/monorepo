import { afterEach, describe, expect, it, vi } from 'vitest';

import { waitForWebPrinterReconnect } from '../web-reconnect';

function fakePrinter(options: { reconnect?: () => void | Promise<void> } = {}) {
	const listeners = new Map<string, ((event?: unknown) => void)[]>();
	return {
		printer: {
			addEventListener: (type: string, cb: (event?: unknown) => void) => {
				listeners.set(type, [...(listeners.get(type) ?? []), cb]);
			},
			reconnect: options.reconnect ?? (() => undefined),
		},
		emit: (type: string, event?: unknown) => {
			for (const cb of listeners.get(type) ?? []) cb(event);
		},
	};
}

describe('waitForWebPrinterReconnect', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('resolves when the connector emits connected', async () => {
		const { printer, emit } = fakePrinter();
		const promise = waitForWebPrinterReconnect(printer, {}, 'USB');
		emit('connected');
		await expect(promise).resolves.toBeUndefined();
	});

	it('rejects when the connector never emits a terminal event', async () => {
		vi.useFakeTimers();
		const { printer } = fakePrinter();
		const promise = waitForWebPrinterReconnect(printer, {}, 'USB', 100);
		const assertion = expect(promise).rejects.toThrow('Timed out reconnecting USB printer');
		await vi.advanceTimersByTimeAsync(100);
		await assertion;
	});

	it('rejects when reconnect rejects asynchronously', async () => {
		const { printer } = fakePrinter({ reconnect: () => Promise.reject(new Error('grant gone')) });
		await expect(waitForWebPrinterReconnect(printer, {}, 'Bluetooth')).rejects.toThrow(
			'grant gone'
		);
	});
});

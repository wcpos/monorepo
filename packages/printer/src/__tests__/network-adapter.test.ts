import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NetworkAdapter } from '../transport/network-adapter';

const { createConnectionMock, writeMock, endMock, destroyMock, onMock, debug, info, warn } =
	vi.hoisted(() => ({
		createConnectionMock: vi.fn(),
		writeMock: vi.fn(),
		endMock: vi.fn(),
		destroyMock: vi.fn(),
		onMock: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
	}));

vi.mock('../logger', () => ({ printerLogger: { debug, info, warn } }));

vi.mock('react-native-tcp-socket', () => ({
	default: {
		createConnection: createConnectionMock,
	},
}));

describe('NetworkAdapter', () => {
	let originalBuffer: typeof Buffer | undefined;
	let connectCallback: (() => void) | undefined;
	let errorCallback: ((error: Error) => void) | undefined;

	beforeEach(() => {
		originalBuffer = globalThis.Buffer;
		Reflect.deleteProperty(globalThis, 'Buffer');
		connectCallback = undefined;
		errorCallback = undefined;

		writeMock.mockImplementation((_payload, _encoding, callback) => callback?.(null));
		// Mirror react-native-tcp-socket's real Socket.end(data, encoding): it has
		// NO completion-callback parameter. When `data` is truthy it is written as a
		// chunk, and a non-string/non-buffer chunk throws — exactly how a Node-style
		// end(callback) crashes on a device with "Invalid data, chunk must be a
		// string or buffer, not function".
		endMock.mockImplementation((data?: unknown) => {
			if (data === undefined || data === null) return;
			const isWritableChunk = typeof data === 'string' || data instanceof Uint8Array;
			if (!isWritableChunk) {
				throw new Error(`Invalid data, chunk must be a string or buffer, not ${typeof data}`);
			}
		});
		destroyMock.mockClear();
		onMock.mockImplementation((event, callback) => {
			if (event === 'error') errorCallback = callback;
		});
		createConnectionMock.mockImplementation((_options, callback) => {
			connectCallback = callback;
			return {
				write: writeMock,
				end: endMock,
				destroy: destroyMock,
				on: onMock,
			};
		});
	});

	afterEach(() => {
		globalThis.Buffer = originalBuffer as typeof Buffer;
		vi.clearAllMocks();
	});

	it('writes raw bytes without requiring global Buffer', async () => {
		const adapter = new NetworkAdapter('192.168.1.144', 9100);
		const printPromise = adapter.printRaw(new Uint8Array([0x1b, 0x40, 0x0a]));

		expect(createConnectionMock).toHaveBeenCalledWith(
			{ host: '192.168.1.144', port: 9100 },
			expect.any(Function)
		);
		expect(connectCallback).toBeDefined();
		expect(() => connectCallback?.()).not.toThrow();
		await expect(printPromise).resolves.toBeUndefined();

		expect(writeMock).toHaveBeenCalledWith(
			new Uint8Array([0x1b, 0x40, 0x0a]),
			undefined,
			expect.any(Function)
		);
		expect(endMock).toHaveBeenCalled();
		expect(debug).toHaveBeenCalledWith('Raw TCP connect started', {
			context: { host: '192.168.1.144', port: 9100, bytes: 3 },
		});
		expect(info).toHaveBeenCalledWith('Raw TCP job sent', {
			context: { host: '192.168.1.144', port: 9100, bytes: 3, elapsedMs: expect.any(Number) },
		});
	});

	it('logs socket errors before rejecting', async () => {
		const promise = new NetworkAdapter('192.168.1.145', 9100).printRaw(new Uint8Array([1, 2]));
		errorCallback?.(new Error('socket closed'));

		await expect(promise).rejects.toThrow('socket closed');
		expect(warn).toHaveBeenCalledWith('Raw TCP job failed', {
			context: {
				host: '192.168.1.145',
				port: 9100,
				bytes: 2,
				elapsedMs: expect.any(Number),
				cause: 'socket closed',
			},
		});
	});

	it('logs timeout failures before rejecting', async () => {
		vi.useFakeTimers();
		const promise = new NetworkAdapter('192.168.1.146', 9100).printRaw(new Uint8Array([1]));
		const rejection = expect(promise).rejects.toThrow('timed out');
		await vi.advanceTimersByTimeAsync(10_000);

		await rejection;
		expect(warn).toHaveBeenCalledWith('Raw TCP job failed', {
			context: expect.objectContaining({ cause: 'timeout' }),
		});
		vi.useRealTimers();
	});

	it('half-closes via end() with no data and resolves (regression: crash after the test page printed)', async () => {
		const adapter = new NetworkAdapter('192.168.1.147', 9100);
		const printPromise = adapter.printRaw(new Uint8Array([0x1b, 0x40]));

		// Driving the connect callback must not throw. Passing the settle callback
		// to end() (the old bug) makes the realistic end mock throw the device's
		// "Invalid data, chunk must be a string or buffer, not function" error here.
		expect(() => connectCallback?.()).not.toThrow();
		await expect(printPromise).resolves.toBeUndefined();

		// end() must never be handed a function as its first argument.
		expect(endMock).toHaveBeenCalled();
		for (const call of endMock.mock.calls) {
			expect(typeof call[0]).not.toBe('function');
		}
		// settle() still tears the socket down.
		expect(destroyMock).toHaveBeenCalled();
	});
});

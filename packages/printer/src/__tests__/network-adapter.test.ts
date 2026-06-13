import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NetworkAdapter } from '../transport/network-adapter';

const { createConnectionMock, writeMock, endMock, destroyMock, onMock } = vi.hoisted(() => ({
	createConnectionMock: vi.fn(),
	writeMock: vi.fn(),
	endMock: vi.fn(),
	destroyMock: vi.fn(),
	onMock: vi.fn(),
}));

vi.mock('react-native-tcp-socket', () => ({
	default: {
		createConnection: createConnectionMock,
	},
}));

describe('NetworkAdapter', () => {
	let originalBuffer: typeof Buffer | undefined;
	let connectCallback: (() => void) | undefined;

	beforeEach(() => {
		originalBuffer = globalThis.Buffer;
		Reflect.deleteProperty(globalThis, 'Buffer');
		connectCallback = undefined;

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
		onMock.mockClear();
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

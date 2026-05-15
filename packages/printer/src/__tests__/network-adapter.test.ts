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
		endMock.mockImplementation((callback) => callback?.());
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
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDeviceTransport } from '../device-adapter';
import { SppNativeAdapter } from '../spp-native-adapter';

const { native, state } = vi.hoisted(() => {
	const state = { os: 'android', connected: false, replies: [] as (string | null)[] };
	const native = {
		bondedDevices: vi.fn(() => []),
		isConnected: vi.fn(() => state.connected),
		connect: vi.fn(async (_address: string) => {
			state.connected = true;
		}),
		write: vi.fn(async (_address: string, _base64: string) => undefined),
		read: vi.fn(async (_address: string, _timeoutMs: number) => state.replies.shift() ?? null),
		disconnect: vi.fn(async (_address: string) => {
			state.connected = false;
		}),
	};
	return { native, state };
});

vi.mock('expo-modules-core', () => ({
	Platform: {
		get OS() {
			return state.os;
		},
	},
	requireOptionalNativeModule: () => (state.os === 'android' ? native : null),
}));

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));

beforeEach(() => {
	state.os = 'android';
	state.connected = false;
	state.replies = [];
	for (const fn of Object.values(native)) fn.mockClear();
});

afterEach(async () => {
	await new SppNativeAdapter('spp:AA:BB:CC:DD:EE:FF').disconnect();
});

describe('SppNativeAdapter', () => {
	it('connects once and writes the job in 512-byte chunks', async () => {
		await new SppNativeAdapter('spp:AA:BB:CC:DD:EE:FF').printRaw(new Uint8Array(1000).fill(65));

		expect(native.connect).toHaveBeenCalledWith('AA:BB:CC:DD:EE:FF');
		expect(native.write.mock.calls.map(([, chunk]) => atob(chunk).length)).toEqual([512, 488]);
	});

	it('reuses the open socket for the next job', async () => {
		const adapter = new SppNativeAdapter('spp:AA:BB:CC:DD:EE:FF');
		await adapter.printRaw(new Uint8Array(4));
		await adapter.printRaw(new Uint8Array(4));

		expect(native.connect).toHaveBeenCalledTimes(1);
		expect(native.disconnect).not.toHaveBeenCalled();
	});

	it('disconnects after a failed write so the next job opens a fresh socket', async () => {
		native.write.mockRejectedValueOnce(new Error('socket closed'));
		const adapter = new SppNativeAdapter('spp:AA:BB:CC:DD:EE:FF');

		await expect(adapter.printRaw(new Uint8Array(8))).rejects.toThrow('socket closed');

		expect(native.disconnect).toHaveBeenCalledTimes(1);
		expect(state.connected).toBe(false);
		await adapter.printRaw(new Uint8Array(8));
		expect(native.connect).toHaveBeenCalledTimes(2);
	});

	it('passes the module line through unchanged', async () => {
		native.connect.mockRejectedValueOnce(
			new Error(
				'Bluetooth printer is not paired with this phone. Pair it in Bluetooth settings, then scan again.'
			)
		);

		await expect(
			new SppNativeAdapter('spp:AA:BB:CC:DD:EE:FF').printRaw(new Uint8Array(4))
		).rejects.toThrow(/not paired with this phone/);
	});

	it('asks DLE EOT over the socket and reads the status byte back', async () => {
		state.replies = [b64([0x16]), b64([0x12]), b64([0x12])];

		const status = await new SppNativeAdapter('spp:AA:BB:CC:DD:EE:FF').queryStatus();

		expect(
			native.write.mock.calls.map(([, chunk]) => Array.from(atob(chunk), (c) => c.charCodeAt(0)))
		).toEqual([
			[0x10, 0x04, 1],
			[0x10, 0x04, 2],
			[0x10, 0x04, 4],
		]);
		expect(status).not.toBeNull();
	});

	it('answers null on a build without the module instead of failing', async () => {
		state.os = 'ios';

		await expect(new SppNativeAdapter('spp:AA:BB:CC:DD:EE:FF').queryStatus()).resolves.toBeNull();
	});

	it('routes an spp: bluetooth profile on native to the SPP adapter', async () => {
		const transport = await createDeviceTransport({
			id: 'p1',
			name: 'BlueTooth Printer',
			connectionType: 'bluetooth',
			vendor: 'generic',
			address: 'spp:AA:BB:CC:DD:EE:FF',
			port: 0,
			language: 'esc-pos',
			columns: 32,
			fullReceiptRaster: false,
			autoCut: true,
			autoOpenDrawer: false,
			isDefault: false,
			isBuiltIn: false,
		});

		expect(transport).toBeInstanceOf(SppNativeAdapter);
		expect(transport.name).toBe('spp-native');
	});
});

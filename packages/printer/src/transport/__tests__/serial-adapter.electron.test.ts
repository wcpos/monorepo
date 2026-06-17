import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SerialElectronAdapter } from '../serial-adapter.electron';

// ---------------------------------------------------------------------------
// IPC stub
// ---------------------------------------------------------------------------

function installIpc(invokeImpl?: () => Promise<unknown>) {
	(window as unknown as Record<string, unknown>).ipcRenderer = {
		invoke: invokeImpl
			? vi.fn().mockImplementation(invokeImpl)
			: vi.fn().mockResolvedValue(undefined),
	};
}

function removeIpc() {
	delete (window as unknown as Record<string, unknown>).ipcRenderer;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SerialElectronAdapter', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		installIpc();
	});

	afterEach(() => {
		removeIpc();
		vi.useRealTimers();
	});

	it('printRaw invokes print-raw-serial with device key and data array', async () => {
		const adapter = new SerialElectronAdapter('serial:/dev/cu.TM-P20');
		const bytes = new Uint8Array([0x1b, 0x40, 0x41]);

		const ipc = (window as unknown as Record<string, unknown>).ipcRenderer as {
			invoke: ReturnType<typeof vi.fn>;
		};

		await adapter.printRaw(bytes);

		expect(ipc.invoke).toHaveBeenCalledWith('print-raw-serial', {
			device: 'serial:/dev/cu.TM-P20',
			data: [0x1b, 0x40, 0x41],
		});
	});

	it('printRaw clears its timeout after ipc resolves', async () => {
		const adapter = new SerialElectronAdapter('serial:/dev/cu.TM-P20');

		await adapter.printRaw(new Uint8Array([0x41]));

		expect(vi.getTimerCount()).toBe(0);
	});

	it('printRaw rejects after 30s timeout when ipc never resolves', async () => {
		// Install a never-resolving invoke
		installIpc(() => new Promise(() => undefined));

		const adapter = new SerialElectronAdapter('serial:/dev/cu.TM-P20');
		const rejection = expect(adapter.printRaw(new Uint8Array([0x41]))).rejects.toThrow('timed out');

		// Advance past the 30s timeout
		await vi.advanceTimersByTimeAsync(30_001);

		await rejection;
	});

	it('printHtml rejects with not-supported error', async () => {
		const adapter = new SerialElectronAdapter('serial:/dev/cu.TM-P20');
		await expect(adapter.printHtml('<p>Hello</p>')).rejects.toThrow(
			'SerialElectronAdapter does not support HTML printing. Use printRaw instead.'
		);
	});

	it('printRaw throws when ipcRenderer is not available', async () => {
		removeIpc();
		const adapter = new SerialElectronAdapter('serial:/dev/cu.TM-P20');
		await expect(adapter.printRaw(new Uint8Array([0x41]))).rejects.toThrow(
			'Electron ipcRenderer not available'
		);
	});
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import { printFromUrl } from './print-from-url.electron';

// ---------------------------------------------------------------------------
// IPC stub — mirrors the preload contract: the event arg is stripped, so
// listeners receive the payload as the FIRST argument.
// ---------------------------------------------------------------------------

type IpcListener = (...args: unknown[]) => void;

function installIpc() {
	const listeners = new Map<string, IpcListener>();
	const sendMock = vi.fn();
	(window as unknown as Record<string, unknown>).ipcRenderer = {
		send: sendMock,
		on: (channel: string, cb: IpcListener) => {
			listeners.set(channel, cb);
			return () => listeners.delete(channel);
		},
	};
	return { listeners, sendMock };
}

afterEach(() => {
	delete (window as unknown as Record<string, unknown>).ipcRenderer;
	vi.useRealTimers();
});

describe('printFromUrl (electron)', () => {
	it('resolves when the after-print channel fires', async () => {
		const { listeners, sendMock } = installIpc();
		const promise = printFromUrl('https://example.com/receipt', vi.fn());

		const { printJobId } = sendMock.mock.calls[0][1] as { printJobId: string };
		listeners.get(`onAfterPrint-${printJobId}`)!();

		await expect(promise).resolves.toBeUndefined();
	});

	it('rejects with the decoded error payload (preload strips the event arg)', async () => {
		const { listeners, sendMock } = installIpc();
		const promise = printFromUrl('https://example.com/receipt', vi.fn());

		const { printJobId } = sendMock.mock.calls[0][1] as { printJobId: string };
		// Preload delivers the payload as the first (and only) argument.
		listeners.get(`onPrintError-${printJobId}`)!('ERR_PRINTER_OFFLINE');

		await expect(promise).rejects.toThrow('Electron print failed: ERR_PRINTER_OFFLINE');
	});

	it('times out after 30s to match SystemPrintAdapter', async () => {
		vi.useFakeTimers();
		installIpc();
		const promise = printFromUrl('https://example.com/receipt', vi.fn());
		const assertion = expect(promise).rejects.toThrow('Electron print timed out after 30000ms');

		await vi.advanceTimersByTimeAsync(30_000);
		await assertion;
	});
});

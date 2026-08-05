/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';

import { usePrintExternalURL } from './use-print-external-url.electron';

jest.mock('uuid', () => ({ v4: () => 'print-job' }));

type IpcRenderer = {
	invoke: (channel: string, args: unknown) => Promise<unknown>;
	send: (channel: string, args: unknown) => void;
	once: (channel: string, callback: (...args: unknown[]) => void) => void;
};

describe('usePrintExternalURL (Electron)', () => {
	afterEach(() => {
		delete (window as unknown as { ipcRenderer?: IpcRenderer }).ipcRenderer;
	});

	it('reports a synchronous onBeforePrint error without throwing from the IPC callback', async () => {
		const error = new Error('preparation failed');
		const onPrintError = jest.fn();
		let onBeforePrintAcknowledged: (() => void) | undefined;
		const ipcRenderer: IpcRenderer = {
			invoke: jest.fn(() => Promise.resolve()),
			send: jest.fn(),
			once: jest.fn((channel, callback) => {
				if (channel === 'onBeforePrint-print-job') {
					onBeforePrintAcknowledged = callback;
				}
			}),
		};
		(window as unknown as { ipcRenderer: IpcRenderer }).ipcRenderer = ipcRenderer;

		const { result } = renderHook(() =>
			usePrintExternalURL({
				externalURL: 'https://example.com/receipt',
				onBeforePrint: () => {
					throw error;
				},
				onPrintError,
			})
		);

		act(() => result.current.print());
		expect(onBeforePrintAcknowledged).toBeDefined();
		expect(() => act(() => onBeforePrintAcknowledged?.())).not.toThrow();

		await waitFor(() => expect(onPrintError).toHaveBeenCalledWith('onBeforePrint', error));
	});
});

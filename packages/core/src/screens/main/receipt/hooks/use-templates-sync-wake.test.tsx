/**
 * @jest-environment jsdom
 *
 * The wake behaviour of `useTemplatesSync`. The deferral is recorded inside the
 * module-level `syncTemplates` (not in the hook), so the hook and the sync
 * function have to agree on the SAME collection identity for the retry to fire —
 * a mismatch there would fail silently, leaving the template set empty until the
 * next remount. These tests pin that handshake.
 */
import { act, renderHook, waitFor } from '@testing-library/react';

import { useTemplatesSync } from './use-templates-sync';

const mockGet = jest.fn();
const mockWakeCallbacks: (() => void)[] = [];
const collection = { name: 'templates' };

jest.mock('../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ get: mockGet }),
}));
jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ localDB: { collections: { templates: collection } } }),
}));
jest.mock('@wcpos/hooks/use-http-client', () => ({
	// The real predicate — a stub here would ratify the test instead of checking
	// the guard the code actually runs.
	isAsleepBlock: jest.requireActual('@wcpos/hooks/use-http-client/request-state-manager')
		.isAsleepBlock,
	requestStateManager: {
		onWake: (callback: () => void) => {
			mockWakeCallbacks.push(callback);
			return () => {
				const index = mockWakeCallbacks.indexOf(callback);
				if (index !== -1) mockWakeCallbacks.splice(index, 1);
			};
		},
	},
}));

const makeAsleepError = () =>
	Object.assign(new Error('App is in background'), {
		isPreFlightBlocked: true,
		blockCode: 'preflight-asleep',
		isSleeping: true,
	});

const wake = async () => {
	await act(async () => {
		for (const callback of [...mockWakeCallbacks]) callback();
	});
};

describe('useTemplatesSync wake behaviour', () => {
	beforeEach(() => {
		mockGet.mockReset();
		mockWakeCallbacks.length = 0;
	});

	it('retries a sync that was deferred by the asleep pre-flight block', async () => {
		mockGet.mockRejectedValueOnce(makeAsleepError()).mockResolvedValue({ data: [] });

		renderHook(() => useTemplatesSync());
		await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));

		await wake();

		await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
	});

	it('does not re-pull the template set on a wake when nothing was deferred', async () => {
		// This sync pulls the FULL set (posts_per_page=-1) and the hook is mounted for
		// the whole session, so an unconditional wake tick would re-pull everything on
		// every tab switch or window restore.
		mockGet.mockResolvedValue({ data: [] });

		renderHook(() => useTemplatesSync());
		await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));

		await wake();
		await wake();

		expect(mockGet).toHaveBeenCalledTimes(1);
	});

	it('consumes the deferral, so later wakes are routine again', async () => {
		mockGet.mockRejectedValueOnce(makeAsleepError()).mockResolvedValue({ data: [] });

		renderHook(() => useTemplatesSync());
		await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));

		await wake();
		await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));

		await wake();
		expect(mockGet).toHaveBeenCalledTimes(2);
	});
});

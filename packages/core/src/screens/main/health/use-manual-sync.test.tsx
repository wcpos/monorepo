/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';

import { Toast } from '@wcpos/components/toast';

import { useManualSync } from './use-manual-sync';

const mockSync = jest.fn();
const mockEngine = { sync: mockSync };

jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine: mockEngine }),
}));
jest.mock('@wcpos/components/toast', () => ({
	Toast: { show: jest.fn() },
}));
jest.mock('../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../jest/translate')>(
		'../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});

describe('useManualSync', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('exposes the in-flight state around the sync call', async () => {
		let finish!: (report: unknown) => void;
		mockSync.mockReturnValue(
			new Promise((resolve) => {
				finish = resolve;
			})
		);

		const { result } = renderHook(() => useManualSync());
		expect(result.current.syncing).toBe(false);

		act(() => {
			void result.current.sync();
		});
		await waitFor(() => expect(result.current.syncing).toBe(true));

		finish({ lane: 'all', status: 'ran' });
		await waitFor(() => expect(result.current.syncing).toBe(false));
		expect(Toast.show).not.toHaveBeenCalled();
	});

	it('shows an error toast with the report error text', async () => {
		mockSync.mockResolvedValue({ lane: 'all', status: 'error', error: 'HTTP 502' });

		const { result } = renderHook(() => useManualSync());
		await act(() => result.current.sync());

		expect(Toast.show).toHaveBeenCalledWith({
			type: 'error',
			text1: 'Couldn’t sync with the server.',
			text2: 'HTTP 502',
		});
	});

	it('surfaces an offline skip as a warning with cashier copy', async () => {
		mockSync.mockResolvedValue({ lane: 'all', status: 'skipped', reason: 'offline' });

		const { result } = renderHook(() => useManualSync());
		await act(() => result.current.sync());

		expect(Toast.show).toHaveBeenCalledWith({
			type: 'warning',
			text1: 'Sync didn’t run.',
			text2: 'This device is offline.',
		});
	});

	it('surfaces a lifecycle-pending skip as a warning with busy copy', async () => {
		mockSync.mockResolvedValue({
			lane: 'all',
			status: 'skipped',
			reason: 'lifecycle operation pending',
		});

		const { result } = renderHook(() => useManualSync());
		await act(() => result.current.sync());

		expect(Toast.show).toHaveBeenCalledWith({
			type: 'warning',
			text1: 'Sync didn’t run.',
			text2: 'The store is busy right now — try again in a moment.',
		});
	});

	it('falls back to the raw reason for other skips', async () => {
		mockSync.mockResolvedValue({ lane: 'all', status: 'skipped', reason: 'no active scope' });

		const { result } = renderHook(() => useManualSync());
		await act(() => result.current.sync());

		expect(Toast.show).toHaveBeenCalledWith({
			type: 'warning',
			text1: 'Sync didn’t run.',
			text2: 'no active scope',
		});
	});

	it('shows an error toast when sync() rejects', async () => {
		mockSync.mockRejectedValue(new Error('engine disposed'));

		const { result } = renderHook(() => useManualSync());
		await act(() => result.current.sync());

		expect(Toast.show).toHaveBeenCalledWith({
			type: 'error',
			text1: 'Couldn’t sync with the server.',
			text2: 'engine disposed',
		});
	});
});

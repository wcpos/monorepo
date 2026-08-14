/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';

import { Toast } from '@wcpos/components/toast';

import { useCollectionCheck, useManualSync } from './use-manual-sync';

const mockSync = jest.fn();
const mockCheckCollection = jest.fn();
const mockEngine = { sync: mockSync, checkCollection: mockCheckCollection };

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

	it('exposes the checked collection around the collection check call', async () => {
		let finish!: (report: unknown) => void;
		mockCheckCollection.mockReturnValue(
			new Promise((resolve) => {
				finish = resolve;
			})
		);

		const { result } = renderHook(() => useCollectionCheck());
		expect(result.current.checking).toBeNull();

		act(() => {
			void result.current.check('products');
		});
		await waitFor(() => expect(result.current.checking).toBe('products'));

		finish({ collection: 'products', status: 'ran' });
		await waitFor(() => expect(result.current.checking).toBeNull());
	});

	it('refuses another collection check or full sync while a collection check is in flight', async () => {
		let finish!: (report: unknown) => void;
		mockCheckCollection.mockReturnValue(
			new Promise((resolve) => {
				finish = resolve;
			})
		);

		const { result } = renderHook(() => ({
			collection: useCollectionCheck(),
			manual: useManualSync(),
		}));
		act(() => {
			void result.current.collection.check('products');
		});
		await waitFor(() => expect(result.current.collection.checking).toBe('products'));

		await act(() => result.current.collection.check('orders'));
		await act(() => result.current.manual.sync());
		expect(mockCheckCollection).toHaveBeenCalledTimes(1);
		expect(mockSync).not.toHaveBeenCalled();

		finish({ collection: 'products', status: 'ran' });
		await waitFor(() => expect(result.current.collection.checking).toBeNull());
	});

	it('shows an error toast for a failed collection check report', async () => {
		mockCheckCollection.mockResolvedValue({
			collection: 'products',
			status: 'error',
			error: 'HTTP 502',
		});

		const { result } = renderHook(() => useCollectionCheck());
		await act(() => result.current.check('products'));

		expect(Toast.show).toHaveBeenCalledWith({
			type: 'error',
			text1: 'Couldn’t sync with the server.',
			text2: 'HTTP 502',
		});
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

	it('shares one in-flight guard across instances and refuses duplicate starts', async () => {
		let finish!: (report: unknown) => void;
		mockSync.mockReturnValue(
			new Promise((resolve) => {
				finish = resolve;
			})
		);

		// Two independent consumers — e.g. a row's Sync now and Check everything now.
		const first = renderHook(() => useManualSync());
		const second = renderHook(() => useManualSync());

		act(() => {
			void first.result.current.sync();
		});
		await waitFor(() => expect(first.result.current.syncing).toBe(true));
		await waitFor(() => expect(second.result.current.syncing).toBe(true));

		// A second entry point pressed mid-flight must not start another engine pass.
		await act(() => second.result.current.sync());
		expect(mockSync).toHaveBeenCalledTimes(1);

		finish({ lane: 'all', status: 'ran' });
		await waitFor(() => expect(first.result.current.syncing).toBe(false));
		await waitFor(() => expect(second.result.current.syncing).toBe(false));
	});

	it('falls back to the report reason when an error report has no error text', async () => {
		mockSync.mockResolvedValue({ lane: 'all', status: 'error', reason: 'scope database not open' });

		const { result } = renderHook(() => useManualSync());
		await act(() => result.current.sync());

		expect(Toast.show).toHaveBeenCalledWith({
			type: 'error',
			text1: 'Couldn’t sync with the server.',
			text2: 'scope database not open',
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

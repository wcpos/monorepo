/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { of } from 'rxjs';

import { useUnreadErrorCount } from './logs-badge';

const mockRecoverLogsCollectionStorage = jest.fn();
const mockCount = jest.fn();
const mockAddState = jest.fn();
const mockLogsCollection = { count: mockCount };
const mockManager = {
	localDB: {
		addState: mockAddState,
		collections: { logs: mockLogsCollection },
	},
};
// ONE observable for the module's lifetime: a fresh `of()` per render would give
// the count memo a new dependency each time and spin it into a resubscribe loop.
const mockLogsCollection$ = of(mockLogsCollection);

jest.mock('@wcpos/query', () => ({
	recoverLogsCollectionStorage: (...args: unknown[]) => mockRecoverLogsCollectionStorage(...args),
	useLocalCollection$: () => mockLogsCollection$,
	useQueryRuntime: () => mockManager,
}));

jest.mock('@wcpos/components/badge', () => ({ Badge: () => null }));

describe('useUnreadErrorCount', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockCount.mockReturnValue({ $: of(3) });
	});

	it('persists a missing watermark before counting retained errors', async () => {
		let watermark: number | undefined;
		let finishPersistence = () => {};
		const state = {
			get: jest.fn(() => watermark),
			get$: jest.fn(() => of(watermark)),
			set: jest.fn((_path: string, modifier: () => number) => {
				watermark = modifier();
				return new Promise<void>((resolve) => {
					finishPersistence = resolve;
				});
			}),
		};
		mockAddState.mockResolvedValue(state);

		const { result } = renderHook(() => useUnreadErrorCount());

		await waitFor(() => expect(state.set).toHaveBeenCalledTimes(1));
		expect(mockCount).not.toHaveBeenCalled();

		await act(async () => {
			finishPersistence();
		});

		await waitFor(() => expect(result.current.count).toBe(3));
		expect(mockCount).toHaveBeenCalledWith({
			selector: {
				level: { $eq: 'error' },
				timestamp: { $gt: watermark },
			},
		});
	});

	it('does not count from epoch when the initial watermark cannot be persisted', async () => {
		const state = {
			get: jest.fn(() => undefined),
			get$: jest.fn(() => of(undefined)),
			set: jest.fn().mockRejectedValue(new Error('state storage unavailable')),
		};
		mockAddState.mockResolvedValue(state);

		const { result } = renderHook(() => useUnreadErrorCount());

		await waitFor(() => expect(state.set).toHaveBeenCalledTimes(1));
		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(result.current.count).toBe(0);
		expect(mockCount).not.toHaveBeenCalled();
	});
});

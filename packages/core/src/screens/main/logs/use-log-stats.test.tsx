/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react';
import { of } from 'rxjs';

import { useLogStats } from './use-log-stats';

const mockCount = jest.fn();
const mockFind = jest.fn();
const mockLogsCollection = { count: mockCount, find: mockFind };
// ONE observable for the module's lifetime. A factory minting a fresh `of()` per
// render would hand `useLogStats` a new dependency every time and spin its memo
// into a resubscribe loop — the real hook memoizes, and the stand-in must too.
const mockLogsCollection$ = of(mockLogsCollection);

jest.mock('@wcpos/query', () => ({
	// The hook reads the collection through `useLocalCollection$` so it follows an
	// in-place replacement; the stand-in is the same collection as a one-shot
	// observable. `useLocalCollection$`'s own following behaviour is covered in
	// packages/query — this suite is about the stats derived from what it hands over.
	useLocalCollection$: () => mockLogsCollection$,
	useQueryRuntime: () => ({
		localDB: { collections: { logs: mockLogsCollection } },
	}),
}));

describe('useLogStats', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockCount.mockReturnValue({ $: of(0) });
		mockFind.mockReturnValue({ $: of([]) });
	});

	it('queries every retained sync record outcome before deriving stuck records', async () => {
		renderHook(() => useLogStats());

		await waitFor(() => expect(mockFind).toHaveBeenCalledTimes(2));
		expect(mockFind).toHaveBeenCalledWith({
			selector: {
				category: { $gte: 'wcpos.sync', $lt: 'wcpos.sync/' },
				operationType: { $eq: 'sync.record' },
			},
			sort: [{ timestamp: 'desc' }],
		});
	});

	it('derives the clock-skew warning from engine warn rows', async () => {
		const skewRow = {
			toJSON: () => ({
				logId: 'skew-1',
				timestamp: Date.now() - 1_000,
				level: 'warn',
				category: 'wcpos.sync.engine',
				context: { skewSeconds: 300 },
			}),
		};
		mockFind.mockImplementation(({ selector }) =>
			selector.category?.$eq === 'wcpos.sync.engine' ? { $: of([skewRow]) } : { $: of([]) }
		);

		const { result } = renderHook(() => useLogStats());

		await waitFor(() => expect(result.current.clockSkew).not.toBeNull());
		expect(result.current.clockSkew?.skewSeconds).toBe(300);
		expect(mockFind).toHaveBeenCalledWith({
			selector: {
				category: { $eq: 'wcpos.sync.engine' },
				level: { $eq: 'warn' },
			},
			sort: [{ timestamp: 'desc' }],
		});
	});
});

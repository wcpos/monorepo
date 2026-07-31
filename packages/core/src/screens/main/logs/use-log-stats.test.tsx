/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react';
import { of } from 'rxjs';

import { useLogStats } from './use-log-stats';

const mockCount = jest.fn();
const mockFind = jest.fn();
const mockLogsCollection = { count: mockCount, find: mockFind };

jest.mock('@wcpos/query', () => ({
	useQueryManager: () => ({
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

		await waitFor(() => expect(mockFind).toHaveBeenCalledTimes(1));
		expect(mockFind).toHaveBeenCalledWith({
			selector: {
				category: { $gte: 'wcpos.sync', $lt: 'wcpos.sync/' },
				operationType: { $eq: 'sync.record' },
			},
			sort: [{ timestamp: 'desc' }],
		});
	});
});

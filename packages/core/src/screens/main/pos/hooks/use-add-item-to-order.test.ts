/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { useAddItemToOrder } from './use-add-item-to-order';

const mockInsert = jest.fn();
const mockIncrementalUpdate = jest.fn();

jest.mock('uuid', () => ({
	v4: jest.fn(() => 'mock-uuid-v4'),
}));

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: jest.fn(() => ({
		error: jest.fn(),
	})),
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('../../../../hooks/use-local-date', () => ({
	convertLocalDateToUTCString: () => '2026-03-06T12:00:00',
}));

jest.mock('../../contexts/storage-health/provider', () => ({
	useStorageHealth: () => ({
		status: 'degraded',
		isDegraded: true,
	}),
}));

jest.mock('../../hooks/use-collection', () => ({
	useCollection: () => ({
		collection: {
			insert: mockInsert,
		},
	}),
}));

jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({
		currentOrder: {
			getLatest: () => ({
				isNew: false,
				incrementalUpdate: mockIncrementalUpdate,
			}),
		},
		setCurrentOrderID: jest.fn(),
	}),
}));

const mockError = (
	(getLogger as unknown as jest.Mock).mock.results[0].value as {
		error: jest.Mock;
	}
).error;

describe('useAddItemToOrder', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('throws immediately when storage health is degraded', async () => {
		const { result } = renderHook(() => useAddItemToOrder());

		await expect(
			result.current.addItemToOrder('line_items', {
				name: 'Test item',
				meta_data: [],
			} as any)
		).rejects.toThrow('storage unavailable');

		expect(mockInsert).not.toHaveBeenCalled();
		expect(mockIncrementalUpdate).not.toHaveBeenCalled();
		expect(mockError).toHaveBeenCalled();
	});
});

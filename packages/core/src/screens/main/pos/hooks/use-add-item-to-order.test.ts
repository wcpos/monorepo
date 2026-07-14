/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useAddItemToOrder } from './use-add-item-to-order';

const mockLocalPatch = jest.fn();
const mockSetCurrentOrderID = jest.fn();

const order: Record<string, unknown> & {
	getLatest(): typeof order;
	line_items: Record<string, unknown>[];
} = {
	uuid: 'order-uuid',
	id: 42,
	line_items: [],
	getLatest: () => order,
};

jest.mock('@wcpos/query', () => ({
	useQueryManager: () => ({}),
}));

jest.mock('uuid', () => ({
	v4: () => 'line-item-uuid',
}));

jest.mock('../../../../hooks/use-local-date', () => ({
	convertLocalDateToUTCString: () => '2026-07-14T00:00:00',
}));

jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	documentRecordId: (document: { uuid?: string }) => document.uuid ?? null,
	insertEngineResident: jest.fn(),
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));

jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({
		currentOrder: { getLatest: () => order },
		setCurrentOrderID: mockSetCurrentOrderID,
	}),
}));

describe('useAddItemToOrder', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		order.line_items = [];
	});

	it('keeps both items when two appends overlap for the same order', async () => {
		let releaseFirst!: () => void;
		const firstPatchMayFinish = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		let calls = 0;
		mockLocalPatch.mockImplementation(
			async ({ data }: { data: { line_items: Record<string, unknown>[] } }) => {
				calls += 1;
				if (calls === 1) await firstPatchMayFinish;
				order.line_items = data.line_items;
				return { changes: data, document: order };
			}
		);

		const { result } = renderHook(() => useAddItemToOrder());
		const first = { product_id: 1, meta_data: [] };
		const second = { product_id: 2, meta_data: [] };

		let firstAppend!: Promise<unknown>;
		let secondAppend!: Promise<unknown>;
		act(() => {
			firstAppend = result.current.addItemToOrder('line_items', first as never);
			secondAppend = result.current.addItemToOrder('line_items', second as never);
		});

		await Promise.resolve();
		expect(mockLocalPatch).toHaveBeenCalledTimes(1);
		releaseFirst();
		await act(async () => Promise.all([firstAppend, secondAppend]));

		expect(order.line_items.map((item) => item.product_id)).toEqual([1, 2]);
	});
});

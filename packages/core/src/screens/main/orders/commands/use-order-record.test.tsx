/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useOrderRecord } from './use-order-record';

/**
 * The real write chain (`localPatch` → `applyLocalPatch` → `patchAndEnqueueEngineResident`),
 * with only the engine faked: this device is bound to `device-register` and is till `device-till`.
 */
const mockWrite = jest.fn();
let mockStored: { payload: Record<string, unknown> };
const mockResident = {
	toJSON: () => mockStored,
	getLatest: () => mockResident,
	incrementalModify: async (modify: (old: typeof mockStored) => typeof mockStored) =>
		Object.assign(mockStored, modify(mockStored)),
};
const mockScope = {
	scopeId: 'scope-1',
	barcodeSelectors: { products: [], variations: [] },
	database: { collections: { orders: { findOne: () => ({ exec: async () => mockResident }) } } },
};
const mockManager = {
	engine: {
		active: () => mockScope,
		whenActive: async () => mockScope,
		ready: Promise.resolve(),
		write: mockWrite,
		status: () => ({ activeScopeId: 'scope-1' }),
	},
};

jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useQueryRuntime: () => mockManager,
}));
// The till and the bound register live in the register document the write path reads.
jest.mock('../../../../../../query/src/register-session/register-document', () => ({
	...jest.requireActual('../../../../../../query/src/register-session/register-document'),
	getRegisterId: () => 'device-till',
	getCurrentBoundRegisterId: () => 'device-register',
}));

const till = [
	{ id: 3, key: '_wcpos_register', value: 'sale-register' },
	{ id: 4, key: '_wcpos_till', value: 'sale-till' },
];
const identity = [
	{ id: 1, key: '_pos_user', value: '7' },
	{ id: 2, key: '_pos_store', value: '3' },
];
const order = {
	uuid: 'order-uuid',
	collection: { name: 'orders' },
	get payload() {
		return mockStored.payload;
	},
} as never;
const keys = (meta: unknown) => ((meta ?? []) as { key: string }[]).map((row) => row.key);
const enqueued = () => mockWrite.mock.lastCall![0].payload as Record<string, unknown>;

function seed(meta: unknown[]) {
	mockStored = { payload: { id: 50, status: 'completed', meta_data: meta } };
}

beforeEach(() => {
	mockWrite.mockReset().mockResolvedValue({ mutationId: 'm-1' });
});

describe('the Orders command never stamps this device on an order (Edit tab writes)', () => {
	it.each(['cashier', 'status'])(
		'a %s update on an order with no register or till rows adds none',
		async (write) => {
			seed([...identity]);
			const { result } = renderHook(() => useOrderRecord());
			const data =
				write === 'cashier'
					? { meta_data: [{ ...identity[0], value: '9' }, identity[1]] }
					: { status: 'on-hold' };
			await act(async () => {
				expect(await result.current.saveOrderFields(order, data as never)).toBe(true);
			});
			expect(mockWrite).toHaveBeenCalledTimes(1);
			for (const meta of [enqueued().meta_data, mockStored.payload.meta_data]) {
				expect(keys(meta)).not.toContain('_wcpos_register');
				expect(keys(meta)).not.toContain('_wcpos_till');
			}
		}
	);

	it('a cashier update keeps an order’s own register and till rows exactly as they were', async () => {
		seed([...identity, ...till]);
		const { result } = renderHook(() => useOrderRecord());
		await act(async () => {
			await result.current.saveOrderFields(order, {
				meta_data: [{ ...identity[0], value: '9' }, identity[1], ...till],
			} as never);
		});
		const meta = mockStored.payload.meta_data as unknown[];
		expect(meta).toEqual([{ ...identity[0], value: '9' }, identity[1], ...till]);
		expect(enqueued().meta_data).toEqual(meta);
	});

	it('a reopen still stamps this device’s register and till (ledger line 10)', async () => {
		seed([...identity]);
		const { result } = renderHook(() => useOrderRecord());
		await act(async () => {
			await result.current.reopenOrder(order, { status: 'pos-open', meta_data: [...identity] });
		});
		expect(enqueued().meta_data).toEqual(
			expect.arrayContaining([
				{ key: '_wcpos_register', value: 'device-register' },
				{ key: '_wcpos_till', value: 'device-till' },
			])
		);
		expect(mockWrite.mock.lastCall![0]).toEqual(expect.objectContaining({ explicit: true }));
	});
});

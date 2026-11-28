import type { EngineRecord } from '@wcpos/query';
import { pushRecord } from '@wcpos/query/mutations';

import { readCouponContext } from '../hooks/use-coupon-context';
import { getOrderSaveState } from './checkout-mode';
import { readStoreCreditFacts, STORE_CREDIT_ACK_BUDGET_MS } from './store-credit-facts';

jest.mock('@wcpos/query/mutations', () => ({ pushRecord: jest.fn() }));
jest.mock('../hooks/use-coupon-context', () => ({ readCouponContext: jest.fn() }));
jest.mock('./checkout-mode', () => ({ getOrderSaveState: jest.fn(() => null) }));

const ctx = {
	runtime: {} as Parameters<typeof readStoreCreditFacts>[0]['runtime'],
	storeCalculatedTypes: new Set(['smart_coupon']),
};
const line = { code: 'SC50', discount: '50.000000', discount_tax: '0.000000' };
const latest = {
	payload: { coupon_lines: [line] },
	sync: { revision: 'r1', adopted: { revision: 'r1', at: 2 } },
	local: { dirty: false, pendingMutationIds: [] },
};
const getLatest = jest.fn(() => latest);
const record = { uuid: 'order', getLatest } as unknown as EngineRecord<'orders'>;
const pass = { needsConnection: false, emptyCodes: [] };
const needsConnection = { needsConnection: true, emptyCodes: [] };
const declared = new Map<string, string>();
beforeEach(() => {
	jest.clearAllMocks();
	latest.payload.coupon_lines = [line];
	latest.local.dirty = false;
	declared.clear();
	declared.set('sc50', 'smart_coupon');
	jest.mocked(readCouponContext).mockResolvedValue({
		coupons: new Map(),
		productCategories: new Map(),
		unsupportedTypes: new Map(),
		storeCalculated: declared,
	});
});
afterEach(() => jest.useRealTimers());

it('F1 an empty type set skips the record and catalog reads', async () => {
	await expect(
		readStoreCreditFacts({ ...ctx, storeCalculatedTypes: new Set() }, record, true)
	).resolves.toBeNull();
	expect(getLatest).not.toHaveBeenCalled();
	expect(readCouponContext).not.toHaveBeenCalled();
	expect(pushRecord).not.toHaveBeenCalled();
});

it('F2 no declared line skips save state and push', async () => {
	latest.payload.coupon_lines = [{ ...line, code: 'ordinary' }];
	await expect(readStoreCreditFacts(ctx, record, false)).resolves.toBeNull();
	expect(getOrderSaveState).not.toHaveBeenCalled();
	expect(pushRecord).not.toHaveBeenCalled();
});

it('F3 unreachable needs a connection without pushing', async () => {
	await expect(readStoreCreditFacts(ctx, record, false)).resolves.toEqual(needsConnection);
	expect(pushRecord).not.toHaveBeenCalled();
});

it.each(['queued-offline', 'rejected'] as const)(
	'F4 %s needs a connection without pushing',
	async (kind) => {
		jest
			.mocked(getOrderSaveState)
			.mockReturnValueOnce({ kind } as ReturnType<typeof getOrderSaveState>);
		await expect(readStoreCreditFacts(ctx, record, true)).resolves.toEqual(needsConnection);
		expect(pushRecord).not.toHaveBeenCalled();
	}
);

it('F5 a fresh ack with credit passes without a push', async () => {
	await expect(readStoreCreditFacts(ctx, record, true)).resolves.toEqual(pass);
	expect(pushRecord).not.toHaveBeenCalled();
});

it('F6 a dirty order pushes once and passes on the fresh ack', async () => {
	latest.local.dirty = true;
	latest.payload.coupon_lines = [{ ...line, discount: '0' }];
	jest.mocked(pushRecord).mockImplementationOnce(async () => {
		latest.local.dirty = false;
		latest.payload.coupon_lines = [{ ...line, discount: '25.000000' }];
		return record;
	});
	await expect(readStoreCreditFacts(ctx, record, true)).resolves.toEqual(pass);
	expect(pushRecord).toHaveBeenCalledTimes(1);
	expect(pushRecord).toHaveBeenCalledWith(ctx.runtime, record);
});

it('F7 a rejected push needs a connection', async () => {
	latest.local.dirty = true;
	jest.mocked(pushRecord).mockRejectedValueOnce(new Error('offline'));
	await expect(readStoreCreditFacts(ctx, record, true)).resolves.toEqual(needsConnection);
});

it('F8 an unsettled push needs a connection after 5000 ms and can reject late', async () => {
	jest.useFakeTimers();
	latest.local.dirty = true;
	let rejectLate!: (error: Error) => void;
	jest.mocked(pushRecord).mockImplementationOnce(
		() =>
			new Promise((_, reject) => {
				rejectLate = reject;
			})
	);
	const result = readStoreCreditFacts(ctx, record, true);
	await jest.advanceTimersByTimeAsync(STORE_CREDIT_ACK_BUDGET_MS);
	await expect(result).resolves.toEqual(needsConnection);
	expect(() => rejectLate(new Error('late rejection'))).not.toThrow();
});

it('F9 a resolved push with a still-dirty resident needs a connection', async () => {
	latest.local.dirty = true;
	jest.mocked(pushRecord).mockResolvedValueOnce(record);
	await expect(readStoreCreditFacts(ctx, record, true)).resolves.toEqual(needsConnection);
	expect(pushRecord).toHaveBeenCalledTimes(1);
});

it('F10 saving pushes a fresh-looking resident and needs a connection after 5000 ms', async () => {
	jest.useFakeTimers();
	jest.mocked(getOrderSaveState).mockReturnValueOnce({ kind: 'saving' });
	jest.mocked(pushRecord).mockImplementationOnce(() => new Promise(() => {}));
	const result = readStoreCreditFacts(ctx, record, true);
	await jest.advanceTimersByTimeAsync(STORE_CREDIT_ACK_BUDGET_MS);
	await expect(result).resolves.toEqual(needsConnection);
	expect(pushRecord).toHaveBeenCalledTimes(1);
});

it('F11 only the declared line without credit is empty', async () => {
	declared.set('sc0', 'smart_coupon');
	latest.payload.coupon_lines = [line, { ...line, code: 'sc0', discount: '0.000000' }];
	await expect(readStoreCreditFacts(ctx, record, true)).resolves.toEqual({
		needsConnection: false,
		emptyCodes: ['sc0'],
	});
});

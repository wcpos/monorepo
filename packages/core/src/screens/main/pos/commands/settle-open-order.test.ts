import { getLogger } from '@wcpos/utils/logger';

import { settleOpenOrder, type SettleOpenOrderDeps } from './settle-open-order';
import { settlePayload } from './settle-payload';

import type { CurrentOrderRecord } from '../contexts/current-order/context';
import type { OrderMutationContext } from '../hooks/order-mutation-queue';
import type { OrderPayload } from './cart-config-for-order';

jest.mock('./settle-payload', () => ({ settlePayload: jest.fn() }));

const { createTestT } = jest.requireActual('../../../../../jest/translate');
const warning = { code: 'unknown_tax_rate_id', rateId: 42 } as const;
const document = { uuid: 'a', payload: { status: 'pos-open', total: '20' } } as CurrentOrderRecord;
const queue = {} as OrderMutationContext;
const coupons = { coupons: new Map(), productCategories: new Map(), categoryParents: new Map() };
let written: Record<string, unknown>[];
function harness(outcome: ReturnType<typeof settlePayload>) {
	jest.mocked(settlePayload).mockReturnValue(outcome);
	written = [];
	const deps: SettleOpenOrderDeps = {
		// The resolver write evaluates `changes` against the resident, as `writeOrderChanges` does.
		write: jest.fn(async (target, changes) => {
			const patch = changes(target.payload);
			if (Object.keys(patch).length) written.push(patch);
		}),
		configForOrder: jest.fn(() => ({ dp: 2 }) as never),
		serverOwnsMoney: jest.fn(() => false),
		commit: jest.fn(async () => ({ kind: 'closed' as const })),
		report: jest.fn(),
		t: createTestT(),
	};
	return deps;
}
const allowed = jest.fn((_payload: OrderPayload, _ignoreCheckout?: boolean) => true);
beforeEach(() => {
	allowed.mockReset().mockReturnValue(true);
	jest.mocked(getLogger(['test']).warn).mockClear();
});

it('writes the settled patch through the resolver, reports its warnings once, and commits nothing', async () => {
	const deps = harness({ kind: 'patch', changes: { total: '10' } as never, warnings: [warning] });
	await expect(settleOpenOrder(deps, 'a', document, allowed, coupons, queue)).resolves.toBe(
		undefined
	);
	expect(written).toEqual([{ total: '10' }]);
	expect(settlePayload).toHaveBeenCalledWith({
		payload: document.payload,
		config: { dp: 2 },
		coupons,
		owner: { uuid: 'a', serverOwnsMoney: deps.serverOwnsMoney },
	});
	expect(deps.commit).not.toHaveBeenCalled();
	expect(deps.report).toHaveBeenCalledTimes(1);
	expect(deps.report).toHaveBeenCalledWith([warning], {
		orderId: 'a',
		site: 'settlement-coordinator',
	});
});

it.each(['owned', 'disallowed'] as const)('writes nothing for an %s order', async (kind) => {
	const deps = harness(
		kind === 'owned'
			? { kind: 'owned' }
			: { kind: 'patch', changes: { total: '10' } as never, warnings: [] }
	);
	if (kind === 'disallowed') allowed.mockReturnValue(false);
	await settleOpenOrder(deps, 'a', document, allowed, undefined, queue);
	expect(written).toEqual([]);
	expect(deps.commit).not.toHaveBeenCalled();
	expect(deps.report).toHaveBeenCalledWith([], { orderId: 'a', site: 'settlement-coordinator' });
});

it('hands a boundary to the system commit with the same write, coupons and allowed', async () => {
	const deps = harness({
		kind: 'boundary',
		changes: { total: '4' },
		netPaid: 4,
		warnings: [],
	} as never);
	jest.mocked(deps.commit).mockResolvedValueOnce({ kind: 'offline' });
	await expect(settleOpenOrder(deps, 'a', document, allowed, coupons, queue)).resolves.toEqual({
		kind: 'offline',
	});
	// The boundary's money is the commit's to write; the settlement write carries nothing.
	expect(written).toEqual([]);
	expect(deps.commit).toHaveBeenCalledWith({
		order: document,
		queue,
		write: expect.any(Function),
		coupons,
		allowed,
	});
	const [{ write }] = jest.mocked(deps.commit).mock.lastCall!;
	await write(() => ({ status: 'completed' }));
	expect(deps.write).toHaveBeenLastCalledWith(document, expect.any(Function));
	expect(written).toEqual([{ status: 'completed' }]);
});

it.each([
	['missing_coupon', 'Coupon not found'],
	['invalid_coupon', 'pos_cart.coupon_apply_failed'],
])('toasts a %s failure in the translated words and reports its warnings', async (code, title) => {
	const t = createTestT();
	const deps = harness({ kind: 'error', error: { code } as never, warnings: [warning] });
	deps.t = t;
	await settleOpenOrder(deps, 'a', document, allowed, coupons, queue);
	expect(written).toEqual([]);
	expect(deps.report).toHaveBeenCalledWith([warning], expect.anything());
	expect(getLogger(['test']).warn).toHaveBeenCalledWith('Cart settlement failed', {
		showToast: true,
		toast: { title: title === 'Coupon not found' ? title : t(title) },
		context: { code },
	});
});

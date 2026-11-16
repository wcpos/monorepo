/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';
import { Subject } from 'rxjs';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import type { OrderPaymentSummary } from '@wcpos/order-math';
import type { ReadonlyEngineRecord } from '@wcpos/query';

import { config } from '../../../../../jest/cart-write';
import { createActionContext } from '../../../../extensions/actions';
import { completeSale, type SaleContext } from '../checkout/sale-completion';
import { enqueueOrderMutation } from '../hooks/order-mutation-queue';
import { commitAtBoundary } from './boundary-commit';
import { useBoundaryCommit } from './use-boundary-commit';

import type { CloseOutcome } from './close-sale';
import type { CartWriteCoupons } from './settle-cart-write';
import type { BoundaryCommitter } from './use-boundary-committer';
import type { PayloadChanges } from '../../hooks/mutations/use-local-mutation';
import type { CurrentOrderRecord } from '../contexts/current-order';
import type { OrderMutationContext } from '../hooks/order-mutation-queue';

const mockCommit = jest.fn<ReturnType<BoundaryCommitter>, Parameters<BoundaryCommitter>>(
	async () => ({ kind: 'closed' })
);
jest.mock('./use-boundary-committer', () => ({ useBoundaryCommitter: () => mockCommit }));
// The real boundary commit (T9) runs against the same guards boundary-commit.test.ts mocks.
jest.mock('@wcpos/query/register-session', () => ({
	...jest.requireActual('@wcpos/query/register-session'),
	requireOpenSession: async () => 'session',
	findOpenSession: jest.fn(async () => ({
		getLatest: () => ({ id: 'session', register_id: 'register', status: 'open', deleted: false }),
	})),
	readRegister: async () => ({ sites: { site: { register_id: 'register' } } }),
	nextSaleCounter: jest.fn(async () => 7),
}));
jest.mock('../checkout/hooks/reconcile-completed-order', () => ({
	reconcileCompletedOrder: jest.fn(async () => {}),
	refreshOrderRecord: jest.fn(async () => 'refreshed'),
}));
jest.mock('../checkout/provenance/provenance-gap', () => ({ reportProvenanceGap: jest.fn() }));
addRxPlugin(RxDBLocalDocumentsPlugin);

const percent = { code: 'ten', discount_type: 'percent' as const, amount: '10' };
const context = { coupons: new Map([['ten', percent]]), productCategories: new Map() };
const missing = { deny: { reasonKey: 'caller_missing' } };
const queue = {} as OrderMutationContext;
const recordOf = (payload: Record<string, unknown>) =>
	({
		uuid: 'boundary',
		payload,
		getLatest() {
			return this;
		},
	}) as unknown as CurrentOrderRecord;
const cart = (coupon_lines: { code: string }[] = [{ code: 'ten' }]) =>
	recordOf({ line_items: [{ product_id: 1, subtotal: '10', total: '10' }], coupon_lines });
const writes: object[] = [];
const localPatch = jest.fn(
	async ({ document, changes }: { document: CurrentOrderRecord; changes: PayloadChanges }) => {
		const written = changes(document.payload as never);
		writes.push(written);
		Object.assign(document.payload, written);
		return document;
	}
);
const committed = () => mockCommit.mock.calls[0][0];
const hook = () => renderHook(() => useBoundaryCommit(localPatch as never)).result.current;
beforeEach(() => {
	jest.clearAllMocks();
	writes.length = 0;
});

it.each([
	['the write supplies', jest.fn()],
	['the context keeps', undefined],
])(
	'commits a priced coupon cart with the context its write settled (%s taxStatusFor)',
	async (_, taxStatusFor) => {
		const own = jest.fn();
		const order = cart();
		await hook()(order, queue, {
			context: { ...context, taxStatusFor: own },
			taxStatusFor,
			missing,
		});
		const { coupons, allowed } = committed();
		expect(coupons).toEqual({ ...context, taxStatusFor: taxStatusFor ?? own });
		expect(coupons?.coupons).toBe(context.coupons);
		expect(allowed?.(order.getLatest().payload)).toBe(true);
	}
);

it('leaves a coupon that arrives during the guards to the continuation', async () => {
	const order = cart();
	await hook()(order, queue, { context, missing });
	order.payload.coupon_lines = [...order.payload.coupon_lines!, { code: 'five' }];
	expect(committed().allowed?.(order.getLatest().payload)).toBe(false);
});

it('without coupons, refuses a coupon cart and allows a cart without coupons', async () => {
	await hook()(cart(), queue);
	const { coupons, allowed } = committed();
	expect(coupons).toBeUndefined();
	expect(allowed?.(cart().payload)).toBe(false);
	expect(allowed?.(cart([]).payload)).toBe(true);
	expect(allowed?.(recordOf({ line_items: [] }).payload)).toBe(true);
});

it('settles the total and coupon discount when a coupon takes a part-paid order to its paid balance', async () => {
	const storeDB = await createRxDatabase({
		name: `boundary${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		localDocuments: true,
		multiInstance: false,
	});
	const catalog = new Subject();
	const ctx = {
		actionCtx: createActionContext({
			log: jest.fn(),
			t: (key) => key,
			readCatalog: async () => null,
			readPaymentMethod: () => null,
			preventOverselling: false,
			priceDecimals: 2,
			resolveSession: async () => ({ registerId: 'register', sessionId: 'session' }),
		}),
		actionActor: { userId: 7, registerId: 'register', sessionId: null },
		storeDB,
		runtime: {
			engine: {
				ready: Promise.resolve(),
				active: () => ({ database: { collections: { products: { $: catalog } } } }),
				db$: () => () => {},
			},
		},
		userDB: {},
		siteUuid: 'site',
		storeId: 1,
		dp: 2,
		sessionsOn: true,
	} as unknown as SaleContext;
	const close = jest.fn(async (target: ReadonlyEngineRecord<'orders'>): Promise<CloseOutcome> => {
		Object.assign(target.getLatest().payload, { status: 'completed' });
		return {
			kind: 'answered',
			order: { status: 'completed' } as OrderPaymentSummary,
			notMirrored: null,
		};
	});
	mockCommit.mockImplementationOnce((input) =>
		commitAtBoundary(
			{
				...ctx,
				configForOrder: () => config,
				serverOwnsMoney: () => false,
				bindingStatus: 'bound',
				closeSale: { online: () => true, close } as never,
				complete: (target, outcome, slot) =>
					completeSale(ctx, target, outcome, { host: 'background' }, slot),
			},
			input
		)
	);
	// The cart write landed the coupon line; the stale total waits for this commit.
	const order = recordOf({
		status: 'pos-partial',
		total: '10',
		line_items: [{ product_id: 1, subtotal: '10', total: '10' }],
		coupon_lines: [{ code: 'ten' }],
		meta_data: [
			{
				key: '_wcpos_payments',
				value: {
					schema: 1,
					payments: [{ id: 'leg', status: 'captured', amount: '9', refunded_amount: '0' }],
				},
			},
		],
	});
	const coupons: CartWriteCoupons = { context, missing };
	try {
		const outcome = await enqueueOrderMutation(order.uuid, (slot) => hook()(order, slot, coupons));
		expect(outcome).toEqual({ kind: 'closed' });
		// 10 less 10% = 9, exactly the 9 captured.
		expect(writes).toEqual([
			expect.objectContaining({
				total: '9',
				discount_total: '1',
				coupon_lines: [expect.objectContaining({ code: 'ten', discount: '1' })],
			}),
		]);
		expect(order.payload.status).toBe('completed');
		expect(close).toHaveBeenCalledTimes(1);
	} finally {
		await storeDB.remove();
	}
});

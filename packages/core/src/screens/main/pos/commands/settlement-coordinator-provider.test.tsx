/** @jest-environment jsdom */
import * as React from 'react';

import { act, render, renderHook } from '@testing-library/react';
import { BehaviorSubject, Subject } from 'rxjs';

import { getLogger } from '@wcpos/utils/logger';
import * as orderMath from '@wcpos/order-math';
import { createCartConfig } from '@wcpos/order-math';

import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { useBoundaryCommit } from './use-boundary-commit';
import { enqueueOrderMutation } from '../hooks/order-mutation-queue';
import { row } from '../checkout/payments/device/fixtures.test-utils';
import { settleCartWrite } from './settle-cart-write';
import { commitAtBoundary } from './boundary-commit';
import { completeSale } from '../checkout/sale-completion';
import { config } from '../../../../../jest/cart-write';
import { SettlementCoordinatorProvider } from './settlement-coordinator-provider';
import { quickDiscountCouponInput } from '../hooks/quick-discount';

import type { CurrentOrderRecord } from '../contexts/current-order/context';
import type { OrderPayload } from './cart-config-for-order';

jest.mock('@wcpos/order-math', () => ({
	...jest.requireActual('@wcpos/order-math'),
	settleCart: jest.fn(jest.requireActual('@wcpos/order-math').settleCart),
}));

const events = new Subject<{ type: string; collection?: string }>();
const coverage = new BehaviorSubject({ complete: true });
const statuses = new BehaviorSubject({ collections: { taxRates: { coverageGeneration: 0 } } });
const orders = new BehaviorSubject({ ready: true, hits: [] as { record: any }[] });
const handle = { observe: () => orders };
const subscribe = (source: Subject<any>) => (fn: any) => {
	const sub = source.subscribe(fn);
	return () => sub.unsubscribe();
};
const engine = {
	events: subscribe(events),
	active: () => ({ database: databases.value }),
	db$: (fn: any) => subscribe(databases)(fn),
	ready: Promise.resolve(),
	status: () => statuses.value,
	statusChanges: subscribe(statuses),
};
const manager = { engine };
const stockChanges = { products: new Subject(), variations: new Subject() };
const databases = new BehaviorSubject({
	collections: {
		products: { $: stockChanges.products },
		variations: { $: stockChanges.variations },
	},
});
const writes: Record<string, unknown>[] = [];
const sessionChanges = new Subject();
let sessionOpen = true;
const saleContext = { storeDB: {} };
jest.mock('@wcpos/query/register-session', () => ({
	...jest.requireActual('@wcpos/query/register-session'),
	observeOpenSessionPresence: () => sessionChanges,
}));
jest.mock('../checkout/hooks/use-sale-context', () => ({ useSaleContext: () => saleContext }));
// Stable, like the hook's memoised value: the coordinator's effect keys on it.
const mockCloseSale = { close: jest.fn(), online: () => true };
jest.mock('./close-sale', () => ({ useCloseSale: () => mockCloseSale }));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('./boundary-commit', () => ({
	commitAtBoundary: jest.fn(async (_ctx, { result, write }) => {
		if (!sessionOpen) return { deny: { reasonKey: 'pos_checkout.open_register_first' } };
		const patch = { ...orderMath.settlementPatch(result), status: 'completed' };
		await write(() => patch);
	}),
}));
const mockComplete = jest.fn();
jest.mock('../checkout/hooks/use-complete-order-flow', () => ({
	useCompleteOrderFlowForOrder: () => mockComplete,
}));
jest.mock('../checkout/sale-completion', () => ({
	...jest.requireActual('../checkout/sale-completion'),
	completeSale: jest.fn(async () => 'completed'),
}));
const report = jest.fn();
let currentConfig = config;
const readConfig = () => currentConfig;
const beforeResolve = jest.fn<Promise<void>, []>(async () => {});
const { createTestT } = jest.requireActual('../../../../../jest/translate');
const t = createTestT();
jest.mock('../../../../contexts/translations', () => ({ useT: () => t }));
const ownsMoney = jest.fn<boolean, [string]>(() => false);
let mockInputs = {
	settings: { priceNumDecimals: 2 },
	rates: [] as { id: number; rate: string }[],
	baseLocation: {},
};
jest.mock('@wcpos/query', () => ({
	OPEN_ORDER_STATUSES: jest.requireActual('@wcpos/query').OPEN_ORDER_STATUSES,
	readCoverageGeneration: jest.requireActual('@wcpos/query').readCoverageGeneration,
	useQueryRuntime: () => manager,
	observeCatalogChanges: jest.requireActual('@wcpos/query').observeCatalogChanges,
	observeCoverage: () => coverage,
	useDocField: (doc: any, read: any) => read(doc),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ wpCredentials: { id: 7 }, store: { id: 8 } }),
}));
jest.mock('../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: jest.fn(() => ({ registerId: 'register', status: 'bound' })),
}));
jest.mock('../contexts/current-order/use-open-orders-handle', () => ({
	useOpenOrdersHandle: (...args: unknown[]) => {
		expect(args).toEqual([7, 8, 'register']);
		return handle;
	},
}));
jest.mock('../hooks/use-cart-config', () => ({
	useCartConfigInputs: () => mockInputs,
	useCartConfigReader: () => readConfig,
}));
jest.mock('../contexts/order-money-divergence', () => ({
	useServerOwnsMoneyReader: () => ownsMoney,
}));
jest.mock('../contexts/order-engine-warnings', () => ({ useReportEngineWarnings: () => report }));
jest.mock('./write-order-changes', () => ({
	// The verb's 'orders' is proven through the real verb: "durable divergence ownership" in use-local-mutation.test.ts.
	writeOrderChanges: async (_manager: unknown, input: any) => {
		input.changes(input.document.payload);
		await beforeResolve();
		const changes = input.changes(input.document.payload);
		if (Object.keys(changes).length) {
			writes.push(changes);
			Object.assign(input.document.payload, changes);
		}
		return { changes, document: input.document };
	},
}));
const record = (payload: OrderPayload = {}) => ({
	uuid: 'a',
	payload: {
		status: 'pos-open',
		total: '20',
		line_items: [{ total: '10', subtotal: '10' }],
		...payload,
	},
	getLatest() {
		return this;
	},
});
const flush = async () => {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
};
beforeEach(() => {
	currentConfig = config;
	sessionOpen = true;
	ownsMoney.mockReset().mockReturnValue(false);
	beforeResolve.mockReset().mockResolvedValue(undefined);
	writes.length = 0;
	jest.clearAllMocks();
	coverage.next({ complete: true });
	orders.next({ ready: true, hits: [{ record: record() }] });
});

it('binds, rebinds on scope/reset, waits for rates, reports once and tears down', async () => {
	const view = render(<SettlementCoordinatorProvider />);
	await flush();
	expect(writes).toHaveLength(1);
	expect(writes[0].total).toBe('10');
	expect(report).toHaveBeenCalledTimes(1);
	act(() => {
		events.next({ type: 'scope-switched' });
		statuses.next({ collections: { taxRates: { coverageGeneration: 1 } } });
		orders.next({ ready: true, hits: [{ record: record() }] });
	});
	await flush();
	expect(writes).toHaveLength(2);
	act(() => {
		events.next({ type: 'collection-reset', collection: 'taxRates' });
		coverage.next({ complete: false });
		orders.next({ ready: true, hits: [{ record: record() }] });
	});
	await flush();
	expect(writes).toHaveLength(2);
	act(() => {
		statuses.next({ collections: { taxRates: { coverageGeneration: 2 } } });
		coverage.next({ complete: true });
	});
	await flush();
	expect(writes).toHaveLength(3);
	view.unmount();
	expect(events.observed).toBe(false);
	expect(coverage.observed).toBe(false);
	expect(statuses.observed).toBe(false);
	expect(orders.observed).toBe(false);
});

it.each(['0.30', '0.40'])('commits a partial order crossing net paid %s', async (amount) => {
	// prettier-ignore
	const meta_data = [{ key: '_wcpos_payments', value: { schema: 1, payments: [
			{ id: 'leg', status: 'captured', amount, refunded_amount: '0.10' },
		] } }];
	orders.next({
		ready: true,
		hits: [
			{ record: record({ status: 'pos-partial', meta_data, line_items: [{ total: '0.20' }] }) },
		],
	});
	const view = render(<SettlementCoordinatorProvider />);
	await flush();
	expect(writes).toEqual([expect.objectContaining({ status: 'completed', total: '0.2' })]);
	expect(commitAtBoundary).toHaveBeenCalledTimes(1);
	view.unmount();
});

const references = new BehaviorSubject({ ready: false, generation: '0:0' });
const context = {
	coupons: new Map([['summer', { code: 'summer', discount_type: 'percent', amount: '10' }]]),
	productCategories: new Map(),
	categoryParents: new Map(),
};
jest.mock('./coupon-continuation', () => ({
	...jest.requireActual('./coupon-continuation'),
	couponReferences: () => references,
}));
jest.mock('../hooks/use-coupon-context', () => ({ readCouponContext: async () => context }));

it.each(['valid', 'missing', 'boundary'])(
	'#963 replays a %s coupon only after references, once, with a translated failure toast',
	async (kind) => {
		references.next({ ready: false, generation: '0:0' });
		const coupon = { code: 'summer', discount_type: 'percent', amount: '10' };
		context.coupons = new Map(kind === 'missing' ? [] : [['summer', coupon]]);
		// prettier-ignore
		const a = record({
			line_items: [{ product_id: 1, quantity: 1, total: '10', subtotal: '10' }],
			coupon_lines: [{ code: 'summer' }],
			...(kind === 'boundary' ? { status: 'pos-partial', meta_data: [{ key: '_wcpos_payments', value: {
				schema: 1, payments: [{ id: 'leg', status: 'captured', amount: '9', refunded_amount: '0' }],
			} }] } : {}),
		});
		orders.next({ ready: true, hits: [{ record: a }] });
		const view = render(<SettlementCoordinatorProvider />);
		await flush();
		expect(references.observed).toBe(true);
		expect(writes).toHaveLength(0);
		act(() => references.next({ ready: true, generation: '0:0' }));
		await flush();
		expect(writes).toHaveLength(kind !== 'missing' ? 1 : 0);
		if (kind === 'valid')
			expect(writes[0]).toEqual(expect.objectContaining({ total: '9', discount_total: '1' }));
		if (kind === 'boundary') expect(commitAtBoundary).toHaveBeenCalledTimes(1);
		if (kind === 'missing')
			expect(getLogger(['test']).warn).toHaveBeenCalledWith(
				'Cart settlement failed',
				expect.objectContaining({
					showToast: true,
					toast: { title: 'Coupon not found' },
					context: expect.objectContaining({ code: 'missing_coupon' }),
				})
			);
		expect(report).toHaveBeenCalledTimes(1);
		act(() => orders.next({ ready: true, hits: [{ record: a }] }));
		await flush();
		expect(writes).toHaveLength(kind !== 'missing' ? 1 : 0);
		expect(getLogger(['test']).warn).toHaveBeenCalledTimes(kind === 'missing' ? 1 : 0);
		view.unmount();
		expect(references.observed).toBe(false);
	}
);

it('#952 replays a quick discount after a line edit without demanding catalog references', async () => {
	const intent = { discount_type: 'percent' as const, amount: '10' };
	const code = 'pos-discount';
	context.coupons = new Map([[code, quickDiscountCouponInput(code, intent)]]);
	references.next({ ready: false, generation: '0:0' });
	// The first line already has 10% off; the newly added line has not been redistributed yet.
	const a = record({
		total: '190',
		line_items: [
			{ product_id: 1, quantity: 1, subtotal: '100', total: '90' },
			{ product_id: 2, quantity: 1, subtotal: '100', total: '100' },
		],
		coupon_lines: [{ code, meta_data: [{ key: '_wcpos_quick_discount', value: intent }] }],
	});
	orders.next({ ready: true, hits: [{ record: a }] });
	const view = render(<SettlementCoordinatorProvider />);
	try {
		await flush();
		expect(references.observed).toBe(false);
		expect(writes).toHaveLength(1);
		expect(writes[0]).toMatchObject({
			total: '180',
			discount_total: '20',
			line_items: [{ total: '90' }, { total: '90' }],
		});
	} finally {
		view.unmount();
	}
});

it('#1472 bind settles stale money; a subsequent bind with correct totals writes nothing', async () => {
	const a = record();
	orders.next({ ready: true, hits: [{ record: a }] });
	const first = render(<SettlementCoordinatorProvider />);
	await flush();
	expect(writes).toHaveLength(1);
	expect(a.payload.total).toBe('10');
	first.unmount();
	writes.length = 0;
	const second = render(<SettlementCoordinatorProvider />);
	await flush();
	expect(writes).toEqual([]);
	second.unmount();
});

it('#1472 tax rates change persisted shipping money without changing a product line', async () => {
	const rates = [{ id: 1, rate: '10', class: 'standard', shipping: true, priority: 1 }];
	currentConfig = createCartConfig({ ...config, calcTaxes: true, rates, allRates: rates });
	const a = record({ shipping_lines: [{ method_id: 'flat_rate', total: '10' }] });
	orders.next({ ready: true, hits: [{ record: a }] });
	const view = render(<SettlementCoordinatorProvider />);
	await flush();
	expect(a.payload.total).toBe('21');
	const changedRates = [{ ...rates[0], rate: '20' }];
	currentConfig = createCartConfig({
		...config,
		calcTaxes: true,
		rates: changedRates,
		allRates: changedRates,
	});
	mockInputs = { ...mockInputs, rates: changedRates };
	view.rerender(<SettlementCoordinatorProvider />);
	await flush();
	expect(writes).toHaveLength(2);
	expect(a.payload.total).toBe('22');
	expect(a.payload.line_items).toEqual([{ total: '10', subtotal: '10' }]);
	view.unmount();
});

it('#1472 serializes emissions so the newest money lands last', async () => {
	const a = record();
	orders.next({ ready: true, hits: [{ record: a }] });
	let release!: () => void;
	beforeResolve.mockImplementationOnce(
		() =>
			new Promise<void>((resolve) => {
				release = resolve;
			})
	);
	const view = render(<SettlementCoordinatorProvider />);
	await flush();
	await act(async () => {
		a.payload.line_items = [{ total: '30', subtotal: '30' }];
		orders.next({ ready: true, hits: [{ record: a }] });
	});
	release();
	await flush();
	expect(a.payload.total).toBe('30');
	expect(writes.map((patch) => patch.total)).toEqual(['30']);
	view.unmount();
});

it('#1472 a queued settlement cannot overwrite a command or rewrite its settled aggregate', async () => {
	const a = record();
	let release!: () => void;
	const command = enqueueOrderMutation('a', async () => {
		await new Promise<void>((resolve) => {
			release = resolve;
		});
		settleCartWrite(
			{
				document: a as CurrentOrderRecord,
				data: { line_items: [{ total: '30', subtotal: '30' }] },
			},
			{
				configForOrder: readConfig,
				serverOwnsMoney: () => false,
				localPatch: ({ changes }) => Object.assign(a.payload, changes(a.payload)),
			}
		);
	});
	orders.next({ ready: true, hits: [{ record: a }] });
	const view = render(<SettlementCoordinatorProvider />);
	await flush();
	release();
	await command;
	await flush();
	expect(a.payload.total).toBe('30');
	expect(writes).toEqual([]);
	view.unmount();
});

it('#1472 persists recomputed percentage fees in the single settlement write', async () => {
	const a = record({
		fee_lines: [
			{
				name: 'Service',
				total: '0',
				meta_data: [
					{
						key: '_woocommerce_pos_data',
						value: JSON.stringify({ amount: '10', percent: true, prices_include_tax: false }),
					},
				],
			},
		],
	});
	orders.next({ ready: true, hits: [{ record: a }] });
	const view = render(<SettlementCoordinatorProvider />);
	await flush();
	expect(writes).toHaveLength(1);
	expect(writes[0]).toMatchObject({ total: '11', fee_lines: [{ total: '1' }] });
	view.unmount();
});

it.each(['aggregate', 'failed coupon'] as const)(
	'#1560 reports warnings on a %s pass even without a write',
	async (kind) => {
		currentConfig = createCartConfig({ ...config, calcTaxes: true });
		context.coupons = new Map();
		references.next({ ready: true, generation: '0:0' });
		// The engine result contract carries warnings on failure too, even though today's
		// missing-coupon gate returns before collecting them. Pin the reporting boundary.
		const failed =
			kind === 'failed coupon'
				? jest.mocked(orderMath.settleCart).mockReturnValue({
						ok: false,
						error: { code: 'missing_coupon', missingCodes: ['missing'] },
						warnings: [{ code: 'unknown_tax_rate_id', rateId: 42 }],
					})
				: undefined;
		const a = record({
			line_items: [
				{
					product_id: 1,
					quantity: 1,
					subtotal: '10',
					total: '10',
					subtotal_tax: '1',
					total_tax: '1',
					taxes: [{ id: 42, subtotal: '1', total: '1' }],
				},
			],
			...(kind === 'failed coupon' ? { coupon_lines: [{ code: 'missing' }] } : {}),
		});
		orders.next({ ready: true, hits: [{ record: a }] });
		const first = render(<SettlementCoordinatorProvider />);
		await flush();
		first.unmount();
		writes.length = 0;
		report.mockClear();
		const view = render(<SettlementCoordinatorProvider />);
		await flush();
		expect(writes).toEqual([]);
		expect(report).toHaveBeenCalledTimes(1);
		expect(report).toHaveBeenCalledWith(
			expect.arrayContaining([{ code: 'unknown_tax_rate_id', rateId: 42 }]),
			{ orderId: 'a', site: 'settlement-coordinator' }
		);
		view.unmount();
		failed?.mockImplementation(jest.requireActual('@wcpos/order-math').settleCart);
	}
);

it('#1560 only reports authoritative warnings after the resolver preflight', async () => {
	currentConfig = createCartConfig({ ...config, calcTaxes: true });
	const a = record({
		line_items: [{ subtotal: '10', total: '10', total_tax: '1', taxes: [{ id: 41, total: '1' }] }],
	});
	orders.next({ ready: true, hits: [{ record: a }] });
	// writeOrderChanges may evaluate a resolver before the authoritative resident write.
	beforeResolve.mockImplementationOnce(async () => {
		expect(report).not.toHaveBeenCalled();
		a.payload.line_items = [
			{ subtotal: '10', total: '10', total_tax: '1', taxes: [{ id: 42, total: '1' }] },
		];
	});
	const view = render(<SettlementCoordinatorProvider />);
	await flush();
	expect(report).toHaveBeenCalledTimes(1);
	expect(report).toHaveBeenCalledWith([{ code: 'unknown_tax_rate_id', rateId: 42 }], {
		orderId: 'a',
		site: 'settlement-coordinator',
	});
	view.unmount();
});

it.each(['divergence', 'command', 'replay-owner', 'replay-edit'] as const)(
	'#1472/#963 rechecks %s at the authoritative resident write',
	async (scenario) => {
		const replay = scenario.startsWith('replay');
		context.coupons = new Map([
			['summer', { code: 'summer', discount_type: 'percent', amount: '10' }],
		]);
		references.next({ ready: true, generation: '0:0' });
		const a = record({
			line_items: [{ product_id: 1, quantity: 1, subtotal: '10', total: '10' }],
			...(replay ? { coupon_lines: [{ code: 'summer' }] } : {}),
		});
		orders.next({ ready: true, hits: [{ record: a }] });
		let release!: () => void;
		beforeResolve.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				})
		);
		const view = render(<SettlementCoordinatorProvider />);
		await flush();
		if (scenario === 'divergence') ownsMoney.mockReturnValue(true);
		else if (scenario === 'replay-owner')
			a.payload.meta_data = [{ key: '_wcpos_money_owner_hint', value: 'server' }];
		else {
			a.payload.line_items = [{ product_id: 1, quantity: 1, subtotal: '30', total: '30' }];
			a.payload.total = '30';
		}
		release();
		await flush();
		if (scenario === 'command') expect(writes[0]).toMatchObject({ total: '30' });
		else expect(writes).toEqual([]);
		view.unmount();
	}
);

it('retries a deferred boundary when a session opens, then excludes the completed order', async () => {
	sessionOpen = false;
	const a = record({
		status: 'pos-partial',
		line_items: [{ total: '4' }],
		meta_data: [
			{
				key: '_wcpos_payments',
				value: {
					schema: 1,
					payments: [{ id: 'leg', status: 'captured', amount: '4', refunded_amount: '0' }],
				},
			},
		],
	});
	orders.next({ ready: true, hits: [{ record: a }] });
	const view = render(<SettlementCoordinatorProvider />);
	await flush();
	expect(commitAtBoundary).toHaveBeenCalledTimes(1);
	expect(writes).toEqual([]);
	act(() => {
		sessionOpen = true;
		sessionChanges.next({});
	});
	await flush();
	expect(a.payload.status).toBe('completed');
	expect(commitAtBoundary).toHaveBeenCalledTimes(2);
	act(() => {
		sessionChanges.next({});
		orders.next({ ready: true, hits: [{ record: a }] });
	});
	await flush();
	expect(commitAtBoundary).toHaveBeenCalledTimes(2);
	view.unmount();
	expect(sessionChanges.observed).toBe(false);
});

it('leaves a coupon edit to the continuation and completes once at the redistributed $5', async () => {
	context.coupons = new Map([
		['summer', { code: 'summer', discount_type: 'fixed_cart', amount: '5' }],
	]);
	references.next({ ready: true, generation: '0:0' });
	const a = record({
		status: 'pos-partial',
		total: '15',
		line_items: [1, 2].map((product_id) => ({
			product_id,
			quantity: 1,
			subtotal: '10',
			total: '7.5',
		})),
		coupon_lines: [{ code: 'summer' }],
		meta_data: [
			{
				key: '_wcpos_payments',
				value: {
					schema: 1,
					payments: [{ id: 'leg', status: 'captured', amount: '8', refunded_amount: '0' }],
				},
			},
		],
	});
	const intent = { line_items: a.payload.line_items!.slice(0, 1) };
	const commandCommit = jest.fn();
	await enqueueOrderMutation(a.uuid, (queue) =>
		settleCartWrite(
			{ document: a as CurrentOrderRecord, data: intent, queue },
			{
				configForOrder: readConfig,
				serverOwnsMoney: () => false,
				commitAtBoundary: commandCommit,
				localPatch: async ({ changes }) => {
					const patch = changes(a.payload);
					expect(patch).toEqual(intent);
					Object.assign(a.payload, patch);
					return a;
				},
			}
		)
	);
	expect(commandCommit).not.toHaveBeenCalled();
	expect(a.payload.total).toBe('15');
	orders.next({ ready: true, hits: [{ record: a }] });
	const view = render(<SettlementCoordinatorProvider />);
	await flush();
	expect(a.payload).toMatchObject({ status: 'completed', total: '5' });
	act(() => orders.next({ ready: true, hits: [{ record: a }] }));
	await flush();
	expect(commitAtBoundary).toHaveBeenCalledTimes(1);
	expect(writes).toHaveLength(1);
	view.unmount();
});

it('marks coordinator boundary work as system rather than cashier initiated', async () => {
	const a = record({
		status: 'pos-partial',
		line_items: [{ total: '4' }],
		meta_data: [
			{
				key: '_wcpos_payments',
				value: { schema: 1, payments: [{ id: 'leg', status: 'captured', amount: '4' }] },
			},
		],
	});
	orders.next({ ready: true, hits: [{ record: a }] });
	const view = render(<SettlementCoordinatorProvider />);
	await flush();
	expect(commitAtBoundary).toHaveBeenCalledWith(
		expect.objectContaining({ source: 'system' }),
		expect.anything()
	);
	view.unmount();
});

it.each([
	['products', 'pos_cart.only_n_available', false],
	['variations', 'pos_products.out_of_stock', true],
	['products', 'pos_checkout.order_changed_retry', false],
] as const)(
	'reconsiders %s stock refusals (%s), but not closed orders',
	async (collection, reasonKey, coupon) => {
		context.coupons = new Map([
			['summer', { code: 'summer', discount_type: 'percent', amount: '10' }],
		]);
		references.next({ ready: true, generation: '0:0' });
		const a = record({
			status: 'pos-partial',
			line_items: [{ product_id: 1, quantity: 1, subtotal: '4', total: '4' }],
			coupon_lines: coupon ? [{ code: 'summer' }] : [],
			meta_data: [
				{
					key: '_wcpos_payments',
					value: {
						schema: 1,
						payments: [{ id: 'leg', status: 'captured', amount: '4' }],
					},
				},
			],
		});
		jest.mocked(commitAtBoundary).mockResolvedValueOnce({ deny: { reasonKey } });
		orders.next({ ready: true, hits: [{ record: a }] });
		const view = render(<SettlementCoordinatorProvider />);
		try {
			await flush();
			expect(writes).toEqual([]);
			expect(commitAtBoundary).toHaveBeenCalledTimes(1);
			// The catalog now has enough stock; no order/config/session emission accompanies it.
			act(() => stockChanges[collection].next({}));
			await flush();
			const closed = reasonKey === 'pos_checkout.order_changed_retry';
			expect(a.payload.status).toBe(closed ? 'pos-partial' : 'completed');
			expect(commitAtBoundary).toHaveBeenCalledTimes(closed ? 1 : 2);
			act(() => stockChanges[collection].next({}));
			await flush();
			expect(commitAtBoundary).toHaveBeenCalledTimes(closed ? 1 : 2);
		} finally {
			view.unmount();
		}
		expect(stockChanges[collection].observed).toBe(false);
		expect(databases.observed).toBe(false);
	}
);

// ADR 0040 D6: an authorization, recorded offline or not, is a hold and never paid.
it.each([true, false])(
	'does not settle on an authorization (offline=%s) after a tax reduction',
	async (recorded_offline) => {
		const rates = [{ id: 1, rate: '20', class: 'standard', shipping: true, priority: 1 }];
		currentConfig = createCartConfig({ ...config, calcTaxes: true, rates, allRates: rates });
		const a = record({
			status: 'pos-partial',
			total: '12',
			line_items: [],
			shipping_lines: [{ method_id: 'flat_rate', total: '10' }],
			meta_data: orderMath.withLedger(
				[],
				[{ ...row, status: 'authorized', recorded_offline, amount: '11' }]
			),
		});
		orders.next({ ready: true, hits: [{ record: a }] });
		const view = render(<SettlementCoordinatorProvider />);
		try {
			await flush();
			expect(commitAtBoundary).not.toHaveBeenCalled();
			const reduced = [{ ...rates[0], rate: '10' }];
			currentConfig = createCartConfig({
				...config,
				calcTaxes: true,
				rates: reduced,
				allRates: reduced,
			});
			mockInputs = { ...mockInputs, rates: reduced };
			view.rerender(<SettlementCoordinatorProvider />);
			await flush();
			expect(a.payload.status).toBe('pos-partial');
			// An offline authorization is not in flight, so the cart still reprices.
			expect(a.payload.total).toBe(recorded_offline ? '11' : '12');
			expect(commitAtBoundary).not.toHaveBeenCalled();
		} finally {
			view.unmount();
		}
	}
);

it('maps an unknown binding to none in both cart and coordinator boundary commits', async () => {
	const binding = useRegisterBinding();
	jest.mocked(useRegisterBinding).mockReturnValue({ ...binding, status: 'unknown' });
	const a = record({
		status: 'pos-partial',
		line_items: [{ total: '4' }],
		meta_data: [
			{
				key: '_wcpos_payments',
				value: { schema: 1, payments: [{ id: 'leg', status: 'captured', amount: '4' }] },
			},
		],
	});
	orders.next({ ready: true, hits: [{ record: a }] });
	const view = render(<SettlementCoordinatorProvider />);
	const hook = renderHook(() => useBoundaryCommit(jest.fn()));
	try {
		await flush();
		await enqueueOrderMutation(a.uuid, (queue) =>
			hook.result.current(
				a as CurrentOrderRecord,
				orderMath.settleAggregate(orderMath.snapshotFromOrderJSON(a.payload), config),
				queue
			)
		);
		expect(commitAtBoundary).toHaveBeenCalledTimes(2);
		for (const [ctx] of jest.mocked(commitAtBoundary).mock.calls)
			expect(ctx.bindingStatus).toBe('none');
	} finally {
		view.unmount();
		hook.unmount();
		jest.mocked(useRegisterBinding).mockReturnValue(binding);
	}
});

it('both boundary hosts hand their completion the outcome unchanged', async () => {
	const a = record({
		status: 'pos-partial',
		line_items: [{ total: '4' }],
		meta_data: [
			{
				key: '_wcpos_payments',
				value: { schema: 1, payments: [{ id: 'leg', status: 'captured', amount: '4' }] },
			},
		],
	});
	orders.next({ ready: true, hits: [{ record: a }] });
	const view = render(<SettlementCoordinatorProvider />);
	const hook = renderHook(() => useBoundaryCommit(jest.fn()));
	try {
		await flush();
		await enqueueOrderMutation(a.uuid, (queue) =>
			hook.result.current(
				a as CurrentOrderRecord,
				orderMath.settleAggregate(orderMath.snapshotFromOrderJSON(a.payload), config),
				queue
			)
		);
		expect(commitAtBoundary).toHaveBeenCalledTimes(2);
		const order = a as never;
		const queue = {} as never;
		for (const [ctx] of jest.mocked(commitAtBoundary).mock.calls) {
			const outcome = { source: 'zero-balance', order: { status: 'completed' } } as never;
			await ctx.complete(order, outcome, queue);
			if (ctx.source === 'system') {
				expect(completeSale).toHaveBeenLastCalledWith(
					saleContext,
					order,
					outcome,
					{ host: 'background' },
					queue
				);
				expect(jest.mocked(completeSale).mock.lastCall?.[2]).toBe(outcome);
			} else {
				expect(mockComplete).toHaveBeenLastCalledWith(order, outcome, queue);
				expect(mockComplete.mock.lastCall?.[1]).toBe(outcome);
			}
		}
		expect(completeSale).toHaveBeenCalledTimes(1);
		expect(mockComplete).toHaveBeenCalledTimes(1);
	} finally {
		view.unmount();
		hook.unmount();
	}
});

it('passes the coupon reference validity check through to the boundary writer', async () => {
	jest.mocked(commitAtBoundary).mockImplementationOnce(async () => undefined);
	context.coupons = new Map([
		['summer', { code: 'summer', discount_type: 'percent', amount: '10' }],
	]);
	references.next({ ready: true, generation: 'before' });
	const a = record({
		status: 'pos-partial',
		line_items: [{ product_id: 1, quantity: 1, total: '10', subtotal: '10' }],
		coupon_lines: [{ code: 'summer' }],
		meta_data: [
			{
				key: '_wcpos_payments',
				value: { schema: 1, payments: [{ id: 'leg', status: 'captured', amount: '9' }] },
			},
		],
	});
	orders.next({ ready: true, hits: [{ record: a }] });
	const view = render(<SettlementCoordinatorProvider />);
	try {
		await flush();
		const { allowed } = jest.mocked(commitAtBoundary).mock.calls[0][1];
		expect(allowed).toEqual(expect.any(Function));
		expect(allowed!(a.payload)).toBe(true);
		act(() => references.next({ ready: false, generation: 'after' }));
		expect(allowed!(a.payload)).toBe(false);
	} finally {
		view.unmount();
	}
});

it('keeps both in-flight boundary binding readers current across a render', async () => {
	const binding = useRegisterBinding();
	jest.mocked(useRegisterBinding).mockReturnValue({ ...binding, status: 'unknown' });
	const a = record({
		status: 'pos-partial',
		line_items: [{ total: '4' }],
		meta_data: orderMath.withLedger([], [{ ...row, status: 'captured', amount: '4' }]),
	});
	orders.next({ ready: true, hits: [{ record: a }] });
	const view = render(<SettlementCoordinatorProvider />);
	const hook = renderHook(() => useBoundaryCommit(jest.fn()));
	try {
		await flush();
		await enqueueOrderMutation(a.uuid, (queue) =>
			hook.result.current(
				a as CurrentOrderRecord,
				orderMath.settleAggregate(orderMath.snapshotFromOrderJSON(a.payload), config),
				queue
			)
		);
		const readers = jest.mocked(commitAtBoundary).mock.calls.map(([ctx]) => ctx.readBindingStatus);
		expect(readers).toHaveLength(2);
		for (const read of readers) expect(read?.()).toBe('none');
		jest.mocked(useRegisterBinding).mockReturnValue({ ...binding, status: 'choose' });
		view.rerender(<SettlementCoordinatorProvider />);
		hook.rerender();
		for (const read of readers) expect(read?.()).toBe('choose');
	} finally {
		view.unmount();
		hook.unmount();
		jest.mocked(useRegisterBinding).mockReturnValue(binding);
	}
});

/** @jest-environment jsdom */
import * as React from 'react';

import { act, render } from '@testing-library/react';
import { BehaviorSubject, Subject } from 'rxjs';

import { getLogger } from '@wcpos/utils/logger';
import * as orderMath from '@wcpos/order-math';
import { createCartConfig } from '@wcpos/order-math';

import { enqueueOrderMutation } from '../hooks/order-mutation-queue';
import { settleCartWrite } from './settle-cart-write';
import { config } from '../../../../../jest/cart-write';
import { SettlementCoordinatorProvider } from './settlement-coordinator-provider';
import { quickDiscountCouponInput } from '../hooks/quick-discount';

import type { CurrentOrderRecord } from '../contexts/current-order/context';
import type { OrderPayload } from './cart-config-for-order';

jest.mock('@wcpos/order-math', () => ({
	...jest.requireActual('@wcpos/order-math'),
	settleCart: jest.fn(jest.requireActual('@wcpos/order-math').settleCart),
}));

const paymentMethods = new BehaviorSubject<unknown>(null);
const extraData = { get: () => paymentMethods.value, get$: () => paymentMethods };
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
	status: () => statuses.value,
	statusChanges: subscribe(statuses),
};
const manager = { engine };
const writes: Record<string, unknown>[] = [];
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
	readStorePaymentsContract: jest.requireActual('@wcpos/query').readStorePaymentsContract,
	readCoverageGeneration: jest.requireActual('@wcpos/query').readCoverageGeneration,
	useQueryRuntime: () => manager,
	observeCoverage: () => coverage,
	useDocField: (doc: any, read: any) => read(doc),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ wpCredentials: { id: 7 }, store: { id: 8 }, extraData }),
}));
jest.mock('../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => ({ registerId: 'register' }),
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
jest.mock('./plain-patch', () => ({
	plainPatch: async (_manager: unknown, collection: string, input: any) => {
		expect(collection).toBe('orders');
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
	paymentMethods.next(null);
	currentConfig = config;
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

it.each(['0.30', '0.40'])(
	'defers a partial order crossing net paid %s, without writing money',
	async (amount) => {
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
		expect(writes).toEqual([]);
		expect(getLogger(['test']).warn).toHaveBeenCalledWith(
			'settlement.boundary-deferred',
			expect.anything()
		);
		view.unmount();
	}
);

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
		expect(writes).toHaveLength(kind === 'valid' ? 1 : 0);
		if (kind === 'valid')
			expect(writes[0]).toEqual(expect.objectContaining({ total: '9', discount_total: '1' }));
		if (kind === 'boundary')
			expect(getLogger(['test']).warn).toHaveBeenCalledWith(
				'settlement.boundary-deferred',
				expect.anything()
			);
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
		expect(writes).toHaveLength(kind === 'valid' ? 1 : 0);
		expect(getLogger(['test']).warn).toHaveBeenCalledTimes(kind === 'valid' ? 0 : 1);
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
	// plainPatch may evaluate a resolver before the authoritative resident write.
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
			a.payload.meta_data = [{ key: '_wcpos_money_owner', value: 'server' }];
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

it('wakes a hint-only open order when the store contract resolves to 1.3', async () => {
	orders.next({
		ready: true,
		hits: [
			{ record: record({ meta_data: [{ key: '_wcpos_money_owner_hint', value: 'server' }] }) },
		],
	});
	const view = render(<SettlementCoordinatorProvider />);
	await flush();
	expect(writes).toHaveLength(0);
	act(() => paymentMethods.next({ schema: 1, methods: [], contract: '1.3' }));
	await flush();
	expect(writes).toHaveLength(1);
	view.unmount();
});

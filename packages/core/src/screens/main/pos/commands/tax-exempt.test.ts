/** @jest-environment jsdom */
import { calculateCartLine, createCartConfig, withAwaitingCustomer } from '@wcpos/order-math';
import { wooMetaCarrier } from '@wcpos/sync-core';

import { setTaxExempt, type TaxExemptDeps } from './tax-exempt';
import {
	createActionContext,
	registerActionHook,
	resetActionRegistry,
} from '../../../../extensions/actions';
import { enqueueOrderMutation, resetOrderMutationQueues } from '../hooks/order-mutation-queue';

import type { OrderPayload } from './cart-config-for-order';
import type { CurrentOrderRecord } from '../contexts/current-order';
import type { PayloadChanges } from '../../hooks/mutations/use-local-mutation';

const rate = { id: 1, rate: '10', compound: false, order: 1, class: 'standard', shipping: true };
const config = createCartConfig({
	rates: [rate],
	allRates: [rate],
	calcTaxes: true,
	pricesIncludeTax: false,
	taxRoundAtSubtotal: false,
	dp: 2,
	shippingTaxClass: '',
	taxClassSlugs: ['standard'],
	calcDiscountsSequentially: false,
});
const product = calculateCartLine(
	{
		kind: 'line_item',
		line: {
			product_id: 1,
			quantity: 1,
			total: '10',
			subtotal: '10',
			tax_class: '',
			meta_data: [{ key: '_woocommerce_pos_data', value: { price: 10, tax_status: 'taxable' } }],
		},
	},
	config
).line as NonNullable<OrderPayload['line_items']>[number];
const fee = calculateCartLine(
	{
		kind: 'fee',
		line: { name: 'Fee', total: '5', tax_class: '', tax_status: 'taxable' },
		cartLineItems: [product],
	},
	config
).line;
const ledger = (status: string, amount = '15.5') => [
	{
		key: '_wcpos_payments',
		value: { schema: 1, payments: [{ id: 'leg', status, amount, refunded_amount: '0' }] },
	},
];

beforeEach(() => {
	resetOrderMutationQueues();
	resetActionRegistry();
});
function setup(overrides: OrderPayload = {}) {
	const order = {
		uuid: 'target',
		payload: {
			status: 'pos-open',
			total: '16.5',
			line_items: [product],
			fee_lines: [fee],
			...overrides,
		},
		getLatest() {
			return this;
		},
	} as CurrentOrderRecord;
	const patches: object[] = [];
	const beforeSecond = jest.fn<void, []>();
	let twice = false;
	const localPatch = jest.fn(
		async ({ changes }: { document: CurrentOrderRecord; changes: PayloadChanges }) => {
			let patch = changes(order.payload);
			if (twice) {
				beforeSecond();
				patch = changes(order.payload);
			}
			patches.push(patch);
			Object.assign(order.payload, patch);
			return { document: order, changes: patch };
		}
	);
	const log = jest.fn();
	const deps: TaxExemptDeps = {
		ctx: createActionContext({
			log,
			t: (key) => key,
			readCatalog: async () => null,
			readPaymentMethod: () => null,
			preventOverselling: false,
			priceDecimals: 2,
			resolveSession: async () => ({ registerId: null, sessionId: null }),
		}),
		actor: { userId: 1, registerId: null, sessionId: null },
		localPatch,
		commitAtBoundary: jest.fn(async () => undefined),
		configForOrder: (payload) =>
			createCartConfig({ ...config, vatExempt: wooMetaCarrier.vatExempt(payload.meta_data) }),
		serverOwnsMoney: () => false,
		orderSaveState: () => null,
		inCheckout: () => false,
		references: jest.fn(async () => true),
		readCoupons: jest.fn(async () => ({
			coupons: new Map([['ten', { code: 'ten', discount_type: 'percent' as const, amount: '10' }]]),
			productCategories: new Map(),
		})),
		readTaxStatuses: jest.fn(async () => () => undefined),
		wcVersion: () => '11.3.0',
		reportEngineWarnings: jest.fn(),
	};
	return {
		order,
		deps,
		patches,
		localPatch,
		log,
		beforeSecond,
		rerun: () => {
			twice = true;
		},
	};
}
const toggle = (h: ReturnType<typeof setup>, exempt = true, source: 'user' | 'repair' = 'user') =>
	setTaxExempt(h.deps, h.order, { exempt, source });
const expectLocked = async (h: ReturnType<typeof setup>) => {
	expect(await toggle(h)).toEqual({ deny: { reasonKey: 'pos_cart.tax_exempt_locked' } });
	expect(h.patches).toEqual([{}]);
	expect(h.log).not.toHaveBeenCalled();
};

it('writes flag, product/fixed-fee tax and aggregates together, then round-trips exactly', async () => {
	const h = setup();
	await toggle(h);
	expect(h.localPatch).toHaveBeenCalledTimes(1);
	expect(h.deps.reportEngineWarnings).toHaveBeenCalledWith([], {
		orderId: 'target',
		site: 'setTaxExempt',
	});
	expect(h.patches[0]).toMatchObject({
		meta_data: [{ key: 'is_vat_exempt', value: 'yes' }],
		line_items: [{ ...product, taxes: [], total_tax: '0', subtotal_tax: '0' }],
		fee_lines: [{ ...fee, taxes: [], total_tax: '0' }],
		total: '15',
		total_tax: '0',
		tax_lines: [],
	});
	await toggle(h);
	expect(h.patches[1]).toEqual({});
	await toggle(h, true, 'repair');
	expect(h.patches[2]).toEqual({});
	await toggle(h, false);
	expect(h.order.payload.line_items).toEqual([product]);
	expect(h.order.payload.fee_lines).toEqual([fee]);
	expect(h.order.payload.total).toBe('16.5');
	expect(wooMetaCarrier.vatExempt(h.order.payload.meta_data)).toBe(false);
});

it.each([
	['closed', { status: 'completed' }],
	['live settlement', { meta_data: ledger('pending') }],
	[
		'awaiting customer',
		{
			meta_data: withAwaitingCustomer([], {
				method_id: 'invoice',
				destination: null,
				attempt_id: 'one',
				sent_at_gmt: '',
				cashier_id: 0,
			}),
		},
	],
	['covered balance', { total: '15', meta_data: ledger('captured') }],
] as [string, OrderPayload][])('refuses %s without writing', async (_, payload) => {
	await expectLocked(setup(payload));
});
it.each(['rejected', 'conflicted', 'needs-revision', 'checkout', 'memory'])(
	'refuses %s on every resolver run',
	async (kind) => {
		const h = setup();
		if (kind === 'checkout') h.deps.inCheckout = () => true;
		else if (kind === 'memory') h.deps.serverOwnsMoney = () => true;
		else h.deps.orderSaveState = () => ({ kind });
		await expectLocked(h);
	}
);
it('writes the exemption flag on a temporary (unsaved) order', async () => {
	const h = setup({ line_items: [], fee_lines: [], total: '0' });
	(h.order as { isNew?: boolean }).isNew = true;
	await toggle(h);
	expect(h.patches).toHaveLength(1);
	expect(wooMetaCarrier.vatExempt(h.order.payload.meta_data)).toBe(true);
});
it('durable ownership keeps store aggregates but writes the flag and lines', async () => {
	const h = setup({ meta_data: [{ key: '_wcpos_money_owner_hint', value: 'server' }] });
	await toggle(h);
	expect(h.patches[0]).toMatchObject({
		line_items: [expect.objectContaining({ taxes: [] })],
		fee_lines: [expect.objectContaining({ taxes: [] })],
	});
	expect(h.patches[0]).not.toHaveProperty('total');
	expect(wooMetaCarrier.vatExempt(h.order.payload.meta_data)).toBe(true);
});
it('reruns from newer resident lines, never the earlier snapshot', async () => {
	const h = setup();
	h.rerun();
	h.beforeSecond.mockImplementation(() => {
		h.order.payload.line_items = [product, { ...product, product_id: 2 }];
	});
	await toggle(h);
	expect(h.order.payload.line_items).toHaveLength(2);
	expect(h.order.payload.line_items?.map((line) => line.total_tax)).toEqual(['0', '0']);
	expect(h.order.payload.total).toBe('25');
});
it('reruns eligibility when the resident closes during a write', async () => {
	const h = setup();
	h.rerun();
	h.beforeSecond.mockImplementation(() => {
		h.order.payload.status = 'completed';
	});
	await expectLocked(h);
});
it('reads coupon references before the context, outside the order slot', async () => {
	const h = setup({ coupon_lines: [{ code: 'ten', discount: '1', discount_tax: '0.1' }] });
	let release!: (ready: boolean) => void;
	h.deps.references = jest.fn(
		() =>
			new Promise<boolean>((resolve) => {
				release = resolve;
			})
	);
	const pending = toggle(h);
	await enqueueOrderMutation(h.order.uuid, async () => {
		expect(h.deps.readCoupons).not.toHaveBeenCalled();
	});
	release(true);
	await pending;
	expect(h.localPatch).toHaveBeenCalledTimes(1);
	expect(h.patches[0]).toMatchObject({
		meta_data: [{ key: 'is_vat_exempt', value: 'yes' }],
		total_tax: '0',
		total: '14',
		tax_lines: [],
		coupon_lines: [{ code: 'ten', discount: '1', discount_tax: '0' }],
	});
});
it('refuses unavailable references before any patch or coupon read', async () => {
	const h = setup({ coupon_lines: [{ code: 'ten' }] });
	h.deps.references = async () => false;
	expect(await toggle(h)).toEqual({
		deny: { reasonKey: 'pos_cart.tax_exempt_references_unavailable' },
	});
	expect(h.localPatch).not.toHaveBeenCalled();
	expect(h.deps.readCoupons).not.toHaveBeenCalled();
});
it.each(['11.2.1', '', 'unparsable'])('refuses coupon carts on Woo %s', async (version) => {
	const h = setup({ coupon_lines: [{ code: 'ten' }] });
	h.deps.wcVersion = () => version;
	expect(await toggle(h)).toEqual({ deny: { reasonKey: 'pos_cart.tax_exempt_wc_version' } });
	expect(h.localPatch).not.toHaveBeenCalled();
});
it.each(['11.3.0', '11.10.0', '11.3.0-rc.1'])('accepts coupon carts on Woo %s', async (version) => {
	const h = setup({ coupon_lines: [{ code: 'ten' }] });
	h.deps.wcVersion = () => version;
	await toggle(h);
	expect(h.order.payload.total).toBe('14');
});
it('refuses coupons arriving after the pre-slot read', async () => {
	const h = setup();
	registerActionHook(
		'cart.tax_exempt.set',
		async (_ctx, event, next) => {
			h.order.payload.coupon_lines = [{ code: 'ten' }];
			return next(event);
		},
		{ id: 'coupon-arrival', tier: 'extension' }
	);
	expect(await toggle(h)).toEqual({
		deny: { reasonKey: 'pos_cart.tax_exempt_references_unavailable' },
	});
	expect(h.patches).toEqual([{}]);
	expect(h.log).not.toHaveBeenCalled();
});
it('uses catalog status only for web lines while restoring taxation', async () => {
	const web = {
		product_id: 7,
		quantity: 1,
		subtotal: '10',
		total: '8',
		taxes: [],
		total_tax: '0',
		subtotal_tax: '0',
	};
	const h = setup({
		line_items: [web, product, { ...web, product_id: null }],
		meta_data: [{ key: 'is_vat_exempt', value: 'yes' }],
	});
	h.deps.readTaxStatuses = jest.fn(async () => () => 'none' as const);
	await toggle(h, false);
	expect(h.deps.readTaxStatuses).toHaveBeenCalledWith([web]);
	expect(h.order.payload.line_items?.[0]).toEqual(web);
	expect(h.order.payload.line_items?.[1]).toEqual(product);
});
it.each([false, true])(
	'crossing paid balance uses the boundary unless couponed=%s',
	async (couponed) => {
		const h = setup({
			status: 'pos-partial',
			meta_data: ledger('captured'),
			coupon_lines: couponed ? [{ code: 'ten' }] : [],
		});
		if (couponed) {
			await expectLocked(h);
			expect(h.deps.commitAtBoundary).not.toHaveBeenCalled();
		} else {
			await toggle(h);
			expect(h.deps.commitAtBoundary).toHaveBeenCalledTimes(1);
			expect(h.patches[0]).not.toHaveProperty('total');
			expect(wooMetaCarrier.vatExempt(h.order.payload.meta_data)).toBe(true);
		}
	}
);
it('dispatches an immutable exemption intent after reading previousExempt in the slot', async () => {
	const h = setup({ meta_data: [{ key: 'is_vat_exempt', value: 'yes' }] });
	registerActionHook(
		'cart.tax_exempt.set',
		async (_ctx, event, next) => {
			expect(event.payload).toEqual({
				orderId: 'target',
				exempt: true,
				previousExempt: true,
				source: 'repair',
			});
			return next({ ...event, payload: { ...event.payload, exempt: false } });
		},
		{ id: 'observer', tier: 'extension' }
	);
	await toggle(h, true, 'repair');
	expect(wooMetaCarrier.vatExempt(h.order.payload.meta_data)).toBe(true);
});

it('allows un-exempting on old WooCommerce', async () => {
	const h = setup({ coupon_lines: [{ code: 'ten' }] });
	h.deps.wcVersion = () => '11.2.1';
	await toggle(h, false);
	expect(h.localPatch).toHaveBeenCalledTimes(1);
});
it('refuses old WooCommerce before waiting for offline references', async () => {
	const h = setup({ coupon_lines: [{ code: 'ten' }] });
	h.deps.wcVersion = () => '11.2.1';
	h.deps.references = jest.fn(async () => false);
	expect(await toggle(h)).toEqual({ deny: { reasonKey: 'pos_cart.tax_exempt_wc_version' } });
	expect(h.deps.references).not.toHaveBeenCalled();
});
it('writes a quick-discount-only order offline without reading references or coupons', async () => {
	const h = setup({
		coupon_lines: [
			{
				code: 'pos-discount',
				meta_data: [
					{ key: '_wcpos_quick_discount', value: { discount_type: 'percent', amount: '10' } },
				],
			},
		],
	});
	h.deps.references = jest.fn(async () => false);
	await toggle(h);
	expect(h.localPatch).toHaveBeenCalledTimes(1);
	expect(h.deps.references).not.toHaveBeenCalled();
	expect(h.deps.readCoupons).not.toHaveBeenCalled();
	expect(h.patches[0]).toMatchObject({
		total: '14',
		total_tax: '0',
		coupon_lines: [expect.objectContaining({ discount: '1', discount_tax: '0' })],
	});
});
it.each([false, true])(
	'checks the pre-slot product set only when references are needed: %s',
	async (couponed) => {
		const web = {
			product_id: 7,
			quantity: 1,
			subtotal: '10',
			total: '10',
			total_tax: '0',
			subtotal_tax: '0',
			taxes: [],
		};
		const h = setup({ line_items: [web], coupon_lines: couponed ? [{ code: 'ten' }] : [] });
		h.deps.readTaxStatuses = jest.fn(
			async () => (line: import('@wcpos/order-math').LineItemInput) =>
				line.product_id === 7 ? 'none' : undefined
		);
		registerActionHook(
			'cart.tax_exempt.set',
			async (_ctx, event, next) => {
				h.order.payload.line_items = [{ ...web }, { ...web, product_id: 8 }];
				return next(event);
			},
			{ id: 'product-arrival', tier: 'extension' }
		);
		const result = await toggle(h, false);
		if (couponed) {
			expect(result).toEqual({ deny: { reasonKey: 'pos_cart.tax_exempt_references_unavailable' } });
			expect(h.patches).toEqual([{}]);
		} else {
			expect(h.order.payload.line_items?.map((line) => line.total_tax)).toEqual(['0', '1']);
		}
	}
);

it('refuses a quick discount arriving in the resolver on old WooCommerce', async () => {
	const h = setup();
	h.deps.wcVersion = () => '11.2.1';
	registerActionHook(
		'cart.tax_exempt.set',
		async (_ctx, event, next) => {
			h.order.payload.coupon_lines = [
				{
					code: 'pos-discount',
					meta_data: [
						{ key: '_wcpos_quick_discount', value: { discount_type: 'percent', amount: '10' } },
					],
				},
			];
			return next(event);
		},
		{ id: 'quick-discount-arrival', tier: 'extension' }
	);
	expect(await toggle(h)).toEqual({ deny: { reasonKey: 'pos_cart.tax_exempt_wc_version' } });
	expect(h.patches).toEqual([{}]);
	expect(wooMetaCarrier.vatExempt(h.order.payload.meta_data)).toBe(false);
});
it.each([true, false])(
	'inclusive store allows only clearing exemption: exempt=%s',
	async (exempt) => {
		const h = setup({ meta_data: [{ key: 'is_vat_exempt', value: 'yes' }] });
		h.deps.configForOrder = () => createCartConfig({ ...config, pricesIncludeTax: true });
		const before = JSON.stringify(h.order.payload);
		const result = await toggle(h, exempt);
		if (exempt) {
			expect(result).toEqual({ deny: { reasonKey: 'pos_cart.tax_exempt_inclusive_store' } });
			expect(JSON.stringify(h.order.payload)).toBe(before);
			expect(h.patches).toEqual([{}]);
		} else {
			expect(wooMetaCarrier.vatExempt(h.order.payload.meta_data)).toBe(false);
			expect(h.order.payload.meta_data).not.toContainEqual({ key: 'is_vat_exempt', value: 'yes' });
		}
	}
);
it.each([false, true])(
	'reports warnings once after rerun, including refusal=%s',
	async (refused) => {
		const h = setup();
		h.rerun();
		h.beforeSecond.mockImplementation(() => {
			expect(h.deps.reportEngineWarnings).not.toHaveBeenCalled();
			if (refused) h.order.payload.status = 'completed';
		});
		await toggle(h);
		expect(h.deps.reportEngineWarnings).toHaveBeenCalledTimes(1);
		expect(h.deps.reportEngineWarnings).toHaveBeenCalledWith([], {
			orderId: 'target',
			site: 'setTaxExempt',
		});
	}
);

it('un-exempting a couponed catalog-none web line does not reintroduce tax in replay', async () => {
	const h = setup({
		meta_data: [{ key: 'is_vat_exempt', value: 'yes' }],
		line_items: [{ ...product, meta_data: [], total_tax: '0', subtotal_tax: '0', taxes: [] }],
		fee_lines: [],
		coupon_lines: [{ code: 'ten' }],
	});
	h.deps.readTaxStatuses = async () => () => 'none';
	await toggle(h, false);
	expect(h.order.payload.line_items?.[0].total_tax).toBe('0');
	expect(h.order.payload.discount_tax).toBe('0');
});

it('repair re-taxes the resident un-exempt payload instead of stamping a stale flag', async () => {
	const h = setup({ meta_data: [{ key: 'is_vat_exempt', value: 'yes' }] });
	await toggle(h);
	h.rerun();
	const meta = [{ key: 'is_vat_exempt', value: 'no' }];
	h.beforeSecond.mockImplementation(() => {
		h.order.payload.meta_data = meta;
	});
	await toggle(h, true, 'repair');
	expect(h.order.payload.line_items).toEqual([product]);
	expect(h.order.payload.fee_lines).toEqual([fee]);
	expect(h.order.payload.total).toBe('16.5');
	expect(h.order.payload.meta_data).toBe(meta);
	expect(h.patches[1]).not.toHaveProperty('meta_data');
});
it('repair refuses durable store ownership without writing', async () => {
	const h = setup({ meta_data: [{ key: '_wcpos_money_owner_hint', value: 'server' }] });
	const before = JSON.stringify(h.order.payload);
	expect(await toggle(h, true, 'repair')).toEqual({
		deny: { reasonKey: 'pos_cart.tax_exempt_locked' },
	});
	expect(h.patches).toEqual([{}]);
	expect(JSON.stringify(h.order.payload)).toBe(before);
	expect(h.deps.commitAtBoundary).not.toHaveBeenCalled();
});

it.each([false, true])(
	'refuses an invalid repair at resident resolution (rerun=%s)',
	async (rerun) => {
		const h = setup({ meta_data: [{ key: 'is_vat_exempt', value: 'yes' }] });
		const before = JSON.stringify(h.order.payload);
		let valid = rerun;
		if (rerun) {
			h.rerun();
			h.beforeSecond.mockImplementation(() => {
				valid = false;
			});
		}
		expect(
			await setTaxExempt(h.deps, h.order, { exempt: true, source: 'repair', valid: () => valid })
		).toEqual({ deny: { reasonKey: 'pos_cart.tax_exempt_locked' } });
		expect(h.patches).toEqual([{}]);
		expect(JSON.stringify(h.order.payload)).toBe(before);
		expect(h.deps.commitAtBoundary).not.toHaveBeenCalled();
	}
);

it.each(['repair', 'user'] as const)('couponed paid-balance crossing from %s', async (source) => {
	const h = setup({
		status: 'pos-partial',
		total: '14.5',
		meta_data: [...ledger('captured', '14'), { key: 'is_vat_exempt', value: 'yes' }],
		line_items: [{ ...product, total: '9', total_tax: '0', subtotal_tax: '0', taxes: [] }],
		coupon_lines: [{ code: 'ten', discount: '1', discount_tax: '0' }],
	});
	const result = await toggle(h, true, source);
	if (source === 'user') {
		expect(result).toEqual({ deny: { reasonKey: 'pos_cart.tax_exempt_locked' } });
		expect(h.patches).toEqual([{}]);
		expect(h.deps.commitAtBoundary).not.toHaveBeenCalled();
	} else {
		expect(h.deps.commitAtBoundary).toHaveBeenCalledWith(
			h.order,
			expect.objectContaining({ totals: expect.objectContaining({ total: '14' }) }),
			expect.anything(),
			expect.objectContaining({
				context: expect.objectContaining({
					coupons: new Map([['ten', { code: 'ten', discount_type: 'percent', amount: '10' }]]),
				}),
			})
		);
		expect(h.order.payload.fee_lines?.[0].total_tax).toBe('0');
	}
});

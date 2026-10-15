/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import { enqueueOrderMutation, resetOrderMutationQueues } from './order-mutation-queue';
import { useUpdateCartLine as useWriter } from './use-update-cart-line';
import * as actions from '../../../../extensions/actions';
import { registerActionHook, resetActionRegistry } from '../../../../extensions/actions';

import type { CurrentOrderRecord } from '../contexts/current-order';

type Payload = import('@wcpos/database').OrderDocument;
const mockPatch = jest.fn();
const mockWarn = jest.fn();
const mockInfo = jest.fn();
let mockOrder: CurrentOrderRecord;
let mockTaxSettings: Record<string, unknown> = {};
function record(uuid: string, payload: Partial<Payload>): CurrentOrderRecord {
	const value = {
		uuid,
		payload,
		getLatest: () => value,
		toMutableJSON: () => ({ payload: JSON.parse(JSON.stringify(value.payload)) }),
	};
	return value as CurrentOrderRecord;
}
const meta = (uuid: string) => [{ key: '_woocommerce_pos_uuid', value: uuid }];
const product = (quantity = 1) => ({
	product_id: 1,
	name: 'Product',
	quantity,
	total: '10',
	subtotal: '10',
	meta_data: [
		...meta('line'),
		{ key: '_woocommerce_pos_data', value: { price: 10, tax_status: 'taxable' } },
	],
});
jest.mock('uuid', () => ({ v4: () => 'uuid' }));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({
		get warn() {
			return mockWarn;
		},
		get info() {
			return mockInfo;
		},
	}),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockPatch }),
	documentRecordId: (value: CurrentOrderRecord) => value.uuid,
}));
jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: mockOrder }),
	useCurrentOrderActions: () => ({ getCurrentOrderRecord: () => mockOrder }),
}));
jest.mock('./use-line-item-data', () => ({
	useLineItemData: () => ({ getLineItemData: () => ({ price: 10 }) }),
}));
jest.mock('../contexts/order-engine-warnings', () => ({
	useReportEngineWarnings: () => jest.fn(),
}));
jest.mock('./use-action-context', () => ({
	useActionContext: () => ({
		ctx: {
			log: mockWarn,
			t: (key: string) => key,
			now: Date.now,
			read: { catalog: async () => null, paymentMethod: () => null },
			register: { resolveSession: async () => ({ registerId: null, sessionId: null }) },
			store: { preventOverselling: false, priceDecimals: 2 },
		},
		actor: { userId: 7, registerId: 'till', sessionId: null },
	}),
}));
jest.mock('./use-cart-config', () => {
	const { createCartConfig } = jest.requireActual('@wcpos/order-math');
	return {
		useCartConfig: () =>
			createCartConfig({
				rates: [],
				allRates: [],
				calcTaxes: true,
				pricesIncludeTax: false,
				taxRoundAtSubtotal: false,
				dp: 2,
				shippingTaxClass: '',
				taxClassSlugs: ['standard'],
				calcDiscountsSequentially: false,
				...mockTaxSettings,
			}),
	};
});

beforeEach(() => {
	jest.clearAllMocks();
	resetOrderMutationQueues();
	resetActionRegistry();
	mockTaxSettings = {};
	mockOrder = record('order', {
		id: 17,
		line_items: [product()],
		fee_lines: [{ name: 'Fee', total: '2', meta_data: meta('fee') }],
		shipping_lines: [{ method_title: 'Shipping', total: '3', meta_data: meta('shipping') }],
	});
	mockPatch.mockImplementation(async ({ document, data }) => {
		Object.assign(document.payload, data);
		return document;
	});
});

afterEach(() => jest.restoreAllMocks());

it('an increment of a vanished line falls back silently', async () => {
	const dispatch = jest.spyOn(actions, 'dispatchAction');
	const { result } = renderHook(useWriter);
	await act(async () => {
		expect(await result.current.incrementLineItem('gone', 1)).toBeUndefined();
	});
	expect(mockWarn).not.toHaveBeenCalled();
	expect(mockInfo).not.toHaveBeenCalled();
	expect(dispatch).not.toHaveBeenCalled();
	expect(mockPatch).not.toHaveBeenCalled();
});

it.each([
	['fee_lines', 'fee'],
	['shipping_lines', 'shipping'],
] as const)(
	'dispatches %s with empty options rather than undefined members',
	async (type, uuid) => {
		const dispatch = jest.spyOn(actions, 'dispatchAction');
		const { result } = renderHook(useWriter);
		await act(async () => {
			await result.current.updateCartLine(type, uuid, {});
		});
		const payload = dispatch.mock.calls[0][0].input.payload;
		expect('options' in payload && payload.options).toStrictEqual({});
	}
);

it('reports a stale line item edit without dispatching', async () => {
	const seen = jest.fn(async (_ctx, e, next) => next(e));
	registerActionHook('cart.line.update', seen, { id: 'test.observe', tier: 'extension' });
	const { result } = renderHook(useWriter);
	await act(async () => {
		expect(
			await result.current.updateCartLine('line_items', 'gone', { quantity: 2 })
		).toBeUndefined();
	});
	expect(seen).not.toHaveBeenCalled();
	expect(mockPatch).not.toHaveBeenCalled();
	expect(mockWarn).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({
			showToast: true,
			toast: { title: 'pos_cart.update_line_not_found' },
		})
	);
});

it('increments against the record a first add left on the slot', async () => {
	const saved = record('order', { id: 18, line_items: [product(5)] });
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const first = enqueueOrderMutation('order', async (queue) => {
		await gate;
		queue.order = saved;
	});
	const { result } = renderHook(useWriter);
	await act(async () => {
		const pending = result.current.incrementLineItem('line', 2);
		release();
		await first;
		await pending;
	});
	expect(saved.payload.line_items?.[0].quantity).toBe(7);
	expect(mockOrder.payload.line_items?.[0].quantity).toBe(1);
});

it.each([
	['line_items', 'line'],
	['fee_lines', 'fee'],
	['shipping_lines', 'shipping'],
] as const)('dispatches one event shape for every editable type: %s', async (type, uuid) => {
	const seen = jest.fn(async (_ctx, e, next) =>
		next({
			...e,
			payload: { ...e.payload, changes: { name: 'Rewritten', method_title: 'Rewritten' } },
		})
	);
	registerActionHook('cart.line.update', seen, { id: 'test.rewrite', tier: 'extension' });
	const { result } = renderHook(useWriter);
	await act(async () => {
		await result.current.updateCartLine(type, uuid, {
			name: 'Requested',
			method_title: 'Requested',
		});
	});
	expect(seen.mock.calls[0][1]).toMatchObject({
		event: 'cart.line.update',
		orderId: 'order',
		source: 'user',
		actor: { userId: 7 },
		payload: {
			type,
			lineUuid: uuid,
			changes: { name: 'Requested', method_title: 'Requested' },
			line: { meta_data: expect.arrayContaining(meta(uuid)) },
			lineItems: [product()],
			options: {},
		},
	});
	expect(mockOrder.payload[type]?.[0]).toMatchObject(
		type === 'shipping_lines' ? { method_title: 'Rewritten' } : { name: 'Rewritten' }
	);
});

it('a fee edit and a line edit queued together land in order on the saved record', async () => {
	const saved = record('order', JSON.parse(JSON.stringify(mockOrder.payload)));
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	void enqueueOrderMutation('order', async (queue) => {
		await gate;
		queue.order = saved;
	});
	const { result } = renderHook(useWriter);
	await act(async () => {
		const fee = result.current.updateCartLine('fee_lines', 'fee', { name: 'Edited fee' });
		const line = result.current.updateCartLine('line_items', 'line', { quantity: 3 });
		release();
		await Promise.all([fee, line]);
	});
	expect(mockPatch.mock.calls.map(([call]) => Object.keys(call.data))).toEqual([
		['fee_lines'],
		['line_items'],
	]);
	expect(mockPatch.mock.calls.every(([call]) => call.document === saved)).toBe(true);
	expect(saved.payload.fee_lines?.[0].name).toBe('Edited fee');
	expect(saved.payload.line_items?.[0].quantity).toBe(3);
});

it.each([
	['fee_lines', 'fee'],
	['shipping_lines', 'shipping'],
] as const)(
	'captures %s at press time rather than render or queue execution',
	async (type, uuid) => {
		const { result } = renderHook(useWriter);
		const pressed = record('pressed', JSON.parse(JSON.stringify(mockOrder.payload)));
		mockOrder = pressed;
		await act(async () => {
			const pending = result.current.updateCartLine(type, uuid, {
				name: 'Pressed',
				method_title: 'Pressed',
			});
			mockOrder = record('later', {});
			await pending;
		});
		expect(mockPatch).toHaveBeenCalledWith(expect.objectContaining({ document: pressed }));
	}
);

it('uses one writer snapshot for a percentage fee even when getLatest advances', async () => {
	const first = record('order', {
		...mockOrder.payload,
		line_items: [{ product_id: 1, total: '80' }],
	});
	const writer = record('order', {
		...mockOrder.payload,
		line_items: [{ product_id: 1, total: '200' }],
	});
	const later = record('order', {
		...mockOrder.payload,
		line_items: [{ product_id: 1, total: '800' }],
	});
	mockOrder.getLatest = jest
		.fn()
		.mockReturnValueOnce(first)
		.mockReturnValueOnce(writer)
		.mockReturnValue(later);
	const { result } = renderHook(useWriter);
	await act(async () => {
		await result.current.updateCartLine('fee_lines', 'fee', { amount: '10', percent: true });
	});
	expect(mockPatch).toHaveBeenCalledWith(expect.objectContaining({ document: writer }));
	expect(writer.payload.fee_lines?.[0].total).toBe('20');
});

it('passes cart lines for inherited shipping tax with an inclusive amount', async () => {
	mockTaxSettings = {
		rates: [
			{ id: 1, rate: '10.0000', class: 'reduced-rate', shipping: true, compound: false, order: 1 },
		],
		shippingTaxClass: 'inherit',
		taxClassSlugs: ['standard', 'reduced-rate'],
	};
	mockOrder.payload.line_items = [{ ...product(), tax_class: 'reduced-rate' }];
	const { result } = renderHook(useWriter);
	await act(async () => {
		await result.current.updateCartLine('shipping_lines', 'shipping', {
			amount: 11,
			prices_include_tax: true,
			tax_status: 'taxable',
		});
	});
	expect(mockOrder.payload.shipping_lines?.[0]).toMatchObject({ total: '10', total_tax: '1' });
});

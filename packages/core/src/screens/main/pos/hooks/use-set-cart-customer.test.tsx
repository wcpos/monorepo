/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { config, expectSettledWrites } from '../../../../../jest/cart-write';
import { resetOrderMutationQueues } from './order-mutation-queue';
import {
	type ActionEventInput,
	registerActionHook,
	resetActionRegistry,
} from '../../../../extensions/actions';
import { useSetCartCustomer } from './use-set-cart-customer';

const localPatch = jest.fn();
const mockActionLog = jest.fn();
jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({
		localPatch: jest.requireActual('../../../../../jest/cart-write').resolveCartWrite(localPatch),
	}),
}));
jest.mock('./use-action-context', () => ({
	useActionContext: () => ({
		ctx: {
			log: mockActionLog,
			t: (key: string) => key,
			now: Date.now,
			read: { catalog: async () => null, paymentMethod: () => null },
			register: { resolveSession: async () => ({ registerId: null, sessionId: null }) },
			store: { preventOverselling: false, priceDecimals: 2 },
		},
		actor: { userId: 7, registerId: 'till', sessionId: null },
	}),
}));

const order = {
	uuid: 'order-uuid',
	payload: { id: 17, customer_id: 3 },
	getLatest: () => order,
} as never;
const billing = { first_name: 'Ada', email: 'ada@example.com' };
const shipping = { first_name: 'Ada', country: 'AU' };

beforeEach(() => {
	resetOrderMutationQueues();
	jest.clearAllMocks();
	resetActionRegistry();
	localPatch.mockResolvedValue({ uuid: 'order-uuid' });
});

it('dispatches the customer with the previous id, then writes the four fields', async () => {
	const seen: ActionEventInput<'cart.customer.set'>[] = [];
	registerActionHook(
		'cart.customer.set',
		async (_ctx, e, next) => {
			seen.push(e);
			expect(localPatch).not.toHaveBeenCalled();
			return next(e);
		},
		{ id: 'test.observer', tier: 'extension' }
	);
	const { result } = renderHook(() => useSetCartCustomer());
	let outcome: unknown;
	await act(async () => {
		outcome = await result.current(order, { customerId: 9, billing, shipping, taxIds: [] });
	});
	expect(outcome).toEqual({ uuid: 'order-uuid' });
	expect(seen).toEqual([
		expect.objectContaining({
			event: 'cart.customer.set',
			orderId: 'order-uuid',
			actor: { userId: 7, registerId: 'till', sessionId: null },
			payload: { customerId: 9, previousCustomerId: 3, billing, shipping, taxIds: [] },
		}),
	]);
	expect(localPatch).toHaveBeenCalledWith({
		document: order,
		data: expect.objectContaining({ customer_id: 9, billing, shipping, tax_ids: [] }),
	});
});

it('a rewritten address is what gets written; the customer id cannot be rewritten', async () => {
	registerActionHook(
		'cart.customer.set',
		async (_ctx, e, next) =>
			next({
				...e,
				payload: {
					...e.payload,
					customerId: 999,
					billing: { ...e.payload.billing, company: 'Loyalty Ltd' },
				},
			}),
		{ id: 'test.rewriter', tier: 'extension' }
	);
	const { result } = renderHook(() => useSetCartCustomer());
	await act(async () => {
		await result.current(order, { customerId: 9, billing, shipping, taxIds: null });
	});
	expect(localPatch).toHaveBeenCalledWith({
		document: order,
		data: expect.objectContaining({
			customer_id: 9,
			billing: { ...billing, company: 'Loyalty Ltd' },
			shipping,
		}),
	});
});

it('taxIds null leaves the order snapshot alone and an absent address is written as absent', async () => {
	const { result } = renderHook(() => useSetCartCustomer());
	await act(async () => {
		await result.current(order, { customerId: 0, billing, shipping: undefined, taxIds: null });
	});
	const { data } = localPatch.mock.calls[0][0];
	expect(data).toMatchObject({ customer_id: 0, billing, shipping: undefined });
	expect('tax_ids' in data).toBe(false);
});

it('a guard refusal writes nothing, presents the reason and resolves false', async () => {
	registerActionHook(
		'cart.customer.set',
		async () => ({ deny: { reasonKey: 'loyalty.customer_blocked' } }),
		{ id: 'test.guard', tier: 'guard' }
	);
	const { result } = renderHook(() => useSetCartCustomer());
	let outcome: unknown;
	await act(async () => {
		outcome = await result.current(order, { customerId: 9, billing, shipping, taxIds: [] });
	});
	expect(outcome).toBe(false);
	expect(localPatch).not.toHaveBeenCalled();
	expect(mockActionLog).toHaveBeenCalledWith(
		'warn',
		'loyalty.customer_blocked',
		expect.objectContaining({ showToast: true })
	);
});

it('without a customer id the write keeps whoever the order is for, read inside the slot, and the event carries that id', async () => {
	const seen: ActionEventInput<'cart.customer.set'>[] = [];
	registerActionHook(
		'cart.customer.set',
		async (_ctx, e, next) => {
			seen.push(e);
			return next(e);
		},
		{ id: 'test.observer', tier: 'extension' }
	);
	const { result } = renderHook(() => useSetCartCustomer());
	await act(async () => {
		await result.current(order, { billing, shipping, taxIds: [] });
	});
	expect(seen[0].payload).toEqual({
		customerId: 3,
		previousCustomerId: 3,
		billing,
		shipping,
		taxIds: [],
	});
	const { data } = localPatch.mock.calls[0][0];
	expect('customer_id' in data).toBe(false);
	expect(data).toMatchObject({ billing, shipping, tax_ids: [] });
});

it('lands on the saved order a first add left on the slot, not the temporary record it was called with', async () => {
	const { enqueueOrderMutation } =
		jest.requireActual<typeof import('./order-mutation-queue')>('./order-mutation-queue');
	const saved = {
		uuid: 'order-uuid',
		payload: { id: 18, customer_id: 0 },
		getLatest: () => saved,
	} as never;
	let release!: () => void;
	const gate = new Promise<void>((resolve) => (release = resolve));
	void enqueueOrderMutation('order-uuid', async (queue) => {
		await gate;
		queue.order = saved;
	});
	const { result } = renderHook(() => useSetCartCustomer());
	const pending = act(async () => {
		await result.current(order, { customerId: 9, billing, shipping, taxIds: null });
	});
	release();
	await pending;
	expect(localPatch).toHaveBeenCalledWith(
		expect.objectContaining({ document: saved, data: expect.objectContaining({ customer_id: 9 }) })
	);
});

afterEach(() => expectSettledWrites(localPatch));

jest.mock('./use-cart-config', () => jest.requireActual('../../../../../jest/cart-write'));

it('settles the target post-edit address, not the rendered order, and re-taxes the lines', async () => {
	const { cartConfigForOrder } = jest.requireActual('../commands/cart-config-for-order');
	const { settleAggregate, snapshotFromOrderJSON } = jest.requireActual('@wcpos/order-math');
	const configForOrder = jest.fn((payload) =>
		cartConfigForOrder({
			settings: { ...config, calcTaxes: true, priceNumDecimals: 2, taxBasedOn: 'billing' },
			rates: [
				{ id: 1, country: 'AU', rate: '10', class: 'standard', shipping: true, priority: 1 },
				{ id: 2, country: 'NZ', rate: '20', class: 'standard', shipping: true, priority: 1 },
			],
			baseLocation: { country: 'AU' },
			order: payload,
		})
	);
	jest.requireMock('./use-cart-config').useCartConfigReader.mockReturnValue(configForOrder);
	const product = {
		product_id: 1,
		quantity: 1,
		subtotal: '10',
		total: '10',
		total_tax: '1',
		subtotal_tax: '1',
		taxes: [{ id: 1, total: '1', subtotal: '1' }],
	};
	const target = {
		uuid: 'order-Y',
		payload: {
			billing: { country: 'AU' },
			line_items: [product],
			shipping_lines: [
				{
					method_id: 'flat_rate',
					total: '10',
				},
			],
		},
		getLatest() {
			return this;
		},
	};
	const { result } = renderHook(() => useSetCartCustomer());
	await act(async () => {
		await result.current(target as never, {
			billing: { country: 'NZ' },
			shipping: undefined,
			taxIds: null,
		});
	});
	const after = { status: 'pos-open', ...target.payload, billing: { country: 'NZ' } };
	expect(configForOrder).toHaveBeenCalledWith(after);
	expect(localPatch).toHaveBeenCalledTimes(1);
	const { data } = localPatch.mock.calls[0][0];
	expect(data).toMatchObject({
		billing: { country: 'NZ' },
		total: '24',
		total_tax: '4',
		shipping_tax: '2',
		line_items: [{ total: '10', subtotal: '10', total_tax: '2', subtotal_tax: '2' }],
	});
	const retaxed = { ...after, line_items: data.line_items };
	expect(data).toMatchObject(
		settleAggregate(snapshotFromOrderJSON(retaxed), configForOrder(retaxed)).patch
	);
});

jest.mock('../commands/use-boundary-commit', () => ({
	useBoundaryCommit: () => jest.fn(),
}));

const mockReport = jest.fn();
const mockReadTaxStatuses = jest.fn();
const mockExtraWarnings = jest.fn((): unknown[] => []);
jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useQueryRuntime: () => ({ engine: 'engine' }),
}));
jest.mock('./use-coupon-context', () => ({
	readCatalogTaxStatuses: (...args: unknown[]) => mockReadTaxStatuses(...args),
}));
jest.mock('../contexts/order-engine-warnings', () => ({
	useReportEngineWarnings: () => mockReport,
}));
// Real retax; a test may append a warning, which the real engine never emits.
jest.mock('../commands/retax-for-customer-write', () => {
	const actual = jest.requireActual('../commands/retax-for-customer-write');
	return {
		retaxForCustomerWrite: (...args: Parameters<typeof actual.retaxForCustomerWrite>) => {
			const result = actual.retaxForCustomerWrite(...args);
			return { ...result, warnings: [...result.warnings, ...mockExtraWarnings()] };
		},
	};
});
beforeEach(() => mockReadTaxStatuses.mockResolvedValue(() => undefined));
afterEach(() =>
	jest.requireMock('./use-cart-config').useCartConfigReader.mockImplementation(() => () => config)
);

describe('the lines follow the rates of the address written (#1875)', () => {
	const { cartConfigForOrder } = jest.requireActual('../commands/cart-config-for-order');
	const reader = (payload: unknown) =>
		cartConfigForOrder({
			settings: { ...config, calcTaxes: true, priceNumDecimals: 2, taxBasedOn: 'shipping' },
			rates: [
				{ id: 1, country: 'AU', rate: '10', class: 'standard', shipping: true, priority: 1 },
				{ id: 2, country: 'NZ', rate: '15', class: 'standard', shipping: true, priority: 1 },
			],
			baseLocation: { country: 'AU' },
			order: payload,
		});
	const line = {
		product_id: 1,
		quantity: 1,
		subtotal: '100',
		total: '100',
		subtotal_tax: '10',
		total_tax: '10',
		taxes: [{ id: 1, total: '10', subtotal: '10' }],
	};
	const au = { first_name: 'Ada', country: 'AU' };
	const nz = { first_name: 'Ada', country: 'NZ' };
	type Plain = Record<string, unknown>;
	const record = (payload: object = {}) => {
		const target = {
			uuid: 'order-uuid',
			payload: { status: 'pos-open', billing: au, shipping: au, line_items: [line], ...payload },
			getLatest: () => target,
		};
		return target as never;
	};
	const setCustomer = async (target: never, fields: { billing: Plain; shipping: Plain }) => {
		jest.requireMock('./use-cart-config').useCartConfigReader.mockReturnValue(reader);
		const { result } = renderHook(() => useSetCartCustomer());
		let outcome: unknown;
		await act(async () => {
			outcome = await result.current(target, { customerId: 9, ...fields, taxIds: null });
		});
		return outcome;
	};
	const nzLine = expect.objectContaining({ total: '100', subtotal: '100', total_tax: '15' });

	it('one write carries the address, the re-taxed lines and the aggregate at the new rate', async () => {
		await setCustomer(record(), { billing: nz, shipping: nz });
		expect(localPatch).toHaveBeenCalledTimes(1);
		const { data } = localPatch.mock.calls[0][0];
		expect(data).toMatchObject({ billing: nz, shipping: nz, total: '115', total_tax: '15' });
		expect(data.line_items).toEqual([nzLine]);
		expect(data.tax_lines).toEqual([expect.objectContaining({ rate_id: 2, tax_total: '15' })]);
	});

	it('a hook that rewrites the shipping country sets the rate, not the form', async () => {
		registerActionHook(
			'cart.customer.set',
			async (_ctx, e, next) => next({ ...e, payload: { ...e.payload, shipping: nz } }),
			{ id: 'test.rewriter', tier: 'extension' }
		);
		await setCustomer(record(), { billing: au, shipping: au });
		const { data } = localPatch.mock.calls[0][0];
		expect(data).toMatchObject({ shipping: nz, total_tax: '15' });
		expect(data.line_items).toEqual([nzLine]);
	});

	it('a couponed order takes the re-taxed lines and leaves its aggregate to the continuation', async () => {
		await setCustomer(record({ coupon_lines: [{ code: 'save', discount: '0' }] }), {
			billing: nz,
			shipping: nz,
		});
		const { data } = localPatch.mock.calls[0][0];
		expect(data.line_items).toEqual([nzLine]);
		expect(data).not.toHaveProperty('total_tax');
	});

	it('a closed order is not written and keeps its lines', async () => {
		const target = record({ status: 'completed' }) as { payload: { line_items: unknown[] } };
		await setCustomer(target as never, { billing: nz, shipping: nz });
		expect(localPatch).not.toHaveBeenCalled();
		expect(target.payload.line_items).toEqual([line]);
	});

	it('reads the catalog inside its slot, so a later mutation runs after its write', async () => {
		const { enqueueOrderMutation } =
			jest.requireActual<typeof import('./order-mutation-queue')>('./order-mutation-queue');
		const events: string[] = [];
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		mockReadTaxStatuses.mockImplementationOnce(async () => {
			await gate;
			return () => undefined;
		});
		localPatch.mockImplementation(async () => {
			events.push('patch');
			return { uuid: 'order-uuid' };
		});
		jest.requireMock('./use-cart-config').useCartConfigReader.mockReturnValue(reader);
		const { result } = renderHook(() => useSetCartCustomer());
		await act(async () => {
			const first = result.current(record(), { billing: nz, shipping: nz, taxIds: null });
			const second = enqueueOrderMutation('order-uuid', async () => void events.push('second'));
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(events).toEqual([]);
			release();
			await Promise.all([first, second]);
		});
		expect(events).toEqual(['patch', 'second']);
	});

	it('reports the last run of the write once, even when its data ran twice', async () => {
		const cartWrite = jest.requireActual('../../../../../jest/cart-write');
		const resolve = cartWrite.resolveCartWrite;
		const twice = jest
			.spyOn(cartWrite, 'resolveCartWrite')
			.mockImplementation((mock) => (input: { document: { payload: object }; changes: never }) => {
				(input.changes as (p: object) => object)({ status: 'pos-open', ...input.document.payload });
				return resolve(mock)(input);
			});
		mockExtraWarnings
			.mockReturnValueOnce([{ kind: 'stale-run' }])
			.mockReturnValueOnce([{ kind: 'last-run' }]);
		await setCustomer(record(), { billing: nz, shipping: nz });
		twice.mockRestore();
		expect(mockExtraWarnings).toHaveBeenCalledTimes(2);
		expect(mockReport).toHaveBeenCalledTimes(1);
		expect(mockReport).toHaveBeenCalledWith([{ kind: 'last-run' }], {
			orderId: 'order-uuid',
			site: 'useSetCartCustomer',
		});
		expect(localPatch.mock.calls[0][0].data.line_items).toEqual([nzLine]);
	});
});

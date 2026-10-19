import { BehaviorSubject, of } from 'rxjs';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import {
	derive,
	readLedger,
	settleAggregate,
	settlementPatch,
	snapshotFromOrderJSON,
	withLedger,
} from '@wcpos/order-math';
import { getLogger } from '@wcpos/utils/logger';
import type { EngineRecord } from '@wcpos/query';
import { RegisterSessionRequiredError } from '@wcpos/query/register-session';
import { pendingCompletions } from '@wcpos/query/store-local';

import { config } from '../../../../../jest/cart-write';
import { createActionContext, registerActionHook } from '../../../../extensions/actions';
import { completeSale, type SaleContext } from '../checkout/sale-completion';
import { enqueueOrderMutation } from '../hooks/order-mutation-queue';
import { enqueueCartAction } from '../hooks/enqueue-cart-action';
import { settleCartWrite } from './settle-cart-write';
import { commitAtBoundary } from './boundary-commit';
import { createSettlementCoordinator } from './settlement-coordinator';

import type { CartConfigInputs } from './cart-config-for-order';

jest.mock('@wcpos/query/register-session', () => ({
	...jest.requireActual('@wcpos/query/register-session'),
	requireOpenSession: async () => 'session',
	readRegister: async () => ({ sites: { site: { register_id: 'register' } } }),
	nextSaleCounter: jest.fn(async () => 7),
}));
jest.mock('../checkout/hooks/reconcile-completed-order', () => ({
	reconcileCompletedOrder: jest.fn(async () => {}),
}));
jest.mock('../checkout/provenance/provenance-gap', () => ({ reportProvenanceGap: jest.fn() }));
addRxPlugin(RxDBLocalDocumentsPlugin);
let ctx: SaleContext;
const log = jest.fn();
const resolveSession = jest.fn();
beforeEach(async () => {
	jest.clearAllMocks();
	resolveSession.mockResolvedValue({ registerId: 'register', sessionId: 'session' });
	ctx = {
		actionCtx: createActionContext({
			log,
			t: (key) => key,
			readCatalog: async () => null,
			readPaymentMethod: () => null,
			preventOverselling: false,
			priceDecimals: 2,
			resolveSession,
		}),
		actionActor: { userId: 7, registerId: 'register', sessionId: null },
		storeDB: await createRxDatabase({
			name: `boundary${Math.random().toString(36).slice(2)}`,
			storage: getRxStorageMemory(),
			localDocuments: true,
			multiInstance: false,
		}),
		userDB: {},
		siteUuid: 'site',
		storeId: 1,
		dp: 2,
		sessionsOn: true,
		localPatch: jest.fn(async ({ document, data, changes }) => {
			expect((await pendingCompletions(ctx.storeDB))[document.uuid].source).toBe('zero-balance');
			Object.assign(document.payload, changes ? changes(document.payload) : data);
			return document;
		}),
	} as unknown as SaleContext;
});
afterEach(async () => {
	await ctx.storeDB.remove();
});
function orderFor(total = '4') {
	return {
		uuid: 'boundary',
		payload: {
			status: 'pos-partial',
			total: '10',
			line_items: [{ total, subtotal: total }],
			meta_data: [
				{
					key: '_wcpos_payments',
					value: {
						schema: 1,
						payments: [{ id: 'leg', status: 'captured', amount: '5', refunded_amount: '1' }],
					},
				},
			],
		},
		getLatest() {
			return this;
		},
	} as EngineRecord<'orders'>;
}
it.each(['4', '3'])(
	'completes %s in one stamped write, journals first and audits in the same slot',
	async (total) => {
		const order = orderFor(total);
		const result = settleAggregate(snapshotFromOrderJSON(order.payload), config);
		await enqueueOrderMutation(order.uuid, async (queue) => {
			await commitAtBoundary(
				{
					...ctx,
					configForOrder: () => config,
					serverOwnsMoney: () => false,
					bindingStatus: 'bound',
					complete: async (target, slot) => {
						expect(slot).toBe(queue);
						await completeSale(
							ctx,
							target,
							{ source: 'zero-balance' },
							{ host: 'background' },
							slot
						);
					},
				},
				{ order, result, queue, write: (changes) => ctx.localPatch({ document: order, changes }) }
			);
		});
		expect(ctx.localPatch).toHaveBeenCalledTimes(1);
		expect(order.payload).toMatchObject({ status: 'completed', total });
		expect(order.payload.meta_data).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: '_wcpos_session', value: 'session' }),
				expect.objectContaining({ key: '_wcpos_sale_time', value: expect.any(String) }),
				expect.objectContaining({ key: '_wcpos_sale_counter', value: '7' }),
				expect.objectContaining({ key: '_wcpos_register', value: 'register' }),
			])
		);
		expect(await pendingCompletions(ctx.storeDB)).toEqual({});
		expect(log).toHaveBeenCalledWith(
			'info',
			expect.any(String),
			expect.objectContaining({
				context: expect.objectContaining({ type: 'checkout.completed' }),
			})
		);
		if (total === '3') {
			expect(derive(total, readLedger(order.payload.meta_data), [], { dp: 2 }).overpaid).toBe(
				'2.00'
			);
			expect(getLogger(['test']).warn).toHaveBeenCalledWith(
				'settlement.boundary-overpaid',
				expect.objectContaining({ context: { orderId: order.uuid, total: '3', netPaid: 4 } })
			);
		}
	}
);
it.each(['session', 'register'])(
	'a refused %s leaves money, status and journal untouched',
	async (gate) => {
		const order = orderFor();
		if (gate === 'session') resolveSession.mockRejectedValue(new RegisterSessionRequiredError());
		const complete = jest.fn();
		await enqueueOrderMutation(order.uuid, (queue) =>
			commitAtBoundary(
				{
					...ctx,
					configForOrder: () => config,
					serverOwnsMoney: () => false,
					bindingStatus: gate === 'register' ? 'choose' : 'bound',
					complete,
				},
				{
					order,
					result: settleAggregate(snapshotFromOrderJSON(order.payload), config),
					queue,
					write: (changes) => ctx.localPatch({ document: order, changes }),
				}
			)
		);
		expect(order.payload).toMatchObject({ total: '10', status: 'pos-partial' });
		expect(ctx.localPatch).not.toHaveBeenCalled();
		expect(complete).not.toHaveBeenCalled();
		expect(await pendingCompletions(ctx.storeDB)).toEqual({});
		expect(getLogger(['test']).warn).toHaveBeenCalledWith(
			'settlement.boundary-deferred',
			expect.objectContaining({
				context: expect.objectContaining({
					reason:
						gate === 'session'
							? 'pos_checkout.open_register_first'
							: 'pos_checkout.choose_register_first',
				}),
			})
		);
	}
);

it.each(['lines', 'status', 'ownership', 'refund'])(
	'supersedes a boundary when %s changes during guards',
	async (change) => {
		const order = orderFor();
		const result = settleAggregate(snapshotFromOrderJSON(order.payload), config);
		resolveSession.mockImplementationOnce(async () => {
			if (change === 'lines') order.payload.line_items = [{ total: '8', subtotal: '8' }];
			if (change === 'status') order.payload.status = 'completed';
			if (change === 'ownership')
				order.payload.meta_data!.push({ key: '_wcpos_money_owner', value: 'server' });
			if (change === 'refund')
				order.payload.meta_data = [
					{
						key: '_wcpos_payments',
						value: {
							schema: 1,
							payments: [{ id: 'leg', status: 'captured', amount: '5', refunded_amount: '5' }],
						},
					},
				];
			return { registerId: 'register', sessionId: 'session' };
		});
		const complete = jest.fn();
		const outcome = await enqueueOrderMutation(order.uuid, (queue) =>
			commitAtBoundary(
				{
					...ctx,
					configForOrder: () => config,
					serverOwnsMoney: () => false,
					bindingStatus: 'bound',
					complete,
				},
				{ order, result, queue, write: (changes) => ctx.localPatch({ document: order, changes }) }
			)
		);
		expect(outcome).toBe('superseded');
		expect(order.payload.total).toBe('10');
		expect(complete).not.toHaveBeenCalled();
		expect(await pendingCompletions(ctx.storeDB)).toEqual({});
		expect(getLogger(['test']).warn).toHaveBeenCalledWith(
			'settlement.boundary-superseded',
			expect.anything()
		);
	}
);

const dispatchSource = jest.fn();
registerActionHook(
	'checkout.tender.commit',
	async (_ctx, event, next) => {
		dispatchSource(event.source);
		return next(event);
	},
	{ id: 'test.boundary-source', tier: 'extension' }
);

it.each([undefined, 'system'] as const)(
	'dispatches boundary source %s (user by default)',
	async (source) => {
		const order = orderFor();
		await enqueueOrderMutation(order.uuid, (queue) =>
			commitAtBoundary(
				{
					...ctx,
					...{ source },
					bindingStatus: 'bound',
					configForOrder: () => config,
					serverOwnsMoney: () => false,
					complete: async () => {},
				},
				{
					order,
					queue,
					result: settleAggregate(snapshotFromOrderJSON(order.payload), config),
					write: (changes) => ctx.localPatch({ document: order, changes }),
				}
			)
		);
		expect(dispatchSource).toHaveBeenCalledWith(source ?? 'user');
		expect(order.payload.status).toBe('completed');
	}
);

it.each(['amount', 'status', 'refund'])(
	're-settles after a ledger %s change supersedes the guarded boundary',
	async (change) => {
		const order = orderFor();
		order.payload.meta_data = withLedger(
			order.payload.meta_data,
			readLedger(order.payload.meta_data).map((row) => ({ ...row, status: 'captured' }))
		);
		const openOrders$ = new BehaviorSubject([order]);
		resolveSession.mockImplementationOnce(async () => {
			const payment = readLedger(order.payload.meta_data)[0];
			order.payload.meta_data = [
				{
					key: '_wcpos_payments',
					value: {
						schema: 1,
						payments: [
							{
								...payment,
								...(change === 'amount'
									? { amount: '2' }
									: change === 'status'
										? { status: 'failed' }
										: { refunded_amount: '5' }),
							},
						],
					},
				},
			];
			openOrders$.next([order]);
			return { registerId: 'register', sessionId: 'session' };
		});
		const outcomes: unknown[] = [];
		const complete = jest.fn();
		const settle = jest.fn(async (_uuid, _record, _allowed, _coupons, queue) => {
			const result = settleAggregate(snapshotFromOrderJSON(order.payload), config);
			if (!outcomes.length)
				outcomes.push(
					await commitAtBoundary(
						{
							...ctx,
							bindingStatus: 'bound',
							configForOrder: () => config,
							serverOwnsMoney: () => false,
							complete,
						},
						{
							order,
							result,
							queue,
							write: (changes) => ctx.localPatch({ document: order, changes }),
						}
					)
				);
			else Object.assign(order.payload, settlementPatch(result));
		});
		const observe = jest.fn();
		const coordinator = createSettlementCoordinator({
			inputs$: of({ settings: { priceNumDecimals: 2 } } as CartConfigInputs),
			openOrders$,
			ratesReady$: of({ ready: true, generation: 0 }),
			references$: of({ ready: true, generation: '0' }),
			readCoupons: async () => ({
				coupons: new Map(),
				productCategories: new Map(),
				categoryParents: new Map(),
			}),
			serverOwnsMoney: () => false,
			orderSaveState: () => null,
			inCheckout: () => false,
			settle,
			now: Date.now,
			observe,
		});
		try {
			await enqueueOrderMutation(order.uuid, async () => {});
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(observe).not.toHaveBeenCalled();
			expect(outcomes).toEqual(['superseded']);
			expect(complete).not.toHaveBeenCalled();
			expect(settle).toHaveBeenCalledTimes(2);
			expect(order.payload).toMatchObject({ status: 'pos-partial', total: '4' });
		} finally {
			coordinator.stop();
		}
	}
);

it('presents a refused boundary to the cashier while retaining the cart edit', async () => {
	const order = orderFor('8');
	const data = { line_items: [{ total: '4', subtotal: '4' }] };
	resolveSession.mockRejectedValue(new RegisterSessionRequiredError());
	const outcome = await enqueueCartAction(
		order,
		(document, queue) =>
			settleCartWrite(
				{ document, data, queue },
				{
					configForOrder: () => config,
					serverOwnsMoney: () => false,
					localPatch: async ({ changes }) => {
						Object.assign(order.payload, changes(order.payload));
						return order;
					},
					commitAtBoundary: (target, result, slot) =>
						commitAtBoundary(
							{
								...ctx,
								bindingStatus: 'bound',
								configForOrder: () => config,
								serverOwnsMoney: () => false,
								complete: jest.fn(),
							},
							{
								order: target as EngineRecord<'orders'>,
								result,
								queue: slot,
								write: (changes) => ctx.localPatch({ document: order, changes }),
							}
						),
				}
			),
		{ ctx: ctx.actionCtx, context: {} }
	);
	expect(order.payload).toMatchObject({ ...data, total: '10', status: 'pos-partial' });
	expect(outcome).toBe(false);
	expect(log).toHaveBeenCalledWith(
		'warn',
		'pos_checkout.open_register_first',
		expect.objectContaining({ showToast: true })
	);
});

it('supersedes coupon completion when references change during the guard window', async () => {
	const order = orderFor();
	order.payload.coupon_lines = [{ code: 'summer' }];
	let generation = 0;
	const complete = jest.fn();
	resolveSession.mockImplementationOnce(async () => {
		generation++;
		return { registerId: 'register', sessionId: 'session' };
	});
	const outcome = await enqueueOrderMutation(order.uuid, (queue) =>
		commitAtBoundary(
			{
				...ctx,
				bindingStatus: 'bound',
				configForOrder: () => config,
				serverOwnsMoney: () => false,
				complete,
			},
			{
				order,
				queue,
				result: settleAggregate(snapshotFromOrderJSON(order.payload), config),
				allowed: () => generation === 0,
				coupons: {
					coupons: new Map([
						['summer', { code: 'summer', discount_type: 'fixed_cart', amount: '1' }],
					]),
					productCategories: new Map(),
					categoryParents: new Map(),
				},
				write: (changes) => ctx.localPatch({ document: order, changes }),
			}
		)
	);
	expect(outcome).toBe('superseded');
	expect(order.payload).toMatchObject({ total: '10', status: 'pos-partial' });
	expect(complete).not.toHaveBeenCalled();
	expect(await pendingCompletions(ctx.storeDB)).toEqual({});
});

it.each(['product', 'variation'] as const)(
	'supersedes when %s stock runs out during the guards',
	async (kind) => {
		const order = orderFor();
		order.payload.line_items![0] = {
			...order.payload.line_items![0],
			product_id: 1,
			variation_id: kind === 'variation' ? 2 : 0,
			quantity: 1,
		};
		let available = true;
		ctx.actionCtx = createActionContext({
			log,
			t: (key) => key,
			readPaymentMethod: () => null,
			preventOverselling: true,
			priceDecimals: 2,
			readCatalog: async (type) => ({
				manage_stock: true,
				stock_quantity: type === kind && !available ? 0 : 2,
				stock_status: type === kind && !available ? 'outofstock' : 'instock',
			}),
			resolveSession: async () => {
				available = false;
				return { registerId: 'register', sessionId: 'session' };
			},
		});
		const complete = jest.fn();
		const outcome = await enqueueOrderMutation(order.uuid, (queue) =>
			commitAtBoundary(
				{
					...ctx,
					bindingStatus: 'bound',
					configForOrder: () => config,
					serverOwnsMoney: () => false,
					complete,
				},
				{
					order,
					queue,
					result: settleAggregate(snapshotFromOrderJSON(order.payload), config),
					write: (changes) => ctx.localPatch({ document: order, changes }),
				}
			)
		);
		expect(outcome).toBe('superseded');
		expect(order.payload).toMatchObject({ total: '10', status: 'pos-partial' });
		expect(complete).not.toHaveBeenCalled();
		expect(getLogger(['test']).warn).toHaveBeenCalledWith(
			'settlement.boundary-superseded',
			expect.objectContaining({
				context: expect.objectContaining({ reason: 'pos_products.out_of_stock' }),
			})
		);
	}
);

it.each([false, true])(
	'allocates a sale counter only for a valid preflight (%s)',
	async (valid) => {
		const { nextSaleCounter } = jest.requireMock('@wcpos/query/register-session');
		const order = orderFor();
		const complete = jest.fn();
		await enqueueOrderMutation(order.uuid, (queue) =>
			commitAtBoundary(
				{
					...ctx,
					bindingStatus: 'bound',
					configForOrder: () => config,
					serverOwnsMoney: () => false,
					complete,
				},
				{
					order,
					queue,
					allowed: () => valid,
					result: settleAggregate(snapshotFromOrderJSON(order.payload), config),
					write: (changes) => ctx.localPatch({ document: order, changes }),
				}
			)
		);
		expect(nextSaleCounter).toHaveBeenCalledTimes(valid ? 1 : 0);
		expect(complete).toHaveBeenCalledTimes(valid ? 1 : 0);
	}
);

it.each(['none', 'choose'] as const)(
	'rechecks unresolved binding after guards: %s',
	async (resolved) => {
		const order = orderFor();
		let binding: 'none' | 'choose' = 'none';
		resolveSession.mockImplementationOnce(async () => {
			binding = resolved;
			return { registerId: 'register', sessionId: 'session' };
		});
		const complete = jest.fn();
		const outcome = await enqueueOrderMutation(order.uuid, (queue) =>
			commitAtBoundary(
				{
					...ctx,
					bindingStatus: 'none',
					...{ readBindingStatus: () => binding },
					configForOrder: () => config,
					serverOwnsMoney: () => false,
					complete,
				},
				{
					order,
					queue,
					result: settleAggregate(snapshotFromOrderJSON(order.payload), config),
					write: (changes) => ctx.localPatch({ document: order, changes }),
				}
			)
		);
		if (resolved === 'choose') {
			expect(outcome).toMatchObject({ deny: { reasonKey: 'pos_checkout.choose_register_first' } });
			expect(order.payload).toMatchObject({ total: '10', status: 'pos-partial' });
			expect(await pendingCompletions(ctx.storeDB)).toEqual({});
		} else expect(order.payload.status).toBe('completed');
		expect(complete).toHaveBeenCalledTimes(resolved === 'choose' ? 0 : 1);
	}
);

it.each(['cart-live', 'cart-offline', 'guard-live', 'guard-offline'])(
	'keeps in-flight authorizations out of completion (%s)',
	async (scenario) => {
		const order = orderFor('8');
		const offline = scenario.endsWith('offline');
		const [payment] = readLedger(order.payload.meta_data);
		const authorize = () => {
			order.payload.meta_data = withLedger(
				[],
				[{ ...payment, status: 'authorized', recorded_offline: offline }]
			);
		};
		const complete = jest.fn();
		const commit = (
			result: Parameters<typeof commitAtBoundary>[1]['result'],
			queue: Parameters<typeof commitAtBoundary>[1]['queue']
		) =>
			commitAtBoundary(
				{
					...ctx,
					bindingStatus: 'bound',
					configForOrder: () => config,
					serverOwnsMoney: () => false,
					complete,
				},
				{
					order,
					result,
					queue,
					write: (changes) => ctx.localPatch({ document: order, changes }),
				}
			);
		const data = { line_items: [{ total: '4', subtotal: '4' }] };
		if (scenario.startsWith('cart')) {
			authorize();
			const dispatch = jest.fn((_order, result, queue) => commit(result, queue));
			await enqueueOrderMutation(order.uuid, (queue) =>
				settleCartWrite(
					{ document: order, data, queue },
					{
						configForOrder: () => config,
						serverOwnsMoney: () => false,
						localPatch: async ({ changes }) => {
							Object.assign(order.payload, changes(order.payload));
							return order;
						},
						commitAtBoundary: dispatch,
					}
				)
			);
			expect(dispatch).toHaveBeenCalledTimes(offline ? 1 : 0);
		} else {
			Object.assign(order.payload, data);
			resolveSession.mockImplementationOnce(async () => {
				authorize();
				return { registerId: 'register', sessionId: 'session' };
			});
			const outcome = await enqueueOrderMutation(order.uuid, (queue) =>
				commit(settleAggregate(snapshotFromOrderJSON(order.payload), config), queue)
			);
			expect(outcome).toBe(offline ? undefined : 'superseded');
		}
		expect(order.payload).toMatchObject({
			...data,
			total: offline ? '4' : '10',
			status: offline ? 'completed' : 'pos-partial',
		});
		expect(complete).toHaveBeenCalledTimes(offline ? 1 : 0);
	}
);

import { BehaviorSubject, of, Subject } from 'rxjs';
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
import type { OrderPaymentSummary } from '@wcpos/order-math';
import type { EngineRecord, ReadonlyEngineRecord } from '@wcpos/query';
import { RegisterSessionRequiredError } from '@wcpos/query/register-session';
import { pendingCompletions } from '@wcpos/query/store-local';

import { config } from '../../../../../jest/cart-write';
import { createActionContext, registerActionHook } from '../../../../extensions/actions';
import { refreshOrderRecord } from '../checkout/hooks/reconcile-completed-order';
import { completeSale, type SaleContext } from '../checkout/sale-completion';
import { enqueueOrderMutation } from '../hooks/order-mutation-queue';
import { enqueueCartAction } from '../hooks/enqueue-cart-action';
import { settleCartWrite } from './settle-cart-write';
import { commitAtBoundary } from './boundary-commit';
import { createSettlementCoordinator } from './settlement-coordinator';

import type { CartConfigInputs } from './cart-config-for-order';
import type { CloseOutcome } from './close-sale';
import type { PayloadChanges } from '../../hooks/mutations/use-local-mutation';

jest.mock('@wcpos/query/register-session', () => ({
	...jest.requireActual('@wcpos/query/register-session'),
	requireOpenSession: async () => 'session',
	findOpenSession: jest.fn(async () => ({ getLatest: () => mockSession })),
	readRegister: async () => ({ sites: { site: { register_id: 'register' } } }),
	nextSaleCounter: jest.fn(async () => 7),
}));
jest.mock('../checkout/hooks/reconcile-completed-order', () => ({
	reconcileCompletedOrder: jest.fn(async () => {}),
	refreshOrderRecord: jest.fn(async () => 'refreshed'),
}));
jest.mock('../checkout/provenance/provenance-gap', () => ({ reportProvenanceGap: jest.fn() }));
addRxPlugin(RxDBLocalDocumentsPlugin);
let ctx: SaleContext & { closeSale: typeof closeSale };
// The server completes a covered sale through close (ADR 0040 D2); its mirror lands the status.
const closeSale = {
	online: jest.fn(() => true),
	close: jest.fn(async (target: ReadonlyEngineRecord<'orders'>): Promise<CloseOutcome> => {
		Object.assign(target.getLatest().payload, { status: 'completed' });
		return { kind: 'answered' as const, order: { status: 'completed' } as OrderPaymentSummary };
	}),
};
const write = jest.fn(
	async ({
		document,
		data,
		changes,
	}: {
		document: EngineRecord<'orders'>;
		data?: object;
		changes?: PayloadChanges;
	}) => {
		expect((await pendingCompletions(ctx.storeDB))[document.uuid].source).toBe('zero-balance');
		Object.assign(document.payload, changes ? changes(document.payload) : data);
		return document;
	}
);
const log = jest.fn();
const resolveSession = jest.fn();
let mockSession = {
	id: 'session',
	register_id: 'register',
	status: 'open',
	sync_status: 'synced',
	deleted: false,
};
const catalog = new Subject();
beforeEach(async () => {
	jest.clearAllMocks();
	mockSession = {
		id: 'session',
		register_id: 'register',
		status: 'open',
		sync_status: 'synced',
		deleted: false,
	};
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
		closeSale,
	} as unknown as typeof ctx;
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
					complete: async (target, outcome, slot) => {
						expect(slot).toBe(queue);
						expect(outcome).toEqual({ source: 'zero-balance', order: { status: 'completed' } });
						return completeSale(ctx, target, outcome, { host: 'background' }, slot);
					},
				},
				{ order, result, queue, write: (changes) => write({ document: order, changes }) }
			);
		});
		expect(write).toHaveBeenCalledTimes(1);
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
// The answered close lands through the answer table; each pins today's boundary behaviour.
describe('an answered close', () => {
	const run = (order: EngineRecord<'orders'>) =>
		enqueueOrderMutation(order.uuid, (queue) =>
			commitAtBoundary(
				{
					...ctx,
					configForOrder: () => config,
					serverOwnsMoney: () => false,
					bindingStatus: 'bound',
					complete: (target, outcome, slot) =>
						completeSale(ctx, target, outcome, { host: 'background' }, slot),
				},
				{
					order,
					result: settleAggregate(snapshotFromOrderJSON(order.payload), config),
					queue,
					write: (changes) => write({ document: order, changes }),
				}
			)
		);
	const answeredWithoutMirror = () =>
		closeSale.close.mockImplementationOnce(async () => ({
			kind: 'answered' as const,
			order: { status: 'completed' } as OrderPaymentSummary,
		}));
	const rows = (name: string) =>
		[jest.mocked(getLogger(['test']).debug), jest.mocked(getLogger(['test']).warn)]
			.flatMap((fn) => fn.mock.calls)
			.filter(([message]) => message === name);

	it('an answered close on a sale reopened elsewhere resolves the attempt and returns nothing', async () => {
		const order = orderFor();
		Object.assign(order.payload, { id: 42 });
		answeredWithoutMirror();
		jest.mocked(refreshOrderRecord).mockResolvedValueOnce('refreshed');
		expect(await run(order)).toBeUndefined();
		expect(order.payload.status).toBe('pos-partial');
		expect(await pendingCompletions(ctx.storeDB)).toEqual({});
		expect(rows('settlement.boundary-not-closed')).toEqual([]);
		expect(rows('settlement.boundary-superseded')).toEqual([]);
	});

	it('an answered close no refresh confirmed awaits adoption', async () => {
		const order = orderFor();
		Object.assign(order.payload, { id: 42 });
		answeredWithoutMirror();
		jest.mocked(refreshOrderRecord).mockResolvedValueOnce('timed-out');
		expect(await run(order)).toBeUndefined();
		expect((await pendingCompletions(ctx.storeDB))[order.uuid]).toMatchObject({
			awaitingAdoption: true,
		});
	});

	it('a close the store answers outstanding logs the not-closed row and keeps the attempt', async () => {
		const order = orderFor();
		closeSale.close.mockImplementationOnce(async () => ({ kind: 'outstanding', order: null }));
		expect(await run(order)).toEqual({ kind: 'outstanding', order: null });
		expect(getLogger(['test']).debug).toHaveBeenCalledWith('settlement.boundary-not-closed', {
			context: { orderId: order.uuid, outcome: 'outstanding' },
		});
		expect((await pendingCompletions(ctx.storeDB))[order.uuid]).toBeDefined();
	});
});

// ADR 0040 PR A: a system pass offline sends nothing; its completion attempt is resolved, and
// the offline outcome is what the coordinator retries on reconnect.
it('an offline boundary returns offline and leaves no completion attempt behind', async () => {
	const order = orderFor();
	closeSale.online.mockReturnValueOnce(false);
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
			{
				order,
				result: settleAggregate(snapshotFromOrderJSON(order.payload), config),
				queue,
				write: (changes) => write({ document: order, changes }),
			}
		)
	);
	expect(outcome).toEqual({ kind: 'offline' });
	expect(closeSale.close).not.toHaveBeenCalled();
	expect(complete).not.toHaveBeenCalled();
	expect(await pendingCompletions(ctx.storeDB)).toEqual({});
});

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
					write: (changes) => write({ document: order, changes }),
				}
			)
		);
		expect(order.payload).toMatchObject({ total: '10', status: 'pos-partial' });
		expect(write).not.toHaveBeenCalled();
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
				order.payload.meta_data!.push({ key: '_wcpos_money_owner_hint', value: 'server' });
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
				{ order, result, queue, write: (changes) => write({ document: order, changes }) }
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
					complete: async () => 'completed' as const,
				},
				{
					order,
					queue,
					result: settleAggregate(snapshotFromOrderJSON(order.payload), config),
					write: (changes) => write({ document: order, changes }),
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
							write: (changes) => write({ document: order, changes }),
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
								write: (changes) => write({ document: order, changes }),
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
				write: (changes) => write({ document: order, changes }),
			}
		)
	);
	expect(outcome).toBe('superseded');
	expect(order.payload).toMatchObject({ total: '10', status: 'pos-partial' });
	expect(complete).not.toHaveBeenCalled();
	expect(await pendingCompletions(ctx.storeDB)).toEqual({});
});

it.each(['product', 'variation', 'read-once', 'read-twice'] as const)(
	'supersedes when %s stock runs out during the guards or snapshot read',
	async (scenario) => {
		const kind = scenario === 'variation' ? 'variation' : 'product';
		let guarded = false;
		let readsAfterGuard = 0;
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
			readCatalog: async (type) => {
				const snapshot = {
					manage_stock: true,
					stock_quantity: type === kind && !available ? 0 : 2,
					stock_status: type === kind && !available ? 'outofstock' : 'instock',
				};
				if (
					guarded &&
					++readsAfterGuard >= 2 &&
					scenario.startsWith('read') &&
					(available || scenario === 'read-twice')
				) {
					available = false;
					catalog.next({}); // The pending read still returns its pre-change snapshot.
				}
				return snapshot;
			},
			resolveSession: async () => {
				guarded = true;
				available = scenario.startsWith('read');
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
					write: (changes) => write({ document: order, changes }),
				}
			)
		);
		const reason = scenario === 'read-twice' ? 'catalog_changed' : 'pos_products.out_of_stock';
		expect(outcome).toEqual({ superseded: true, reason });
		expect(order.payload).toMatchObject({ total: '10', status: 'pos-partial' });
		expect(complete).not.toHaveBeenCalled();
		expect(getLogger(['test']).warn).toHaveBeenCalledWith(
			'settlement.boundary-superseded',
			expect.objectContaining({
				context: expect.objectContaining({ reason }),
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
					write: (changes) => write({ document: order, changes }),
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
					write: (changes) => write({ document: order, changes }),
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

// ADR 0040 D6: an authorization, recorded offline or not, is a hold and never paid.
it.each(['cart-live', 'cart-offline', 'guard-live', 'guard-offline'])(
	'keeps authorizations out of completion (%s)',
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
					write: (changes) => write({ document: order, changes }),
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
			expect(dispatch).not.toHaveBeenCalled();
		} else {
			Object.assign(order.payload, data);
			resolveSession.mockImplementationOnce(async () => {
				authorize();
				return { registerId: 'register', sessionId: 'session' };
			});
			const outcome = await enqueueOrderMutation(order.uuid, (queue) =>
				commit(settleAggregate(snapshotFromOrderJSON(order.payload), config), queue)
			);
			expect(outcome).toBe('superseded');
		}
		expect(order.payload).toMatchObject({
			...data,
			// An offline authorization is not in flight, so the cart write still reprices; the
			// boundary commit itself is superseded and writes nothing.
			total: scenario === 'cart-offline' ? '4' : '10',
			status: 'pos-partial',
		});
		expect(complete).not.toHaveBeenCalled();
	}
);

it.each(['stock', 'predicate', 'unchanged'])(
	'fences completion after provenance allocation (%s)',
	async (change) => {
		const order = orderFor();
		order.payload.line_items![0].product_id = 1;
		order.payload.line_items![0].quantity = 1;
		let available = true;
		let allowed = true;
		ctx.actionCtx = createActionContext({
			log,
			t: (key) => key,
			readPaymentMethod: () => null,
			preventOverselling: true,
			priceDecimals: 2,
			resolveSession,
			readCatalog: async () => ({
				manage_stock: true,
				stock_quantity: available ? 2 : 0,
				stock_status: available ? 'instock' : 'outofstock',
			}),
		});
		const { nextSaleCounter } = jest.requireMock('@wcpos/query/register-session');
		nextSaleCounter.mockImplementationOnce(async () => {
			available = change !== 'stock';
			allowed = change !== 'predicate';
			return 7;
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
					allowed: () => allowed,
					result: settleAggregate(snapshotFromOrderJSON(order.payload), config),
					write: (changes) => write({ document: order, changes }),
				}
			)
		);
		expect(order.payload).toMatchObject(
			change === 'unchanged'
				? { status: 'completed', total: '4' }
				: { status: 'pos-partial', total: '10' }
		);
		expect(complete).toHaveBeenCalledTimes(change === 'unchanged' ? 1 : 0);
		if (change === 'stock')
			expect(outcome).toEqual({ superseded: true, reason: 'pos_products.out_of_stock' });
		// No counter-release API exists and the resident resolver cannot await allocation.
		expect(nextSaleCounter).toHaveBeenCalledTimes(1);
	}
);

it('completes a refunded partial sale through the coordinator using net paid', async () => {
	const order = orderFor();
	order.payload.meta_data = withLedger(
		[],
		[{ ...readLedger(order.payload.meta_data)[0], amount: '10', refunded_amount: '6' }]
	);
	const complete = jest.fn();
	const coordinator = createSettlementCoordinator({
		inputs$: of({ settings: { priceNumDecimals: 2 } } as CartConfigInputs),
		openOrders$: of([order]),
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
		now: Date.now,
		observe: jest.fn(),
		settle: (_uuid, _record, allowed, _coupons, queue) =>
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
					allowed,
					result: settleAggregate(snapshotFromOrderJSON(order.payload), config),
					write: (changes) => write({ document: order, changes }),
				}
			),
	});
	try {
		await enqueueOrderMutation(order.uuid, async () => {});
		expect(order.payload).toMatchObject({ status: 'completed', total: '4' });
		expect(complete).toHaveBeenCalledTimes(1);
	} finally {
		coordinator.stop();
	}
});

it.each([
	'catalog',
	'checkout',
	'coupon-checkout',
	'checkout-exit',
	'checkout-return',
	'coupon-checkout-return',
])(
	'fences a %s change during resident resolution and completes covered partials after checkout exits',
	async (change) => {
		const order = orderFor();
		const before = order.payload.meta_data;
		const complete = jest.fn();
		let checkout = false;
		const openOrders$ = new BehaviorSubject([order]);
		if (change.startsWith('coupon-checkout')) order.payload.coupon_lines = [{ code: 'sale' }];
		if (change === 'checkout-exit')
			resolveSession.mockImplementationOnce(async () => {
				checkout = true;
				return { registerId: 'register', sessionId: 'session' };
			});
		const outcomes: unknown[] = [];
		const coordinator = createSettlementCoordinator({
			inputs$: of({ settings: { priceNumDecimals: 2 } } as CartConfigInputs),
			openOrders$,
			ratesReady$: of({ ready: true, generation: 0 }),
			references$: of({ ready: true, generation: '0' }),
			readCoupons: async () => ({
				coupons: new Map([['sale', { code: 'sale', discount_type: 'fixed_cart', amount: '0' }]]),
				productCategories: new Map(),
				categoryParents: new Map(),
			}),
			serverOwnsMoney: () => false,
			orderSaveState: () => null,
			inCheckout: () => checkout,
			now: Date.now,
			observe: jest.fn(),
			settle: async (_uuid, _record, allowed, coupons, queue) => {
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
							queue,
							allowed,
							coupons,
							result: settleAggregate(snapshotFromOrderJSON(order.payload), config),
							write: async (changes) => {
								await Promise.resolve(); // applyLocalPatch awaits resolveEngineResident before the modifier.
								if (change === 'catalog') catalog.next({});
								else if (!outcomes.length) {
									checkout = change !== 'checkout-exit';
									openOrders$.next([order]);
								}
								return write({ document: order, changes });
							},
						}
					)
				);
			},
		});
		try {
			await new Promise((resolve) => setTimeout(resolve, 20));
			expect(outcomes).toEqual([
				{ superseded: true, reason: change === 'catalog' ? 'catalog_changed' : 'in_checkout' },
			]);
			expect(order.payload).toMatchObject({
				status: 'pos-partial',
				total: change === 'catalog' ? '10' : '4',
			});
			expect(order.payload.meta_data).toEqual(before);
			expect(complete).not.toHaveBeenCalled();
			expect(await pendingCompletions(ctx.storeDB)).toEqual({});
			if (change.endsWith('checkout-return')) {
				checkout = false;
				openOrders$.next([order]); // The provider forwards checkout-mode emissions here.
				await new Promise((resolve) => setTimeout(resolve, 20));
				expect(order.payload).toMatchObject({ status: 'completed', total: '4' });
				expect(complete).toHaveBeenCalledTimes(1);
				openOrders$.next([order]);
				await new Promise((resolve) => setTimeout(resolve, 20));
				expect(complete).toHaveBeenCalledTimes(1);
			}
		} finally {
			coordinator.stop();
		}
	}
);

// Mutating either identity after the last async check must not stamp a completed sale.
it.each(['register_changed', 'session_changed', 'session_replaced', 'unchanged'])(
	'fences guarded provenance at the resident modifier: %s',
	async (change) => {
		const order = orderFor();
		let registerId = 'register';
		const complete = jest.fn();
		const outcome = await enqueueOrderMutation(order.uuid, (queue) =>
			commitAtBoundary(
				{
					...ctx,
					bindingStatus: 'bound',
					readBindingStatus: () => 'bound',
					...{ readRegisterId: () => registerId },
					configForOrder: () => config,
					serverOwnsMoney: () => false,
					complete,
				},
				{
					order,
					queue,
					result: settleAggregate(snapshotFromOrderJSON(order.payload), config),
					write: async (changes) => {
						if (change === 'register_changed') registerId = 'other';
						if (change === 'session_changed') mockSession.status = 'closed';
						if (change === 'session_replaced') mockSession.id = 'replacement';
						return write({ document: order, changes });
					},
				}
			)
		);
		const unchanged = change === 'unchanged';
		expect(outcome).toEqual(
			unchanged
				? undefined
				: {
						superseded: true,
						reason: change === 'register_changed' ? change : 'session_changed',
					}
		);
		expect(order.payload).toMatchObject({
			status: unchanged ? 'completed' : 'pos-partial',
			total: unchanged ? '4' : '10',
		});
		expect(complete).toHaveBeenCalledTimes(unchanged ? 1 : 0);
	}
);

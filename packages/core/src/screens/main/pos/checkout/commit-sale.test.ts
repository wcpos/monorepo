import { withLedger } from '@wcpos/order-math';
import type { EngineRecord } from '@wcpos/query';
import { RegisterSessionRequiredError } from '@wcpos/query/register-session';

import {
	createActionContext,
	resetActionHookStrikes,
	TENDER_COMMIT_EVENT,
	TENDER_GUARD_IDS,
} from '../../../../extensions/actions';
import {
	enqueueOrderMutation,
	type OrderMutationContext,
	resetOrderMutationQueues,
} from '../hooks/order-mutation-queue';
import {
	commitSale,
	type SaleAmounts,
	type SaleCommitContext,
	type SaleCommitRequest,
	type StampedSale,
	stampSale,
} from './commit-sale';
import { row } from './payments/device/fixtures.test-utils';

const resolveSession = jest.fn();
const readCatalog = jest.fn();
const patchSession = jest.fn();
let openSession: { id: string; incrementalPatch: typeof patchSession } | null;
let payload: EngineRecord<'orders'>['payload'];
const order = { uuid: 'order', getLatest: () => ({ payload }) } as EngineRecord<'orders'>;
const ctx: SaleCommitContext = {
	actionCtx: createActionContext({
		log: jest.fn(),
		t: (key) => key,
		readCatalog,
		readPaymentMethod: () => null,
		preventOverselling: true,
		priceDecimals: 2,
		resolveSession,
	}),
	actionActor: { userId: 7, registerId: 'register', sessionId: null },
	storeDB: {
		collections: { register_sessions: { findOne: () => ({ exec: async () => openSession }) } },
	} as unknown as SaleCommitContext['storeDB'],
	sessionsOn: true,
	dp: 2,
};
const request: SaleCommitRequest = {
	order,
	methodId: 'cash',
	bindingStatus: 'bound',
	amounts: { kind: 'whole-balance' },
};
const write = jest.fn(async (sale: StampedSale, queue: OrderMutationContext) => ({ sale, queue }));

beforeEach(() => {
	jest.clearAllMocks();
	resetOrderMutationQueues();
	resetActionHookStrikes();
	payload = {
		id: 42,
		total: '10.00',
		meta_data: withLedger([], [{ ...row, amount: '4.00', status: 'captured' }]),
	};
	openSession = { id: 'session', incrementalPatch: patchSession };
	resolveSession.mockResolvedValue({ registerId: 'register', sessionId: 'session' });
	readCatalog.mockResolvedValue({ manage_stock: true, stock_quantity: 1, backorders: 'no' });
});

it('refuses order_changed_retry before any gate when the slot balance moved', async () => {
	const outcome = await commitSale(
		ctx,
		{
			...request,
			amounts: {
				kind: 'entry',
				expectedBalanceMinor: 1000,
				amountMinor: 1000,
				tenderedMinor: 1000,
				captureMode: 'manual',
				reachable: true,
			},
		},
		write
	);
	expect(outcome).toEqual({
		deny: {
			reasonKey: 'pos_checkout.order_changed_retry',
			detail: { balanceMinor: 1000, latestBalanceMinor: 600 },
		},
	});
	expect(resolveSession).not.toHaveBeenCalled();
	expect(patchSession).not.toHaveBeenCalled();
	expect(write).not.toHaveBeenCalled();
});

it('whole-balance dispatches the slot balance as every amount, completing, mode gateway', async () => {
	await commitSale(ctx, request, write);
	expect(write).toHaveBeenCalledWith(
		{
			methodId: 'cash',
			mode: 'gateway',
			amountMinor: 600,
			tenderedMinor: 600,
			balanceMinor: 600,
			roundingMinor: 0,
			completing: true,
			remainingMinor: 0,
			lane: null,
			bindingStatus: 'bound',
			registerId: 'register',
			sessionId: 'session',
			conditions: { unmet: [] },
		},
		expect.objectContaining({ dispatchToken: expect.any(Object) })
	);
});

it.each([0, 3])('uses the caller decimal count (%s) for the slot balance', async (dp) => {
	await commitSale({ ...ctx, dp }, request, write);
	expect(write.mock.calls[0][0].balanceMinor).toBe(dp === 0 ? 6 : 6000);
});

it('an entry at a zero slot balance dispatches mode zero-balance', async () => {
	payload.total = '4.00';
	await commitSale(
		ctx,
		{
			...request,
			amounts: {
				kind: 'entry',
				expectedBalanceMinor: 0,
				amountMinor: 0,
				tenderedMinor: 0,
				captureMode: 'manual',
				reachable: true,
			},
		},
		write
	);
	expect(write.mock.calls[0][0]).toMatchObject({
		mode: 'zero-balance',
		completing: true,
		balanceMinor: 0,
	});
});

it('a whole-balance commit of a fully paid order stays mode gateway', async () => {
	payload.total = '4.00';
	await commitSale(ctx, { ...request, amounts: { kind: 'whole-balance' } }, write);
	expect(write.mock.calls[0][0]).toMatchObject({
		mode: 'gateway',
		completing: true,
		balanceMinor: 0,
	});
});

it('a partial entry preserves the capture mode and tendered amount', async () => {
	await commitSale(
		ctx,
		{
			...request,
			amounts: {
				kind: 'entry',
				expectedBalanceMinor: 600,
				amountMinor: 200,
				tenderedMinor: 500,
				captureMode: 'device',
				reachable: true,
			},
		},
		write
	);
	expect(write.mock.calls[0][0]).toMatchObject({
		mode: 'device',
		amountMinor: 200,
		tenderedMinor: 500,
		balanceMinor: 600,
		completing: false,
	});
});

it('counts conditions on the record a write queued ahead left on the slot', async () => {
	const savedPayload = {
		...payload,
		line_items: [{ product_id: 5, quantity: 2, name: 'Belt', meta_data: [] }],
	};
	const edit = enqueueOrderMutation(order.uuid, async (queue) => {
		queue.order = {
			uuid: order.uuid,
			getLatest: () => ({ payload: savedPayload }),
		} as unknown as typeof order;
	});
	const outcome = commitSale(ctx, request, write);
	await edit;
	await expect(outcome).resolves.toMatchObject({
		deny: {
			reasonKey: 'pos_cart.only_n_available',
			params: { quantity: 1, name: 'Belt' },
		},
	});
	expect(write).not.toHaveBeenCalled();
	expect(patchSession).not.toHaveBeenCalled();
});

it('the write callback receives the queue whose order a write queued ahead left', async () => {
	const saved = {
		uuid: order.uuid,
		getLatest: () => ({
			payload: {
				...payload,
				line_items: [{ product_id: 5, quantity: 1, name: 'Belt', meta_data: [] }],
			},
		}),
	} as unknown as typeof order;
	const edit = enqueueOrderMutation(order.uuid, async (queue) => {
		queue.order = saved;
	});
	const outcome = commitSale(ctx, request, write);
	await edit;
	await outcome;
	expect(write.mock.calls[0][1].order).toBe(saved);
});

it('a guard refusal is returned and the write never runs', async () => {
	await expect(
		commitSale(ctx, { ...request, bindingStatus: 'choose' }, write)
	).resolves.toMatchObject({
		deny: { reasonKey: 'pos_checkout.choose_register_first' },
	});
	expect(write).not.toHaveBeenCalled();
	expect(patchSession).not.toHaveBeenCalled();
});

it('the write receives the gate-stamped ids without patching the session', async () => {
	const written = await commitSale(ctx, request, async (sale) => {
		expect(patchSession).not.toHaveBeenCalled();
		return { registerId: sale.registerId, sessionId: sale.sessionId };
	});
	expect(written).toEqual({ registerId: 'register', sessionId: 'session' });
});

it.each(['closed', 'replaced'])(
	'a session %s between gate and write throws with no write',
	async (change) => {
		resolveSession.mockImplementationOnce(async () => {
			openSession =
				change === 'closed' ? null : { id: 'session-B', incrementalPatch: patchSession };
			return { registerId: 'register', sessionId: 'session' };
		});
		await expect(commitSale(ctx, request, write)).rejects.toBeInstanceOf(
			RegisterSessionRequiredError
		);
		expect(write).not.toHaveBeenCalled();
	}
);

it('sessions off passes the nullable stamped ids without a session write', async () => {
	resolveSession.mockResolvedValueOnce({ registerId: null, sessionId: null });
	await commitSale({ ...ctx, sessionsOn: false }, request, write);
	expect(write.mock.calls[0][0]).toMatchObject({ registerId: null, sessionId: null });
	expect(patchSession).not.toHaveBeenCalled();
});

it('rethrows the write error untouched for caller mirror-error recovery', async () => {
	const error = new Error('mirror failed');
	await expect(
		commitSale(ctx, request, async () => {
			throw error;
		})
	).rejects.toBe(error);
});

it('a dispatch waits for an edit queued ahead', async () => {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const edit = enqueueOrderMutation(order.uuid, async () => {
		await gate;
		payload.total = '12.00';
	});
	const outcome = commitSale(ctx, request, write);
	await Promise.resolve();
	expect(write).not.toHaveBeenCalled();
	expect(resolveSession).not.toHaveBeenCalled();
	release();
	await edit;
	await outcome;
	expect(write.mock.calls[0][0].balanceMinor).toBe(800);
});

it('importing only commit-sale registers every tender guard, without cash rounding', async () => {
	await jest.isolateModulesAsync(async () => {
		const { commitSale: isolatedCommit } = await import('./commit-sale');
		const { getActionHooks } = await import('../../../../extensions/actions');
		expect(getActionHooks(TENDER_COMMIT_EVENT).map(({ id }) => id)).toEqual(TENDER_GUARD_IDS);
		await isolatedCommit(ctx, request, write);
		expect(write).toHaveBeenCalledTimes(1);
	});
});

it('a missing tender guard refuses actions.guard_missing', async () => {
	await jest.isolateModulesAsync(async () => {
		const { commitSale: isolatedCommit } = await import('./commit-sale');
		const { resetActionRegistry } = await import('../../../../extensions/actions');
		resetActionRegistry();
		await expect(isolatedCommit(ctx, request, write)).resolves.toMatchObject({
			deny: { reasonKey: 'actions.guard_missing' },
		});
		expect(write).not.toHaveBeenCalled();
	});
});

it('reuses a held slot for a retained-captures completion without taking another tender', async () => {
	await enqueueOrderMutation(order.uuid, async (queue) => {
		const result = await commitSale(
			ctx,
			{ ...request, methodId: null, amounts: { kind: 'retained-captures' } },
			write,
			{ queue }
		);
		expect(result).toMatchObject({ queue });
		expect(write.mock.calls[0][1]).toBe(queue);
		expect(write.mock.calls[0][0]).toMatchObject({
			mode: 'zero-balance',
			completing: true,
			amountMinor: 0,
			tenderedMinor: 0,
			balanceMinor: 0,
		});
	});
}, 1000);

describe('stampSale', () => {
	const chained: Parameters<typeof stampSale>[0] = {
		methodId: 'cash',
		mode: 'manual',
		amountMinor: 1000,
		tenderedMinor: 1000,
		balanceMinor: 1000,
		roundingMinor: 0,
		bindingStatus: 'bound',
		registerId: null,
		sessionId: null,
		conditions: { unmet: [] },
	};
	const entry = (reachable: boolean): SaleAmounts => ({
		kind: 'entry',
		expectedBalanceMinor: 1000,
		amountMinor: 998,
		tenderedMinor: 1000,
		captureMode: 'manual',
		reachable,
	});
	it.each([
		[
			'a leg cash rounding moved onto the balance completes',
			{ amountMinor: 1000, balanceMinor: 1000, roundingMinor: 2 },
			entry(true),
			42,
			{ completing: true, remainingMinor: 0, lane: 'online' },
		],
		[
			'a short split leg leaves the remainder',
			{ amountMinor: 400 },
			entry(true),
			42,
			{ completing: false, remainingMinor: 600, lane: 'online' },
		],
		['a queued save settles later', {}, entry(false), 42, { lane: 'settles-later' }],
		['no server id is not on the store', {}, entry(true), null, { lane: 'not-on-store' }],
		['server id 0 is not on the store', {}, entry(false), 0, { lane: 'not-on-store' }],
		[
			'a whole-balance commit has no press lane',
			{},
			{ kind: 'whole-balance' } as const,
			42,
			{ completing: true, remainingMinor: 0, lane: null },
		],
	])('%s', (_name, changes, amounts, serverId, expected) => {
		expect(stampSale({ ...chained, ...changes }, amounts, serverId)).toMatchObject({
			...chained,
			...changes,
			...expected,
		});
	});
});

it('the writer receives the lane from the order as the slot reads it', async () => {
	payload = { ...payload, id: undefined };
	const saved = {
		uuid: order.uuid,
		getLatest: () => ({ payload: { ...payload, id: 42 } }),
	} as unknown as typeof order;
	const edit = enqueueOrderMutation(order.uuid, async (queue) => {
		queue.order = saved;
	});
	const amounts: SaleAmounts = {
		kind: 'entry',
		expectedBalanceMinor: 600,
		amountMinor: 200,
		tenderedMinor: 200,
		captureMode: 'manual',
		reachable: true,
	};
	const outcome = commitSale(ctx, { ...request, amounts }, write);
	await edit;
	await outcome;
	expect(write.mock.calls[0][0]).toMatchObject({ lane: 'online', remainingMinor: 400 });
});

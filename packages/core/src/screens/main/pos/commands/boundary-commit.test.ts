import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { derive, readLedger, settleAggregate, snapshotFromOrderJSON } from '@wcpos/order-math';
import { getLogger } from '@wcpos/utils/logger';
import type { EngineRecord } from '@wcpos/query';

import { config } from '../../../../../jest/cart-write';
import { createActionContext } from '../../../../extensions/actions';
import { RegisterSessionRequiredError } from '../../../../services/register-session/session-store';
import { pendingCompletions } from '../checkout/completion-journal';
import { completeSale, type SaleContext } from '../checkout/sale-completion';
import { enqueueOrderMutation } from '../hooks/order-mutation-queue';
import { commitAtBoundary } from './boundary-commit';

jest.mock('../../../../services/register/register-document', () => ({
	readRegister: async () => ({ sites: { site: { register_id: 'register' } } }),
	nextSaleCounter: async () => 7,
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
		sessions: { findOne: () => ({ exec: async () => ({ id: 'session' }) }) },
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
						payments: [{ id: 'leg', status: 'authorized', amount: '5', refunded_amount: '1' }],
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

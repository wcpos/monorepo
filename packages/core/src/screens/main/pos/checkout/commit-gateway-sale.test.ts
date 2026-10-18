import { withLedger } from '@wcpos/order-math';
import { RegisterSessionRequiredError } from '@wcpos/query/register-session';

import { createActionContext, resetActionHookStrikes } from '../../../../extensions/actions';
import { commitGatewaySale } from './commit-gateway-sale';
import { row } from './payments/device/fixtures.test-utils';
import { persistSaleProvenance, recordSaleAttempt } from './sale-completion';

import type { SaleContext } from './sale-completion';

const mockRequireOpenSession = jest.fn();
jest.mock('@wcpos/query/register-session', () => ({
	...jest.requireActual('@wcpos/query/register-session'),
	requireOpenSession: (...args: unknown[]) => mockRequireOpenSession(...args),
}));
jest.mock('./sale-completion', () => ({
	persistSaleProvenance: jest.fn(async () => undefined),
	recordSaleAttempt: jest.fn(async () => undefined),
}));

const resolveSession = jest.fn();
const log = jest.fn();
// 10.00 owed, 4.00 already captured: the gateway tender is the 6.00 outstanding.
const payload = {
	id: 42,
	total: '10.00',
	meta_data: withLedger([], [{ ...row, amount: '4.00', status: 'captured' }]),
};
const order = { uuid: 'order', getLatest: () => ({ payload }) } as never;
const ctx = {
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
	storeDB: {},
	sessionsOn: true,
	dp: 2,
} as unknown as SaleContext;
const input = {
	order,
	source: 'gateway-contract' as const,
	methodId: 'stripe',
	settledOrderStatus: 'pending',
	bindingStatus: 'bound' as const,
	online: true,
};

beforeEach(() => {
	jest.clearAllMocks();
	resetActionHookStrikes();
	resolveSession.mockResolvedValue({ registerId: 'register', sessionId: 'session' });
	mockRequireOpenSession.mockResolvedValue('session');
});

it('journals and stamps the provenance on the gate-approved session, then returns the ids', async () => {
	await expect(commitGatewaySale(ctx, input)).resolves.toEqual({
		registerId: 'register',
		sessionId: 'session',
	});
	expect(mockRequireOpenSession).toHaveBeenCalledWith({}, 'register', true);
	expect(recordSaleAttempt).toHaveBeenCalledWith(ctx, {
		order,
		completing: true,
		source: 'gateway-contract',
		settledOrderStatus: 'pending',
		settledOrderGateway: 'stripe',
	});
	expect(persistSaleProvenance).toHaveBeenCalledWith(ctx, {
		order,
		source: 'gateway-contract',
		sessionId: 'session',
		online: true,
	});
	expect(jest.mocked(recordSaleAttempt).mock.invocationCallOrder[0]).toBeLessThan(
		jest.mocked(persistSaleProvenance).mock.invocationCallOrder[0]
	);
});
it('a store with registers to choose from refuses before any write', async () => {
	const outcome = await commitGatewaySale(ctx, { ...input, bindingStatus: 'choose' });
	expect(outcome).toMatchObject({ deny: { reasonKey: 'pos_checkout.choose_register_first' } });
	expect(mockRequireOpenSession).not.toHaveBeenCalled();
	expect(recordSaleAttempt).not.toHaveBeenCalled();
	expect(persistSaleProvenance).not.toHaveBeenCalled();
});
it('no open session refuses before any write', async () => {
	resolveSession.mockRejectedValueOnce(new RegisterSessionRequiredError());
	const outcome = await commitGatewaySale(ctx, input);
	expect(outcome).toMatchObject({ deny: { reasonKey: 'pos_checkout.open_register_first' } });
	expect(mockRequireOpenSession).not.toHaveBeenCalled();
	expect(recordSaleAttempt).not.toHaveBeenCalled();
});
it('a session replaced between the gate and the write refuses through the session-required path', async () => {
	mockRequireOpenSession.mockResolvedValueOnce('session-B');
	await expect(commitGatewaySale(ctx, input)).rejects.toBeInstanceOf(RegisterSessionRequiredError);
	expect(recordSaleAttempt).not.toHaveBeenCalled();
	expect(persistSaleProvenance).not.toHaveBeenCalled();
});
it('dispatches the whole outstanding balance as a completing gateway tender', async () => {
	const seen: unknown[] = [];
	const { registerActionHook } = jest.requireActual<
		typeof import('../../../../extensions/actions')
	>('../../../../extensions/actions');
	registerActionHook(
		'checkout.tender.commit',
		async (_ctx, e, next) => {
			seen.push(e);
			return next(e);
		},
		{ id: 'test.observer', tier: 'extension' }
	);
	await commitGatewaySale(ctx, { ...input, online: false });
	expect(seen[0]).toMatchObject({
		event: 'checkout.tender.commit',
		orderId: 'order',
		source: 'user',
		actor: ctx.actionActor,
		payload: {
			methodId: 'stripe',
			mode: 'gateway',
			amountMinor: 600,
			tenderedMinor: 600,
			balanceMinor: 600,
			roundingMinor: 0,
			completing: true,
			bindingStatus: 'bound',
			registerId: null,
			sessionId: null,
		},
	});
	expect(persistSaleProvenance).toHaveBeenCalledWith(
		ctx,
		expect.objectContaining({ online: false })
	);
});
it('an over-stock line refuses a gateway sale before any write (the gate counts here too)', async () => {
	const overselling = {
		...ctx,
		actionCtx: createActionContext({
			log,
			t: (key) => key,
			readCatalog: async () => ({ manage_stock: true, stock_quantity: 1, backorders: 'no' }),
			readPaymentMethod: () => null,
			preventOverselling: true,
			priceDecimals: 2,
			resolveSession,
		}),
	} as SaleContext;
	const lines = [{ product_id: 5, quantity: 2, name: 'Belt', meta_data: [] }];
	const withLines = {
		...input,
		order: {
			uuid: 'order',
			getLatest: () => ({ payload: { ...payload, line_items: lines } }),
		} as never,
	};
	const outcome = await commitGatewaySale(overselling, withLines);
	expect(outcome).toMatchObject({
		deny: { reasonKey: 'pos_cart.only_n_available', params: { quantity: 1, name: 'Belt' } },
	});
	expect(mockRequireOpenSession).not.toHaveBeenCalled();
	expect(recordSaleAttempt).not.toHaveBeenCalled();
	expect(persistSaleProvenance).not.toHaveBeenCalled();
});

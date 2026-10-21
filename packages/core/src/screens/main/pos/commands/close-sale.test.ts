import type { EngineRecord } from '@wcpos/query';

import { closeSale } from './close-sale';

// The hook's dependencies; closeSale itself takes everything it needs as arguments.
jest.mock('@wcpos/hooks/use-online-status', () => ({ useOnlineStatus: () => ({}) }));
jest.mock('../../hooks/use-rest-http-client', () => ({ useRestHttpClient: () => ({}) }));
jest.mock('../checkout/hooks/use-sale-context', () => ({ useSaleContext: () => ({}) }));
const mockPosterInput = jest.fn();
const mockMirror = jest.fn(async (..._args: unknown[]) => undefined);
const mockSettle = jest.fn(async () => undefined);
jest.mock('@wcpos/query', () => {
	class MoneyCommandError extends Error {
		constructor(public reason: string) {
			super(reason);
		}
	}
	return {
		MoneyCommandError,
		moneyCommandPoster: (input: {
			post: (url: string, body: unknown) => Promise<unknown>;
			runtime: unknown;
			orderUuid: string;
		}) => {
			mockPosterInput(input);
			return Object.assign((url: string, body: unknown) => input.post(url, body), {
				mirror: async (answer: object) => {
					await mockMirror(input.runtime, input.orderUuid, {
						...answer,
						sentRevision: 'sha256:sent',
					});
					await mockSettle();
				},
				settle: mockSettle,
			});
		},
	};
});
jest.mock('@wcpos/query/mutations', () => ({
	mirrorServerOrder: (...args: unknown[]) => mockMirror(...(args as [])),
}));

const order = {
	uuid: 'order-1',
	getLatest: () => ({ payload: { id: 42, total: '0.00', currency: 'EUR' } }),
} as unknown as EngineRecord<'orders'>;
const approval = { total: '10.00', currency: 'EUR' };
const refusal = (status: number, code: string, data?: object) =>
	Object.assign(new Error(code), {
		response: { status, data: { code, message: `${code} says`, data } },
	});
function deps(post: jest.Mock) {
	return { post, approval, provenance: async () => null };
}

beforeEach(() => jest.clearAllMocks());

it('a zero-balance close carries the approval and is refused when the covered total changed', async () => {
	const { MoneyCommandError } = jest.requireMock('@wcpos/query');
	const post = jest.fn(async () => {
		throw new MoneyCommandError('order_changed');
	});

	const outcome = await closeSale({} as never, {} as never, order, deps(post));

	expect(mockPosterInput).toHaveBeenCalledWith(expect.objectContaining({ approval }));
	expect(post).toHaveBeenCalledWith('orders/42/close', {});
	expect(outcome).toEqual({ kind: 'order_changed' });
	expect(mockMirror).not.toHaveBeenCalled();
});

it('a 2xx with a completion completes, mirroring the summary under the sent revision', async () => {
	const summary = { status: 'completed' };
	const post = jest.fn(async () => ({ data: { order: summary, completion: { n: 2, id: 'c2' } } }));

	const outcome = await closeSale({} as never, {} as never, order, deps(post));

	expect(outcome).toEqual({ kind: 'completed', order: summary, completion: { n: 2, id: 'c2' } });
	expect(mockMirror).toHaveBeenCalledWith({}, 'order-1', {
		order: summary,
		sentRevision: 'sha256:sent',
	});
	expect(mockSettle).toHaveBeenCalledTimes(1);
});

it.each([
	['no body', null],
	['no summary', { completion: { n: 1, id: 'c1' } }],
	['a summary without a status', { order: { total: '0.00' }, completion: { n: 1, id: 'c1' } }],
	['no completion', { order: { status: 'completed' } }],
	['a null completion on an open summary', { order: { status: 'pos-open' }, completion: null }],
	['a completion without its number', { order: { status: 'completed' }, completion: { id: 'c1' } }],
])(
	'a 2xx with %s is not a close: nothing is mirrored or settled and the entry stays',
	async (_, data) => {
		const post = jest.fn(async () => ({ data }));

		await expect(closeSale({} as never, {} as never, order, deps(post))).rejects.toThrow(
			'close_malformed_response'
		);
		expect(mockMirror).not.toHaveBeenCalled();
		expect(mockSettle).not.toHaveBeenCalled();
	}
);

// Server SPEC §4.3: a paid sale whose completion stamp could not persist answers no completion.
it('a paid summary with a null completion completes, without a completion number', async () => {
	const summary = { status: 'completed' };
	const post = jest.fn(async () => ({ data: { order: summary, completion: null } }));

	const outcome = await closeSale({} as never, {} as never, order, deps(post));

	expect(outcome).toEqual({ kind: 'completed', order: summary, completion: null });
	expect(mockSettle).toHaveBeenCalledTimes(1);
});

it('balance outstanding mirrors the summary and says what is due', async () => {
	const summary = { status: 'pos-partial', balance: '4.00' };
	const post = jest.fn(async () => {
		throw refusal(409, 'wcpos_balance_outstanding', { order: summary });
	});

	expect(await closeSale({} as never, {} as never, order, deps(post))).toEqual({
		kind: 'outstanding',
		order: summary,
	});
	expect(mockMirror).toHaveBeenCalledWith(
		{},
		'order-1',
		expect.objectContaining({ order: summary })
	);
});

it.each([
	[409, 'wcpos_payment_in_flight'],
	[400, 'wcpos_insufficient_stock'],
])('a %s %s is refused with the store message and never retried', async (status, code) => {
	const post = jest.fn(async () => {
		throw refusal(status, code);
	});

	expect(await closeSale({} as never, {} as never, order, deps(post))).toEqual({
		kind: 'refused',
		code,
		message: `${code} says`,
	});
	expect(post).toHaveBeenCalledTimes(1);
	// The refusal says the till's view is stale: the corrective refresh runs, nothing is mirrored.
	expect(mockSettle).toHaveBeenCalledTimes(1);
	expect(mockMirror).not.toHaveBeenCalled();
});

it('an order the store has never seen sends nothing (connectivity is the caller’s check)', async () => {
	const post = jest.fn();
	const unsynced = {
		uuid: 'order-2',
		getLatest: () => ({ payload: { total: '0.00', currency: 'EUR' } }),
	} as unknown as EngineRecord<'orders'>;
	expect(await closeSale({} as never, {} as never, unsynced, deps(post))).toEqual({
		kind: 'offline',
	});
	expect(post).not.toHaveBeenCalled();
	expect(mockPosterInput).not.toHaveBeenCalled();
});

// The resident after the mirror decides, as for every leg: a close answered after another till's
// reopen was adopted settles its journal entry and mirrors, but is not reported completed, so the
// zero-balance flow shows the reopened cart and prints no receipt.
it('a close answered after another till’s reopen was adopted is reopened, settled, no receipt', async () => {
	let status = 'pos-partial';
	const resident = {
		uuid: 'order-1',
		getLatest: () => ({ payload: { id: 42, total: '0.00', currency: 'EUR', status } }),
	} as unknown as EngineRecord<'orders'>;
	const summary = { status: 'completed' };
	const post = jest.fn(async () => {
		status = 'pos-open'; // the reopen is adopted while the close is in flight
		return { data: { order: summary, completion: { n: 1, id: 'c1' } } };
	});

	const outcome = await closeSale({} as never, {} as never, resident, deps(post));

	expect(outcome).toEqual({ kind: 'reopened', order: summary });
	expect(mockMirror).toHaveBeenCalledTimes(1);
	expect(mockSettle).toHaveBeenCalledTimes(1);
});

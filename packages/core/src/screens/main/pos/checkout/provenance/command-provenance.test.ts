import type { EngineRecord, ProvenanceCommand } from '@wcpos/query';

import { commandProvenance } from './command-provenance';
import { completionMeta } from './stamp-completion';

jest.mock('./stamp-completion', () => ({ completionMeta: jest.fn() }));

const ctx = { userDB: {} as never, siteUuid: 'site', storeId: 9 };
const order = (meta_data: { key: string; value: unknown }[], total = '10.00') =>
	({ getLatest: () => ({ payload: { total, meta_data } }) }) as unknown as EngineRecord<'orders'>;
const tuple = [
	{ key: '_wcpos_register', value: 'reg-1' },
	{ key: '_wcpos_session', value: 'session-1' },
	{ key: '_wcpos_sale_time', value: '2026-10-20T10:00:00+02:00' },
	{ key: '_wcpos_sale_tz', value: 'Europe/Madrid' },
	{ key: '_wcpos_sale_counter', value: '41' },
];
const close: ProvenanceCommand = { kind: 'close', target: null, body: {} };
const record = (amount: string): ProvenanceCommand => ({
	kind: 'record',
	target: null,
	body: { payment: { id: 'row', amount } },
});
const minted = [
	{ key: '_wcpos_register', value: 'reg-1' },
	{ key: '_wcpos_sale_time', value: '2026-10-21T09:00:00+02:00' },
	{ key: '_wcpos_sale_tz', value: 'Europe/Madrid' },
	{ key: '_wcpos_sale_counter', value: '42' },
	{ key: '_wcpos_session', value: 'session-2' },
];
const history = [...tuple, { key: '_wcpos_completions', value: [{ id: 'c1', n: 1 }] }];

beforeEach(() => jest.mocked(completionMeta).mockReset());

it('provenance is read from the till tuple for completion 1 and minted once for a re-completion', async () => {
	// Completion 1: the tuple persistProvenance stamped, without its counter (the server's own).
	expect(await commandProvenance(ctx, order(tuple), 'session-1', close)).toEqual({
		register_id: 'reg-1',
		session_id: 'session-1',
		sale_time: '2026-10-20T10:00:00+02:00',
		sale_tz: 'Europe/Madrid',
	});
	expect(completionMeta).not.toHaveBeenCalled();
	// A re-completion mints a fresh tuple with its own counter, once per call (the poster calls
	// it once, when it freezes the command).
	jest.mocked(completionMeta).mockResolvedValueOnce(minted);
	expect(await commandProvenance(ctx, order(history), 'session-2', close)).toEqual({
		register_id: 'reg-1',
		session_id: 'session-2',
		sale_time: '2026-10-21T09:00:00+02:00',
		sale_tz: 'Europe/Madrid',
		sale_counter: '42',
	});
	expect(completionMeta).toHaveBeenCalledTimes(1);
	expect(completionMeta).toHaveBeenCalledWith(
		{ meta_data: [] },
		{ ...ctx, sessionId: 'session-2' }
	);
});

it('a re-completion mints a sale counter only for the command that completes the sale', async () => {
	jest.mocked(completionMeta).mockResolvedValue(minted);
	// A partial leg of the reopened sale, and an intent, complete nothing: no counter.
	expect(await commandProvenance(ctx, order(history), 'session-2', record('4.00'))).toBeNull();
	expect(
		await commandProvenance(ctx, order(history), 'session-2', {
			kind: 'intent',
			target: 'leg',
			body: { payment: { id: 'leg', amount: '10.00' } },
		})
	).toBeNull();
	expect(completionMeta).not.toHaveBeenCalled();
	// The leg that covers the balance, a capture of an authorized row that covers it, a close.
	expect(await commandProvenance(ctx, order(history), 'session-2', record('10.00'))).toMatchObject({
		sale_counter: '42',
	});
	const authorized = {
		key: '_wcpos_payments',
		value: {
			schema: 1,
			payments: [{ id: 'leg', amount: '10.00', status: 'authorized', refunds: [] }],
		},
	};
	expect(
		await commandProvenance(ctx, order([...history, authorized]), 'session-2', {
			kind: 'capture',
			target: 'leg',
			body: { context: {} },
		})
	).toMatchObject({ sale_counter: '42' });
	expect(completionMeta).toHaveBeenCalledTimes(2);
});

it('a sale with no tuple yet carries no provenance', async () => {
	expect(await commandProvenance(ctx, order([]), null, close)).toBeNull();
});

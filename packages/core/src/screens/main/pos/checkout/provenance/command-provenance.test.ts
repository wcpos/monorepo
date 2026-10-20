import type { EngineRecord } from '@wcpos/query';

import { commandProvenance } from './command-provenance';
import { completionMeta } from './stamp-completion';

jest.mock('./stamp-completion', () => ({ completionMeta: jest.fn() }));

const ctx = { userDB: {} as never, siteUuid: 'site', storeId: 9 };
const order = (meta_data: { key: string; value: unknown }[]) =>
	({ getLatest: () => ({ payload: { meta_data } }) }) as unknown as EngineRecord<'orders'>;
const tuple = [
	{ key: '_wcpos_register', value: 'reg-1' },
	{ key: '_wcpos_session', value: 'session-1' },
	{ key: '_wcpos_sale_time', value: '2026-10-20T10:00:00+02:00' },
	{ key: '_wcpos_sale_tz', value: 'Europe/Madrid' },
	{ key: '_wcpos_sale_counter', value: '41' },
];

beforeEach(() => jest.mocked(completionMeta).mockReset());

it('provenance is read from the till tuple for completion 1 and minted once for a re-completion', async () => {
	// Completion 1: the tuple persistProvenance stamped, without its counter (the server's own).
	expect(await commandProvenance(ctx, order(tuple), 'session-1')).toEqual({
		register_id: 'reg-1',
		session_id: 'session-1',
		sale_time: '2026-10-20T10:00:00+02:00',
		sale_tz: 'Europe/Madrid',
	});
	expect(completionMeta).not.toHaveBeenCalled();
	// A re-completion mints a fresh tuple with its own counter, once per call (the poster calls
	// it once, when it freezes the command).
	jest.mocked(completionMeta).mockResolvedValueOnce([
		{ key: '_wcpos_register', value: 'reg-1' },
		{ key: '_wcpos_sale_time', value: '2026-10-21T09:00:00+02:00' },
		{ key: '_wcpos_sale_tz', value: 'Europe/Madrid' },
		{ key: '_wcpos_sale_counter', value: '42' },
		{ key: '_wcpos_session', value: 'session-2' },
	]);
	const history = [...tuple, { key: '_wcpos_completions', value: [{ id: 'c1', n: 1 }] }];
	expect(await commandProvenance(ctx, order(history), 'session-2')).toEqual({
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

it('a sale with no tuple yet carries no provenance', async () => {
	expect(await commandProvenance(ctx, order([]), null)).toBeNull();
});

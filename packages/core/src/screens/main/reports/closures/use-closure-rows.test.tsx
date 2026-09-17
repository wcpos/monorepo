/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';
import { Query } from 'mingo';

import type { ClosureRow } from '@wcpos/database';

import { exportCsv } from './export-csv';
import { useClosureRows } from './use-closure-rows';

const source = new BehaviorSubject<{ toMutableJSON: () => ClosureRow }[]>([]);
const collection = { find: () => ({ $: source }), findOne: jest.fn() };
const get = jest.fn();
const http = { get };
let online = true;
let isPro = true;
const binding = { registerId: 'r', registerName: 'Front' };
jest.mock('../../../../services/register-session/use-register-session-collections', () => ({
	useClosureCollection: () => collection,
}));
jest.mock('../../hooks/use-rest-http-client', () => ({ useRestHttpClient: () => http }));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: online ? 'online-website-available' : 'offline' }),
}));
jest.mock('../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => binding,
}));
jest.mock('../../../../hooks/use-app-info', () => ({ useAppInfo: () => ({ license: { isPro } }) }));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store: { id: 1 } }),
}));
jest.mock('../../../../hooks/use-store-day', () => ({
	useStoreDay: (storeId?: number) => ({
		timezone: storeId === 2 ? 'America/Los_Angeles' : 'UTC',
		presets: () => ({ today: { from: new Date('2026-09-17T00:00:00Z') } }),
	}),
	zoneOptions: jest.requireActual('../../../../hooks/use-store-day').zoneOptions,
}));
const scope = { from: '2026-09-17', to: '2026-09-17', registerId: 'r', storeId: 1 };
const row = (id: string, changes: Partial<ClosureRow> = {}) =>
	({
		id,
		register_id: 'r',
		store_id: 1,
		business_day: '2026-09-17',
		opened_at: '2026-09-17T08:00:00Z',
		closed_at: '2026-09-17T12:00:00Z',
		expected: {},
		sync_status: 'synced',
		synced_rows_at: '2026-09-17T12:00:00Z',
		...changes,
	}) as ClosureRow;
beforeEach(() => {
	collection.findOne.mockReset().mockReturnValue({ exec: async () => null });
	get.mockReset().mockResolvedValue({ data: [] });
	source.next([]);
	online = true;
	isPro = true;
});
// Revert: enable server reads for Free, or replace the local-first result with a server-only list.
it('shows local rows immediately without requesting current-register today for Free', async () => {
	isPro = false;
	source.next([{ toMutableJSON: () => row('local') }]);
	const { result } = renderHook(() => useClosureRows(scope));
	expect(result.current.rows.map((r) => r.id)).toEqual(['local']);
	await act(() => result.current.loadMore());
	expect(get).not.toHaveBeenCalled();
});
// Revert: exempt bound-register Today from Pro server reads, or let server rows replace pending/failed locals.
it.each(['pending', 'failed'] as const)(
	'merges Pro current-register Today into the list and CSV while preserving %s local rows',
	async (sync_status) => {
		const local = row('local', {
			server_closure_id: 'server-local',
			sync_status,
			number: 1,
			counted: { cash: '9' },
			variance: { cash: '0' },
			breakdowns: {},
		});
		source.next([{ toMutableJSON: () => local }]);
		get.mockResolvedValue({
			data: [
				row('server-local', { counted: { cash: '1' } }),
				row('another-device', { number: 2, counted: { cash: '20' } }),
			],
		});
		const { result } = renderHook(() => useClosureRows(scope));
		expect(result.current.rows).toEqual([local]);
		await waitFor(() => expect(result.current.status).toBe('ready'));
		expect(result.current.rows.map((r) => r.id).sort()).toEqual(['another-device', 'local']);
		expect(result.current.rows.find((r) => r.id === 'local')).toEqual(local);
		expect(get).toHaveBeenCalledTimes(1);
		expect(get).toHaveBeenCalledWith('closures', {
			params: {
				register_id: 'r',
				store_id: 1,
				after: '2026-09-17',
				before: '2026-09-17',
				page: 1,
				per_page: 50,
			},
		});
		const csv = exportCsv(result.current.rows, (key) => key);
		expect(csv.split('\r\n')).toHaveLength(3);
		expect(csv).toContain('"2026-09-17","2"');
	}
);
// Revert: remove paging, id merge, pending-local precedence, or the short-page stop.
it('pages another register, dedupes, preserves pending local rows and stops on a short page', async () => {
	source.next([
		{
			toMutableJSON: () =>
				row('same', { register_id: 'other', sync_status: 'pending', counted: { cash: '9' } }),
		},
	]);
	get.mockImplementation(async (_url, config) => ({
		data:
			config.params.page === 1
				? Array.from({ length: config.params.per_page }, (_, i) =>
						row(i === 0 ? 'same' : String(i), { register_id: 'other', counted: { cash: '1' } })
					)
				: [row('same', { register_id: 'other' }), row('last', { register_id: 'other' })],
	}));
	const { result } = renderHook(() => useClosureRows({ ...scope, registerId: 'other' }));
	await waitFor(() => expect(result.current.hasMore).toBe(true));
	expect(get).toHaveBeenCalledWith(
		'closures',
		expect.objectContaining({
			params: expect.objectContaining({
				register_id: 'other',
				store_id: 1,
				after: scope.from,
				before: scope.to,
				page: 1,
			}),
		})
	);
	expect(result.current.rows.find((r) => r.id === 'same')?.counted).toEqual({ cash: '9' });
	await act(() => result.current.loadMore());
	expect(result.current.rows.filter((r) => r.id === 'same')).toHaveLength(1);
	expect(result.current.rows.some((r) => r.id === 'last')).toBe(true);
	expect(result.current.hasMore).toBe(false);
	await act(() => result.current.loadMore());
	expect(get).toHaveBeenCalledTimes(2);
});
// Revert: omit server history reads when the requested start predates local history.
it('fills history older than the device holds', async () => {
	source.next([{ toMutableJSON: () => row('local') }]);
	const { result } = renderHook(() => useClosureRows({ ...scope, from: '2026-09-01' }));
	await waitFor(() => expect(result.current.status).toBe('ready'));
	expect(get).toHaveBeenCalledWith(
		'closures',
		expect.objectContaining({ params: expect.objectContaining({ after: '2026-09-01' }) })
	);
});
// Revert: clear remote rows on disconnect or treat an unseen offline scope as empty.
it('keeps loaded rows unavailable offline and distinguishes a never-loaded scope', async () => {
	get.mockResolvedValue({ data: [row('remote', { register_id: 'other' })] });
	const { result, rerender } = renderHook(
		({ registerId }) => useClosureRows({ ...scope, registerId }),
		{ initialProps: { registerId: 'other' } }
	);
	await waitFor(() => expect(result.current.rows).toHaveLength(1));
	online = false;
	rerender({ registerId: 'other' });
	expect(result.current.rows[0].id).toBe('remote');
	expect(result.current.unavailableIds.has('remote')).toBe(true);
	expect(result.current.status).toBe('unavailable');
	rerender({ registerId: 'unseen' });
	expect(result.current.rows).toEqual([]);
	expect(result.current.status).toBe('unavailable');
	expect(get).toHaveBeenCalledTimes(1);
});
// Revert: activate remote reads before resolving Free deep-link/restored scope.
it('resolves a locked Free scope before issuing any request', () => {
	isPro = false;
	source.next([{ toMutableJSON: () => row('local') }]);
	const { result } = renderHook(() =>
		useClosureRows({ from: '2020-01-01', to: '2020-01-02', registerId: 'other', storeId: 2 })
	);
	expect(result.current.rows.map((r) => r.id)).toEqual(['local']);
	expect(result.current.scope).toEqual(scope);
	expect(get).not.toHaveBeenCalled();
});
// Revert: collapse forbidden responses into empty, or retry a failed page automatically.
it.each([403, 500])('distinguishes HTTP %s and retries only when requested', async (status) => {
	get.mockRejectedValueOnce({ response: { status } });
	const { result } = renderHook(() => useClosureRows({ ...scope, registerId: 'other' }));
	await waitFor(() => expect(result.current.status).toBe(status === 403 ? 'denied' : 'error'));
	expect(get).toHaveBeenCalledTimes(1);
	if (status === 500) {
		await act(() => result.current.loadMore());
		expect(result.current.status).toBe('ready');
		expect(get.mock.calls[1][1].params.page).toBe(1);
	}
});
// Revert: cast SQL-shaped server rows as local rows without adapting dates and labels.
it('adapts the server list shape for grouping, the panel and CSV', async () => {
	get.mockResolvedValue({
		data: [
			{
				...row('remote', { register_id: 'other', corrections_count: 1 }),
				opened_at: undefined,
				closed_at: undefined,
				synced_rows_at: undefined,
				opened_at_gmt: '2026-09-17 08:00:00',
				closed_at_gmt: '2026-09-17 12:00:00',
				breakdowns: {
					labels: { register_name: 'Back', closed_by_name: 'Alex' },
					store: { name: 'Second' },
				},
			},
		],
	});
	const { result } = renderHook(() => useClosureRows({ ...scope, registerId: 'other' }));
	await waitFor(() => expect(result.current.rows).toHaveLength(1));
	expect(result.current.rows[0]).toMatchObject({
		opened_at: '2026-09-17T08:00:00.000Z',
		closed_at: '2026-09-17T12:00:00.000Z',
		sync_status: 'synced',
		breakdowns: { register_name: 'Back', closed_by_name: 'Alex', store_name: 'Second' },
	});
	expect(result.current.rows[0].synced_rows_at).toBeTruthy();
});

// Revert: send rejected store_id=0, inherit the bound store, or show rows from other stores.
it('reads global-store closures without inheriting the till store filter', async () => {
	get.mockResolvedValue({
		data: [
			row('global', { register_id: 'other', store_id: null }),
			row('elsewhere', { register_id: 'other', store_id: 2 }),
		],
	});
	const { result } = renderHook(() =>
		useClosureRows({ ...scope, registerId: 'other', storeId: 0 })
	);
	await waitFor(() => expect(result.current.status).toBe('ready'));
	expect(get).toHaveBeenCalledWith(
		'closures',
		expect.objectContaining({ params: expect.objectContaining({ store_id: null }) })
	);
	expect(result.current.rows.map((row) => row.id)).toEqual(['global']);
});

// Revert: pass invalid REST timestamps and absent money maps through to the list.
it('rejects invalid timestamps and supplies empty money maps', async () => {
	get.mockResolvedValue({
		data: [
			row('valid', { register_id: 'other' }),
			row('bad', { register_id: 'other', closed_at: 'invalid' }),
			row('missing', { register_id: 'other', opened_at: undefined }),
		],
	});
	const { result } = renderHook(() => useClosureRows({ ...scope, registerId: 'other' }));
	await waitFor(() => expect(result.current.status).toBe('ready'));
	expect(result.current.rows).toHaveLength(1);
	expect(result.current.rows[0]).toMatchObject({ id: 'valid', counted: {}, variance: {} });
});

// Revert: refresh only the receipt document after recount, leaving the list badge stale.
it('patches the badge immediately and refetches the recounted closure', async () => {
	get.mockResolvedValueOnce({ data: [row('remote', { register_id: 'other' })] });
	const { result } = renderHook(() => useClosureRows({ ...scope, registerId: 'other' }));
	await waitFor(() => expect(result.current.rows).toHaveLength(1));
	get.mockResolvedValueOnce({
		data: row('remote', { register_id: 'other', corrections_count: 2 }),
	});
	await act(() => result.current.refreshRow(result.current.rows[0]));
	expect(get).toHaveBeenLastCalledWith('closures/remote');
	expect(result.current.rows[0].corrections_count).toBe(2);
});

// Revert: let the refreshed server row replace the device's own closure under the server id.
it('keeps the local identity of a recounted closure this device wrote', async () => {
	source.next([
		{ toMutableJSON: () => row('local-uuid', { server_closure_id: '9', corrections_count: 0 }) },
	]);
	const { result } = renderHook(() => useClosureRows(scope));
	await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(['local-uuid']));
	// The detail response omits store_id, as a scope-agnostic server row may.
	const { store_id: _omitted, ...detail } = row('9', { corrections_count: 2 });
	get.mockResolvedValueOnce({ data: detail });
	await act(() => result.current.refreshRow(result.current.rows[0]));
	expect(get).toHaveBeenLastCalledWith('closures/9');
	expect(result.current.rows).toHaveLength(1);
	expect(result.current.rows[0]).toMatchObject({
		id: 'local-uuid',
		server_closure_id: '9',
		store_id: 1,
		corrections_count: 2,
	});
});

// Revert: derive remote legacy days using the bound store timezone.
it('derives legacy remote business days in the selected store zone', async () => {
	get.mockResolvedValue({
		data: [
			row('remote', { store_id: 2, business_day: undefined, opened_at: '2026-09-17T02:00:00Z' }),
		],
	});
	const { result } = renderHook(() =>
		useClosureRows({ ...scope, storeId: 2, from: '2026-09-16', to: '2026-09-16' })
	);
	await waitFor(() => expect(result.current.status).toBe('ready'));
	expect(result.current.rows.map((row) => row.business_day)).toEqual(['2026-09-16']);
});

// Revert: merge a superseded local row under its losing UUID instead of its server ID.
it('merges a superseded closure with its winning server row', async () => {
	source.next([
		{
			toMutableJSON: () =>
				row('loser', {
					register_id: 'other',
					server_closure_id: 'winner',
					sync_status: 'superseded',
				}),
		},
	]);
	get.mockResolvedValue({ data: [row('winner', { register_id: 'other' })] });
	const { result } = renderHook(() => useClosureRows({ ...scope, registerId: 'other' }));
	await waitFor(() => expect(result.current.status).toBe('ready'));
	expect(result.current.rows.map((row) => row.id)).toEqual(['winner']);
});

// Revert: assume any local closure on the start day proves historical completeness.
it('merges server history even when the device has a closure on the start day', async () => {
	source.next([{ toMutableJSON: () => row('local', { business_day: '2026-09-16' }) }]);
	get.mockResolvedValue({ data: [row('another-device', { business_day: '2026-09-16' })] });
	const { result } = renderHook(() => useClosureRows({ ...scope, from: '2026-09-16' }));
	await waitFor(() => expect(result.current.rows).toHaveLength(2));
	expect(result.current.rows.map((row) => row.id)).toEqual(
		expect.arrayContaining(['local', 'another-device'])
	);
});

// Revert: compare local UUIDs rather than canonical server identities for offline availability.
it('keeps a server-listed local closure available offline by server id', async () => {
	source.next([{ toMutableJSON: () => row('local', { server_closure_id: 'server' }) }]);
	get.mockResolvedValue({
		data: [row('server'), row('remote-local', { server_closure_id: 'remote-server' })],
	});
	const { result, rerender } = renderHook(() => useClosureRows({ ...scope, from: '2026-09-16' }));
	await waitFor(() => expect(result.current.status).toBe('ready'));
	online = false;
	rerender();
	expect(result.current.rows.map((r) => r.id)).toEqual(['server', 'remote-local']);
	expect([...result.current.unavailableIds]).toEqual(['remote-server']);
});

// Revert: finish after an unfiltered page instead of filling the cashier-filtered page.
it.each([1, 50])('automatically finds %s cashier closures beyond page one', async (matches) => {
	const statuses: string[] = [];
	get.mockImplementation(async (_url, config) => ({
		data:
			config.params.page <= 2
				? Array.from({ length: 50 }, (_, i) =>
						row(`${config.params.page}-${i}`, {
							register_id: 'other',
							closed_by: config.params.page === 2 && i < matches ? 7 : 8,
						})
					)
				: [],
	}));
	const { result } = renderHook(() => {
		const result = useClosureRows({ ...scope, registerId: 'other', cashier: 7 });
		statuses.push(result.status);
		return result;
	});
	await waitFor(() => expect(result.current.status).toBe('ready'));
	expect(result.current.rows).toHaveLength(matches);
	expect(get.mock.calls.map(([, config]) => config.params.page)).toEqual(
		matches === 50 ? [1, 2] : [1, 2, 3]
	);
	expect(statuses.slice(0, -1)).not.toContain('ready');
	expect(result.current.hasMore).toBe(matches === 50);
});

// Revert: use the absolute PAGE_SIZE threshold, or reset the target on each continued request.
it.each([1, 50])(
	'fills another cashier page per Load more with %s new matches',
	async (matches) => {
		const statuses: string[] = [];
		get.mockImplementation(async (_url, config) => ({
			data:
				config.params.page <= 3
					? Array.from({ length: 50 }, (_, i) =>
							row(`${config.params.page}-${i}`, {
								register_id: 'other',
								closed_by:
									config.params.page === 1 || (config.params.page === 3 && i < matches) ? 7 : 8,
							})
						)
					: [],
		}));
		const { result } = renderHook(() => {
			const result = useClosureRows({ ...scope, registerId: 'other', cashier: 7 });
			statuses.push(result.status);
			return result;
		});
		await waitFor(() => expect(result.current.hasMore).toBe(true));
		expect(result.current.rows).toHaveLength(50);
		statuses.length = 0;
		await act(() => result.current.loadMore());
		await waitFor(() => expect(result.current.status).toBe('ready'));
		expect(result.current.rows).toHaveLength(50 + matches);
		expect(result.current.rows.some((row) => row.id === '3-0')).toBe(true);
		expect(get.mock.calls.map(([, config]) => config.params.page)).toEqual(
			matches === 50 ? [1, 2, 3] : [1, 2, 3, 4]
		);
		expect(statuses.slice(0, -1)).not.toContain('ready');
		expect(result.current.hasMore).toBe(matches === 50);
	}
);

// Revert: automatically page unfiltered scopes rather than leaving Load more user-driven.
it('requests only the first page without a cashier filter', async () => {
	get.mockResolvedValue({
		data: Array.from({ length: 50 }, (_, i) => row(String(i), { register_id: 'other' })),
	});
	const { result } = renderHook(() => useClosureRows({ ...scope, registerId: 'other' }));
	await waitFor(() => expect(result.current.status).toBe('ready'));
	expect(result.current.rows).toHaveLength(50);
	expect(result.current.hasMore).toBe(true);
	expect(get).toHaveBeenCalledTimes(1);
});

// Revert: discard device-only snapshot/printed number when the authoritative server row wins.
it('preserves the local cached document and printed number on the merged server row offline', async () => {
	const snapshot = JSON.stringify({
		closure: { corrections: [{ type: 'recount', figures: { counted: { cash: '101' } } }] },
	});
	source.next([
		{
			toMutableJSON: () =>
				row('local', {
					server_closure_id: 'server',
					receipt_snapshot: snapshot,
					printed_number: 4,
					corrections_count: 0,
				}),
		},
	]);
	get.mockResolvedValue({
		data: [row('server', { corrections_count: 1, counted: { cash: '99' } })],
	});
	const { result, rerender } = renderHook(() => useClosureRows({ ...scope, from: '2026-09-16' }));
	await waitFor(() => expect(result.current.status).toBe('ready'));
	online = false;
	rerender();
	expect(result.current.rows).toHaveLength(1);
	expect(result.current.rows[0]).toMatchObject({
		id: 'server',
		receipt_snapshot: snapshot,
		printed_number: 4,
		corrections_count: 1,
		counted: { cash: '99' },
	});
	expect([...result.current.unavailableIds]).toEqual([]);
});

// Revert: find the persisted closure by row.id alone after the server row wins the merge.
it('patches the local UUID document when refreshing its merged server row', async () => {
	const persisted = row('local-uuid', { server_closure_id: '9', corrections_count: 0 });
	const local = {
		toMutableJSON: () => ({ ...persisted }),
		incrementalPatch: async (patch: Partial<ClosureRow>) => Object.assign(persisted, patch),
	};
	collection.findOne.mockImplementation(
		(query: string | { selector: Record<string, unknown> }) => ({
			exec: async () =>
				new Query(typeof query === 'string' ? { id: query } : query.selector).test(persisted)
					? local
					: null,
		})
	);
	source.next([local]);
	get.mockResolvedValueOnce({ data: [row('9', { corrections_count: 0 })] });
	const { result } = renderHook(() => useClosureRows({ ...scope, from: '2026-09-16' }));
	await waitFor(() => expect(result.current.status).toBe('ready'));
	expect(result.current.rows.map((row) => row.id)).toEqual(['9']);
	get.mockResolvedValueOnce({ data: row('9', { corrections_count: 2 }) });
	await act(() => result.current.refreshRow(result.current.rows[0]));
	expect(get).toHaveBeenLastCalledWith('closures/9');
	expect(persisted.corrections_count).toBe(2);
	expect(persisted.id).toBe('local-uuid');
});

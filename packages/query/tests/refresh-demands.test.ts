/**
 * @jest-environment jsdom
 */
import { act, waitFor } from '@testing-library/react';

import type { EngineEvent, RxdbSyncEngine } from '@wcpos/sync-engine';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import {
	fetchFreshRecords,
	refreshStockFor,
	watchVariationParentRefresh,
} from '../src/reads/refresh-demands';

const mockFindEngineResident = jest.fn();
const mockRequire = jest.fn();
const mockEvents = jest.fn();
const mockLoggerError = jest.fn();

const engine = {
	events: mockEvents,
	require: mockRequire,
	status: () => ({ activeScopeId }),
	active: () => residentScope(),
	whenActive: async () => residentScope(),
} as unknown as RxdbSyncEngine;

const residentScope = () => ({
	scopeId: residentScopeId,
	database: {
		collections: {
			variations: {
				findOne: (recordId: string) => ({ exec: () => mockFindEngineResident(recordId) }),
			},
		},
	},
});

/** The scope the resident is read in, and the scope live when the fetch is declared. */
let residentScopeId = 'scope-1';
let activeScopeId = 'scope-1';

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ error: (...args: unknown[]) => mockLoggerError(...args) }),
	getErrorMessage: (error: unknown) => String(error),
}));

/** The engine's event callback, captured when the watcher subscribes. */
let emit: (event: EngineEvent) => void;
let unsubscribe: jest.Mock;

/** Resolvers for each `handle.ready`, in the order the requirements were declared. */
let readyControls: { resolve: () => void; reject: (error: Error) => void }[];
let releases: jest.Mock[];

const resident = (parentId: unknown) => ({ toJSON: () => ({ payload: { parent_id: parentId } }) });

const ack = (recordId: string, type = 'write-acknowledged') =>
	({
		type,
		collection: 'variations',
		recordId,
		mutationId: 'm',
		currentRevision: null,
	}) as EngineEvent;

beforeEach(() => {
	jest.clearAllMocks();
	residentScopeId = 'scope-1';
	activeScopeId = 'scope-1';
	readyControls = [];
	releases = [];
	unsubscribe = jest.fn();
	mockEvents.mockImplementation((cb: (event: EngineEvent) => void) => {
		emit = cb;
		return unsubscribe;
	});
	mockRequire.mockImplementation(() => {
		const release = jest.fn();
		releases.push(release);
		let resolve!: () => void;
		let reject!: (error: Error) => void;
		const ready = new Promise<void>((res, rej) => {
			resolve = () => res();
			reject = rej;
		});
		readyControls.push({ resolve, reject });
		return { ready, release };
	});
	mockFindEngineResident.mockResolvedValue(resident(41));
});

const mount = () => ({ unmount: watchVariationParentRefresh(engine) });

it('fetches the parent by id, forced, when a variation write is acknowledged', async () => {
	mount();

	act(() => emit(ack('variation-uuid')));

	await waitFor(() => expect(mockRequire).toHaveBeenCalledTimes(1));
	expect(mockRequire).toHaveBeenCalledWith({
		id: 'variation-parent:refresh:41',
		collection: 'products',
		kind: 'targeted-records',
		remoteIds: ['41'],
		forceRefresh: true,
	});

	await act(async () => readyControls[0].resolve());
	expect(releases[0]).toHaveBeenCalledTimes(1);
});

it('also fires for a re-materializing acknowledgement', async () => {
	mount();

	act(() => emit(ack('variation-uuid', 'write-ack-rematerialized')));

	await waitFor(() => expect(mockRequire).toHaveBeenCalledTimes(1));
});

/**
 * The regression the record binding exists for. An offline edit is acknowledged
 * whenever it eventually drains — long past any `awaitWriteOutcome` timeout, and
 * under a fresh mutationId if it was coalesced on the way. Neither is visible
 * here: the ack names the record, and that is all this needs.
 */
it('fetches on an acknowledgement that arrives long after the edit, under any mutationId', async () => {
	mount();

	act(() =>
		emit({
			type: 'write-acknowledged',
			collection: 'variations',
			recordId: 'variation-uuid',
			// The coalesced replacement's id — not the one the edit was enqueued under.
			mutationId: 'a-completely-different-mutation',
			currentRevision: 'rev-9',
		} as EngineEvent)
	);

	await waitFor(() => expect(mockRequire).toHaveBeenCalledTimes(1));
});

it('ignores writes to other collections and non-terminal events', async () => {
	mount();

	act(() => {
		emit({
			type: 'write-acknowledged',
			collection: 'orders',
			recordId: 'order-uuid',
			mutationId: 'm',
			currentRevision: null,
		} as EngineEvent);
		emit({ type: 'config-changed', collections: ['variations'] } as EngineEvent);
	});

	await Promise.resolve();
	expect(mockRequire).not.toHaveBeenCalled();
});

it('fetches nothing when the variation has no resolvable parent', async () => {
	mockFindEngineResident.mockResolvedValue(resident(0));
	mount();

	act(() => emit(ack('variation-uuid')));

	await waitFor(() => expect(mockFindEngineResident).toHaveBeenCalled());
	expect(mockRequire).not.toHaveBeenCalled();
});

it('fetches nothing when the variation resident is gone', async () => {
	mockFindEngineResident.mockResolvedValue(null);
	mount();

	act(() => emit(ack('variation-uuid')));

	await waitFor(() => expect(mockFindEngineResident).toHaveBeenCalled());
	expect(mockRequire).not.toHaveBeenCalled();
});

it('re-runs once when a sibling is acknowledged mid-fetch, rather than racing it', async () => {
	mount();

	act(() => emit(ack('variation-l-blue')));
	await waitFor(() => expect(mockRequire).toHaveBeenCalledTimes(1));

	// A second child of the SAME parent lands while the first fetch is in flight:
	// that response was issued before this edit, so it cannot be trusted for it.
	act(() => emit(ack('variation-l-green')));
	await waitFor(() => expect(mockFindEngineResident).toHaveBeenCalledTimes(2));
	expect(mockRequire).toHaveBeenCalledTimes(1);

	await act(async () => {
		readyControls[0].resolve();
	});

	await waitFor(() => expect(mockRequire).toHaveBeenCalledTimes(2));
	await act(async () => readyControls[1].resolve());
	// ...and settles there — the re-run is once, not a loop.
	expect(mockRequire).toHaveBeenCalledTimes(2);
});

/**
 * The parent id is resolved from the outgoing store's resident, and the switch
 * lands while that lookup is in flight. Product ids are site-wide, so nothing
 * here is obviously wrong to look at — which is why it has to be checked: the
 * incoming store's catalog need not contain that product at all.
 */
it('fetches nothing when the store switched under the resident lookup', async () => {
	mount();
	mockFindEngineResident.mockImplementation(async () => {
		activeScopeId = 'scope-2';
		return resident(41);
	});

	act(() => emit(ack('variation-uuid')));

	await waitFor(() => expect(mockFindEngineResident).toHaveBeenCalled());
	expect(mockRequire).not.toHaveBeenCalled();
});

it('does not re-run into a scope that changed while the first fetch was in flight', async () => {
	mount();

	act(() => emit(ack('variation-l-blue')));
	await waitFor(() => expect(mockRequire).toHaveBeenCalledTimes(1));
	act(() => emit(ack('variation-l-green')));
	await waitFor(() => expect(mockFindEngineResident).toHaveBeenCalledTimes(2));

	activeScopeId = 'scope-2';
	await act(async () => readyControls[0].resolve());

	expect(mockRequire).toHaveBeenCalledTimes(1);
});

it('releases the requirement and logs without a toast when the fetch fails', async () => {
	mount();

	act(() => emit(ack('variation-uuid')));
	await waitFor(() => expect(mockRequire).toHaveBeenCalledTimes(1));

	await act(async () => {
		readyControls[0].reject(new Error('offline'));
	});

	expect(releases[0]).toHaveBeenCalledTimes(1);
	expect(mockLoggerError).toHaveBeenCalledTimes(1);
	expect(mockLoggerError.mock.calls[0][1]).not.toHaveProperty('showToast', true);
});

it('unsubscribes on unmount and declares nothing afterwards', async () => {
	const { unmount } = mount();
	unmount();

	expect(unsubscribe).toHaveBeenCalledTimes(1);
});

describe('refreshStockFor', () => {
	it('partitions valid remote ids and forces both refreshes, releasing on ready', async () => {
		refreshStockFor(engine, [
			{ product_id: 12, variation_id: 0 },
			{ product_id: 13, variation_id: 14 },
			{ product_id: 0, variation_id: 0 },
			{ product_id: 13, variation_id: -1 },
		]);
		expect(mockRequire.mock.calls).toEqual([
			[
				{
					id: 'stock-adjustment:products:12',
					collection: 'products',
					kind: 'targeted-records',
					remoteIds: ['12'],
					forceRefresh: true,
				},
			],
			[
				{
					id: 'stock-adjustment:variations:14',
					collection: 'variations',
					kind: 'targeted-records',
					remoteIds: ['14'],
					forceRefresh: true,
				},
			],
		]);
		expect(releases[0]).not.toHaveBeenCalled();
		expect(releases[1]).not.toHaveBeenCalled();
		readyControls.forEach(({ resolve }) => resolve());
		await Promise.resolve();
		releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
	});

	it('releases and logs a failed refresh without a toast', async () => {
		refreshStockFor(engine, [{ product_id: 12, variation_id: 0 }]);
		readyControls[0].reject(new Error('offline'));
		await Promise.resolve();
		expect(releases[0]).toHaveBeenCalledTimes(1);
		expect(mockLoggerError).toHaveBeenCalledWith('Stock refresh failed', {
			code: ERROR_CODES.PRODUCT_UNEXPECTED,
			context: { collection: 'products', error: 'Error: offline' },
		});
	});

	it('does nothing for empty input or ids that cannot be refreshed', () => {
		refreshStockFor(engine, []);
		refreshStockFor(engine, [{ product_id: 0, variation_id: 0 }]);
		expect(mockRequire).not.toHaveBeenCalled();
	});
});

describe('fetchFreshRecords', () => {
	it.each(['customers', 'orders'] as const)('supports forced %s refreshes', async (collection) => {
		const pending = fetchFreshRecords(engine, [
			{ id: 'record-refresh:37', collection, wooIds: [37] },
		]);
		expect(mockRequire).toHaveBeenCalledWith({
			id: 'record-refresh:37',
			collection,
			kind: 'targeted-records',
			remoteIds: ['37'],
			forceRefresh: true,
		});
		expect(releases[0]).not.toHaveBeenCalled();
		readyControls[0].resolve();
		await pending;
		expect(releases[0]).toHaveBeenCalledTimes(1);
	});

	const requests = [
		{ id: 'barcode:code:ambiguous:products', collection: 'products' as const, wooIds: [12] },
		{ id: 'barcode:code:ambiguous:variations', collection: 'variations' as const, wooIds: [14] },
	];

	it('skips empty requests', async () => {
		await fetchFreshRecords(engine, []);
		await fetchFreshRecords(engine, [{ id: 'empty', collection: 'products', wooIds: [] }]);
		expect(mockRequire).not.toHaveBeenCalled();
	});

	it('forces each request, awaits all readiness and releases on success', async () => {
		const pending = fetchFreshRecords(engine, requests);
		expect(mockRequire.mock.calls).toEqual([
			[
				{
					id: 'barcode:code:ambiguous:products',
					collection: 'products',
					kind: 'targeted-records',
					remoteIds: ['12'],
					forceRefresh: true,
				},
			],
			[
				{
					id: 'barcode:code:ambiguous:variations',
					collection: 'variations',
					kind: 'targeted-records',
					remoteIds: ['14'],
					forceRefresh: true,
				},
			],
		]);
		readyControls[0].resolve();
		await Promise.resolve();
		releases.forEach((release) => expect(release).not.toHaveBeenCalled());
		readyControls[1].resolve();
		await pending;
		releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
	});

	it('releases every handle and rethrows the original readiness failure', async () => {
		const pending = fetchFreshRecords(engine, requests);
		const error = new Error('storage unavailable');
		const rejected = expect(pending).rejects.toBe(error);
		readyControls[0].reject(error);
		await rejected;
		releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
	});

	it('releases acquired handles if declaring a later request throws', async () => {
		const error = new Error('require failed');
		const requireHandle = mockRequire.getMockImplementation()!;
		mockRequire.mockImplementationOnce(requireHandle).mockImplementationOnce(() => {
			throw error;
		});
		await expect(fetchFreshRecords(engine, requests)).rejects.toBe(error);
		expect(releases[0]).toHaveBeenCalledTimes(1);
	});
});

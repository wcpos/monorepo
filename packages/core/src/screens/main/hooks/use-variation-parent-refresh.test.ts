/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';

import type { EngineEvent } from '@wcpos/sync-engine';

import { useVariationParentRefresh } from './use-variation-parent-refresh';

const mockFindEngineResident = jest.fn();
const mockRequire = jest.fn();
const mockEvents = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('@wcpos/query', () => ({
	engineCollection: (database: { variations?: unknown } | null, name: string) =>
		name === 'variations' ? database?.variations : null,
	useQueryRuntime: () => ({
		engine: {
			events: mockEvents,
			require: mockRequire,
			active: () => ({
				database: {
					variations: {
						findOne: (recordId: string) => ({ exec: () => mockFindEngineResident(recordId) }),
					},
				},
			}),
		},
	}),
}));

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ error: (...args: unknown[]) => mockLoggerError(...args) }),
	getErrorMessage: (error: unknown) => String(error),
}));

/** The engine's event callback, captured when the hook subscribes. */
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

const mount = () => renderHook(() => useVariationParentRefresh());

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

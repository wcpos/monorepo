import type { SyncEvent, SyncObserver } from '@wcpos/sync-core';

export type CollectionSyncStatus = {
	lastCheckedAt: number | null;
	lastChangedAt: number | null;
	lastError: { at: number; type: string; message: string } | null;
};

export type SyncStatusState = Record<string, CollectionSyncStatus>;

export const SYNC_STATUS_STATE_KEY = 'sync_status_v1';

const EMPTY: CollectionSyncStatus = {
	lastCheckedAt: null,
	lastChangedAt: null,
	lastError: null,
};

function errorsEqual(
	left: CollectionSyncStatus['lastError'],
	right: CollectionSyncStatus['lastError']
): boolean {
	return (
		left === right ||
		(left !== null &&
			right !== null &&
			left.at === right.at &&
			left.type === right.type &&
			left.message === right.message)
	);
}

export function foldSyncStatus(
	state: SyncStatusState,
	event: SyncEvent,
	atMs: number
): SyncStatusState {
	let next = state;
	const update = (collection: string, patch: Partial<CollectionSyncStatus>): void => {
		const current = next[collection] ?? EMPTY;
		const entry = { ...current, ...patch };
		if (
			entry.lastCheckedAt === current.lastCheckedAt &&
			entry.lastChangedAt === current.lastChangedAt &&
			errorsEqual(entry.lastError, current.lastError)
		) {
			return;
		}
		if (next === state) next = { ...state };
		next[collection] = entry;
	};

	if (event.type === 'signal.cycle' && Array.isArray(event.fields?.collectionsChecked)) {
		for (const collection of event.fields.collectionsChecked) {
			if (typeof collection === 'string') update(collection, { lastCheckedAt: atMs });
		}
	}
	if (
		event.type === 'engine.lane.tick' &&
		event.fields?.lane === 'order-window-seed' &&
		event.fields.status === 'ran'
	) {
		update('orders', { lastCheckedAt: atMs });
	}
	if (
		(event.type === 'apply.pull' || event.type === 'apply.delete') &&
		event.collection &&
		typeof event.fields?.applied === 'number' &&
		event.fields.applied > 0
	) {
		update(event.collection, { lastChangedAt: atMs });
	}
	if ((event.level === 'warn' || event.level === 'error') && event.collection) {
		update(event.collection, {
			lastError: { at: atMs, type: event.type, message: event.message ?? event.type },
		});
	}
	return next;
}

let syncStatusState: SyncStatusState = {};
let syncStatusEpoch = 0;
let staleFlag = false;
const listeners = new Set<() => void>();

function setSyncStatusState(next: SyncStatusState): void {
	if (next === syncStatusState) return;
	syncStatusState = next;
	for (const listener of listeners) listener();
}

export const syncStatusObserver: SyncObserver = (event) => {
	// A lazy reset (markSyncStatusStale) runs here, on the first observed event —
	// never during render — so the outgoing store's persistence-bridge flush has
	// already snapshotted the old state before this fresh session overwrites it.
	if (staleFlag) resetSyncStatus();
	// The emitter stamps `at` at emit time; the fallback covers events from
	// emitters that omit it.
	setSyncStatusState(foldSyncStatus(syncStatusState, event, event.at ?? Date.now()));
};

export function getSyncStatusState(): SyncStatusState {
	return syncStatusState;
}

/**
 * Defer a wipe of the module state to the next observed event instead of doing it
 * now. Setting the flag does NOT touch state and fires NO listeners — critical so
 * that a store switch (which supersedes the engine during render) cannot make the
 * outgoing bridge's cleanup flush persist an empty snapshot into the old store's
 * doc. The incoming bridge's own reset-before-hydrate clears this flag on a genuine
 * store switch, so a lazy reset never wipes freshly hydrated history.
 */
export function markSyncStatusStale(): void {
	staleFlag = true;
}

export function resetSyncStatus(): void {
	// A bridge-level reset supersedes a pending lazy one — they serve the same
	// purpose, so clear the flag to avoid a redundant second wipe.
	staleFlag = false;
	syncStatusState = {};
	syncStatusEpoch += 1;
	for (const listener of listeners) listener();
}

export function getSyncStatusEpoch(): number {
	return syncStatusEpoch;
}

function newerTimestamp(current: number | null, persisted: number | null): number | null {
	if (current === null) return persisted;
	if (persisted === null) return current;
	return Math.max(current, persisted);
}

export function hydrateSyncStatus(persisted: SyncStatusState | undefined): void {
	if (!persisted) return;
	let next = syncStatusState;
	for (const [collection, saved] of Object.entries(persisted)) {
		const current = next[collection] ?? EMPTY;
		const entry: CollectionSyncStatus = {
			lastCheckedAt: newerTimestamp(current.lastCheckedAt, saved.lastCheckedAt),
			lastChangedAt: newerTimestamp(current.lastChangedAt, saved.lastChangedAt),
			lastError:
				!current.lastError || (saved.lastError && saved.lastError.at > current.lastError.at)
					? saved.lastError
					: current.lastError,
		};
		if (
			entry.lastCheckedAt === current.lastCheckedAt &&
			entry.lastChangedAt === current.lastChangedAt &&
			errorsEqual(entry.lastError, current.lastError)
		) {
			continue;
		}
		if (next === syncStatusState) next = { ...syncStatusState };
		next[collection] = entry;
	}
	setSyncStatusState(next);
}

export function subscribeSyncStatus(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

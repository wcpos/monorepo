import type {
	QueuedMutation,
	RecordMutationQueue,
	RemoteId,
	StoreScopeManager,
	SyncObserver,
} from '@wcpos/sync-core';

import { writeFacetFor } from '../collections/collection-descriptors';
import { type ConflictResolutionChoice, createConflictResolution } from './conflict-resolution';
import {
	createWriteDrainLane,
	type WriteAnnihilatedEvent,
	type WriteDrainLaneDeps,
	type WriteDrainReport,
	type WriteOutcomeEvent,
	type WriteSupersededEvent,
} from './write-drain-lane';
import { queueFor as defaultQueueFor, enqueueWriteIntent, type WriteIntent } from './write-intents';

import type { SyncCollectionName } from '../collections/engine-collections';
import type { BarcodeSelectors } from '../materialization/barcode-selectors';
import type { RxDatabase } from 'rxdb';

export type { ConflictResolutionChoice, WriteIntent };
export type WriteReceipt = {
	mutationId: string;
	recordId: string;
	annihilated?: boolean;
	supersededMutationId?: string;
};
export type WriteOptions = {
	/**
	 * Bind the write to this scope (its scope id): it is refused unless that scope
	 * is the active one when the enqueue takes the scope guard — the same guard a
	 * switch takes — so it can never land in a scope the caller did not mean.
	 */
	scopeId?: string;
	/** A create takes its payload from the latest resident (see `enqueueWriteIntent`). */
	payloadFromResident?: boolean;
};
export type WritePlane = {
	write(intent: WriteIntent, options?: WriteOptions): Promise<WriteReceipt>;
	conflicts(): Promise<QueuedMutation[]>;
	resolveConflict(mutationId: string, resolution: ConflictResolutionChoice): Promise<void>;
	tick(signal?: AbortSignal): Promise<WriteDrainReport>;
	lastError(): string | null;
	queueDepth(): number | null;
	sessionHeld(): boolean;
};
type WritePlaneDeps = {
	assertUsable: () => void;
	settled: (kind: 'read' | 'write') => Promise<void>;
	manager: StoreScopeManager;
	databaseFor: (scopeId: string) => RxDatabase | null;
	fetcher: (url: string, init?: RequestInit) => Promise<Response>;
	syncBaseUrl: string;
	mintUuid: () => string;
	now: () => number;
	diagnostics: SyncObserver;
	onStatusChanged: () => void;
	connectivity: () => 'online' | 'offline' | 'degraded';
	emitWriteEvent: (event: WriteOutcomeEvent | WriteAnnihilatedEvent | WriteSupersededEvent) => void;
	onActivityChange?: (collection: SyncCollectionName, delta: 1 | -1) => void;
	barcodeSelectorsFor?: (scopeId: string) => BarcodeSelectors | null;
	persistOrderRepull: (input: {
		database: RxDatabase;
		remoteIds: RemoteId[];
		nowMs?: number;
	}) => Promise<void>;
	repullOrdersNow: (input: { remoteIds: RemoteId[]; reason: string }) => Promise<void>;
	queueFor?: (database: RxDatabase) => RecordMutationQueue;
	/** The facets the drain lane acknowledges through (see `WriteDrainLaneDeps.writeFacetFor`). */
	writeFacetFor?: WriteDrainLaneDeps['writeFacetFor'];
};
export function createWritePlane(deps: WritePlaneDeps): WritePlane {
	const queueFor = deps.queueFor ?? defaultQueueFor;
	let queueDepth: number | null = null;
	let sessionHeldScope: string | null = null;
	let lastError: string | null = null;
	let drainChain: Promise<unknown> = Promise.resolve();
	// Resolutions run ONE AT A TIME (#832 follow-up, R7b). Two different choices
	// racing on the same dead letter is not a hypothetical: requeue durably
	// enqueues its replacement BEFORE it retires the dead letter, so a discard
	// interleaving in that window destroys the resident while the replacement is
	// already queued — the drain then pushes the create and the ack's
	// missing-resident path REMATERIALIZES the order the cashier just confirmed
	// destroying. Neither side can unwind the other once the drain has claimed the
	// row, so the fix is to stop the interleave happening. Same idiom as the
	// queue's own transition chain: serialize, and let each resolution re-read
	// state inside its own turn (both paths already do).
	let resolutionChain: Promise<unknown> = Promise.resolve();
	// This drain instance's id for the durable claim lease (task 43 follow-up):
	// one per lane, so two Electron windows mint different ids and cannot both hold
	// one row's claim. Minted lazily on first use — the lane may be constructed on a
	// host without Web Crypto, and a lane that never drains must not pay for an id.
	let drainInstanceIdOnce: string | null = null;
	let resolutionInstanceIdOnce: string | null = null;
	const ignore = (): undefined => undefined;
	const serializeResolution = <T>(op: () => Promise<T>): Promise<T> => {
		const run = resolutionChain.then(op, op);
		resolutionChain = run.then(ignore, ignore);
		return run;
	};
	const onQueueChanged = async (database: RxDatabase | null): Promise<void> => {
		if (database) queueDepth = (await queueFor(database).pending()).length;
		deps.onStatusChanged();
	};
	const drainLane = createWriteDrainLane({
		manager: deps.manager,
		databaseFor: deps.databaseFor,
		fetcher: deps.fetcher,
		syncBaseUrl: deps.syncBaseUrl,
		connectivity: deps.connectivity,
		diagnostics: deps.diagnostics,
		emitWriteEvent: deps.emitWriteEvent,
		mintUuid: deps.mintUuid,
		queueFor,
		drainInstanceIdFor: () => (drainInstanceIdOnce ??= deps.mintUuid()),
		setQueueDepth: (depth) => void (queueDepth = depth),
		setSessionHeld: (scopeId) => {
			sessionHeldScope = scopeId;
			deps.onStatusChanged();
		},
		setLastError: (error) => void (lastError = error),
		...(deps.onActivityChange ? { onActivityChange: deps.onActivityChange } : {}),
		...(deps.barcodeSelectorsFor ? { barcodeSelectorsFor: deps.barcodeSelectorsFor } : {}),
		...(deps.writeFacetFor ? { writeFacetFor: deps.writeFacetFor } : {}),
		now: deps.now,
	});
	const conflictResolution = createConflictResolution({
		assertUsable: deps.assertUsable,
		settled: deps.settled,
		manager: deps.manager,
		databaseFor: deps.databaseFor,
		fetcher: deps.fetcher,
		syncBaseUrl: deps.syncBaseUrl,
		now: deps.now,
		mintUuid: deps.mintUuid,
		diagnostics: deps.diagnostics,
		persistOrderRepull: deps.persistOrderRepull,
		repullOrdersNow: deps.repullOrdersNow,
		queueFor,
		resolutionInstanceIdFor: () => (resolutionInstanceIdOnce ??= deps.mintUuid()),
		serializeResolution,
		onQueueChanged,
		...(deps.barcodeSelectorsFor ? { barcodeSelectorsFor: deps.barcodeSelectorsFor } : {}),
		...(deps.writeFacetFor ? { writeFacetFor: deps.writeFacetFor } : {}),
	});
	return {
		write: async (intent, options) => {
			deps.assertUsable();
			if (!writeFacetFor(intent.collection)) {
				throw new Error(
					`write: collection "${intent.collection}" is not client-writeable (no push/ack contract) — writeable collections: orders, products, variations, customers, coupons`
				);
			}
			// Invariant 3's write() half: a pending switch/reset must settle before
			// the enqueue captures a scope — otherwise the mutation could land in
			// the OUTGOING store's queue mid-transition. FIFO ops are quick; wait
			// them out rather than reject a caller-initiated durable write.
			await deps.settled('write');
			return deps.manager.runGuarded(async (bound) => {
				if (options?.scopeId !== undefined && bound.scopeId !== options.scopeId) {
					throw new Error(
						'write: the active scope is not the one this write is bound to — nothing was enqueued'
					);
				}
				const database = deps.databaseFor(bound.scopeId);
				if (!database) throw new Error('write: scope database not open');
				let result: WriteReceipt | null = null;
				const wrote = await bound.guardWrite(async () => {
					result = await enqueueWriteIntent({
						db: database,
						intent,
						mintUuid: deps.mintUuid,
						now: () => new Date(deps.now()).toISOString(),
						observe: deps.diagnostics,
						canCoalesce: true,
						...(options?.payloadFromResident ? { payloadFromResident: true } : {}),
					});
					await onQueueChanged(database);
				});
				if (wrote === 'dropped' || result === null) {
					throw new Error('write: scope moved during enqueue — retry against the settled scope');
				}
				const receipt = result as WriteReceipt;
				if (receipt.annihilated) {
					// The honest terminal contract (gate2 #516 item 3): the delete was
					// satisfied locally (chain cancelled, resident row removed) — ONE
					// terminal event for the receipt mutationId, and no 'enqueued'
					// diagnostics (nothing was enqueued).
					deps.emitWriteEvent({
						type: 'write-annihilated',
						collection: intent.collection,
						recordId: receipt.recordId,
						mutationId: receipt.mutationId,
					});
					return receipt;
				}
				deps.diagnostics({
					type: 'queue.write.enqueued',
					level: 'debug',
					collection: intent.collection,
					fields: {
						mutationId: receipt.mutationId,
						recordId: receipt.recordId,
						queueDepth,
					},
				});
				// The coalesce orphaned the prior row's id: tell its waiter which id to
				// follow now. AFTER the enqueue diagnostics, so the replacement is already
				// durably queued when a re-bound waiter asks for its replay.
				if (receipt.supersededMutationId !== undefined) {
					deps.emitWriteEvent({
						type: 'write-superseded',
						collection: intent.collection,
						recordId: receipt.recordId,
						mutationId: receipt.supersededMutationId,
						replacedBy: receipt.mutationId,
					});
				}
				return receipt;
			});
		},
		conflicts: conflictResolution.conflicts,
		resolveConflict: conflictResolution.resolveConflict,
		tick: (signal) => {
			const run = drainChain.then(
				() => drainLane.tick(signal),
				() => drainLane.tick(signal)
			);
			drainChain = run.then(ignore, ignore);
			return run;
		},
		lastError: () => lastError,
		queueDepth: () => queueDepth,
		sessionHeld: () => sessionHeldScope !== null && sessionHeldScope === deps.manager.activeScope,
	};
}

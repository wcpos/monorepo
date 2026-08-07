import type {
	QueuedMutation,
	RecordMutationQueue,
	StoreScopeManager,
	SyncObserver,
} from '@wcpos/sync-core';

import { writeFacetFor } from '../collections/collection-descriptors';
import { type ConflictResolutionChoice, createConflictResolution } from './conflict-resolution';
import {
	createWriteDrainLane,
	type WriteDrainReport,
	type WriteOutcomeEvent,
} from './write-drain-lane';
import { queueFor as defaultQueueFor, enqueueWriteIntent, type WriteIntent } from './write-intents';

import type { SyncCollectionName } from '../collections/engine-collections';
import type { BarcodeSelectors } from '../materialization/barcode-selectors';
import type { RxDatabase } from 'rxdb';

export type { ConflictResolutionChoice, WriteIntent };
export type WriteReceipt = { mutationId: string; recordId: string; annihilated?: boolean };
export type WritePlane = {
	write(intent: WriteIntent): Promise<WriteReceipt>;
	conflicts(): Promise<QueuedMutation[]>;
	resolveConflict(mutationId: string, resolution: ConflictResolutionChoice): Promise<void>;
	tick(signal?: AbortSignal): Promise<WriteDrainReport>;
	lastError(): string | null;
	queueDepth(): number | null;
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
	isWritePlaneOwner: () => boolean;
	emitWriteEvent: (
		event:
			| WriteOutcomeEvent
			| { type: 'write-annihilated'; collection: string; recordId: string; mutationId: string }
	) => void;
	onActivityChange?: (collection: SyncCollectionName, delta: 1 | -1) => void;
	barcodeSelectorsFor?: (scopeId: string) => BarcodeSelectors | null;
	persistOrderRepull: (input: {
		database: RxDatabase;
		wooIds: number[];
		nowMs?: number;
	}) => Promise<void>;
	repullOrdersNow: (input: { wooIds: number[]; reason: string }) => Promise<void>;
	queueFor?: (database: RxDatabase) => RecordMutationQueue;
};
export function createWritePlane(deps: WritePlaneDeps): WritePlane {
	const queueFor = deps.queueFor ?? defaultQueueFor;
	let queueDepth: number | null = null;
	let lastError: string | null = null;
	let drainChain: Promise<unknown> = Promise.resolve();
	let resolutionChain: Promise<unknown> = Promise.resolve();
	let drainInstanceIdOnce: string | null = null;
	let resolutionInstanceIdOnce: string | null = null;
	const ignore = (): undefined => undefined;
	const serializeResolution = <T>(op: () => Promise<T>): Promise<T> => {
		const run = resolutionChain.then(op, op);
		resolutionChain = run.then(ignore, ignore);
		return run;
	};
	const onQueueChanged = async (database: RxDatabase): Promise<void> => {
		queueDepth = (await queueFor(database).pending()).length;
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
		setLastError: (error) => void (lastError = error),
		...(deps.onActivityChange ? { onActivityChange: deps.onActivityChange } : {}),
		...(deps.barcodeSelectorsFor ? { barcodeSelectorsFor: deps.barcodeSelectorsFor } : {}),
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
	});
	return {
		write: async (intent) => {
			deps.assertUsable();
			if (!writeFacetFor(intent.collection)) {
				throw new Error(
					`write: collection "${intent.collection}" is not client-writeable (no push/ack contract) — writeable collections: orders, products, variations, customers, coupons`
				);
			}
			await deps.settled('write');
			return deps.manager.runGuarded(async (bound) => {
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
						canCoalesce: deps.isWritePlaneOwner(),
					});
					await onQueueChanged(database);
				});
				if (wrote === 'dropped' || result === null) {
					throw new Error('write: scope moved during enqueue — retry against the settled scope');
				}
				const receipt = result as WriteReceipt;
				if (receipt.annihilated) {
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
					level: 'info',
					collection: intent.collection,
					fields: {
						mutationId: receipt.mutationId,
						recordId: receipt.recordId,
						queueDepth,
					},
				});
				return receipt;
			});
		},
		conflicts: conflictResolution.conflicts,
		resolveConflict: (mutationId, resolution) => {
			if (!deps.isWritePlaneOwner()) {
				const error = new Error(
					'resolveConflict: another tab is the active window completing this — switch to it, or wait for it to finish'
				);
				error.name = 'WritePlaneFollowerError';
				return Promise.reject(error);
			}
			return conflictResolution.resolveConflict(mutationId, resolution);
		},
		tick: (signal) => {
			if (!deps.isWritePlaneOwner()) {
				return Promise.resolve({ lane: 'write-drain', status: 'ran', pushed: 0 });
			}
			const run = drainChain.then(
				() => drainLane.tick(signal),
				() => drainLane.tick(signal)
			);
			drainChain = run.then(ignore, ignore);
			return run;
		},
		lastError: () => lastError,
		queueDepth: () => queueDepth,
	};
}

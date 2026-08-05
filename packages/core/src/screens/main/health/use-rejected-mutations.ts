import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { from, Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { useQueryRuntime } from '@wcpos/query';
import { MUTATION_QUEUE_RXDB_COLLECTION } from '@wcpos/sync-engine';
import type { EngineConflict, RxdbSyncEngine } from '@wcpos/sync-engine';

/**
 * The dead-letter feed for Store health → Database (#832).
 *
 * A `rejected` queue row is a write the server permanently refused — for a
 * CREATE that means a completed sale that exists only on this device and that
 * nothing will ever retry. Until this hook existed the only trace was a lumped
 * count, so the recovery story lived in a support session. Each row here carries
 * what a cashier needs to decide: what it was, what the server said, when, and
 * how many recoveries it has already survived.
 *
 * `residentMissing` is the one branch the UI must respect: recovery REBUILDS the
 * payload from the resident record, so a row whose record is gone from this
 * device can only be discarded.
 */
export type RejectedMutation = {
	mutationId: string;
	collectionName: string;
	recordId: string;
	operation: 'create' | 'update' | 'delete';
	/** Human handle for the record ("#1042 · 25.00"), or null when nothing names it. */
	label: string | null;
	/** The server's machine code (`rest_invalid_param`), when it sent one. */
	reason: string | null;
	/** The server's own sentence, when it sent one. */
	message: string | null;
	status: number | null;
	rejectedAt: string | null;
	/** Recoveries this chain has already survived; 0 for a first-time dead letter. */
	requeueCount: number;
	/** The record is no longer on this device — there is nothing to rebuild from. */
	residentMissing: boolean;
};

type EngineDatabase = NonNullable<ReturnType<RxdbSyncEngine['active']>>['database'];
type MutationRow = EngineConflict | { toJSON(): EngineConflict };
type MutationCollection = {
	find(query: { selector: { status: { $eq: string } } }): {
		$: Observable<readonly MutationRow[]>;
	};
};

function toJson(row: MutationRow): EngineConflict {
	return 'toJSON' in row && typeof row.toJSON === 'function'
		? row.toJSON()
		: (row as EngineConflict);
}

function labelFor(resident: Record<string, unknown> | null, entry: EngineConflict): string | null {
	const payload = (entry.payload ?? {}) as Record<string, unknown>;
	const source = resident ?? payload;
	const number = source.number ?? payload.number;
	const total = source.total ?? payload.total;
	const parts = [
		typeof number === 'string' && number !== '' ? `#${number}` : null,
		typeof total === 'string' && total !== '' ? total : null,
	].filter((part): part is string => part !== null);
	return parts.length > 0 ? parts.join(' · ') : null;
}

async function describe(
	database: EngineDatabase,
	rows: readonly MutationRow[]
): Promise<RejectedMutation[]> {
	const described = await Promise.all(
		rows.map(async (row) => {
			const entry = toJson(row);
			const doc = await database.collections[entry.collectionName]?.findOne(entry.recordId).exec();
			const resident = (doc?.toJSON() ?? null) as Record<string, unknown> | null;
			return {
				mutationId: entry.mutationId,
				collectionName: entry.collectionName,
				recordId: entry.recordId,
				operation: entry.operation,
				label: labelFor(resident, entry),
				reason: entry.rejectedReason ?? null,
				message: entry.rejectedMessage ?? null,
				status: entry.rejectedStatus ?? null,
				rejectedAt: entry.rejectedAt ?? null,
				requeueCount: entry.requeueCount ?? 0,
				residentMissing: resident === null,
			};
		})
	);
	// Newest refusal first — the row a cashier is most likely looking for.
	return described.sort((a, b) => (b.rejectedAt ?? '').localeCompare(a.rejectedAt ?? ''));
}

function rejected$(engine: RxdbSyncEngine): Observable<RejectedMutation[]> {
	return new Observable<EngineDatabase | null>((subscriber) =>
		engine.db$((database) => subscriber.next(database))
	).pipe(
		switchMap((database) => {
			if (!database) return of<RejectedMutation[]>([]);
			const mutations = database.collections[
				MUTATION_QUEUE_RXDB_COLLECTION
			] as unknown as MutationCollection;
			return mutations
				.find({ selector: { status: { $eq: 'rejected' } } })
				.$.pipe(switchMap((rows) => from(describe(database, rows))));
		})
	);
}

/**
 * Suspends until the first emission, then re-renders on every queue change — the
 * house data-flow (ObservableResource + Suspense), so there is no loading branch
 * to get wrong. Keyed on the engine so a scope switch rebuilds the resource.
 */
export function useRejectedMutations(): RejectedMutation[] {
	const { engine } = useQueryRuntime();
	const resource = React.useMemo(() => new ObservableResource(rejected$(engine)), [engine]);
	return useObservableSuspense(resource);
}

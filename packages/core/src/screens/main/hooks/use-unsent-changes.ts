import * as React from 'react';

import { Observable, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

import { useQueryRuntime } from '@wcpos/query';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { MUTATION_QUEUE_RXDB_COLLECTION } from '@wcpos/sync-engine';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';
import {
	classifyUnsentChanges,
	readUnsentChanges,
	rememberUnsentChanges,
	type UnsentChanges,
} from '@wcpos/utils/unsent-changes';

const healthLogger = getLogger(['wcpos', 'health']);

/**
 * Structural, so this module stays a leaf: importing the translations context
 * here would drag i18next and the whole app-state graph into anything that only
 * wants to count the queue.
 */
type Translate = (key: string, options?: { count: number }) => string;

/**
 * UNSENT WORK — the fault-counter family that answers "is it safe to reset?"
 * (CONTEXT.md § Language — Fault counters). The engine-side half of the shared
 * unsent-changes check (#1098); the pure half — the reading, and the remembered
 * value the crash screen falls back on — lives in `@wcpos/utils/unsent-changes`,
 * where the essay explains why the two halves are split.
 *
 * The count is the WHOLE mutation queue, with no status selector. A row leaves
 * the queue only when the server acknowledges it, so every row still there is a
 * change the server has never seen: pending, claimed, conflicted,
 * needs-revision, and the dead letters alike. Selecting on `status` would also
 * miss the rows that legitimately carry none — the schema leaves it optional and
 * treats an absent status as pending — and a change that is invisible to the
 * count is a change a cashier is never warned about losing.
 *
 * IT IS SUPPOSED TO DISAGREE with the SYNC BACKLOG (`use-engine-monitor.ts`),
 * which excludes the rows the engine holds while a cart is open and every
 * terminal row. That number asks whether sync is healthy, and a held cart is no
 * fault; this one asks what a wipe would destroy, and a held cart is a sale.
 * Neither is wrong, and adopting the other's exclusions breaks one of them —
 * see `fault-counter-families.test.tsx`, which pins both off one queue.
 */

type EngineDatabase = NonNullable<ReturnType<RxdbSyncEngine['active']>>['database'];
type CountCollection = {
	count(): { $: Observable<number>; exec(): Promise<number> };
};

const UNSENT_CHANGES_COUNT_TIMEOUT_MS = 1_000;

function queueOf(database: EngineDatabase): CountCollection {
	return database.collections[MUTATION_QUEUE_RXDB_COLLECTION] as unknown as CountCollection;
}

function unsentCount$(engine: RxdbSyncEngine): Observable<number | null> {
	return new Observable<EngineDatabase | null>((subscriber) =>
		engine.db$((database) => subscriber.next(database))
	).pipe(
		switchMap((database) => {
			// No database (disposed, mid-switch, never opened) is NOT an empty queue.
			// Recording `null` makes the next reader say "may include unsent sales"
			// instead of inheriting a zero from the previous scope.
			if (!database) return of(null);
			return queueOf(database).count().$;
		}),
		catchError(() => of(null))
	);
}

/**
 * Keep the remembered reading current for surfaces that cannot ask the engine —
 * above all the root error boundary, which renders above every provider.
 */
export function subscribeToUnsentChanges(engine: RxdbSyncEngine): () => void {
	const subscription = unsentCount$(engine).subscribe({
		// An empty active queue cannot prove that inactive scope databases erased by
		// clearAllDB are empty, so it is not safe to remember the reassuring state.
		next: (count) => rememberUnsentChanges(count === 0 ? null : count),
		error: () => rememberUnsentChanges(null),
	});
	return () => subscription.unsubscribe();
}

/**
 * The authoritative reading, for a surface that still has an engine. Falls back
 * to the remembered value — and from there to `unknown` — rather than throwing:
 * a reset confirm that cannot count must still open, because refusing to reset a
 * broken profile removes the only way out of it.
 */
export async function countUnsentChanges(engine: RxdbSyncEngine): Promise<UnsentChanges> {
	let deadline: ReturnType<typeof setTimeout> | undefined;
	try {
		const database = engine.active()?.database;
		if (!database) return readUnsentChanges();
		const count = await Promise.race([
			queueOf(database).count().exec(),
			new Promise<null>((resolve) => {
				deadline = setTimeout(() => resolve(null), UNSENT_CHANGES_COUNT_TIMEOUT_MS);
			}),
		]);
		if (count === null) return readUnsentChanges();
		rememberUnsentChanges(count === 0 ? null : count);
		if (count === 0) return readUnsentChanges();
		return classifyUnsentChanges(count);
	} catch (error) {
		healthLogger.warn('Unsent-changes count probe failed; showing the cached value', {
			context: { error: getErrorMessage(error) },
		});
		return readUnsentChanges();
	} finally {
		if (deadline !== undefined) clearTimeout(deadline);
	}
}

/**
 * What a "clear all local data" confirm says, given the reading: the unsent-work
 * warning FIRST — that is the part that cannot be undone — then what the wipe
 * itself does.
 *
 * Split out from the menu so the sentence a cashier actually reads is testable.
 * `unknown` gets its own copy on purpose: it must warn that the wipe MAY destroy
 * unsent sales, never borrow the reassuring `none` sentence (#1098). The keys
 * are written out in full rather than assembled, so the translation extractor
 * can see them.
 */
export function describeResetConfirm(unsent: UnsentChanges, t: Translate): string {
	const warning =
		unsent.status === 'unknown'
			? t('common.clear_all_local_data_unknown')
			: unsent.status === 'none'
				? t('common.clear_all_local_data_none')
				: t('common.clear_all_local_data_unsent', { count: unsent.count });

	return `${warning} ${t('common.clear_all_local_data_body')}`;
}

export function useUnsentChangesRecorder(): void {
	const { engine } = useQueryRuntime();

	React.useEffect(() => {
		// An external RxDB subscription bound to the engine lifecycle, the same
		// shape `useMutationCounts` uses.
		return subscribeToUnsentChanges(engine);
	}, [engine]);
}

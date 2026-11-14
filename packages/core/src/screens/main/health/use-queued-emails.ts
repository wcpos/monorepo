import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { tap } from 'rxjs/operators';

import {
	observeQueuedEmails,
	type QueuedEmail,
	type ReceiptEmailStoreDatabase,
} from '@wcpos/query/receipt-email-queue';

import { useAppState } from '../../../contexts/app-state';

export type { QueuedEmail } from '@wcpos/query/receipt-email-queue';

/**
 * One resource per store database, held OUTSIDE the render lifecycle — the same
 * suspend-before-commit trap `use-rejected-mutations` documents.
 *
 * That file claims this hook "gets away with" a `useMemo` because its observable emits
 * `of([])` synchronously while the collection is undefined. That is only true on a cold boot.
 * Open Store Health with a store database already mounted — the ordinary way a merchant gets
 * here — and `observeQueuedEmails` takes the live `find().$` path, whose first emission is async; the
 * panel then suspends before it has ever committed, React discards the `useMemo` with the
 * aborted render, and every retry builds a resource that suspends for the reason its
 * predecessor did. A loop, not a load (#1707).
 *
 * Keyed on the database; the named read follows resets and a store switch gets a new resource.
 *
 * A FAILED RESOURCE IS NEVER SERVED TWICE, for the reason `engine-record-resource` gives
 * (#1710): `ObservableResource` latches an error and `read()` rethrows it forever, so a queue
 * read that fails before its first value — a transient storage fault, a database closing under
 * the query — would otherwise be cached for the database's whole lifetime, and navigating
 * away and back would read the same dead resource. The per-mount implementation this replaced
 * resubscribed on every mount, and that recovery has to survive the cache. The input is tapped:
 * an error, or a completion with no value at all (which `ObservableResource` turns into
 * "Suspender ended unexpectedly"), drops the entry, so the Suspense retry that follows builds a
 * live one and the panel recovers when storage does.
 */
const resourceByDatabase = new WeakMap<object, ObservableResource<QueuedEmail[]>>();
/** No store database: `of([])`, one resource for all of them, and it never suspends. */
const emptyQueueResource = new ObservableResource(observeQueuedEmails(undefined));

function queuedEmailsResource(
	storeDB: ReceiptEmailStoreDatabase
): ObservableResource<QueuedEmail[]> {
	if (!storeDB) return emptyQueueResource;
	const cached = resourceByDatabase.get(storeDB);
	if (cached && !cached.isDestroyed) return cached;

	// A failure can arrive synchronously, inside the `ObservableResource` constructor — so
	// before `holder.resource` is assigned and before anything is cached to drop. The flag is
	// what covers that case; the holder covers the asynchronous one. (Closing over the `const`
	// directly is a temporal-dead-zone throw on the synchronous path, which is exactly what
	// "re-subscribes after a transient queue error and remount" catches.)
	let emitted = false;
	let failed = false;
	const holder: { resource?: ObservableResource<QueuedEmail[]> } = {};
	const dropFailed = () => {
		failed = true;
		if (holder.resource && resourceByDatabase.get(storeDB) === holder.resource) {
			resourceByDatabase.delete(storeDB);
		}
	};
	const resource = new ObservableResource(
		observeQueuedEmails(storeDB).pipe(
			tap({
				next: () => {
					emitted = true;
				},
				error: dropFailed,
				complete: () => {
					if (!emitted) dropFailed();
				},
			})
		)
	);
	holder.resource = resource;
	if (!failed) resourceByDatabase.set(storeDB, resource);
	return resource;
}

/**
 * Suspends until the first emission, then re-renders on every queue change —
 * the house data-flow (ObservableResource + Suspense), so there is no loading
 * branch to get wrong.
 */
export function useQueuedEmails(): QueuedEmail[] {
	const { storeDB } = useAppState();
	return useObservableSuspense(queuedEmailsResource(storeDB));
}

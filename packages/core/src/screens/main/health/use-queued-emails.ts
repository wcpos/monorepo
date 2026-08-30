import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { map, tap } from 'rxjs/operators';
import { type Observable, of } from 'rxjs';

import { useReceiptEmailQueueCollection } from '../receipt/email-queue/use-receipt-email-queue-collection';

import type { ReceiptEmailDoc } from '../receipt/email-queue/queue';

/**
 * The unfinished receipt emails for Store health → Database (#165).
 *
 * `sent` rows are deliberately absent: they are history, and the panel exists
 * to surface work that has NOT happened yet. A row is either still trying
 * (pending) or has stopped trying (failed), and only those two need a merchant.
 */
export type QueuedEmail = {
	doc: ReceiptEmailDoc;
	localID: string;
	orderId: number;
	orderNumber?: string;
	email: string;
	status: 'pending' | 'failed';
	queuedAt: string;
	attempts: number;
	nextAttemptAt?: string;
	lastError?: string;
};

type QueueCollection = {
	find(query: { selector: Record<string, unknown> }): { $: Observable<readonly ReceiptEmailDoc[]> };
};

function toRow(doc: ReceiptEmailDoc): QueuedEmail {
	return {
		doc,
		localID: doc.localID,
		orderId: doc.orderId,
		orderNumber: doc.orderNumber,
		email: doc.email,
		status: doc.status === 'failed' ? 'failed' : 'pending',
		queuedAt: doc.queuedAt,
		attempts: doc.attempts,
		nextAttemptAt: doc.nextAttemptAt,
		lastError: doc.lastError,
	};
}

function queued$(collection: QueueCollection | undefined): Observable<QueuedEmail[]> {
	// No store database yet: an empty queue, not a permanently-suspended panel.
	if (!collection) return of<QueuedEmail[]>([]);
	return collection.find({ selector: { status: { $in: ['pending', 'failed'] } } }).$.pipe(
		map((docs) =>
			[...docs]
				.map(toRow)
				// Failed first — those need a decision; then oldest queued.
				.sort((a, b) => {
					if (a.status !== b.status) return a.status === 'failed' ? -1 : 1;
					return a.queuedAt.localeCompare(b.queuedAt);
				})
		)
	);
}

/**
 * One resource per queue collection, held OUTSIDE the render lifecycle — the same
 * suspend-before-commit trap `use-rejected-mutations` documents.
 *
 * That file claims this hook "gets away with" a `useMemo` because its observable emits
 * `of([])` synchronously while the collection is undefined. That is only true on a cold boot.
 * Open Store Health with a store database already mounted — the ordinary way a merchant gets
 * here — and `queued$` takes the live `find().$` path, whose first emission is async; the
 * panel then suspends before it has ever committed, React discards the `useMemo` with the
 * aborted render, and every retry builds a resource that suspends for the reason its
 * predecessor did. A loop, not a load (#1707).
 *
 * Keyed on the collection, so a store switch or a reset follows the new one and the entry is
 * released with the collection it belongs to.
 *
 * A FAILED RESOURCE IS NEVER SERVED TWICE, for the reason `engine-record-resource` gives
 * (#1710): `ObservableResource` latches an error and `read()` rethrows it forever, so a queue
 * read that fails before its first value — a transient storage fault, a database closing under
 * the query — would otherwise be cached for the collection's whole lifetime, and navigating
 * away and back would read the same dead resource. The per-mount implementation this replaced
 * resubscribed on every mount, and that recovery has to survive the cache. The input is tapped:
 * an error, or a completion with no value at all (which `ObservableResource` turns into
 * "Suspender ended unexpectedly"), drops the entry, so the Suspense retry that follows builds a
 * live one and the panel recovers when storage does.
 */
const resourceByCollection = new WeakMap<object, ObservableResource<QueuedEmail[]>>();
/** No store database: `of([])`, one resource for all of them, and it never suspends. */
const emptyQueueResource = new ObservableResource(queued$(undefined));

function queuedEmailsResource(
	collection: QueueCollection | undefined
): ObservableResource<QueuedEmail[]> {
	if (!collection) return emptyQueueResource;
	const cached = resourceByCollection.get(collection);
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
		if (holder.resource && resourceByCollection.get(collection) === holder.resource) {
			resourceByCollection.delete(collection);
		}
	};
	const resource = new ObservableResource(
		queued$(collection).pipe(
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
	if (!failed) resourceByCollection.set(collection, resource);
	return resource;
}

/**
 * Suspends until the first emission, then re-renders on every queue change —
 * the house data-flow (ObservableResource + Suspense), so there is no loading
 * branch to get wrong.
 */
export function useQueuedEmails(): QueuedEmail[] {
	const collection = useReceiptEmailQueueCollection();
	return useObservableSuspense(
		queuedEmailsResource(collection as unknown as QueueCollection | undefined)
	);
}

import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { map } from 'rxjs/operators';
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
 */
const resourceByCollection = new WeakMap<object, ObservableResource<QueuedEmail[]>>();
/** No store database: `of([])`, one resource for all of them, and it never suspends. */
const emptyQueueResource = new ObservableResource(queued$(undefined));

function queuedEmailsResource(
	collection: QueueCollection | undefined
): ObservableResource<QueuedEmail[]> {
	if (!collection) return emptyQueueResource;
	let resource = resourceByCollection.get(collection);
	if (!resource) {
		resource = new ObservableResource(queued$(collection));
		resourceByCollection.set(collection, resource);
	}
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

import * as React from 'react';

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
 * Suspends until the first emission, then re-renders on every queue change —
 * the house data-flow (ObservableResource + Suspense), so there is no loading
 * branch to get wrong. Keyed on the collection so a store switch or a reset
 * rebuilds the resource.
 */
export function useQueuedEmails(): QueuedEmail[] {
	const collection = useReceiptEmailQueueCollection();
	const resource = React.useMemo(
		() => new ObservableResource(queued$(collection as unknown as QueueCollection | undefined)),
		[collection]
	);
	React.useEffect(() => {
		// ObservableResource owns the RxDB subscription and must release it on rebind/unmount.
		return () => resource.destroy();
	}, [resource]);
	return useObservableSuspense(resource);
}

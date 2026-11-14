import { map, type Observable, of, startWith, switchMap } from 'rxjs';

import { observeFollowedCollection } from '../use-local-collection';

import type { ReceiptEmailStoreDatabase } from './commands';
import type { ReceiptEmailDoc, ReceiptEmailRow } from './queue';

/**
 * The unfinished receipt emails for Store health → Database (#165).
 *
 * `sent` rows are deliberately absent: they are history, and the panel exists
 * to surface work that has NOT happened yet. A row is either still trying
 * (pending) or has stopped trying (failed), and only those two need a merchant.
 */
export type QueuedEmail = {
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

/** Absent → [], preserving the health panel's no-database answer. */
export function observeQueuedEmails(storeDB: ReceiptEmailStoreDatabase): Observable<QueuedEmail[]> {
	return observeFollowedCollection<ReceiptEmailRow>(storeDB, 'receipt_email_queue').pipe(
		switchMap((collection) => queued$(collection))
	);
}

/** Emit on every own replacement, even when availability remains true. */
export function observeReceiptEmailQueueAvailability(storeDB: ReceiptEmailStoreDatabase) {
	return observeFollowedCollection(storeDB, 'receipt_email_queue').pipe(
		map(Boolean),
		startWith(false)
	);
}

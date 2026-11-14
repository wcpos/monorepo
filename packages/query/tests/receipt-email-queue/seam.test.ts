import { BehaviorSubject, of, Subject } from 'rxjs';

import {
	observeQueuedEmails,
	observeReceiptEmailQueueAvailability,
} from '../../src/receipt-email-queue';

const input = { orderId: 42, email: 'ada@example.com' };

// Removing switchMap or the owner guard would retain old rows or adopt another store's queue.
it('maps plain unfinished rows, follows only its own resets, and reports availability', () => {
	const reset$ = new Subject<never>();
	const rows = new BehaviorSubject([
		{ ...input, localID: 'pending', status: 'pending', queuedAt: '2026-01-01', attempts: 0 },
		{ ...input, localID: 'failed', status: 'failed', queuedAt: '2026-02-01', attempts: 2 },
	]);
	const first = { find: jest.fn(() => ({ $: rows })) };
	const storeDB = { collections: { receipt_email_queue: first }, reset$ };
	const values: unknown[][] = [],
		available: boolean[] = [];
	const sub = observeQueuedEmails(storeDB).subscribe((value) => values.push(value));
	const availability = observeReceiptEmailQueueAvailability(storeDB).subscribe((value) =>
		available.push(value)
	);
	expect(first.find).toHaveBeenCalledWith({ selector: { status: { $in: ['pending', 'failed'] } } });
	expect(values[0]).toMatchObject([{ localID: 'failed' }, { localID: 'pending' }]);
	expect(values[0][0]).not.toHaveProperty('doc');
	const next = {
		name: 'receipt_email_queue',
		database: storeDB,
		find: jest.fn(() => ({ $: of([]) })),
	};
	reset$.next({ ...next, database: {} } as never);
	expect(values).toHaveLength(1);
	storeDB.collections.receipt_email_queue = next as unknown as typeof first;
	reset$.next(next as never);
	expect(values.at(-1)).toEqual([]);
	rows.next([]);
	expect(values).toHaveLength(2);
	expect(available).toEqual([false, true, true]);
	sub.unsubscribe();
	availability.unsubscribe();
	observeQueuedEmails(null).subscribe((value) => expect(value).toEqual([]));
	observeReceiptEmailQueueAvailability(null).subscribe((value) => expect(value).toBe(false));
});

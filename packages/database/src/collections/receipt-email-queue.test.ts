import { storeCollections } from './index';
import { receiptEmailQueueLiteral } from './schemas/receipt-email-queue';

describe('receipt_email_queue collection', () => {
	it('is registered in the store scope, where the till that queued the email lives', () => {
		expect(storeCollections.receipt_email_queue).toBeDefined();
		expect(storeCollections.receipt_email_queue.schema).toBe(receiptEmailQueueLiteral);
	});

	it('ships as an unreleased v0 with no migration — 1.10 gets the schema fresh', () => {
		expect(receiptEmailQueueLiteral.version).toBe(0);
		expect(storeCollections.receipt_email_queue.migrationStrategies).toBeUndefined();
	});

	it('requires everything the drain reads before it can pick a row', () => {
		// A row missing any of these could not be ordered, retried or attributed.
		expect(receiptEmailQueueLiteral.required).toEqual(
			expect.arrayContaining(['localID', 'orderId', 'email', 'status', 'queuedAt', 'attempts'])
		);
	});

	it('indexes status, the only field the drain selects on', () => {
		expect(receiptEmailQueueLiteral.indexes).toEqual(['status']);
		// RxDB requires an indexed string field to declare a maxLength.
		expect(receiptEmailQueueLiteral.properties.status.maxLength).toBeGreaterThan(0);
	});

	it('constrains status to the three states the queue can be in', () => {
		expect(receiptEmailQueueLiteral.properties.status.enum).toEqual(['pending', 'sent', 'failed']);
	});
});

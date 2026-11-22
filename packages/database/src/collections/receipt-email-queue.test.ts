import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { storeCollections } from './index';
import { receiptEmailQueueLiteral } from './schemas/receipt-email-queue';

describe('receipt_email_queue collection', () => {
	it('is registered in the store scope, where the till that queued the email lives', () => {
		expect(storeCollections.receipt_email_queue).toBeDefined();
		expect(storeCollections.receipt_email_queue.schema).toBe(receiptEmailQueueLiteral);
	});

	it('can reopen a version 0 queue without losing the pending send or its backoff', async () => {
		addRxPlugin(RxDBMigrationSchemaPlugin);
		const options = { name: 'emailmigration', storage: getRxStorageMemory(), multiInstance: false };
		const { templateId, ...legacyProperties } = receiptEmailQueueLiteral.properties;
		const legacy = await createRxDatabase(options);
		const { receipt_email_queue: oldQueue } = await legacy.addCollections({
			receipt_email_queue: {
				schema: {
					...storeCollections.receipt_email_queue.schema,
					version: 0,
					properties: legacyProperties,
				},
			},
		});
		const row = {
			localID: 'legacy',
			orderId: 42,
			email: 'a@example.org',
			status: 'pending',
			queuedAt: '2026-11-22T10:00:00Z',
			attempts: 2,
			nextAttemptAt: '2026-11-22T10:02:00Z',
		};
		await oldQueue.insert(row);
		await legacy.close();

		const reopened = await createRxDatabase(options);
		try {
			const { receipt_email_queue: queue } = await reopened.addCollections({
				receipt_email_queue: storeCollections.receipt_email_queue,
			});
			expect((await queue.findOne('legacy').exec())?.toJSON()).toEqual(row);
			await queue.insert({ ...row, localID: 'selected', templateId: 'gallery-small' });
			expect((await queue.findOne('selected').exec())?.toJSON()).toMatchObject({
				templateId: 'gallery-small',
			});
		} finally {
			await reopened.remove();
		}
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

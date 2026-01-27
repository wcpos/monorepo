import { addRxPlugin, createRxDatabase, RxCollection, RxDatabase } from 'rxdb';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { calculateChanges, getDocumentIdentifier, RxDBAuditLogPlugin } from './audit-log';
import { RxDBGenerateIdPlugin } from './generate-id';

// Mock uuid to avoid ESM issues
let mockUuidCounter = 0;
jest.mock('uuid', () => ({
	v4: jest.fn(() => `mocked-uuid-${++mockUuidCounter}`),
}));

// Test schemas
const testDocSchema = {
	title: 'test document schema',
	version: 0,
	primaryKey: 'uuid',
	type: 'object',
	properties: {
		uuid: { type: 'string', maxLength: 36 },
		name: { type: 'string' },
		price: { type: 'number' },
		stock: { type: 'number' },
	},
	required: ['uuid', 'name'],
} as const;

const logsSchema = {
	title: 'logs schema',
	version: 0,
	primaryKey: 'logId',
	type: 'object',
	properties: {
		logId: { type: 'string', maxLength: 36 },
		timestamp: { type: 'integer' },
		level: { type: 'string' },
		code: { type: 'string' },
		message: { type: 'string' },
		context: { type: 'object', additionalProperties: true },
	},
} as const;

// Helper to generate unique database name
function generateUniqueDbName(baseName: string): string {
	return `${baseName}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

// Helper to wait for async operations
const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Add required plugins once before all tests
beforeAll(() => {
	addRxPlugin(RxDBQueryBuilderPlugin);
	addRxPlugin(RxDBGenerateIdPlugin);
	addRxPlugin(RxDBAuditLogPlugin);
});

describe('audit-log plugin', () => {
	let db: RxDatabase;
	let testCollection: RxCollection;
	let logsCollection: RxCollection;

	beforeEach(async () => {
		// Create a fresh database for each test
		db = await createRxDatabase({
			name: generateUniqueDbName('auditlogtest'),
			storage: getRxStorageMemory(),
			allowSlowCount: true,
		});

		// Add collections - logs first, then test collection
		const collections = await db.addCollections({
			logs: { schema: logsSchema },
			products: { schema: testDocSchema },
		});

		logsCollection = collections.logs;
		testCollection = collections.products;
	});

	afterEach(async () => {
		if (db) {
			await db.remove();
		}
	});

	describe('calculateChanges', () => {
		it('should detect changed fields', () => {
			const before = { name: 'old', price: 10 };
			const after = { name: 'new', price: 10 };
			const changes = calculateChanges(before, after, []);

			expect(changes).toEqual({
				name: { old: 'old', new: 'new' },
			});
		});

		it('should detect added fields', () => {
			const before = { name: 'test' };
			const after = { name: 'test', price: 10 };
			const changes = calculateChanges(before, after, []);

			expect(changes).toEqual({
				price: { old: undefined, new: 10 },
			});
		});

		it('should detect removed fields', () => {
			const before = { name: 'test', price: 10 };
			const after = { name: 'test' };
			const changes = calculateChanges(before, after, []);

			expect(changes).toEqual({
				price: { old: 10, new: undefined },
			});
		});

		it('should exclude specified fields', () => {
			const before = { name: 'old', date_modified: '2024-01-01' };
			const after = { name: 'new', date_modified: '2024-01-02' };
			const changes = calculateChanges(before, after, ['date_modified']);

			expect(changes).toEqual({
				name: { old: 'old', new: 'new' },
			});
		});

		it('should exclude internal fields starting with underscore', () => {
			const before = { name: 'old', _rev: '1' };
			const after = { name: 'new', _rev: '2' };
			const changes = calculateChanges(before, after, []);

			expect(changes).toEqual({
				name: { old: 'old', new: 'new' },
			});
		});

		it('should return null if no changes', () => {
			const before = { name: 'same', price: 10 };
			const after = { name: 'same', price: 10 };
			const changes = calculateChanges(before, after, []);

			expect(changes).toBeNull();
		});

		it('should handle deep object comparison', () => {
			const before = { meta: { key: 'value1' } };
			const after = { meta: { key: 'value2' } };
			const changes = calculateChanges(before, after, []);

			expect(changes).toEqual({
				meta: { old: { key: 'value1' }, new: { key: 'value2' } },
			});
		});
	});

	describe('getDocumentIdentifier', () => {
		it('should return name for products', () => {
			const identifier = getDocumentIdentifier('products', { name: 'Test Product', uuid: '123' });
			expect(identifier).toBe('Test Product');
		});

		it('should return order number for orders', () => {
			const identifier = getDocumentIdentifier('orders', { number: '1001', uuid: '123' });
			expect(identifier).toBe('#1001');
		});

		it('should return email for customers', () => {
			const identifier = getDocumentIdentifier('customers', {
				email: 'test@example.com',
				uuid: '123',
			});
			expect(identifier).toBe('test@example.com');
		});

		it('should return customer name when no email', () => {
			const identifier = getDocumentIdentifier('customers', {
				first_name: 'John',
				last_name: 'Doe',
				uuid: '123',
			});
			expect(identifier).toBe('John Doe');
		});

		it('should fallback to uuid when no identifier found', () => {
			const identifier = getDocumentIdentifier('products', { uuid: 'abc-123' });
			expect(identifier).toBe('#abc-123');
		});
	});

	describe('insert events', () => {
		it('should log document inserts', async () => {
			// Insert a document
			await testCollection.insert({
				uuid: 'test-uuid-1',
				name: 'Test Product',
				price: 9.99,
			});

			// Wait for async logging
			await waitFor(100);

			// Check that an audit log was created
			const logs = await logsCollection.find().exec();
			const insertLog = logs.find((log) => log.code === 'AUDIT_INSERT');

			expect(insertLog).toBeDefined();
			expect(insertLog?.message).toContain('products insert');
			expect(insertLog?.context?.operation).toBe('insert');
			expect(insertLog?.context?.collection).toBe('products');
			expect(insertLog?.context?.documentId).toBe('test-uuid-1');
		});
	});

	describe('update events', () => {
		it('should log document updates with changes', async () => {
			// Insert a document
			const doc = await testCollection.insert({
				uuid: 'test-uuid-2',
				name: 'Original Name',
				price: 9.99,
			});

			// Wait for insert log
			await waitFor(100);

			// Update the document
			await doc.patch({ name: 'Updated Name' });

			// Wait for update log
			await waitFor(100);

			// Check that an update audit log was created
			const logs = await logsCollection.find().exec();
			const updateLog = logs.find((log) => log.code === 'AUDIT_UPDATE');

			expect(updateLog).toBeDefined();
			expect(updateLog?.message).toContain('products update');
			expect(updateLog?.context?.operation).toBe('update');
			expect(updateLog?.context?.changes?.name).toEqual({
				old: 'Original Name',
				new: 'Updated Name',
			});
		});
	});

	describe('delete events', () => {
		it('should log document deletions', async () => {
			// Insert a document
			const doc = await testCollection.insert({
				uuid: 'test-uuid-3',
				name: 'To Be Deleted',
			});

			// Wait for insert log
			await waitFor(100);

			// Delete the document
			await doc.remove();

			// Wait for delete log
			await waitFor(100);

			// Check that a delete audit log was created
			const logs = await logsCollection.find().exec();
			const deleteLog = logs.find((log) => log.code === 'AUDIT_DELETE');

			expect(deleteLog).toBeDefined();
			expect(deleteLog?.message).toContain('products delete');
			expect(deleteLog?.context?.operation).toBe('delete');
			expect(deleteLog?.context?.documentId).toBe('test-uuid-3');
		});
	});

	describe('excluded collections', () => {
		it('should not log changes to logs collection', async () => {
			// Get initial count
			const initialCount = await logsCollection.count().exec();

			// Insert directly into logs (simulating a manual log)
			await logsCollection.insert({
				logId: 'manual-log-1',
				timestamp: Date.now(),
				level: 'info',
				code: 'TEST',
				message: 'Test log',
				context: {},
			});

			// Wait a bit
			await waitFor(100);

			// Count should only increase by 1 (the manual log, not an audit log of the manual log)
			const finalCount = await logsCollection.count().exec();
			expect(finalCount).toBe(initialCount + 1);

			// Verify no AUDIT log was created for the logs collection
			const auditLogs = await logsCollection
				.find({ selector: { code: { $regex: '^AUDIT_' } } })
				.exec();
			const logsCollectionAudit = auditLogs.find((log) => log.context?.collection === 'logs');
			expect(logsCollectionAudit).toBeUndefined();
		});
	});

	describe('bulk operations', () => {
		it('should log bulk inserts', async () => {
			// Bulk insert documents
			await testCollection.bulkInsert([
				{ uuid: 'bulk-1', name: 'Bulk Product 1' },
				{ uuid: 'bulk-2', name: 'Bulk Product 2' },
				{ uuid: 'bulk-3', name: 'Bulk Product 3' },
			]);

			// Wait for async logging
			await waitFor(200);

			// Check that audit logs were created for each insert
			const logs = await logsCollection.find({ selector: { code: 'AUDIT_INSERT' } }).exec();

			expect(logs.length).toBeGreaterThanOrEqual(3);
		});
	});
});

import { CategoryLogger, getLogger, setDatabase, setToast } from './index';

type TestLogRow = Record<string, unknown> & {
	context: Record<string, unknown>;
	sizeBytes: number;
	seq: number;
};

type TestLogDocument = TestLogRow & {
	primary: string;
	incrementalPatch(patch: Record<string, unknown>): Promise<TestLogDocument>;
};

function createLogCollection() {
	const rows: TestLogDocument[] = [];
	const insert = jest.fn(async (row: TestLogRow) => {
		const document: TestLogDocument = {
			...row,
			primary: `log-${rows.length + 1}`,
			incrementalPatch: jest.fn(
				async (patch: Record<string, unknown>): Promise<TestLogDocument> => {
					Object.assign(document, patch);
					return document;
				}
			),
		};
		rows.push(document);
		return document;
	});
	const find = jest.fn((query: Record<string, unknown>) => {
		if (query.selector) return { remove: jest.fn().mockResolvedValue([]) };
		return { exec: jest.fn().mockResolvedValue(rows) };
	});

	return {
		rows,
		collection: {
			insert,
			find,
			bulkRemove: jest.fn().mockResolvedValue(undefined),
		},
	};
}

async function flushWrites() {
	for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe('logger/index', () => {
	describe('getLogger', () => {
		it('should create a CategoryLogger with the given category', () => {
			const logger = getLogger(['wcpos', 'test']);
			expect(logger).toBeInstanceOf(CategoryLogger);
			expect(logger.getCategoryString()).toBe('wcpos.test');
		});

		it('should handle single category', () => {
			const logger = getLogger(['app']);
			expect(logger.getCategoryString()).toBe('app');
		});

		it('should handle deep category hierarchy', () => {
			const logger = getLogger(['wcpos', 'pos', 'cart', 'items']);
			expect(logger.getCategoryString()).toBe('wcpos.pos.cart.items');
		});

		it('should handle empty category array', () => {
			const logger = getLogger([]);
			expect(logger.getCategoryString()).toBe('');
		});
	});

	describe('CategoryLogger', () => {
		let logger: CategoryLogger;

		beforeEach(() => {
			logger = getLogger(['wcpos', 'test']);
		});

		describe('getChild', () => {
			it('should create child logger with string subcategory', () => {
				const child = logger.getChild('child');
				expect(child.getCategoryString()).toBe('wcpos.test.child');
			});

			it('should create child logger with array subcategory', () => {
				const child = logger.getChild(['level1', 'level2']);
				expect(child.getCategoryString()).toBe('wcpos.test.level1.level2');
			});

			it('should not modify parent logger', () => {
				logger.getChild('child');
				expect(logger.getCategoryString()).toBe('wcpos.test');
			});

			it('should allow chaining getChild calls', () => {
				const deepChild = logger.getChild('a').getChild('b').getChild('c');
				expect(deepChild.getCategoryString()).toBe('wcpos.test.a.b.c');
			});
		});

		describe('with', () => {
			it('should create logger with bound context', () => {
				const contextLogger = logger.with({ orderId: '123' });
				expect(contextLogger).toBeInstanceOf(CategoryLogger);
				// Context is internal, but we can verify it's a new instance
				expect(contextLogger).not.toBe(logger);
			});

			it('should not modify parent logger', () => {
				const original = logger.getCategoryString();
				logger.with({ test: 'value' });
				expect(logger.getCategoryString()).toBe(original);
			});

			it('should allow chaining with calls', () => {
				const contextLogger = logger.with({ a: 1 }).with({ b: 2 }).with({ c: 3 });
				expect(contextLogger).toBeInstanceOf(CategoryLogger);
			});

			it('should preserve category when adding context', () => {
				const contextLogger = logger.with({ orderId: '123' });
				expect(contextLogger.getCategoryString()).toBe('wcpos.test');
			});
		});

		describe('getCategoryString', () => {
			it('should return dot-separated category string', () => {
				expect(logger.getCategoryString()).toBe('wcpos.test');
			});

			it('should handle single segment', () => {
				const singleLogger = getLogger(['app']);
				expect(singleLogger.getCategoryString()).toBe('app');
			});
		});

		describe('log methods', () => {
			it('should have debug method', () => {
				expect(typeof logger.debug).toBe('function');
				// Should not throw
				expect(() => logger.debug('test message')).not.toThrow();
			});

			it('should have info method', () => {
				expect(typeof logger.info).toBe('function');
				expect(() => logger.info('test message')).not.toThrow();
			});

			it('should have warn method', () => {
				expect(typeof logger.warn).toBe('function');
				expect(() => logger.warn('test message')).not.toThrow();
			});

			it('should have error method', () => {
				expect(typeof logger.error).toBe('function');
				expect(() => logger.error('test message')).not.toThrow();
			});

			it('should have success method', () => {
				expect(typeof logger.success).toBe('function');
				expect(() => logger.success('test message')).not.toThrow();
			});

			it('should accept lazy message (function)', () => {
				const lazyMessage = jest.fn(() => 'lazy message');
				// In production mode (non-debug), lazy message might not be called
				expect(() => logger.info(lazyMessage)).not.toThrow();
			});

			it('should accept options parameter', () => {
				expect(() =>
					logger.info('test', {
						showToast: false,
						saveToDb: false,
						context: { extra: 'data' },
					})
				).not.toThrow();
			});
		});

		describe('child logger inheritance', () => {
			it('should inherit category from parent', () => {
				const parent = getLogger(['wcpos', 'pos']);
				const child = parent.getChild('cart');
				expect(child.getCategoryString()).toContain('wcpos.pos');
			});

			it('should create independent instances', () => {
				const parent = getLogger(['wcpos']);
				const child1 = parent.getChild('a');
				const child2 = parent.getChild('b');

				expect(child1.getCategoryString()).not.toBe(child2.getCategoryString());
			});
		});
	});

	describe('setToast', () => {
		it('should accept a toast function', () => {
			const mockToast = jest.fn();
			expect(() => setToast(mockToast)).not.toThrow();
		});
	});

	describe('setDatabase', () => {
		it('should accept a database collection', () => {
			const mockCollection = {
				insert: jest.fn(),
				find: jest
					.fn()
					.mockReturnValueOnce({ remove: jest.fn().mockResolvedValue([]) })
					.mockReturnValueOnce({ exec: jest.fn().mockResolvedValue([]) }),
				bulkRemove: jest.fn(),
			};
			expect(() => setDatabase(mockCollection)).not.toThrow();
		});

		it('should prune log entries older than 30 days on bind', async () => {
			const mockRemove = jest.fn().mockResolvedValue([{ id: '1' }, { id: '2' }]);
			const mockFind = jest
				.fn()
				.mockReturnValueOnce({ remove: mockRemove })
				.mockReturnValueOnce({ exec: jest.fn().mockResolvedValue([]) });
			const mockCollection = {
				insert: jest.fn(),
				find: mockFind,
				bulkRemove: jest.fn(),
			};

			let freshSetDatabase: typeof setDatabase;
			jest.isolateModules(() => {
				freshSetDatabase = require('./index').setDatabase;
			});

			freshSetDatabase!(mockCollection);

			// Let the microtask (find().remove().then()) settle
			await Promise.resolve();

			expect(mockFind).toHaveBeenCalledWith({
				selector: { timestamp: { $lt: expect.any(Number) } },
			});
			expect(mockRemove).toHaveBeenCalled();
		});

		it('persists searchable operational identifiers without copying arbitrary context', async () => {
			const insert = jest.fn().mockResolvedValue(undefined);
			setDatabase({
				insert,
				find: jest
					.fn()
					.mockReturnValueOnce({ remove: jest.fn().mockResolvedValue([]) })
					.mockReturnValueOnce({ exec: jest.fn().mockResolvedValue([]) }),
				bulkRemove: jest.fn(),
			});

			getLogger(['wcpos', 'pos', 'cart']).info('Cart line item updated', {
				saveToDb: true,
				context: {
					event: 'cart.line-item.updated',
					orderID: 2468,
					orderNumber: '67882',
					productName: 'Diagnostic Coffee',
					previousQuantity: 1,
					quantity: 3,
					previousPrice: 10,
					price: 20,
					method: 'POST',
					endpoint: '/wp-json/wcpos/v2/push/orders',
					status: 201,
					billing: 'must not be copied',
				},
			});
			await Promise.resolve();

			const [{ context }] = insert.mock.calls[0];
			expect(context.search).toContain('2468');
			expect(context.search).toContain('67882');
			expect(context.search).toContain('Diagnostic Coffee');
			expect(context.search).toContain('1');
			expect(context.search).toContain('3');
			expect(context.search).toContain('10');
			expect(context.search).toContain('20');
			expect(context.search).toContain('POST');
			expect(context.search).toContain('/wp-json/wcpos/v2/push/orders');
			expect(context.search).toContain('201');
			expect(context.search).toContain('wcpos.pos.cart');
			expect(context.search).not.toContain('must not be copied');
		});

		it('includes collection, type and lane in the search string', async () => {
			const insert = jest.fn().mockResolvedValue(undefined);
			setDatabase({
				insert,
				find: jest
					.fn()
					.mockReturnValueOnce({ remove: jest.fn().mockResolvedValue([]) })
					.mockReturnValueOnce({ exec: jest.fn().mockResolvedValue([]) }),
				bulkRemove: jest.fn(),
			});

			getLogger(['wcpos', 'sync']).info('Applied sync changes', {
				saveToDb: true,
				context: {
					collection: 'products',
					type: 'apply.pull',
					lane: 'change-signal',
					applied: 3,
				},
			});
			await Promise.resolve();

			const [{ context }] = insert.mock.calls[0];
			expect(context.search).toContain('products');
			expect(context.search).toContain('apply.pull');
			expect(context.search).toContain('change-signal');
			expect(context.search).not.toContain('3');
		});

		it('persists info by default but never persists debug', async () => {
			const { rows, collection } = createLogCollection();
			setDatabase(collection);

			getLogger(['sync']).info('Persisted by default');
			getLogger(['sync']).debug('Never persisted', { saveToDb: true });
			await flushWrites();

			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({ level: 'info', category: 'sync' });
		});

		it('writes success as info with an ok outcome', async () => {
			const { rows, collection } = createLogCollection();
			setDatabase(collection);

			getLogger(['checkout']).success('Order completed');
			await flushWrites();

			expect(rows[0]).toMatchObject({ level: 'info', outcome: 'ok' });
		});

		it('promotes defined record fields and lets an explicit success outcome win', async () => {
			const { rows, collection } = createLogCollection();
			setDatabase(collection);

			getLogger(['checkout']).success('Order cancelled', {
				terminal: {
					outcome: 'cancelled',
					operationId: 'operation-1',
					operationType: 'checkout.submit',
					requestId: 'request-1',
					serverRequestId: 'server-request-1',
					attempt: 2,
					durationMs: 150,
					startedAt: 1_000,
				},
			});
			await flushWrites();

			expect(rows[0]).toMatchObject({
				outcome: 'cancelled',
				operationId: 'operation-1',
				operationType: 'checkout.submit',
				requestId: 'request-1',
				serverRequestId: 'server-request-1',
				attempt: 2,
				durationMs: 150,
				startedAt: 1_000,
			});
		});

		it('skips undefined record fields on inserted rows', async () => {
			const { rows, collection } = createLogCollection();
			setDatabase(collection);

			getLogger(['sync']).info('Cycle complete', {
				terminal: { outcome: 'ok', operationId: undefined },
			});
			await flushWrites();

			expect(rows[0]).not.toHaveProperty('operationId');
		});

		it('separates operation rows but collapses uncorrelated repeats', async () => {
			const { rows, collection } = createLogCollection();
			setDatabase(collection);
			const logger = getLogger(['sync']);

			logger.info('Cycle complete', { terminal: { operationId: 'operation-1' } });
			logger.info('Cycle complete', { terminal: { operationId: 'operation-2' } });
			logger.info('Record failed');
			logger.info('Record failed');
			await flushWrites();

			expect(rows).toHaveLength(3);
			expect(rows[0]).toMatchObject({ operationId: 'operation-1', count: 1 });
			expect(rows[1]).toMatchObject({ operationId: 'operation-2', count: 1 });
			expect(rows[2]).toMatchObject({ count: 2 });
		});

		// Review #854: per-collection events carrying no message of their own matched
		// on every identity component, so the second collection's row folded into the
		// first and the survivor named only the first collection.
		it('does not collapse the same event across different collections', async () => {
			const { rows, collection } = createLogCollection();
			setDatabase(collection);
			const logger = getLogger(['sync']);

			logger.info('apply.refresh', { context: { collection: 'tax_rates' } });
			logger.info('apply.refresh', { context: { collection: 'products' } });
			await flushWrites();

			expect(rows).toHaveLength(2);
			expect(rows[0].context).toMatchObject({ collection: 'tax_rates' });
			expect(rows[1].context).toMatchObject({ collection: 'products' });
		});

		// Review #854: RxDB rejects the WHOLE insert when a bounded column overflows,
		// so an over-long id would cost the entire terminal record.
		it('clamps bounded columns instead of losing the row', async () => {
			const { rows, collection } = createLogCollection();
			setDatabase(collection);
			const logger = getLogger(['sync']);

			logger.info('Checkout stage', {
				terminal: {
					// a 36-character UUID against a 32-character column
					operationId: '3f7a1b2c-9d4e-4f60-8a1b-2c9d4e4f6011',
					operationType: 'x'.repeat(60),
				},
			});
			await flushWrites();

			expect(rows).toHaveLength(1);
			expect(rows[0].operationId).toBe('3f7a1b2c-9d4e-4f60-8a1b-2c9d4e4f');
			expect(String(rows[0].operationId)).toHaveLength(32);
			expect(String(rows[0].operationType)).toHaveLength(48);
		});

		// A timed unit of work is distinct evidence, not a repeat: two sync cycles
		// rendering the same message must keep both durations and cursors.
		it('never collapses records that carry a duration', async () => {
			const { rows, collection } = createLogCollection();
			setDatabase(collection);
			const logger = getLogger(['sync']);

			logger.info('change-signal: checked for updates (2 changed, 0 deleted)', {
				terminal: { durationMs: 120, operationType: 'sync.cycle' },
				context: { cursor: 41 },
			});
			logger.info('change-signal: checked for updates (2 changed, 0 deleted)', {
				terminal: { durationMs: 380, operationType: 'sync.cycle' },
				context: { cursor: 43 },
			});
			await flushWrites();

			expect(rows).toHaveLength(2);
			expect(rows[0]).toMatchObject({ durationMs: 120, count: 1 });
			expect(rows[1]).toMatchObject({ durationMs: 380, count: 1 });
		});

		// ...while undurated repeats (a record failing over and over) still fold.
		it('still collapses identical records that carry no duration', async () => {
			const { rows, collection } = createLogCollection();
			setDatabase(collection);
			const logger = getLogger(['sync']);

			logger.error('orders 4711 — rejected by server', { context: { recordId: '4711' } });
			logger.error('orders 4711 — rejected by server', { context: { recordId: '4711' } });
			await flushWrites();

			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({ count: 2 });
		});

		it('collapses consecutive identical rows while keeping the original timestamp', async () => {
			jest.useFakeTimers().setSystemTime(1000);
			const { rows, collection } = createLogCollection();
			setDatabase(collection);
			const logger = getLogger(['payment']);

			logger.error('Declined', { context: { errorCode: 'PY01001', recordId: 'order-1' } });
			await flushWrites();
			jest.setSystemTime(2000);
			logger.error('Declined', { context: { errorCode: 'PY01001', recordId: 'order-1' } });
			await flushWrites();

			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({
				timestamp: 1000,
				firstSeen: 1000,
				lastSeen: 2000,
				count: 2,
				code: 'PY01001',
			});
			jest.useRealTimers();
		});

		it('does not collapse cycle rows when their cursor facts change', async () => {
			const { rows, collection } = createLogCollection();
			setDatabase(collection);
			const logger = getLogger(['sync']);

			logger.info('Cycle complete', {
				context: { cursor: 5, cursorFrom: 4, head: 6, backlog: 1 },
			});
			logger.info('Cycle complete', {
				context: { cursor: 6, cursorFrom: 5, head: 6, backlog: 0 },
			});
			await flushWrites();

			expect(rows).toHaveLength(2);
			expect(rows[0].context).toMatchObject({ cursor: 5, cursorFrom: 4, head: 6, backlog: 1 });
			expect(rows[1].context).toMatchObject({ cursor: 6, cursorFrom: 5, head: 6, backlog: 0 });
		});

		it('starts a new repeat run when the code changes', async () => {
			const { rows, collection } = createLogCollection();
			setDatabase(collection);
			const logger = getLogger(['payment']);

			logger.error('Declined', { context: { errorCode: 'PY01001' } });
			logger.error('Declined', { context: { errorCode: 'PY01002' } });
			await flushWrites();

			expect(rows).toHaveLength(2);
		});

		it('truncates oversized context and records the serialized row size', async () => {
			const { rows, collection } = createLogCollection();
			setDatabase(collection);

			getLogger(['client']).info('Large response', {
				context: { payload: 'x'.repeat(20 * 1024), requestId: 'request-1' },
			});
			await flushWrites();

			expect(rows[0].context).toMatchObject({
				payload: '[truncated]',
				requestId: 'request-1',
				_truncated: true,
			});
			expect(
				new TextEncoder().encode(JSON.stringify(rows[0].context)).byteLength
			).toBeLessThanOrEqual(16 * 1024);
			const { primary, incrementalPatch, ...persistedRow } = rows[0];
			expect(rows[0].sizeBytes).toBe(
				new TextEncoder().encode(JSON.stringify(persistedRow)).byteLength
			);
		});

		it('stamps monotonically increasing sequence numbers', async () => {
			const { rows, collection } = createLogCollection();
			setDatabase(collection);

			getLogger(['db']).info('First');
			getLogger(['db']).warn('Second');
			await flushWrites();

			expect(rows[1].seq).toBeGreaterThan(rows[0].seq);
		});
	});
});

describe('review fixes (PR #851)', () => {
	afterEach(() => {
		jest.useRealTimers();
		setDatabase(null);
	});

	it('does not collapse an info row into a success row (outcome is part of identity)', async () => {
		const { rows, collection } = createLogCollection();
		setDatabase(collection);
		const logger = getLogger(['checkout']);

		logger.success('Order saved');
		await flushWrites();
		logger.info('Order saved');
		await flushWrites();

		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ outcome: 'ok', count: 1 });
		expect(rows[1].outcome).toBeUndefined();
	});

	it('recovers repeat state after a rejected insert instead of poisoning the chain', async () => {
		const { rows, collection } = createLogCollection();
		const workingInsert = collection.insert.getMockImplementation()!;
		collection.insert.mockRejectedValueOnce(new Error('storage offline'));
		setDatabase(collection);
		const logger = getLogger(['sync']);

		logger.error('Push failed', { context: { errorCode: 'API03001', recordId: 'p-1' } });
		await flushWrites();
		expect(rows).toHaveLength(0);

		collection.insert.mockImplementation(workingInsert);
		logger.error('Push failed', { context: { errorCode: 'API03001', recordId: 'p-1' } });
		await flushWrites();

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ count: 1 });
	});

	it('drops keys entirely when truncation markers alone would exceed the admission cap', async () => {
		const { rows, collection } = createLogCollection();
		setDatabase(collection);

		const context: Record<string, unknown> = {};
		for (let index = 0; index < 4000; index += 1) {
			context[`key_${index}_${'x'.repeat(24)}`] = 'y'.repeat(64);
		}
		getLogger(['sync']).info('Huge context', { context });
		await flushWrites();

		expect(rows).toHaveLength(1);
		const admitted = rows[0].context;
		expect(admitted._truncated).toBe(true);
		expect(admitted._droppedKeys as number).toBeGreaterThan(0);
		const bytes = new TextEncoder().encode(JSON.stringify(admitted)).byteLength;
		expect(bytes).toBeLessThanOrEqual(16 * 1024 + 1024);
	});
});

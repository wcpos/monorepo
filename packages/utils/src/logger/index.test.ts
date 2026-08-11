import {
	CategoryLogger,
	getLogger,
	log,
	promoteRecorder,
	resetRecorderPromotionBackoff,
	setDatabase,
	setToast,
	setVerboseDiagnostics,
} from './index';
import { recorderStats, snapshotRecorder } from './flight-recorder';

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
	const addRow = (row: TestLogRow) => {
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
	};
	const insert = jest.fn(async (row: TestLogRow) => addRow(row));
	const bulkInsert = jest.fn(async (bulkRows: TestLogRow[]) => ({
		success: bulkRows.map(addRow),
		error: [],
	}));
	const find = jest.fn((query: Record<string, unknown>) => {
		if (query.selector) return { remove: jest.fn().mockResolvedValue([]) };
		return { exec: jest.fn().mockResolvedValue(rows) };
	});

	return {
		rows,
		collection: {
			insert,
			bulkInsert,
			find,
			bulkRemove: jest.fn().mockResolvedValue(undefined),
		},
	};
}

async function flushWrites() {
	for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe('logger/index', () => {
	describe('module initialization', () => {
		it('uses production behavior when the Metro __DEV__ global is unavailable', async () => {
			const devDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__DEV__');
			const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
			let isolatedLevel: string | undefined;

			Reflect.deleteProperty(globalThis, '__DEV__');

			try {
				await expect(
					jest.isolateModulesAsync(async () => {
						const { log: isolatedLog } = await import('./index');
						isolatedLevel = isolatedLog.getLevel();
						isolatedLog.warn('warning without Metro');
					})
				).resolves.toBeUndefined();
				expect(isolatedLevel).toBe('info');
			} finally {
				if (devDescriptor) {
					Object.defineProperty(globalThis, '__DEV__', devDescriptor);
				}
				consoleWarn.mockRestore();
			}
		});
	});

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
			it('only writes warnings and errors to the console in production', () => {
				const originalDev = __DEV__;
				const consoleLog = jest.spyOn(console, 'log').mockImplementation();
				const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
				const consoleError = jest.spyOn(console, 'error').mockImplementation();

				Object.defineProperty(globalThis, '__DEV__', {
					configurable: true,
					value: false,
				});

				try {
					logger.info('informational');
					logger.warn('warning');
					logger.error('failure');

					expect(consoleLog).not.toHaveBeenCalled();
					expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('WARN : warning'));
					expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('ERROR : failure'));
				} finally {
					Object.defineProperty(globalThis, '__DEV__', {
						configurable: true,
						value: originalDev,
					});
					consoleLog.mockRestore();
					consoleWarn.mockRestore();
					consoleError.mockRestore();
				}
			});

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

		it('drops a deferred write when the database binding changes', async () => {
			const first = createLogCollection();
			const second = createLogCollection();
			setDatabase(first.collection);

			getLogger(['db']).info('Bound to the first database');
			setDatabase(second.collection);
			await flushWrites();

			expect(first.collection.insert).not.toHaveBeenCalled();
			expect(second.collection.insert).not.toHaveBeenCalled();
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

		it('records debug at info runtime level without persisting it', async () => {
			const { rows, collection } = createLogCollection();
			setDatabase(collection);
			log.setLevel('info');

			getLogger(['sync']).info('Persisted by default');
			getLogger(['sync']).debug('Recorded in memory', { saveToDb: true });
			await flushWrites();

			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({ level: 'info', category: 'sync' });
			expect(snapshotRecorder()).toEqual([
				expect.objectContaining({
					level: 'debug',
					message: 'Recorded in memory',
					context: { category: 'sync' },
				}),
			]);
			log.setLevel('debug');
		});

		it('redacts credentials before retaining debug narration for promotion', () => {
			getLogger(['notifications']).debug(
				'Connecting with Bearer abc.def.ghi to https://user:password@store.test',
				{
					context: {
						metadata: { licenseKey: 'license-key-value-12345' },
						url: 'https://store.test?authorization=Bearer%20secret-token',
					},
				}
			);

			const serialized = JSON.stringify(snapshotRecorder());
			expect(serialized).not.toContain('abc.def.ghi');
			expect(serialized).not.toContain('user:password');
			expect(serialized).not.toContain('license-key-value-12345');
			expect(serialized).not.toContain('secret-token');
		});

		it('promotes recorded debug rows once, in order, without recursion', async () => {
			const { collection } = createLogCollection();
			setDatabase(collection);

			getLogger(['sync']).debug('First step');
			getLogger(['sync']).debug('Second step');
			getLogger(['sync']).error('Sync failed');
			await flushWrites();

			expect(collection.bulkInsert).toHaveBeenCalledTimes(1);
			const [promotedRows] = collection.bulkInsert.mock.calls[0];
			expect(promotedRows).toHaveLength(2);
			expect(promotedRows.map((row) => row.message)).toEqual(['First step', 'Second step']);
			expect(promotedRows.map((row) => row.context)).toEqual([
				expect.objectContaining({ category: 'sync', _promotedBy: 'error' }),
				expect.objectContaining({ category: 'sync', _promotedBy: 'error' }),
			]);
			expect(recorderStats()).toEqual({ events: 0, bytes: 0 });

			getLogger(['sync']).error('A second error');
			await flushWrites();
			expect(collection.bulkInsert).toHaveBeenCalledTimes(1);
		});

		it('removes only recorder events that bulk promotion inserted', async () => {
			const { collection } = createLogCollection();
			collection.bulkInsert.mockImplementation(async (bulkRows) => ({
				success: [bulkRows[1] as unknown as TestLogDocument],
				error: [{ status: 500 } as unknown as never],
			}));
			setDatabase(collection);
			getLogger(['sync']).debug('First step');
			getLogger(['sync']).debug('Second step');

			await expect(promoteRecorder('test')).resolves.toBe(1);
			expect(snapshotRecorder()).toEqual([expect.objectContaining({ message: 'First step' })]);
		});

		it('serializes overlapping recorder promotions', async () => {
			const { collection } = createLogCollection();
			let releaseInsert!: () => void;
			const insertBlocked = new Promise<void>((resolve) => {
				releaseInsert = resolve;
			});
			collection.bulkInsert.mockImplementationOnce(async (bulkRows) => {
				await insertBlocked;
				return {
					success: bulkRows as unknown as TestLogDocument[],
					error: [],
				};
			});
			setDatabase(collection);
			getLogger(['sync']).debug('First step');
			getLogger(['sync']).debug('Second step');

			const first = promoteRecorder('first error');
			await flushWrites();
			const second = promoteRecorder('second error');
			await flushWrites();
			const callsWhileFirstInsertWasBlocked = collection.bulkInsert.mock.calls.length;
			releaseInsert();

			await expect(Promise.all([first, second])).resolves.toEqual([2, 0]);
			expect(callsWhileFirstInsertWasBlocked).toBe(1);
			expect(collection.bulkInsert).toHaveBeenCalledTimes(1);
		});

		it('persists debug in real time while verbose mode is active and keeps it recorded', async () => {
			const { rows, collection } = createLogCollection();
			setDatabase(collection);
			setVerboseDiagnostics(true);

			getLogger(['sync']).debug('Verbose step');
			await flushWrites();

			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({ level: 'debug', message: 'Verbose step' });
			expect(snapshotRecorder()).toEqual([
				expect.objectContaining({ level: 'debug', message: 'Verbose step' }),
			]);
			setVerboseDiagnostics(false);
		});

		it('keeps terminal fields on verbose-persisted debug rows (#899 recovered chain)', async () => {
			const { rows, collection } = createLogCollection();
			setDatabase(collection);
			setVerboseDiagnostics(true);

			getLogger(['sync']).debug('transport.request', {
				context: { status: 401 },
				terminal: { outcome: 'recovered', operationId: 'auth-arc-1' },
			});
			await flushWrites();

			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({
				level: 'debug',
				outcome: 'recovered',
				operationId: 'auth-arc-1',
			});
			setVerboseDiagnostics(false);
		});

		it('keeps terminal fields when recorded debug rows are promoted', async () => {
			const { collection } = createLogCollection();
			setDatabase(collection);

			getLogger(['sync']).debug('transport.request', {
				context: { status: 401 },
				terminal: {
					outcome: 'recovered',
					operationType: 'sync.http',
					operationId: 'auth-arc-1',
				},
			});

			await expect(promoteRecorder('error')).resolves.toBe(1);
			const [rows] = collection.bulkInsert.mock.calls[0];
			expect(rows[0]).toMatchObject({
				outcome: 'recovered',
				operationType: 'sync.http',
				operationId: 'auth-arc-1',
			});
		});

		it('stops real-time debug persistence when verbose mode expires', async () => {
			jest.useFakeTimers().setSystemTime(1_000);
			const { rows, collection } = createLogCollection();
			setDatabase(collection);
			setVerboseDiagnostics(true, 10);

			getLogger(['sync']).debug('Before expiry');
			await flushWrites();
			jest.advanceTimersByTime(11);
			getLogger(['sync']).debug('After expiry');
			await flushWrites();

			expect(rows).toHaveLength(1);
			expect(rows[0].message).toBe('Before expiry');
			setVerboseDiagnostics(false);
			jest.useRealTimers();
		});

		it('clears recorded narration when the database collection changes', () => {
			const first = createLogCollection();
			const second = createLogCollection();
			setDatabase(first.collection);
			getLogger(['sync']).debug('Old store narration');
			expect(recorderStats().events).toBe(1);

			setDatabase(second.collection);

			expect(recorderStats()).toEqual({ events: 0, bytes: 0 });
		});

		it('writes success as info with an ok outcome', async () => {
			const { rows, collection } = createLogCollection();
			setDatabase(collection);

			getLogger(['checkout']).success('Order completed');
			await flushWrites();

			expect(rows[0]).toMatchObject({ level: 'info', outcome: 'ok' });
		});

		it('drops a failure code from an ok row (PY02001 regression)', async () => {
			const consoleError = jest.spyOn(console, 'error').mockImplementation();
			const { rows, collection } = createLogCollection();
			setDatabase(collection);

			getLogger(['payment']).success('Payment completed; status check failed', {
				context: { errorCode: 'CLIENT999' },
			});
			await flushWrites();

			expect(rows).toHaveLength(1);
			expect(rows[0]).not.toHaveProperty('code');
			expect(rows[0].context).not.toHaveProperty('errorCode');
			expect(consoleError).toHaveBeenCalledWith(
				'Dropped failure-severity code CLIENT999 from log row with outcome ok'
			);
			consoleError.mockRestore();
		});

		it.each([
			['wcpos.sync.engine', 'SYNC999'],
			['wcpos.auth.oauth', 'AUTH999'],
			['wcpos.pos.checkout', 'CHECKOUT999'],
			['wcpos.pos.checkout.payment', 'PAYMENT999'],
			['wcpos.print.native', 'PRINT999'],
			['wcpos.products.actions.sync', 'PRODUCT999'],
			['wcpos.license.check', 'LICENSE999'],
			['wcpos.http.client', 'CLIENT999'],
		])('adds the domain fallback code for %s errors', async (category, expectedCode) => {
			const { rows, collection } = createLogCollection();
			setDatabase(collection);

			getLogger(category.split('.')).error('Unexpected failure');
			await flushWrites();

			expect(rows[0]).toMatchObject({ code: expectedCode });
			expect(rows[0].context).toMatchObject({
				errorCode: expectedCode,
				codeFallback: true,
			});
		});

		it('does not overwrite an existing error code with a fallback', async () => {
			const { rows, collection } = createLogCollection();
			setDatabase(collection);

			getLogger(['wcpos', 'sync', 'engine']).error('Known failure', {
				context: { errorCode: 'SYNC101' },
			});
			await flushWrites();

			expect(rows[0]).toMatchObject({ code: 'SYNC101' });
			expect(rows[0].context).toMatchObject({ errorCode: 'SYNC101' });
			expect(rows[0].context).not.toHaveProperty('codeFallback');
		});

		it('does not add fallback codes to warning rows', async () => {
			const { rows, collection } = createLogCollection();
			setDatabase(collection);

			getLogger(['wcpos', 'sync', 'engine']).warn('Potential problem');
			await flushWrites();

			expect(rows[0]).not.toHaveProperty('code');
			expect(rows[0].context).not.toHaveProperty('errorCode');
			expect(rows[0].context).not.toHaveProperty('codeFallback');
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

/**
 * #163 follow-up: with a dead storage worker every error log triggers a flight
 * recorder promotion, the promotion's bulkInsert rejects, and the catch console
 * .errors — unbounded. Measured live at roughly 200 errors/second, which buries
 * the real diagnostics and burns the main thread during an outage.
 */
describe('flight recorder promotion backoff (#163)', () => {
	let consoleError: jest.SpyInstance;

	beforeEach(() => {
		jest.useFakeTimers();
		consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		resetRecorderPromotionBackoff();
	});

	afterEach(() => {
		consoleError.mockRestore();
		jest.useRealTimers();
		resetRecorderPromotionBackoff();
		setDatabase(null as never);
	});

	function createFailingCollection(bulkInsert: jest.Mock) {
		return {
			insert: jest.fn(async () => undefined),
			bulkInsert,
			find: jest.fn(() => ({
				remove: jest.fn().mockResolvedValue([]),
				exec: jest.fn().mockResolvedValue([]),
			})),
			bulkRemove: jest.fn().mockResolvedValue(undefined),
		};
	}

	async function recordSomething() {
		getLogger(['wcpos', 'db']).debug('narration for promotion', { saveToDb: true });
		await Promise.resolve();
	}

	it('logs the failure once per streak instead of once per attempt', async () => {
		const bulkInsert = jest.fn().mockRejectedValue(new Error('storage worker is gone'));
		setDatabase(createFailingCollection(bulkInsert) as never);

		for (let attempt = 0; attempt < 25; attempt += 1) {
			await recordSomething();
			await promoteRecorder('error');
		}

		const promotionErrors = consoleError.mock.calls.filter(([message]) =>
			String(message).includes('Failed to promote flight recorder')
		);
		expect(promotionErrors).toHaveLength(1);
	});

	it('stops hammering dead storage until the backoff window elapses', async () => {
		const bulkInsert = jest.fn().mockRejectedValue(new Error('storage worker is gone'));
		setDatabase(createFailingCollection(bulkInsert) as never);

		await recordSomething();
		await promoteRecorder('error');
		expect(bulkInsert).toHaveBeenCalledTimes(1);

		for (let attempt = 0; attempt < 25; attempt += 1) {
			await recordSomething();
			await promoteRecorder('error');
		}
		expect(bulkInsert).toHaveBeenCalledTimes(1);

		jest.setSystemTime(Date.now() + 120_000);
		await recordSomething();
		await promoteRecorder('error');
		expect(bulkInsert).toHaveBeenCalledTimes(2);
	});

	it('recovers cleanly once storage answers again', async () => {
		const bulkInsert = jest
			.fn()
			.mockRejectedValueOnce(new Error('storage worker is gone'))
			.mockImplementation(async (rows: { seq: number }[]) => ({
				success: rows.map((row) => ({ ...row })),
				error: [],
			}));
		setDatabase(createFailingCollection(bulkInsert) as never);

		await recordSomething();
		await promoteRecorder('error');

		jest.setSystemTime(Date.now() + 120_000);
		await recordSomething();
		await expect(promoteRecorder('error')).resolves.toBeGreaterThan(0);

		// A later failure is a new streak and must be reported again.
		bulkInsert.mockRejectedValueOnce(new Error('storage worker is gone again'));
		await recordSomething();
		await promoteRecorder('error');

		const promotionErrors = consoleError.mock.calls.filter(([message]) =>
			String(message).includes('Failed to promote flight recorder')
		);
		expect(promotionErrors).toHaveLength(2);
	});
});

describe('flight recorder promotion backoff — review findings (#163)', () => {
	let consoleError: jest.SpyInstance;

	beforeEach(() => {
		jest.useFakeTimers();
		consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		resetRecorderPromotionBackoff();
	});

	afterEach(() => {
		consoleError.mockRestore();
		jest.useRealTimers();
		resetRecorderPromotionBackoff();
		setDatabase(null as never);
	});

	function collectionWith(bulkInsert: jest.Mock) {
		return {
			insert: jest.fn(async () => undefined),
			bulkInsert,
			find: jest.fn(() => ({
				remove: jest.fn().mockResolvedValue([]),
				exec: jest.fn().mockResolvedValue([]),
			})),
			bulkRemove: jest.fn().mockResolvedValue(undefined),
		};
	}

	async function recordSomething() {
		getLogger(['wcpos', 'db']).debug('narration for promotion', { saveToDb: true });
		await Promise.resolve();
	}

	// bulkInsert reports storage write failures in an `error` array rather than
	// rejecting, so a total failure never reached the catch and reset the backoff.
	it('backs off when bulkInsert resolves with every row failed', async () => {
		const bulkInsert = jest.fn(async (rows: { seq: number }[]) => ({
			success: [],
			error: rows.map((row) => ({ status: 500, documentId: String(row.seq) })),
		}));
		setDatabase(collectionWith(bulkInsert) as never);

		await recordSomething();
		await promoteRecorder('error');
		expect(bulkInsert).toHaveBeenCalledTimes(1);

		for (let attempt = 0; attempt < 25; attempt += 1) {
			await recordSomething();
			await promoteRecorder('error');
		}

		expect(bulkInsert).toHaveBeenCalledTimes(1);
		expect(
			consoleError.mock.calls.filter(([message]) =>
				String(message).includes('Failed to promote flight recorder')
			)
		).toHaveLength(1);
	});

	// A promotion in flight when the collection is rebound must not hand the old
	// database's failure to the new one.
	it('ignores a stale promotion outcome after the collection is rebound', async () => {
		let rejectOld: ((error: Error) => void) | undefined;
		const oldBulkInsert = jest.fn(() => new Promise((_resolve, reject) => (rejectOld = reject)));
		setDatabase(collectionWith(oldBulkInsert) as never);

		await recordSomething();
		const stale = promoteRecorder('error');
		// promoteRecorder queues behind recorderPromotionChain, so let the old
		// bulkInsert actually start before rebinding.
		await flushWrites();
		expect(oldBulkInsert).toHaveBeenCalledTimes(1);

		const freshBulkInsert = jest.fn(async (rows: { seq: number }[]) => ({
			success: rows.map((row) => ({ ...row })),
			error: [],
		}));
		setDatabase(collectionWith(freshBulkInsert) as never);
		rejectOld!(new Error('old storage worker is gone'));
		await stale;

		await recordSomething();
		await promoteRecorder('error');

		// The fresh collection promotes immediately instead of serving the old
		// database's backoff window.
		expect(freshBulkInsert).toHaveBeenCalledTimes(1);
	});
});

import { CategoryLogger, getLogger, setDatabase, setToast } from './index';

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
				find: jest.fn().mockReturnValue({
					remove: jest.fn().mockResolvedValue([]),
				}),
				count: jest.fn().mockReturnValue({
					exec: jest.fn().mockResolvedValue(0),
				}),
			};
			expect(() => setDatabase(mockCollection)).not.toThrow();
		});

		it('should prune log entries older than 30 days on init', async () => {
			// Use isolateModules to get a fresh module where hasPruned is false
			const mockRemove = jest.fn().mockResolvedValue([{ id: '1' }, { id: '2' }]);
			const mockFind = jest.fn().mockReturnValue({ remove: mockRemove });
			const mockCollection = {
				insert: jest.fn(),
				find: mockFind,
				count: jest.fn().mockReturnValue({
					exec: jest.fn().mockResolvedValue(0),
				}),
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

		it('prunes beyond MAX_LOG_ROWS on setDatabase', async () => {
			const oldLogRemove = jest.fn().mockResolvedValue([]);
			const excessLogRemove = jest.fn().mockResolvedValue(new Array(600).fill({}));
			const mockFind = jest
				.fn()
				.mockReturnValueOnce({ remove: oldLogRemove })
				.mockReturnValueOnce({ remove: excessLogRemove });
			const mockCountExec = jest.fn().mockResolvedValue(5600);
			const mockCollection = {
				insert: jest.fn(),
				find: mockFind,
				count: jest.fn().mockReturnValue({ exec: mockCountExec }),
			};

			let freshSetDatabase: typeof setDatabase;
			jest.isolateModules(() => {
				freshSetDatabase = require('./index').setDatabase;
			});

			freshSetDatabase!(mockCollection);
			// The row-cap pass is now chained after the age prune settles, so more
			// microtask ticks are needed for the full chain to drain.
			for (let i = 0; i < 8; i += 1) await Promise.resolve();

			expect(mockCountExec).toHaveBeenCalled();
			expect(mockFind).toHaveBeenCalledWith({
				sort: [{ timestamp: 'asc' }],
				limit: 600,
			});
			expect(excessLogRemove).toHaveBeenCalled();
		});

		it('runs the row-cap count only after the age prune resolves', async () => {
			let resolveAgeRemove!: (rows: any[]) => void;
			const ageRemove = jest
				.fn()
				.mockReturnValue(new Promise<any[]>((resolve) => (resolveAgeRemove = resolve)));
			const excessRemove = jest.fn().mockResolvedValue([]);
			const mockFind = jest
				.fn()
				.mockReturnValueOnce({ remove: ageRemove })
				.mockReturnValueOnce({ remove: excessRemove });
			const mockCountExec = jest.fn().mockResolvedValue(0);
			const mockCollection = {
				insert: jest.fn(),
				find: mockFind,
				count: jest.fn().mockReturnValue({ exec: mockCountExec }),
			};

			let freshSetDatabase: typeof setDatabase;
			jest.isolateModules(() => {
				freshSetDatabase = require('./index').setDatabase;
			});

			freshSetDatabase!(mockCollection);
			// Age prune is still pending (deferred not resolved): the row-cap count()
			// must NOT have been reached yet.
			for (let i = 0; i < 8; i += 1) await Promise.resolve();
			expect(ageRemove).toHaveBeenCalled();
			expect(mockCountExec).not.toHaveBeenCalled();

			// Resolving the age prune releases the chained row-cap pass.
			resolveAgeRemove([]);
			for (let i = 0; i < 8; i += 1) await Promise.resolve();
			expect(mockCountExec).toHaveBeenCalled();
		});

		it('persists searchable operational identifiers without copying arbitrary context', async () => {
			const insert = jest.fn().mockResolvedValue(undefined);
			setDatabase({
				insert,
				find: jest.fn().mockReturnValue({ remove: jest.fn().mockResolvedValue([]) }),
				count: jest.fn().mockReturnValue({
					exec: jest.fn().mockResolvedValue(0),
				}),
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
				find: jest.fn().mockReturnValue({ remove: jest.fn().mockResolvedValue([]) }),
				count: jest.fn().mockReturnValue({
					exec: jest.fn().mockResolvedValue(0),
				}),
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
	});
});

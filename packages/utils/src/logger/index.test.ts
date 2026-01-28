import { CategoryLogger, getLogger, setToast, setDatabase } from './index';

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
			const mockCollection = { insert: jest.fn() };
			expect(() => setDatabase(mockCollection)).not.toThrow();
		});
	});
});

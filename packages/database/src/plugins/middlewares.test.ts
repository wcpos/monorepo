import { middlewaresPlugin } from './middlewares';

// Type for mock collection used in tests
interface MockMiddlewareCollection {
	options?: {
		middlewares?: Record<string, { handle: jest.Mock; parallel: boolean }>;
	};
	preInsert: jest.Mock;
	preSave: jest.Mock;
	preRemove: jest.Mock;
	postInsert: jest.Mock;
	postSave: jest.Mock;
	postRemove: jest.Mock;
}

describe('middlewaresPlugin', () => {
	describe('plugin metadata', () => {
		it('should have correct plugin name', () => {
			// Note: there's a typo in the original code ('middleswares')
			expect(middlewaresPlugin.name).toBe('middleswares');
		});

		it('should be marked as rxdb plugin', () => {
			expect(middlewaresPlugin.rxdb).toBe(true);
		});

		it('should have createRxCollection hook', () => {
			expect(middlewaresPlugin.hooks).toBeDefined();
			expect(middlewaresPlugin.hooks?.createRxCollection).toBeDefined();
			expect(middlewaresPlugin.hooks?.createRxCollection?.after).toBeDefined();
		});
	});

	describe('createRxCollection hook', () => {
		let mockCollection: MockMiddlewareCollection;

		beforeEach(() => {
			mockCollection = {
				options: {
					middlewares: {},
				},
				preInsert: jest.fn(),
				preSave: jest.fn(),
				preRemove: jest.fn(),
				postInsert: jest.fn(),
				postSave: jest.fn(),
				postRemove: jest.fn(),
			};
		});

		it('should register multiple middleware hooks', () => {
			const preInsertHandler = jest.fn();
			const preSaveHandler = jest.fn();

			mockCollection.options!.middlewares = {
				preInsert: {
					handle: preInsertHandler,
					parallel: false,
				},
				preSave: {
					handle: preSaveHandler,
					parallel: true,
				},
			};

			const hookFn = middlewaresPlugin.hooks?.createRxCollection?.after;
			hookFn?.({ collection: mockCollection } as any);

			expect(mockCollection.preInsert).toHaveBeenCalledWith(preInsertHandler, false);
			expect(mockCollection.preSave).toHaveBeenCalledWith(preSaveHandler, true);
		});

		it('should handle parallel middleware registration', () => {
			const handler = jest.fn();

			mockCollection.options!.middlewares = {
				postInsert: {
					handle: handler,
					parallel: true,
				},
			};

			const hookFn = middlewaresPlugin.hooks?.createRxCollection?.after;
			hookFn?.({ collection: mockCollection } as any);

			expect(mockCollection.postInsert).toHaveBeenCalledWith(handler, true);
		});

		it('should not fail when no middlewares are configured', () => {
			mockCollection.options!.middlewares = undefined;

			const hookFn = middlewaresPlugin.hooks?.createRxCollection?.after;

			expect(() => hookFn?.({ collection: mockCollection } as any)).not.toThrow();
		});

		it('should not fail when options is undefined', () => {
			mockCollection.options = undefined;

			const hookFn = middlewaresPlugin.hooks?.createRxCollection?.after;

			// Fixed: previously threw "Cannot read properties of undefined (reading 'middlewares')"
			expect(() => hookFn?.({ collection: mockCollection } as any)).not.toThrow();
		});

		it('should return the collection', () => {
			mockCollection.options!.middlewares = {};

			const hookFn = middlewaresPlugin.hooks?.createRxCollection?.after;
			const result = hookFn?.({ collection: mockCollection } as any);

			expect(result).toBe(mockCollection);
		});

		it('should support all hook types', () => {
			// All the RxDB hook types that could be used
			const hookTypes = [
				'preInsert',
				'preSave',
				'preRemove',
				'postInsert',
				'postSave',
				'postRemove',
			];

			const handlers: Record<string, jest.Mock> = {};
			mockCollection.options!.middlewares = {};

			hookTypes.forEach((hookType) => {
				handlers[hookType] = jest.fn();
				mockCollection.options!.middlewares![hookType] = {
					handle: handlers[hookType],
					parallel: false,
				};
			});

			const hookFn = middlewaresPlugin.hooks?.createRxCollection?.after;
			hookFn?.({ collection: mockCollection } as any);

			hookTypes.forEach((hookType) => {
				expect((mockCollection as Record<string, any>)[hookType]).toHaveBeenCalledWith(
					handlers[hookType],
					false
				);
			});
		});
	});
});

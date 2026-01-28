import middlewaresPlugin from './middlewares';

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
		let mockCollection: any;

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

		it('should register middleware hooks from collection options', () => {
			const preInsertHandler = jest.fn((doc) => doc);

			mockCollection.options.middlewares = {
				preInsert: {
					handle: preInsertHandler,
					parallel: false,
				},
			};

			const hookFn = middlewaresPlugin.hooks?.createRxCollection?.after;
			hookFn?.({ collection: mockCollection } as any);

			expect(mockCollection.preInsert).toHaveBeenCalledWith(preInsertHandler, false);
		});

		it('should register multiple middleware hooks', () => {
			const preInsertHandler = jest.fn();
			const preSaveHandler = jest.fn();

			mockCollection.options.middlewares = {
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

			mockCollection.options.middlewares = {
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
			mockCollection.options.middlewares = undefined;

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
			mockCollection.options.middlewares = {};

			const hookFn = middlewaresPlugin.hooks?.createRxCollection?.after;
			const result = hookFn?.({ collection: mockCollection } as any);

			expect(result).toBe(mockCollection);
		});

		it('should support all hook types', () => {
			// All the RxDB hook types that could be used
			const hookTypes = ['preInsert', 'preSave', 'preRemove', 'postInsert', 'postSave', 'postRemove'];

			const handlers: Record<string, jest.Mock> = {};
			mockCollection.options.middlewares = {};

			hookTypes.forEach((hookType) => {
				handlers[hookType] = jest.fn();
				mockCollection.options.middlewares[hookType] = {
					handle: handlers[hookType],
					parallel: false,
				};
			});

			const hookFn = middlewaresPlugin.hooks?.createRxCollection?.after;
			hookFn?.({ collection: mockCollection } as any);

			hookTypes.forEach((hookType) => {
				expect(mockCollection[hookType]).toHaveBeenCalledWith(handlers[hookType], false);
			});
		});
	});

	describe('real-world middleware scenarios', () => {
		it('should support sortable_price middleware pattern', () => {
			const mockCollection: any = {
				options: {
					middlewares: {
						preInsert: {
							handle: (doc: any) => {
								doc.sortable_price = Math.round(parseFloat(doc.price || '0') * 1000000);
								return doc;
							},
							parallel: false,
						},
						preSave: {
							handle: (doc: any) => {
								doc.sortable_price = Math.round(parseFloat(doc.price || '0') * 1000000);
								return doc;
							},
							parallel: false,
						},
					},
				},
				preInsert: jest.fn(),
				preSave: jest.fn(),
			};

			const hookFn = middlewaresPlugin.hooks?.createRxCollection?.after;
			hookFn?.({ collection: mockCollection } as any);

			// Verify middlewares were registered
			expect(mockCollection.preInsert).toHaveBeenCalled();
			expect(mockCollection.preSave).toHaveBeenCalled();

			// Test the actual handler function
			const preInsertHandler = mockCollection.preInsert.mock.calls[0][0];
			const doc = { price: '9.99' };
			preInsertHandler(doc);

			expect(doc.sortable_price).toBe(9990000);
		});

		it('should support async middleware handlers', async () => {
			const asyncHandler = jest.fn(async (doc: any) => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				doc.processed = true;
				return doc;
			});

			const mockCollection: any = {
				options: {
					middlewares: {
						preInsert: {
							handle: asyncHandler,
							parallel: false,
						},
					},
				},
				preInsert: jest.fn(),
			};

			const hookFn = middlewaresPlugin.hooks?.createRxCollection?.after;
			hookFn?.({ collection: mockCollection } as any);

			expect(mockCollection.preInsert).toHaveBeenCalledWith(asyncHandler, false);
		});
	});
});

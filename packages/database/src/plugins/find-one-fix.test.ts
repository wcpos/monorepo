import { firstValueFrom, of } from 'rxjs';

import { findOneFixPlugin } from './find-one-fix';

/**
 * The findOneFix plugin uses `proto.findOne.call(this, queryObj)` which means
 * it expects `findOne` to be available on the prototype when the plugin method is called.
 * We need to set it up correctly in our mock.
 */
describe('findOneFixPlugin', () => {
	describe('plugin metadata', () => {
		it('should have correct plugin name', () => {
			expect(findOneFixPlugin.name).toBe('find-one-fix');
		});

		it('should be marked as rxdb plugin', () => {
			expect(findOneFixPlugin.rxdb).toBe(true);
		});

		it('should extend RxCollection prototype', () => {
			expect(findOneFixPlugin.prototypes).toBeDefined();
			expect(findOneFixPlugin.prototypes?.RxCollection).toBeDefined();
		});
	});

	describe('findOneFix behavior', () => {
		let mockCollection: any;
		let originalFindOne: jest.Mock;
		let proto: any;

		beforeEach(() => {
			originalFindOne = jest.fn();

			// Create a prototype with findOne already defined
			proto = {
				findOne: originalFindOne,
			};

			// Apply the plugin to the prototype (this adds findOneFix)
			findOneFixPlugin.prototypes?.RxCollection(proto);

			// The mock collection uses the augmented prototype
			mockCollection = Object.create(proto);
		});

		it('should return null for empty query object', async () => {
			const result = mockCollection.findOneFix({});

			expect(await result.exec()).toBeNull();
			expect(originalFindOne).not.toHaveBeenCalled();
		});

		it('should return observable of null for empty query object', async () => {
			const result = mockCollection.findOneFix({});

			const value = await firstValueFrom(result.$);
			expect(value).toBeNull();
			expect(originalFindOne).not.toHaveBeenCalled();
		});

		it('should delegate to original findOne for non-empty query', () => {
			const mockResult = { exec: () => Promise.resolve({ id: 1 }), $: of({ id: 1 }) };
			originalFindOne.mockReturnValue(mockResult);

			const query = { selector: { uuid: 'test-uuid' } };
			const result = mockCollection.findOneFix(query);

			expect(result).toBe(mockResult);
			expect(originalFindOne).toHaveBeenCalledWith(query);
		});

		it('should delegate to original findOne for query with selector', () => {
			const mockResult = { exec: () => Promise.resolve({ id: 1 }), $: of({ id: 1 }) };
			originalFindOne.mockReturnValue(mockResult);

			const query = { selector: { name: { $eq: 'test' } } };
			mockCollection.findOneFix(query);

			expect(originalFindOne).toHaveBeenCalledWith(query);
		});

		it('should delegate for query with primary key', () => {
			const mockResult = { exec: () => Promise.resolve({ id: 1 }), $: of({ id: 1 }) };
			originalFindOne.mockReturnValue(mockResult);

			mockCollection.findOneFix('primary-key-value');

			expect(originalFindOne).toHaveBeenCalledWith('primary-key-value');
		});

		it('should handle null query by returning null result', async () => {
			// isEmpty(null) returns true in lodash
			const result = mockCollection.findOneFix(null);

			expect(await result.exec()).toBeNull();
			expect(originalFindOne).not.toHaveBeenCalled();
		});

		it('should handle undefined query by returning null result', async () => {
			// isEmpty(undefined) returns true in lodash
			const result = mockCollection.findOneFix(undefined);

			expect(await result.exec()).toBeNull();
			expect(originalFindOne).not.toHaveBeenCalled();
		});
	});

	describe('edge cases', () => {
		let mockCollection: any;
		let originalFindOne: jest.Mock;
		let proto: any;

		beforeEach(() => {
			originalFindOne = jest.fn();

			proto = {
				findOne: originalFindOne,
			};

			findOneFixPlugin.prototypes?.RxCollection(proto);
			mockCollection = Object.create(proto);
		});

		it('should handle query with empty arrays', async () => {
			// isEmpty([]) returns true, so this should return null
			const result = mockCollection.findOneFix([]);

			await expect(result.exec()).resolves.toBeNull();
			expect(originalFindOne).not.toHaveBeenCalled();
		});

		it('should delegate for query with nested empty object', () => {
			// isEmpty({ selector: {} }) returns false (object is not empty)
			const mockResult = { exec: () => Promise.resolve(null), $: of(null) };
			originalFindOne.mockReturnValue(mockResult);

			const query = { selector: {} };
			mockCollection.findOneFix(query);

			expect(originalFindOne).toHaveBeenCalledWith(query);
		});

		it('should return null for numeric queries (lodash isEmpty returns true for numbers)', async () => {
			// lodash isEmpty(0) === true, isEmpty(1) === true
			// So numeric queries are treated as "empty" and return null
			const result = mockCollection.findOneFix(0);

			expect(await result.exec()).toBeNull();
			expect(originalFindOne).not.toHaveBeenCalled();
		});

		it('should return null for query with false value', async () => {
			// isEmpty(false) returns true, so this returns null
			const result = mockCollection.findOneFix(false);

			await expect(result.exec()).resolves.toBeNull();
		});

		it('should delegate for non-empty string queries', () => {
			const mockResult = { exec: () => Promise.resolve({ id: 1 }), $: of({ id: 1 }) };
			originalFindOne.mockReturnValue(mockResult);

			mockCollection.findOneFix('some-uuid');

			expect(originalFindOne).toHaveBeenCalledWith('some-uuid');
		});

		it('should return null for empty string queries', async () => {
			const result = mockCollection.findOneFix('');

			expect(await result.exec()).toBeNull();
			expect(originalFindOne).not.toHaveBeenCalled();
		});
	});
});

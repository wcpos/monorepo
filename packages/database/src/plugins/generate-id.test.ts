import { generateID } from './generate-id';

import type { RxCollection } from 'rxdb';

jest.mock('uuid', () => {
	return {
		v4: jest.fn(() => 'mocked-uuid'),
	};
});

describe('generateID', () => {
	it('should use the meta_data uuid if present', () => {
		const mockCollection = {
			schema: {
				primaryPath: 'uuid',
				jsonSchema: {
					properties: {
						meta_data: {},
					},
				},
			},
		} as unknown as RxCollection;

		const data: Record<string, any> = {
			meta_data: [
				{
					key: '_woocommerce_pos_uuid',
					value: 'existing-uuid',
				},
			],
		};

		generateID.call(mockCollection, data);
		expect(data.uuid).toBe('existing-uuid');
	});

	it('should generate a uuid if not present', () => {
		const mockCollection = {
			schema: {
				primaryPath: 'uuid',
				jsonSchema: {
					properties: {},
				},
			},
		} as unknown as RxCollection;

		const data: Record<string, any> = {};

		generateID.call(mockCollection, data);
		expect(data.uuid).toBe('mocked-uuid');
	});

	it('should generate a short localID if not present', () => {
		const mockCollection = {
			schema: {
				primaryPath: 'localID',
				jsonSchema: {
					properties: {},
				},
			},
		} as unknown as RxCollection;

		const data: Record<string, any> = {};

		generateID.call(mockCollection, data);
		expect(data.localID).toBe('mocked-u');
	});

	it('should add uuid to meta_data if schema has meta_data property', () => {
		const mockCollection = {
			schema: {
				primaryPath: 'uuid',
				jsonSchema: {
					properties: {
						meta_data: {},
					},
				},
			},
		} as unknown as RxCollection;

		const data: Record<string, any> = {};

		generateID.call(mockCollection, data);
		expect(data.uuid).toBe('mocked-uuid');
		expect(data.meta_data).toContainEqual({
			key: '_woocommerce_pos_uuid',
			value: 'mocked-uuid',
		});
	});
});

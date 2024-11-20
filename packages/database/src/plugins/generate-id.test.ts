import { generateID } from './generate-id';

jest.mock('uuid', () => {
	return {
		v4: jest.fn(() => 'mocked-uuid'),
	};
});

describe('generateID', () => {
	it('should use the meta_data uuid if present', () => {
		const RxCollection = {
			schema: {
				primaryPath: 'uuid',
			},
		};

		const data = {
			meta_data: [
				{
					key: '_woocommerce_pos_uuid',
					value: 'existing-uuid',
				},
			],
		};

		generateID.call(RxCollection, data);
		expect(data.uuid).toBe('existing-uuid');
	});

	it('should generate a uuid if not present', () => {
		const RxCollection = {
			schema: {
				primaryPath: 'uuid',
			},
		};

		const data = {};

		generateID.call(RxCollection, data);
		expect(data.uuid).toBe('mocked-uuid');
	});

	it('should generate a short localID if not present', () => {
		const RxCollection = {
			schema: {
				primaryPath: 'localID',
			},
		};

		const data = {};

		generateID.call(RxCollection, data);
		expect(data.localID).toBe('mocked-u');
	});
});

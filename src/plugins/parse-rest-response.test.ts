import { RxJsonSchema } from 'rxdb';

import { pruneProperties, coerceData, parseRestResponse } from './parse-rest-response';

describe('pruneProperties', () => {
	const schema: RxJsonSchema<any> = {
		properties: {
			id: {
				type: 'integer',
			},
			name: {
				type: 'string',
			},
			links: {
				type: 'object',
			},
		},
	};

	it('should replace "_links" with "links"', () => {
		const data = {
			id: 1,
			name: 'John Doe',
			_links: {
				self: '/api/v1/users/1',
			},
		};

		pruneProperties(schema, data);

		expect(data).toEqual({
			id: 1,
			name: 'John Doe',
			links: {
				self: '/api/v1/users/1',
			},
		});
	});

	it('should remove properties not present in the schema', () => {
		const data = {
			id: 1,
			name: 'John Doe',
			email: 'johndoe@example.com',
			_links: {
				self: '/api/v1/users/1',
			},
		};

		pruneProperties(schema, data);

		expect(data).toEqual({
			id: 1,
			name: 'John Doe',
			links: {
				self: '/api/v1/users/1',
			},
		});
	});

	it('should convert the special case of _links to links (rxdb does not allow underscore)', () => {
		const data = {
			id: 1,
			name: 'John Doe',
			_links: {
				self: '/api/v1/users/1',
			},
		};

		pruneProperties(schema, data);

		expect(data).toEqual({
			id: 1,
			name: 'John Doe',
			links: {
				self: '/api/v1/users/1',
			},
		});
	});
});

describe('coerceData', () => {
	it('should return data with proper types', () => {
		const schema = {
			type: 'object',
			properties: {
				numberProp: { type: 'number' },
				integerProp: { type: 'integer' },
				stringProp: { type: 'string' },
				booleanProp: { type: 'boolean' },
			},
		};
		const data = {
			numberProp: '123',
			integerProp: '456',
			stringProp: 123,
			booleanProp: 'false',
		};
		const coercedData = coerceData(schema, data);
		expect(coercedData).toEqual({
			numberProp: 123,
			integerProp: 456,
			stringProp: '123',
			booleanProp: false,
		});
	});

	it('should set default value for missing property', () => {
		const schema = {
			type: 'object',
			properties: {
				propA: { type: 'string', default: 'defaultA' },
				propB: { type: 'string', default: 'defaultB' },
			},
		};
		const data = { propA: 'valueA' };
		const coercedData = coerceData(schema, data);
		expect(coercedData).toEqual({ propA: 'valueA', propB: 'defaultB' });
	});

	it('should handle nested objects', () => {
		const schema = {
			type: 'object',
			properties: {
				objProp: {
					type: 'object',
					properties: {
						numberProp: { type: 'number' },
						stringProp: { type: 'string' },
					},
				},
			},
		};
		const data = {
			objProp: {
				numberProp: '123',
				stringProp: 456,
			},
		};
		const coercedData = coerceData(schema, data);
		expect(coercedData).toEqual({
			objProp: {
				numberProp: 123,
				stringProp: '456',
			},
		});
	});

	it('should handle arrays', () => {
		const schema = {
			type: 'object',
			properties: {
				arrayProp: {
					type: 'array',
					items: { type: 'number' },
				},
			},
		};
		const data = {
			arrayProp: ['123', 456, '789'],
		};
		const coercedData = coerceData(schema, data);
		expect(coercedData).toEqual({
			arrayProp: [123, 456, 789],
		});
	});
});

describe('parseRestResponse', () => {
	it('should parse nested data', () => {
		const ordersCollection = {
			schema: {
				jsonSchema: {
					type: 'object',
					properties: {
						id: {
							type: 'integer',
						},
						number: {
							type: 'string',
						},
						line_items: {
							type: 'array',
							ref: 'line_items',
							items: {
								type: 'string',
							},
						},
						meta_data: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									key: {
										type: 'string',
									},
									value: {
										type: 'string',
									},
								},
							},
						},
					},
				},
			},
			parseRestResponse,
		};

		const lineItemsCollection = {
			schema: {
				jsonSchema: {
					type: 'object',
					properties: {
						id: {
							type: 'integer',
						},
						name: {
							type: 'string',
						},
						parent_name: {
							type: 'string',
						},
						image: {
							type: 'object',
							properties: {
								id: {
									type: 'integer',
								},
								src: {
									type: 'string',
								},
							},
						},
						meta_data: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									key: {
										type: 'string',
									},
									value: {
										type: 'string',
									},
								},
							},
						},
					},
				},
			},
		};

		ordersCollection.database = {
			collections: {
				orders: ordersCollection,
				line_items: lineItemsCollection,
			},
		};

		const response = {
			id: 1,
			number: 1,
			line_items: [
				{
					id: 1,
					name: 'Belt',
					parent_name: null,
					image: {
						id: '46',
						src: 'https://wchpos.local/wp-content/uploads/2022/12/belt-2.jpg',
					},
					meta_data: [
						{
							key: '_woocommerce_pos_uuid',
							value: 'line-item-uuid',
						},
					],
				},
			],
			meta_data: [
				{
					key: '_woocommerce_pos_uuid',
					value: 'order-uuid',
				},
			],
		};
		expect(ordersCollection.parseRestResponse(response)).toEqual({
			uuid: 'order-uuid',
			id: 1,
			number: '1',
			line_items: [
				{
					uuid: 'line-item-uuid',
					id: 1,
					name: 'Belt',
					parent_name: '',
					image: {
						id: 46,
						src: 'https://wchpos.local/wp-content/uploads/2022/12/belt-2.jpg',
					},
					meta_data: [
						{
							key: '_woocommerce_pos_uuid',
							value: 'line-item-uuid',
						},
					],
				},
			],
			meta_data: [
				{
					key: '_woocommerce_pos_uuid',
					value: 'order-uuid',
				},
			],
		});
	});
});

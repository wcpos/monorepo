import { RxJsonSchema } from 'rxdb';

import { pruneProperties, coerceData } from './validate';

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

	it('should leave only properties present in the schema', () => {
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
		coerceData(schema, data);
		expect(data).toEqual({
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
		coerceData(schema, data);
		expect(data).toEqual({ propA: 'valueA', propB: 'defaultB' });
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
		coerceData(schema, data);
		expect(data).toEqual({
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
		coerceData(schema, data);
		expect(data).toEqual({
			arrayProp: [123, 456, 789],
		});
	});

	it('#bugfix - line_item image id should be coerced to integer', () => {
		const schema = {
			title: 'WooCommerce Order Line Item schema',
			version: 0,
			description: 'WooCommerce Order Line Item schema',
			type: 'object',
			primaryKey: 'uuid',
			properties: {
				uuid: {
					description: 'Unique identifier for the resource.',
					type: 'string',
					maxLength: 36,
				},
				id: {
					description: 'Item ID.',
					type: 'integer',
				},
				name: {
					description: 'Product name.',
					type: 'string',
				},
				product_id: {
					description: 'Product ID.',
					type: 'integer',
				},
				variation_id: {
					description: 'Variation ID, if applicable.',
					type: 'integer',
				},
				parent_name: {
					type: 'string',
				},
				sku: {
					description: 'Product SKU.',
					type: 'string',
				},
				price: {
					description: 'Product price.',
					type: 'number',
				},
				quantity: {
					description: 'Quantity ordered.',
					type: 'number',
				},
				tax_class: {
					description: 'Tax class of product.',
					type: 'string',
				},
				subtotal: {
					description: 'Line subtotal (before discounts).',
					type: 'string',
				},
				subtotal_tax: {
					description: 'Line subtotal tax (before discounts).',
					type: 'string',
				},
				total: {
					description: 'Line total (after discounts).',
					type: 'string',
				},
				total_tax: {
					description: 'Line total tax (after discounts).',
					type: 'string',
				},
				taxes: {
					description: 'Line taxes.',
					type: 'array',
					items: {
						type: 'object',
						properties: {
							id: {
								description: 'Tax rate ID.',
								type: 'integer',
							},
							total: {
								description: 'Tax total.',
								type: 'string',
							},
							subtotal: {
								description: 'Tax subtotal.',
								type: 'string',
							},
						},
					},
				},
				meta_data: {
					description: 'Meta data.',
					type: 'array',
					items: {
						type: 'object',
						properties: {
							id: {
								description: 'Meta ID.',
								type: 'integer',
							},
							key: {
								description: 'Meta key.',
								type: 'string',
							},
							value: {
								description: 'Meta value.',
								type: 'string',
							},
						},
					},
				},
				image: {
					description: 'Product image.',
					type: 'object',
					properties: {
						id: {
							description: 'Image ID.',
							type: 'integer',
						},
						src: {
							description: 'Image URL.',
							type: 'string',
						},
					},
				},
			},
		};
		const data = {
			id: 6,
			name: 'Belt',
			product_id: 17,
			variation_id: 0,
			quantity: 9,
			tax_class: '',
			subtotal: '495.00',
			subtotal_tax: '0.00',
			total: '495.00',
			total_tax: '0.00',
			taxes: [],
			meta_data: [
				{
					id: 71,
					key: '_wpcom_is_markdown',
					value: '1',
					display_key: '_wpcom_is_markdown',
					display_value: '1',
				},
				{
					id: 72,
					key: '_pos',
					value: 'wqo2r22vrp:1674147647694',
					display_key: '_pos',
					display_value: 'wqo2r22vrp:1674147647694',
				},
			],
			sku: 'woo-belt',
			price: 55,
			image: {
				id: '46',
				src: 'https://wchpos.local/wp-content/uploads/2022/12/belt-2.jpg',
			},
			parent_name: null,
			_deleted: false,
			uuid: '587119ff-15be-4372-bc14-cb0a667ba51d',
			_attachments: {},
			_meta: {
				lwt: 1675187600460.01,
			},
			_rev: '1-kauivjsvlk',
		};
		coerceData(schema, data);
		expect(data).toEqual({
			id: 6,
			name: 'Belt',
			product_id: 17,
			variation_id: 0,
			quantity: 9,
			tax_class: '',
			subtotal: '495.00',
			subtotal_tax: '0.00',
			total: '495.00',
			total_tax: '0.00',
			taxes: [],
			meta_data: [
				{
					id: 71,
					key: '_wpcom_is_markdown',
					value: '1',
					display_key: '_wpcom_is_markdown',
					display_value: '1',
				},
				{
					id: 72,
					key: '_pos',
					value: 'wqo2r22vrp:1674147647694',
					display_key: '_pos',
					display_value: 'wqo2r22vrp:1674147647694',
				},
			],
			sku: 'woo-belt',
			price: 55,
			image: {
				id: 46,
				src: 'https://wchpos.local/wp-content/uploads/2022/12/belt-2.jpg',
			},
			parent_name: '',
			_deleted: false,
			uuid: '587119ff-15be-4372-bc14-cb0a667ba51d',
			_attachments: {},
			_meta: {
				lwt: 1675187600460.01,
			},
			_rev: '1-kauivjsvlk',
		});
	});
});

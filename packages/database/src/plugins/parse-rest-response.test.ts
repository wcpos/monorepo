import { coerceData, getDefaultForType, pruneProperties } from './parse-rest-response';

describe('pruneProperties', () => {
	const schema = {
		version: 1,
		type: 'object',
		primaryKey: 'id',
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

describe('getDefaultForType', () => {
	it('should return empty string for string type', () => {
		expect(getDefaultForType({ type: 'string' } as any)).toBe('');
	});

	it('should return 0 for number type', () => {
		expect(getDefaultForType({ type: 'number' } as any)).toBe(0);
	});

	it('should return 0 for integer type', () => {
		expect(getDefaultForType({ type: 'integer' } as any)).toBe(0);
	});

	it('should return false for boolean type', () => {
		expect(getDefaultForType({ type: 'boolean' } as any)).toBe(false);
	});

	it('should return empty array for array type', () => {
		expect(getDefaultForType({ type: 'array' } as any)).toEqual([]);
	});

	it('should return empty object for object type', () => {
		expect(getDefaultForType({ type: 'object' } as any)).toEqual({});
	});

	it('should return null for null type', () => {
		expect(getDefaultForType({ type: 'null' } as any)).toBe(null);
	});

	it('should return undefined for unknown types', () => {
		expect(getDefaultForType({ type: 'unknown' } as any)).toBe(undefined);
	});
});

describe('coerceData', () => {
	it('should return data with proper types', () => {
		const schema = {
			version: 1,
			type: 'object',
			primaryKey: 'id',
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
			version: 1,
			type: 'object',
			primaryKey: 'id',
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
			version: 1,
			type: 'object',
			primaryKey: 'id',
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
			version: 1,
			type: 'object',
			primaryKey: 'id',
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

	it('FIX: should coerce null object and apply type-safe defaults to nested properties', () => {
		const schema = {
			version: 1,
			type: 'object',
			primaryKey: 'id',
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
			objProp: null,
		};
		const coercedData = coerceData(schema, data);
		// With type-safe fallbacks, nested properties get their defaults even when parent is null
		expect(coercedData).toEqual({
			objProp: {
				numberProp: 0,
				stringProp: '',
			},
		});
	});

	it('should return an empty array when schema expects an array but gets null', () => {
		const schema = {
			version: 1,
			type: 'object',
			primaryKey: 'id',
			properties: {
				arrayProp: {
					type: 'array',
					items: { type: 'number' },
				},
			},
		};
		const data = {
			arrayProp: null,
		};
		const coercedData = coerceData(schema, data);
		expect(coercedData).toEqual({
			arrayProp: [],
		});
	});

	describe('missing properties (type-safe fallbacks)', () => {
		it('should set missing string property to empty string', () => {
			const schema = {
				version: 1,
				type: 'object',
				primaryKey: 'id',
				properties: {
					name: { type: 'string' },
					description: { type: 'string' },
				},
			};
			const data = { name: 'Test' };
			const coercedData = coerceData(schema, data);
			expect(coercedData).toEqual({
				name: 'Test',
				description: '',
			});
		});

		it('should set missing number property to 0', () => {
			const schema = {
				version: 1,
				type: 'object',
				primaryKey: 'id',
				properties: {
					count: { type: 'number' },
					total: { type: 'number' },
				},
			};
			const data = { count: 5 };
			const coercedData = coerceData(schema, data);
			expect(coercedData).toEqual({
				count: 5,
				total: 0,
			});
		});

		it('should set missing integer property to 0', () => {
			const schema = {
				version: 1,
				type: 'object',
				primaryKey: 'id',
				properties: {
					id: { type: 'integer' },
					quantity: { type: 'integer' },
				},
			};
			const data = { id: 1 };
			const coercedData = coerceData(schema, data);
			expect(coercedData).toEqual({
				id: 1,
				quantity: 0,
			});
		});

		it('should set missing boolean property to false', () => {
			const schema = {
				version: 1,
				type: 'object',
				primaryKey: 'id',
				properties: {
					active: { type: 'boolean' },
					featured: { type: 'boolean' },
				},
			};
			const data = { active: true };
			const coercedData = coerceData(schema, data);
			expect(coercedData).toEqual({
				active: true,
				featured: false,
			});
		});

		it('should set missing array property to empty array', () => {
			const schema = {
				version: 1,
				type: 'object',
				primaryKey: 'id',
				properties: {
					tags: { type: 'array', items: { type: 'string' } },
					categories: { type: 'array', items: { type: 'string' } },
				},
			};
			const data = { tags: ['a', 'b'] };
			const coercedData = coerceData(schema, data);
			expect(coercedData).toEqual({
				tags: ['a', 'b'],
				categories: [],
			});
		});

		it('should set missing object property to empty object', () => {
			const schema = {
				version: 1,
				type: 'object',
				primaryKey: 'id',
				properties: {
					settings: { type: 'object', properties: {} },
					metadata: { type: 'object', properties: {} },
				},
			};
			const data = { settings: { key: 'value' } };
			const coercedData = coerceData(schema, data);
			expect(coercedData).toEqual({
				settings: {},
				metadata: {},
			});
		});

		it('should prefer schema default over type fallback', () => {
			const schema = {
				version: 1,
				type: 'object',
				primaryKey: 'id',
				properties: {
					status: { type: 'string', default: 'pending' },
					count: { type: 'number', default: 10 },
				},
			};
			const data = {};
			const coercedData = coerceData(schema, data);
			expect(coercedData).toEqual({
				status: 'pending',
				count: 10,
			});
		});

		it('should handle all missing properties with mixed types', () => {
			const schema = {
				version: 1,
				type: 'object',
				primaryKey: 'id',
				properties: {
					name: { type: 'string' },
					count: { type: 'number' },
					id: { type: 'integer' },
					active: { type: 'boolean' },
					tags: { type: 'array', items: { type: 'string' } },
					meta: { type: 'object', properties: {} },
				},
			};
			const data = {};
			const coercedData = coerceData(schema, data);
			expect(coercedData).toEqual({
				name: '',
				count: 0,
				id: 0,
				active: false,
				tags: [],
				meta: {},
			});
		});

		it('should handle nested objects with missing properties', () => {
			const schema = {
				version: 1,
				type: 'object',
				primaryKey: 'id',
				properties: {
					user: {
						type: 'object',
						properties: {
							name: { type: 'string' },
							age: { type: 'integer' },
							email: { type: 'string' },
						},
					},
				},
			};
			const data = {
				user: {
					name: 'John',
				},
			};
			const coercedData = coerceData(schema, data);
			expect(coercedData).toEqual({
				user: {
					name: 'John',
					age: 0,
					email: '',
				},
			});
		});

		it('should handle deeply nested missing properties', () => {
			const schema = {
				version: 1,
				type: 'object',
				primaryKey: 'id',
				properties: {
					level1: {
						type: 'object',
						properties: {
							level2: {
								type: 'object',
								properties: {
									name: { type: 'string' },
									value: { type: 'number' },
								},
							},
						},
					},
				},
			};
			const data = {
				level1: {
					level2: {
						name: 'deep',
					},
				},
			};
			const coercedData = coerceData(schema, data);
			expect(coercedData).toEqual({
				level1: {
					level2: {
						name: 'deep',
						value: 0,
					},
				},
			});
		});
	});

	describe('null/undefined data handling', () => {
		it('should handle null data at root level', () => {
			const schema = {
				version: 1,
				type: 'object',
				primaryKey: 'id',
				properties: {
					name: { type: 'string' },
					count: { type: 'number' },
				},
			};
			const coercedData = coerceData(schema, null as any);
			expect(coercedData).toEqual({
				name: '',
				count: 0,
			});
		});

		it('should handle undefined data at root level', () => {
			const schema = {
				version: 1,
				type: 'object',
				primaryKey: 'id',
				properties: {
					name: { type: 'string' },
					count: { type: 'number' },
				},
			};
			const coercedData = coerceData(schema, undefined as any);
			expect(coercedData).toEqual({
				name: '',
				count: 0,
			});
		});

		it('should handle null nested object', () => {
			const schema = {
				version: 1,
				type: 'object',
				primaryKey: 'id',
				properties: {
					nested: {
						type: 'object',
						properties: {
							name: { type: 'string' },
							value: { type: 'number' },
						},
					},
				},
			};
			const data = { nested: null };
			const coercedData = coerceData(schema, data);
			expect(coercedData).toEqual({
				nested: {
					name: '',
					value: 0,
				},
			});
		});

		it('should handle undefined nested object', () => {
			const schema = {
				version: 1,
				type: 'object',
				primaryKey: 'id',
				properties: {
					nested: {
						type: 'object',
						properties: {
							name: { type: 'string' },
							value: { type: 'number' },
						},
					},
				},
			};
			const data = { nested: undefined };
			const coercedData = coerceData(schema, data);
			expect(coercedData).toEqual({
				nested: {
					name: '',
					value: 0,
				},
			});
		});
	});

	describe('real-world scenarios', () => {
		it('should handle wcpos_pro_version missing from REST response', () => {
			const schema = {
				version: 1,
				type: 'object',
				primaryKey: 'id',
				properties: {
					id: { type: 'integer' },
					name: { type: 'string' },
					wcpos_pro_version: { type: 'string' },
					status: { type: 'string', default: 'publish' },
				},
			};
			const data = {
				id: 123,
				name: 'Test Product',
				// wcpos_pro_version is missing from the REST response
			};
			const coercedData = coerceData(schema, data);
			expect(coercedData).toEqual({
				id: 123,
				name: 'Test Product',
				wcpos_pro_version: '',
				status: 'publish',
			});
		});

		it('should handle WooCommerce product with missing optional fields', () => {
			const schema = {
				version: 1,
				type: 'object',
				primaryKey: 'id',
				properties: {
					id: { type: 'integer' },
					name: { type: 'string' },
					sku: { type: 'string' },
					price: { type: 'string' },
					regular_price: { type: 'string' },
					sale_price: { type: 'string' },
					on_sale: { type: 'boolean' },
					purchasable: { type: 'boolean' },
					stock_quantity: { type: 'integer' },
					manage_stock: { type: 'boolean' },
					categories: { type: 'array', items: { type: 'object' } },
					tags: { type: 'array', items: { type: 'object' } },
					images: { type: 'array', items: { type: 'object' } },
					attributes: { type: 'array', items: { type: 'object' } },
				},
			};
			const data = {
				id: 1,
				name: 'Simple Product',
				price: '10.00',
				on_sale: false,
			};
			const coercedData = coerceData(schema, data);
			expect(coercedData).toEqual({
				id: 1,
				name: 'Simple Product',
				sku: '',
				price: '10.00',
				regular_price: '',
				sale_price: '',
				on_sale: false,
				purchasable: false,
				stock_quantity: 0,
				manage_stock: false,
				categories: [],
				tags: [],
				images: [],
				attributes: [],
			});
		});
	});
});

// describe('parseRestResponse', () => {
// 	it('should parse nested data', () => {
// 		const ordersCollection = {
// 			schema: {
// 				jsonSchema: {
// 					type: 'object',
// 					properties: {
// 						uuid: {
// 							type: 'string',
// 						},
// 						id: {
// 							type: 'integer',
// 						},
// 						number: {
// 							type: 'string',
// 						},
// 						line_items: {
// 							type: 'array',
// 							ref: 'line_items',
// 							items: {
// 								type: 'string',
// 							},
// 						},
// 						meta_data: {
// 							type: 'array',
// 							items: {
// 								type: 'object',
// 								properties: {
// 									key: {
// 										type: 'string',
// 									},
// 									value: {
// 										type: 'string',
// 									},
// 								},
// 							},
// 						},
// 					},
// 				},
// 			},
// 			parseRestResponse,
// 		};

// 		const lineItemsCollection = {
// 			schema: {
// 				jsonSchema: {
// 					type: 'object',
// 					properties: {
// 						uuid: {
// 							type: 'string',
// 						},
// 						id: {
// 							type: 'integer',
// 						},
// 						name: {
// 							type: 'string',
// 						},
// 						parent_name: {
// 							type: 'string',
// 						},
// 						image: {
// 							type: 'object',
// 							properties: {
// 								id: {
// 									type: 'integer',
// 								},
// 								src: {
// 									type: 'string',
// 								},
// 							},
// 						},
// 						meta_data: {
// 							type: 'array',
// 							items: {
// 								type: 'object',
// 								properties: {
// 									key: {
// 										type: 'string',
// 									},
// 									value: {
// 										type: 'string',
// 									},
// 								},
// 							},
// 						},
// 					},
// 				},
// 			},
// 		};

// 		ordersCollection.database = {
// 			collections: {
// 				orders: ordersCollection,
// 				line_items: lineItemsCollection,
// 			},
// 		};

// 		const response = {
// 			id: 1,
// 			number: 1,
// 			line_items: [
// 				{
// 					id: 1,
// 					name: 'Belt',
// 					parent_name: null,
// 					image: {
// 						id: '46',
// 						src: 'https://wchpos.local/wp-content/uploads/2022/12/belt-2.jpg',
// 					},
// 					meta_data: [
// 						{
// 							key: '_woocommerce_pos_uuid',
// 							value: 'line-item-uuid',
// 						},
// 					],
// 				},
// 			],
// 			meta_data: [
// 				{
// 					key: '_woocommerce_pos_uuid',
// 					value: 'order-uuid',
// 				},
// 			],
// 		};

// 		expect(ordersCollection.parseRestResponse(response)).toEqual({
// 			uuid: 'order-uuid',
// 			id: 1,
// 			number: '1',
// 			line_items: [
// 				{
// 					uuid: 'line-item-uuid',
// 					id: 1,
// 					name: 'Belt',
// 					parent_name: '',
// 					image: {
// 						id: 46,
// 						src: 'https://wchpos.local/wp-content/uploads/2022/12/belt-2.jpg',
// 					},
// 					meta_data: [
// 						{
// 							key: '_woocommerce_pos_uuid',
// 							value: 'line-item-uuid',
// 						},
// 					],
// 				},
// 			],
// 			meta_data: [
// 				{
// 					key: '_woocommerce_pos_uuid',
// 					value: 'order-uuid',
// 				},
// 			],
// 		});
// 	});
// });

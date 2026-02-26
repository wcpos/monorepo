import {
	buildSchema,
	isArrayOfIntegers,
	buildEndpointWithParams,
	pluckProperties,
	toUpperSnakeCase,
	getParamValueFromEndpoint,
	normalizeWhereClauses,
} from '../src/utils';

describe('buildSchema', () => {
	const inputSchema = {
		email: {
			description: 'The email address for the customer.',
			type: 'string',
		},
		first_name: {
			description: 'Customer first name.',
			type: 'string',
		},
		last_name: {
			description: 'Customer last name.',
			type: 'string',
		},
		role: {
			type: 'string',
		},
		username: {
			description: 'Customer login name.',
			type: 'string',
		},
		password: {
			description: 'Customer password.',
			type: 'string',
		},
		billing: {
			description: 'List of billing address data.',
			type: 'object',
			properties: {
				first_name: {
					type: 'string',
				},
				last_name: {
					type: 'string',
				},
				company: {
					type: 'string',
				},
				address_1: {
					type: 'string',
				},
				address_2: {
					type: 'string',
				},
				city: {
					type: 'string',
				},
				postcode: {
					type: 'string',
				},
				country: {
					type: 'string',
				},
				state: {
					type: 'string',
				},
				email: {
					type: 'string',
				},
				phone: {
					type: 'string',
				},
			},
		},
		shipping: {
			description: 'List of shipping address data.',
			type: 'object',
			properties: {
				first_name: {
					type: 'string',
				},
				last_name: {
					type: 'string',
				},
				company: {
					type: 'string',
				},
				address_1: {
					type: 'string',
				},
				address_2: {
					type: 'string',
				},
				city: {
					type: 'string',
				},
				postcode: {
					type: 'string',
				},
				country: {
					type: 'string',
				},
				state: {
					type: 'string',
				},
			},
		},
		is_paying_customer: {
			type: 'boolean',
		},
	};

	it('should build schema for top-level properties', () => {
		const fields = ['first_name', 'last_name', 'email'];

		const expectedOutput = {
			first_name: 'string',
			last_name: 'string',
			email: 'string',
		};

		expect(buildSchema(inputSchema, fields)).toEqual(expectedOutput);
	});

	it('should build schema for nested properties', () => {
		const fields = ['billing.first_name', 'billing.last_name', 'billing.email'];

		const expectedOutput = {
			billing: {
				first_name: 'string',
				last_name: 'string',
				email: 'string',
			},
		};

		expect(buildSchema(inputSchema, fields)).toEqual(expectedOutput);
	});

	it('should build schema for mixed top-level and nested properties', () => {
		const fields = [
			'first_name',
			'last_name',
			'email',
			'username',
			'billing.first_name',
			'billing.last_name',
			'billing.email',
			'billing.company',
			'billing.phone',
		];

		const expectedOutput = {
			first_name: 'string',
			last_name: 'string',
			email: 'string',
			username: 'string',
			billing: {
				first_name: 'string',
				last_name: 'string',
				email: 'string',
				company: 'string',
				phone: 'string',
			},
		};

		expect(buildSchema(inputSchema, fields)).toEqual(expectedOutput);
	});

	it('should handle empty fields array', () => {
		const fields: string[] = [];

		const expectedOutput = {};

		expect(buildSchema(inputSchema, fields)).toEqual(expectedOutput);
	});
});

describe('isArrayOfIntegers', () => {
	it('should return true for array of integers', () => {
		expect(isArrayOfIntegers([1, 2, 3])).toBe(true);
	});

	it('should return false for array with non-integers', () => {
		expect(isArrayOfIntegers([1, 2.5, 3])).toBe(false);
	});

	it('should return false for non-array', () => {
		expect(isArrayOfIntegers('not an array')).toBe(false);
		expect(isArrayOfIntegers(42)).toBe(false);
		expect(isArrayOfIntegers(null)).toBe(false);
	});

	it('should return true for empty array', () => {
		expect(isArrayOfIntegers([])).toBe(true);
	});
});

describe('buildEndpointWithParams', () => {
	it('should append query params to endpoint', () => {
		const result = buildEndpointWithParams('products', { per_page: 10, orderby: 'date' });
		expect(result).toContain('products?');
		expect(result).toContain('per_page=10');
		expect(result).toContain('orderby=date');
	});

	it('should return endpoint alone when params are empty', () => {
		expect(buildEndpointWithParams('products', {})).toBe('products');
	});

	it('should skip null values', () => {
		const result = buildEndpointWithParams('products', { name: null, status: 'publish' });
		expect(result).not.toContain('name');
		expect(result).toContain('status=publish');
	});

	it('should format arrays with bracket notation', () => {
		const result = buildEndpointWithParams('products', { include: [1, 2, 3] });
		expect(result).toContain('include');
	});
});

describe('pluckProperties', () => {
	it('should extract top-level properties', () => {
		const obj = { a: 1, b: 2, c: 3 };
		expect(pluckProperties(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
	});

	it('should extract nested properties', () => {
		const obj = { billing: { first_name: 'John', email: 'john@example.com' } };
		expect(pluckProperties(obj, ['billing.first_name'])).toEqual({
			billing: { first_name: 'John' },
		});
	});

	it('should handle missing properties gracefully', () => {
		const obj = { a: 1 };
		const result = pluckProperties(obj, ['b']);
		expect(result.b).toBeUndefined();
	});
});

describe('toUpperSnakeCase', () => {
	it('should convert camelCase to UPPER_SNAKE_CASE', () => {
		expect(toUpperSnakeCase('myVariableName')).toBe('MY_VARIABLE_NAME');
	});

	it('should convert kebab-case to UPPER_SNAKE_CASE', () => {
		expect(toUpperSnakeCase('my-variable-name')).toBe('MY_VARIABLE_NAME');
	});

	it('should handle single word', () => {
		expect(toUpperSnakeCase('hello')).toBe('HELLO');
	});
});

describe('getParamValueFromEndpoint', () => {
	it('should extract query param value', () => {
		expect(getParamValueFromEndpoint('products?per_page=10&orderby=date', 'per_page')).toBe('10');
		expect(getParamValueFromEndpoint('products?per_page=10&orderby=date', 'orderby')).toBe(
			'date'
		);
	});

	it('should return null for missing param', () => {
		expect(getParamValueFromEndpoint('products?per_page=10', 'orderby')).toBeNull();
	});

	it('should handle endpoints without query string', () => {
		expect(getParamValueFromEndpoint('products', 'per_page')).toBeNull();
	});
});

describe('normalizeWhereClauses', () => {
	it('should deduplicate clauses by field', () => {
		const clauses = [
			{ field: 'status', value: 'draft' },
			{ field: 'status', value: 'publish' },
		];
		const result = normalizeWhereClauses(clauses);
		expect(result).toHaveLength(1);
		expect(result[0].value).toBe('publish');
	});

	it('should remove fields with null value', () => {
		const clauses = [
			{ field: 'status', value: 'publish' },
			{ field: 'status', value: null },
		];
		const result = normalizeWhereClauses(clauses);
		expect(result).toHaveLength(0);
	});

	it('should handle $elemMatch clauses', () => {
		const clauses = [
			{ field: 'meta_data', value: { $elemMatch: { key: 'color', value: 'red' } } },
		];
		const result = normalizeWhereClauses(clauses);
		expect(result).toHaveLength(1);
	});

	it('should remove $elemMatch clauses with null value', () => {
		const clauses = [
			{ field: 'meta_data', value: { $elemMatch: { key: 'color', value: null } } },
		];
		const result = normalizeWhereClauses(clauses);
		expect(result).toHaveLength(0);
	});

	it('should remove $elemMatch clauses with null option', () => {
		const clauses = [
			{ field: 'attributes', value: { $elemMatch: { name: 'Size', option: null } } },
		];
		const result = normalizeWhereClauses(clauses);
		expect(result).toHaveLength(0);
	});

	it('should not add fields after they are marked for removal', () => {
		const clauses = [
			{ field: 'status', value: null },
			{ field: 'status', value: 'publish' },
		];
		const result = normalizeWhereClauses(clauses);
		expect(result).toHaveLength(0);
	});
});

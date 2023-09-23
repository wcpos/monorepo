import { buildSchema } from './schema.helpers'; // Adjust the import to point to your file

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

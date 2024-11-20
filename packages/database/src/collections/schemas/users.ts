export const usersLiteral = {
	title: 'User schema',
	version: 0,
	description: 'Global app user - different to WordPress user',
	type: 'object',
	primaryKey: 'uuid',
	properties: {
		uuid: {
			description: 'Unique identifier for the resource.',
			type: 'string',
			maxLength: 36,
		},
		first_name: {
			type: 'string',
		},
		last_name: {
			type: 'string',
		},
		display_name: {
			type: 'string',
		},
		locale: {
			type: 'string',
		},
		sites: {
			type: 'array',
			ref: 'sites',
			items: {
				type: 'string',
			},
		},
	},
} as const;

export const syncLiteral = {
	title: 'WooCommerce Sync schema',
	version: 0,
	description: 'WooCommerce Sync schema',
	type: 'object',
	primaryKey: {
		key: 'syncId',
		fields: ['endpoint', 'id'],
		separator: '|',
	},
	properties: {
		syncId: {
			type: 'string',
			maxLength: 100,
		},
		id: {
			type: 'integer',
			final: true,
		},
		endpoint: {
			type: 'string',
			final: true,
			maxLength: 100,
		},
		date_modified_gmt: {
			type: 'string',
			maxLength: 100,
		},
		conflicts: {
			type: 'object',
			additionalProperties: true,
		},
	},
	required: ['id', 'endpoint'],
	indexes: ['endpoint', 'date_modified_gmt'],
} as const;

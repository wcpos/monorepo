import { de } from '@faker-js/faker';

export const syncLiteral = {
	title: 'WooCommerce Sync schema',
	version: 0,
	description: 'WooCommerce Sync schema',
	type: 'object',
	primaryKey: {
		key: 'syncId',
		fields: ['endpoint', 'id', 'awaitingRemoteCreateUUID'],
		separator: '|',
	},
	properties: {
		syncId: {
			type: 'string',
			maxLength: 36,
		},
		awaitingRemoteCreateUUID: {
			type: 'string',
			maxLength: 36,
			default: '',
		},
		status: {
			type: 'string',
			maxLength: 100,
		},
		id: {
			type: 'integer',
			multipleOf: 1,
			minimum: 0,
			maximum: 2147483647, // 2^31-1 (max int in MySQL)
		},
		uuid: {
			type: 'string',
			maxLength: 36,
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
		context: {
			type: 'object',
			additionalProperties: true,
		},
	},
	required: ['endpoint'],
	indexes: ['id', 'status', 'endpoint', 'date_modified_gmt'],
} as const;

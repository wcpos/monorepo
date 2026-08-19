export const orderSchema = {
	title: 'Woo order document schema',
	version: 0,
	primaryKey: 'uuid',
	type: 'object',
	properties: {
		uuid: { type: 'string', maxLength: 128 },
		remoteId: { type: ['string', 'null'], maxLength: 64 },
		// Promoted filter/sort columns (duplicated out of payload, payload bytes unchanged) so RxDB
		// Mango .where()/sort can touch them. Indexed string fields require maxLength + required.
		number: { type: 'string', maxLength: 24 },
		dateCreatedGmt: { type: 'string', maxLength: 32 },
		status: { type: 'string', maxLength: 24 },
		total: { type: 'string', maxLength: 16 },
		customerId: { type: 'number' },
		payload: { type: 'object', additionalProperties: true },
		sync: { type: 'object', additionalProperties: true },
		local: { type: 'object', additionalProperties: true },
	},
	required: [
		'uuid',
		'remoteId',
		'number',
		'dateCreatedGmt',
		'status',
		'total',
		'customerId',
		'payload',
		'sync',
		'local',
	],
	// The axes a POS order list sorts/filters by, as single + compound indexes.
	indexes: ['dateCreatedGmt', ['status', 'dateCreatedGmt']],
} as const;

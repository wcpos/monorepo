export const productDefault = {
	title: 'order schema',
	version: 0,
	description: 'describes an order',
	keyCompression: false,
	primaryKey: 'uuid',
	type: 'object',
	properties: {
		uuid: {
			type: 'string',
			maxLength: 36,
		},
		number: {
			type: 'string',
		},
		line_items: {
			description: 'Line items data.',
			type: 'array',
			ref: 'line_items',
			items: {
				type: 'string',
			},
		},
	},
	indexes: [],
};

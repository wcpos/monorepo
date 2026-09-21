import { sessionOutboxProperties } from './register-sessions';

export const cashMovementsLiteral = {
	title: 'Cash movements',
	version: 0,
	type: 'object',
	primaryKey: 'id',
	properties: {
		id: { type: 'string', maxLength: 36 },
		session_id: { type: 'string', maxLength: 36 },
		type: { type: 'string', enum: ['paid_in', 'paid_out', 'no_sale', 'void'] },
		amount: { type: 'string' },
		reason: { type: 'string' },
		created_at_gmt: { type: 'string' },
		created_by: { type: ['number', 'null'] },
		voids: { type: ['string', 'null'] },
		voided_by: { type: ['string', 'null'] },
		...sessionOutboxProperties,
	},
	required: [
		'id',
		'session_id',
		'type',
		'amount',
		'reason',
		'created_at_gmt',
		'sync_status',
		'sync_attempts',
	],
	indexes: [['session_id'], ['sync_status']],
} as const;

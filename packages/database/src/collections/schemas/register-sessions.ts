/** Action outbox, not an engine record-mutation collection. IDs are server idempotency keys. */
export const sessionOutboxProperties = {
	sync_status: { type: 'string', enum: ['pending', 'synced', 'failed'], maxLength: 7 },
	sync_attempts: { type: 'number', default: 0 },
	sync_next_at: { type: ['number', 'null'], default: null },
	sync_error: { type: ['string', 'null'], default: null },
} as const;
export const registerSessionsLiteral = {
	title: 'Register sessions',
	version: 1,
	type: 'object',
	primaryKey: 'id',
	properties: {
		id: { type: 'string', maxLength: 36 },
		register_id: { type: 'string', maxLength: 36 },
		store_id: { type: ['number', 'null'] },
		status: { type: 'string', enum: ['open', 'counting', 'closed'], maxLength: 8 },
		business_day: { type: 'string', maxLength: 10 },
		opened_at_gmt: { type: 'string' },
		opened_by: { type: ['number', 'null'] },
		expected_float: { type: ['string', 'null'] },
		counted_float: { type: 'string' },
		opening_variance: { type: ['string', 'null'] },
		counting_started_at_gmt: { type: ['string', 'null'] },
		closed_at_gmt: { type: ['string', 'null'] },
		closed_by: { type: ['number', 'null'] },
		approval_required: { type: 'boolean', default: false },
		approved_by: { type: ['number', 'null'] },
		approved_counted: { type: ['object', 'null'], additionalProperties: { type: 'string' } },
		counted: { type: ['object', 'null'], additionalProperties: { type: 'string' } },
		closure_id: { type: ['string', 'null'] },
		pending_status: { type: ['string', 'null'], default: null },
		// Distinguish an unacknowledged create from a pending transition, including after restart.
		server_status: { type: ['string', 'null'], default: null },
		status_at: { type: ['string', 'null'], default: null },
		approver_token: { type: ['string', 'null'], default: null },
		server_expected: {
			type: ['object', 'null'],
			additionalProperties: { type: 'string' },
			default: null,
		},
		server_movement_ids: { type: 'array', items: { type: 'string' }, default: [] },
		// Null means an older server omitted membership; an empty array is an empty snapshot.
		server_order_ids: { type: ['array', 'null'], items: { type: 'number' }, default: null },
		server_ledger_row_ids: { type: ['array', 'null'], items: { type: 'string' }, default: null },
		server_refund_ids: { type: ['array', 'null'], items: { type: 'number' }, default: null },
		server_ledger_rows: {
			type: ['array', 'null'],
			default: null,
			items: {
				type: 'object',
				properties: {
					id: { type: 'string' },
					updated_at_gmt: { type: 'string' },
					status: { type: 'string' },
					version: { type: 'string' },
				},
			},
		},
		server_refunds: {
			type: ['array', 'null'],
			default: null,
			items: {
				type: 'object',
				properties: {
					id: { type: 'number' },
					updated_at_gmt: { type: 'string' },
				},
			},
		},
		server_expected_at: { type: ['string', 'null'], default: null },
		server_sales_count: { type: ['number', 'null'], default: null },
		/**
		 * The drawer terms of the same snapshot as `server_expected`, as the detail route serves
		 * them (four-decimal strings). Null when the server omits them: a blind cashier, or an
		 * older plugin, and the till strip then derives the terms from this device's rows.
		 */
		server_terms: {
			type: ['object', 'null'],
			default: null,
			properties: {
				float: { type: 'string' },
				cash_sales: {
					type: 'object',
					properties: { amount: { type: 'string' }, count: { type: 'number' } },
					required: ['amount', 'count'],
				},
				paid_in: {
					type: 'array',
					items: {
						type: 'object',
						properties: { amount: { type: 'string' }, reason: { type: ['string', 'null'] } },
						required: ['amount'],
					},
				},
				paid_out: {
					type: 'object',
					properties: {
						amount: { type: 'string' },
						count: { type: 'number' },
						note: { type: ['string', 'null'] },
					},
					required: ['amount', 'count'],
				},
				cash_refunds: {
					type: 'object',
					properties: { amount: { type: 'string' }, count: { type: 'number' } },
					required: ['amount', 'count'],
				},
				no_sales: { type: 'number' },
				voids: { type: 'number' },
			},
			required: ['float', 'cash_sales', 'paid_in', 'paid_out', 'cash_refunds', 'no_sales', 'voids'],
		},
		...sessionOutboxProperties,
	},
	required: [
		'id',
		'register_id',
		'status',
		'opened_at_gmt',
		'counted_float',
		'sync_status',
		'sync_attempts',
	],
	indexes: [['register_id', 'status'], ['sync_status']],
} as const;

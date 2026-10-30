/** Action outbox, not an engine record-mutation collection. IDs are server idempotency keys. */
export const sessionOutboxProperties = {
	sync_status: { type: 'string', enum: ['pending', 'synced', 'failed'], maxLength: 7 },
	sync_attempts: { type: 'number', default: 0 },
	sync_next_at: { type: ['number', 'null'], default: null },
	sync_error: { type: ['string', 'null'], default: null },
} as const;
export const registerSessionsLiteral = {
	title: 'Register sessions',
	version: 5,
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
		counted_float: { type: ['string', 'null'] },
		opening_variance: { type: ['string', 'null'] },
		counting_started_at_gmt: { type: ['string', 'null'] },
		counting_by: { type: ['number', 'null'] },
		float_source: { type: ['string', 'null'] },
		carried_from_closure_id: { type: ['string', 'null'], maxLength: 36 },
		closed_at_gmt: { type: ['string', 'null'] },
		closed_by: { type: ['number', 'null'] },
		approval_required: { type: 'boolean', default: false },
		approved_by: { type: ['number', 'null'] },
		approved_counted: { type: ['object', 'null'], additionalProperties: { type: 'string' } },
		count_note: { type: ['string', 'null'], default: null },
		count_denominations: {
			type: ['array', 'null'],
			default: null,
			items: {
				type: 'object',
				properties: { value: { type: 'string' }, pieces: { type: 'number' } },
				required: ['value', 'pieces'],
			},
		},
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
		 * Nothing is required: a partial block must never fail the whole session's adoption
		 * (and with it `server_expected`); a missing term reads as zero.
		 */
		server_terms: {
			type: ['object', 'null'],
			default: null,
			properties: {
				float: { type: 'string' },
				cash_sales: {
					type: 'object',
					properties: { amount: { type: 'string' }, count: { type: 'number' } },
				},
				paid_in: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							// The cash movement id; older plugins omit it.
							id: { type: 'string' },
							amount: { type: 'string' },
							reason: { type: ['string', 'null'] },
						},
					},
				},
				paid_out: {
					type: 'object',
					properties: {
						amount: { type: 'string' },
						count: { type: 'number' },
						note: { type: ['string', 'null'] },
					},
				},
				cash_refunds: {
					type: 'object',
					properties: { amount: { type: 'string' }, count: { type: 'number' } },
				},
				no_sales: { type: 'number' },
				voids: { type: 'number' },
			},
		},
		...sessionOutboxProperties,
	},
	required: ['id', 'register_id', 'status', 'opened_at_gmt', 'sync_status', 'sync_attempts'],
	indexes: [['register_id', 'status'], ['sync_status']],
} as const;

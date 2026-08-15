/**
 * Receipt email queue (#165).
 *
 * A receipt email is an ACTION, not a record mutation: there is no local
 * document whose state the server converges on, so it has no business in the
 * engine's record-mutation queue (whose contract is document sync). It gets its
 * own small, local-only collection in the STORE scope instead.
 *
 * Local-only and per-device on purpose. The row lives where the cashier tapped
 * Send, so two registers can never both drain the same queued email — there is
 * nothing to deduplicate across devices.
 */
export const receiptEmailQueueLiteral = {
	title: 'Receipt Email Queue schema',
	version: 0,
	description: 'Per-device durable queue of receipt emails waiting to reach the server',
	type: 'object',
	primaryKey: 'localID',
	properties: {
		localID: {
			type: 'string',
			maxLength: 36,
		},
		orderId: {
			description: 'WooCommerce order id the receipt belongs to.',
			type: 'integer',
			minimum: 0,
			maximum: 100000000000000,
			multipleOf: 1,
		},
		orderNumber: {
			description: 'Order number as the cashier saw it, so the queue can name the row.',
			type: 'string',
			maxLength: 64,
		},
		email: {
			type: 'string',
			maxLength: 320,
		},
		saveTo: {
			description: "The endpoint's save_to argument: 'billing' or an empty string.",
			type: 'string',
			maxLength: 16,
		},
		status: {
			type: 'string',
			enum: ['pending', 'sent', 'failed'],
			maxLength: 8,
			default: 'pending',
		},
		queuedAt: {
			description: 'ISO timestamp of the cashier tap that created the row.',
			type: 'string',
			maxLength: 30,
		},
		attempts: {
			description: 'Send attempts made so far; drives the backoff and the bounded retry.',
			type: 'integer',
			minimum: 0,
			maximum: 1000,
			multipleOf: 1,
			default: 0,
		},
		nextAttemptAt: {
			description: 'ISO timestamp before which the drain must leave this row alone.',
			type: 'string',
			maxLength: 30,
		},
		lastAttemptAt: {
			type: 'string',
			maxLength: 30,
		},
		sentAt: {
			type: 'string',
			maxLength: 30,
		},
		lastError: {
			description: 'The reason the last attempt failed, kept verbatim for the merchant.',
			type: 'string',
			maxLength: 500,
		},
		lastErrorCode: {
			type: 'string',
			maxLength: 64,
		},
	},
	required: ['localID', 'orderId', 'email', 'status', 'queuedAt', 'attempts'],
	indexes: ['status'],
} as const;

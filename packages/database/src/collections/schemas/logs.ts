export const logsLiteral = {
	title: 'Log schema',
	version: 2,
	description: 'Logs events for debugging and user record',
	type: 'object',
	primaryKey: 'logId',
	properties: {
		logId: {
			description: 'Unique identifier for the resource.',
			type: 'string',
			maxLength: 36,
		},
		timestamp: {
			type: 'integer',
			description: 'The time the log entry was created.',
			minimum: 0,
			maximum: 100000000000000,
			multipleOf: 1,
		},
		code: {
			type: 'string',
			description: 'A reference code for the log entry.',
			maxLength: 24,
		},
		seq: {
			type: 'integer',
			minimum: 0,
		},
		outcome: {
			type: 'string',
			enum: ['ok', 'failed', 'rejected', 'cancelled', 'unknown'],
		},
		level: {
			type: 'string',
			description: 'The severity level of the log entry.',
			default: 'info',
			maxLength: 16,
		},
		message: {
			type: 'string',
			description: 'A human-readable message describing the log entry.',
		},
		context: {
			type: 'object',
			additionalProperties: true,
		},
		category: {
			type: 'string',
			maxLength: 64,
		},
		operationId: {
			type: 'string',
			maxLength: 32,
		},
		operationType: {
			type: 'string',
			maxLength: 48,
		},
		requestId: {
			type: 'string',
			maxLength: 40,
		},
		serverRequestId: {
			type: 'string',
			maxLength: 40,
		},
		attempt: {
			type: 'integer',
			minimum: 0,
		},
		durationMs: {
			type: 'number',
			minimum: 0,
		},
		startedAt: {
			type: 'integer',
			minimum: 0,
		},
		count: {
			type: 'integer',
			minimum: 1,
			default: 1,
		},
		firstSeen: {
			type: 'integer',
			minimum: 0,
		},
		lastSeen: {
			type: 'integer',
			minimum: 0,
		},
		actor: {
			type: 'object',
			properties: {
				id: { type: 'string' },
				role: { type: 'string' },
				name: { type: 'string' },
			},
			additionalProperties: false,
		},
		sizeBytes: {
			type: 'integer',
			minimum: 0,
		},
		site: {
			type: ['string', 'null'],
		},
		store: {
			type: ['string', 'null'],
		},
		actorRef: {
			type: ['string', 'null'],
		},
	},
	indexes: [['timestamp'], ['level', 'timestamp'], ['category', 'timestamp']],
} as const;

export const logsLiteral = {
	title: 'Log schema',
	version: 1,
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
	},
	indexes: [['timestamp'], ['level', 'timestamp']],
} as const;

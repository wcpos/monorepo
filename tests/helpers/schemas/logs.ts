export const logsLiteral = {
	title: 'Log schema',
	version: 0,
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
		},
		code: {
			type: 'string',
			description: 'A reference code for the log entry.',
		},
		level: {
			type: 'string',
			description: 'The severity level of the log entry.',
			default: 'info',
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
} as const;

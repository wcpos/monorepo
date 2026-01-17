export const notificationsLiteral = {
	title: 'Notification schema',
	version: 0,
	description: 'In-app notifications from Novu',
	type: 'object',
	primaryKey: 'id',
	properties: {
		id: {
			description: 'Novu notification ID',
			type: 'string',
			maxLength: 36,
		},
		subscriberId: {
			description: 'Subscriber ID in format: {site.domain}:{store.id}:{wpCredentials.uuid}',
			type: 'string',
			maxLength: 320, // domain (253) + store.id (20) + uuid (36) + separators
		},
		title: {
			description: 'Notification title',
			type: 'string',
		},
		body: {
			description: 'Notification body/message',
			type: 'string',
		},
		payload: {
			description: 'Additional notification data',
			type: 'object',
			additionalProperties: true,
		},
		channel: {
			description: 'Notification channel (in_app, push, etc.)',
			type: 'string',
			default: 'in_app',
		},
		status: {
			description: 'Notification read status',
			type: 'string',
			maxLength: 16, // 'archived' is longest at 8 chars
			enum: ['unread', 'read', 'archived'],
			default: 'unread',
		},
		seen: {
			description: 'Whether the notification has been seen',
			type: 'boolean',
			default: false,
		},
		createdAt: {
			description: 'Timestamp when the notification was created',
			type: 'integer',
			multipleOf: 1,
		},
	},
	indexes: ['subscriberId', 'status', 'createdAt'],
} as const;

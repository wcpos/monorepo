export const templatesLiteral = {
	title: 'WCPOS Template schema',
	version: 0,
	description: 'POS receipt/report templates',
	type: 'object',
	primaryKey: 'uuid',
	indexes: ['type', 'menu_order'],
	properties: {
		uuid: {
			description: 'Unique identifier for the resource.',
			type: 'string',
			maxLength: 36,
		},
		id: {
			description: 'Template ID. Integer for database templates, string for virtual.',
			type: ['string', 'integer'],
		},
		title: {
			type: 'string',
		},
		description: {
			type: 'string',
		},
		type: {
			description: 'Template type: receipt or report.',
			type: 'string',
			maxLength: 20,
		},
		engine: {
			description: 'Rendering engine: logicless, thermal, or legacy-php.',
			type: 'string',
		},
		output_type: {
			description: 'Output format: html for browser rendering, escpos for thermal byte encoding.',
			type: 'string',
		},
		paper_width: {
			description: 'Physical paper width: 58mm, 80mm, or null for HTML/A4.',
			type: ['string', 'null'],
		},
		content: {
			description:
				'Template content. HTML for logicless, XML for thermal. Present in view context for offline-capable templates.',
			type: 'string',
		},
		menu_order: {
			type: 'integer',
			minimum: 0,
			maximum: 2147483647,
			multipleOf: 1,
		},
		offline_capable: {
			description:
				'True for logicless (Mustache) and thermal (XML) templates that can render without server.',
			type: 'boolean',
		},
		is_active: {
			description: 'Whether this is the currently active/default template.',
			type: 'boolean',
		},
		is_virtual: {
			description: 'True for filesystem-based templates (theme, pro, core).',
			type: 'boolean',
		},
		source: {
			description: 'Template source: custom, theme, or plugin.',
			type: 'string',
		},
		status: {
			description: 'Post status for database templates: publish or draft.',
			type: 'string',
		},
		date_modified_gmt: {
			type: 'string',
		},
	},
	required: ['uuid', 'id', 'title', 'type'],
} as const;

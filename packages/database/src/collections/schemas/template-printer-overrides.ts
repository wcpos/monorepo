export const templatePrinterOverridesLiteral = {
	title: 'Template Printer Overrides schema',
	version: 1,
	description: 'Per-device mapping of template IDs to printer target IDs',
	type: 'object',
	primaryKey: 'template_id',
	properties: {
		template_id: {
			type: 'string',
			maxLength: 100,
			description: 'Template ID (stringified)',
		},
		printer_profile_id: {
			type: 'string',
			maxLength: 128,
			description:
				'Printer target id: local printer profile uuid, system, or cloud:<cloudPrinterId>',
		},
	},
	required: ['template_id', 'printer_profile_id'],
} as const;

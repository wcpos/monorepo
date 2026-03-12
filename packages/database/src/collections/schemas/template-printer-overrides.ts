export const templatePrinterOverridesLiteral = {
	title: 'Template Printer Overrides schema',
	version: 0,
	description: 'Per-device mapping of template IDs to printer profile IDs',
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
			maxLength: 36,
			description: 'References printer_profiles.id',
		},
	},
	required: ['template_id', 'printer_profile_id'],
} as const;

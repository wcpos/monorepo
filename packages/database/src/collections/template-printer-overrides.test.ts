interface TemplatePrinterOverridesSchemaShape {
	version: number;
	description?: string;
	properties: {
		printer_profile_id: {
			maxLength: number;
			description?: string;
		};
	};
}

describe('template_printer_overrides schema (printer target ids)', () => {
	it('widens printer_profile_id to store generic printer target ids including cloud printers', async () => {
		const { storeCollections } = await import('./index');
		const schema = storeCollections.template_printer_overrides
			.schema as unknown as TemplatePrinterOverridesSchemaShape;

		expect(schema.version).toBe(0);
		expect(schema.properties.printer_profile_id.maxLength).toBe(128);
		expect(schema.properties.printer_profile_id.description).toContain('cloud:<cloudPrinterId>');
		expect(schema.properties.printer_profile_id.description).not.toContain(
			'References printer_profiles.id'
		);
	});
});

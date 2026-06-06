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

describe('template_printer_overrides schema v1 (printer target ids)', () => {
	it('widens printer_profile_id to store generic printer target ids including cloud printers', async () => {
		const { storeCollections } = await import('./index');
		const schema = storeCollections.template_printer_overrides
			.schema as unknown as TemplatePrinterOverridesSchemaShape;

		expect(schema.version).toBe(1);
		expect(schema.properties.printer_profile_id.maxLength).toBe(128);
		expect(schema.properties.printer_profile_id.description).toContain('cloud:<cloudPrinterId>');
		expect(schema.properties.printer_profile_id.description).not.toContain(
			'References printer_profiles.id'
		);
	});

	it('provides a non-destructive v1 migration preserving existing override targets', async () => {
		const { storeCollections } = await import('./index');
		const migrateToV1 = storeCollections.template_printer_overrides.migrationStrategies?.[1];
		const legacyOverride = {
			template_id: 'receipt-template',
			printer_profile_id: '71d74953-eb1a-42ee-9960-46b624b9fa7b',
		};

		expect(typeof migrateToV1).toBe('function');
		expect(migrateToV1?.(legacyOverride)).toEqual(legacyOverride);
	});
});

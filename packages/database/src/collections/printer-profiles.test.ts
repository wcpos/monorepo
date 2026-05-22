/** Narrow shape for the parts of the schema this test inspects (avoids `any`). */
interface PrinterProfileSchemaShape {
	version: number;
	properties: {
		connectionType: { enum: readonly string[] };
		cloudPrinterId?: { type: string };
	};
}

describe('printer_profiles schema v6 (cloud connection type)', () => {
	it('declares schema version 6 with a cloud connection type and cloudPrinterId', async () => {
		const { storeCollections } = await import('./index');
		const schema = storeCollections.printer_profiles.schema as unknown as PrinterProfileSchemaShape;

		expect(schema.version).toBe(6);
		expect(schema.properties.connectionType.enum).toContain('cloud');
		expect(schema.properties.cloudPrinterId).toBeDefined();
	});

	it('provides a v6 migration that preserves existing profile data', async () => {
		const { storeCollections } = await import('./index');
		const migrateToV6 = storeCollections.printer_profiles.migrationStrategies?.[6];

		expect(typeof migrateToV6).toBe('function');

		const migrated = migrateToV6?.({
			id: 'p1',
			name: 'Front Counter',
			connectionType: 'network',
			vendor: 'epson',
			address: '192.168.1.50',
			port: 9100,
			language: 'esc-pos',
			columns: 42,
			emitEscPrintMode: true,
			fullReceiptRaster: false,
			autoCut: true,
			autoOpenDrawer: false,
			isDefault: true,
			isBuiltIn: false,
		});

		expect(migrated).toMatchObject({ id: 'p1', connectionType: 'network', isDefault: true });
	});
});

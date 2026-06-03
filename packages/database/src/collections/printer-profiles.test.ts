/** Narrow shape for the parts of the schema this test inspects (avoids `any`). */
interface PrinterProfileSchemaShape {
	version: number;
	properties: {
		connectionType: { enum: readonly string[] };
		cloudPrinterId?: { type: string; minLength?: number };
		cloudProvider?: { type: string; enum?: readonly string[] };
	};
}

const migrationCollection = undefined as never;

describe('printer_profiles schema v7 (cloud connection type + provider)', () => {
	it('declares schema version 7 with a cloud connection type, cloudPrinterId and cloudProvider', async () => {
		const { storeCollections } = await import('./index');
		const schema = storeCollections.printer_profiles.schema as unknown as PrinterProfileSchemaShape;

		expect(schema.version).toBe(7);
		expect(schema.properties.connectionType.enum).toContain('cloud');
		expect(schema.properties.cloudPrinterId).toBeDefined();
		expect(schema.properties.cloudPrinterId?.minLength).toBe(1);
		expect(schema.properties.cloudProvider).toBeDefined();
		expect(schema.properties.cloudProvider?.enum).toEqual([
			'star-cloudprnt',
			'epson-sdp',
			'printnode',
		]);
	});

	it('provides a v6 migration that preserves existing profile data', async () => {
		const { storeCollections } = await import('./index');
		const migrateToV6 = storeCollections.printer_profiles.migrationStrategies?.[6];

		expect(typeof migrateToV6).toBe('function');

		const migrated = migrateToV6?.(
			{
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
			},
			migrationCollection
		);

		expect(migrated).toMatchObject({ id: 'p1', connectionType: 'network', isDefault: true });
	});

	it('provides a v7 migration that preserves existing profile data', async () => {
		const { storeCollections } = await import('./index');
		const migrateToV7 = storeCollections.printer_profiles.migrationStrategies?.[7];

		expect(typeof migrateToV7).toBe('function');

		const migrated = migrateToV7?.(
			{
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
			},
			migrationCollection
		);

		expect(migrated).toMatchObject({ id: 'p1', connectionType: 'network', isDefault: true });
	});
});

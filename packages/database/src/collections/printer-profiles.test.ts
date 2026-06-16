/** Narrow shape for the parts of the schema this test inspects (avoids `any`). */
interface PrinterProfileSchemaShape {
	version: number;
	properties: {
		connectionType: { enum: readonly string[] };
		cloudPrinterId?: { type: string; minLength?: number };
		cloudProvider?: { type: string; enum?: readonly string[] };
		drawerConnector?: { type: string; enum?: readonly string[]; default?: string };
	};
}

describe('printer_profiles schema cloud connection type + provider', () => {
	it('declares cloud connection type, cloudPrinterId and cloudProvider', async () => {
		const { storeCollections } = await import('./index');
		const schema = storeCollections.printer_profiles.schema as unknown as PrinterProfileSchemaShape;

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

	it('provides a v7 migration that preserves existing profile data', async () => {
		const { storeCollections } = await import('./index');
		const migrateToV7 = storeCollections.printer_profiles.migrationStrategies?.[7];

		expect(typeof migrateToV7).toBe('function');

		const migrated = migrateToV7?.({
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

describe('printer_profiles schema v8 (drawer connector)', () => {
	it('declares schema version 8 with drawerConnector enum and default pin2', async () => {
		const { storeCollections } = await import('./index');
		const schema = storeCollections.printer_profiles.schema as unknown as PrinterProfileSchemaShape;

		expect(schema.version).toBe(8);
		expect(schema.properties.drawerConnector).toBeDefined();
		expect(schema.properties.drawerConnector?.enum).toEqual(['pin2', 'pin5']);
		expect(schema.properties.drawerConnector?.default).toBe('pin2');
	});

	it('provides a v8 migration that defaults unknown drawer connectors to pin2', async () => {
		const { storeCollections } = await import('./index');
		const migrateToV8 = storeCollections.printer_profiles.migrationStrategies?.[8];

		expect(typeof migrateToV8).toBe('function');

		const migrated = migrateToV8?.({
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

		expect(migrated).toMatchObject({ drawerConnector: 'pin2' });
	});
});

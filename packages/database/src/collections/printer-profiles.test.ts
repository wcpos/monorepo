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
});

describe('printer_profiles schema (drawer connector)', () => {
	it('declares schema version 0 with drawerConnector enum and default pin2', async () => {
		const { storeCollections } = await import('./index');
		const schema = storeCollections.printer_profiles.schema as unknown as PrinterProfileSchemaShape;

		expect(schema.version).toBe(0);
		expect(schema.properties.drawerConnector).toBeDefined();
		expect(schema.properties.drawerConnector?.enum).toEqual(['pin2', 'pin5']);
		expect(schema.properties.drawerConnector?.default).toBe('pin2');
	});
});

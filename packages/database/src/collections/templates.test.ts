describe('templates migration strategy', () => {
	// Migration 2 (Closures room, #2131): closure templates became store-scoped, keyed
	// `<storeId>:<uuid>`. An unscoped closure row would never match a scoped query and
	// never be removed by the scoped sync, so the migration drops it; the next sync rewrites it.
	// Revert: keep unscoped closure rows, or drop rows of other types.
	it('migration 2 drops unscoped closure templates and keeps the rest', async () => {
		const { storeCollections } = await import('./index');
		const migrate = storeCollections.templates.migrationStrategies?.[2];
		if (!migrate) throw new Error('templates migration 2 missing');
		expect(migrate({ uuid: 'a', type: 'closure' }, undefined as never)).toBeNull();
		const receipt = { uuid: 'b', type: 'receipt' };
		expect(migrate(receipt, undefined as never)).toEqual(receipt);
	});
});

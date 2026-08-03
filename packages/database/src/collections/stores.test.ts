describe('stores migration strategy', () => {
	// #908 preset re-tune: only tills still on the RETIRED Balanced default —
	// the 10 s / 50-records tuple written by migration 10 — move to 60 s.
	// Any other combination is a deliberate merchant choice and must survive.
	const migrateToV13 = async () => {
		const { userCollections } = await import('./index');
		const migrate = userCollections.stores.migrationStrategies?.[13];
		if (!migrate) throw new Error('stores migration 13 missing');
		return migrate;
	};

	it('moves the retired Balanced default tuple (10 s / 50) to 60 s', async () => {
		const migrate = await migrateToV13();
		const migrated = migrate({ sync_check_interval_ms: 10_000, sync_pull_batch_size: 50 });
		expect(migrated.sync_check_interval_ms).toBe(60_000);
		expect(migrated.sync_pull_batch_size).toBe(50);
	});

	it('preserves a 10 s interval when the batch size was customized', async () => {
		const migrate = await migrateToV13();
		const migrated = migrate({ sync_check_interval_ms: 10_000, sync_pull_batch_size: 25 });
		expect(migrated.sync_check_interval_ms).toBe(10_000);
		expect(migrated.sync_pull_batch_size).toBe(25);
	});

	it('preserves any non-default interval', async () => {
		const migrate = await migrateToV13();
		const realtime = migrate({ sync_check_interval_ms: 5_000, sync_pull_batch_size: 100 });
		expect(realtime.sync_check_interval_ms).toBe(5_000);
		const eco = migrate({ sync_check_interval_ms: 60_000, sync_pull_batch_size: 25 });
		expect(eco.sync_check_interval_ms).toBe(60_000);
	});
});

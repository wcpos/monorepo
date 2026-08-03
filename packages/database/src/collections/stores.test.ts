describe('stores migration strategy', () => {
	// The 1.9 → 1.10 upgrade path: migration 10 (#559 knob contract, amended
	// pre-release by the #908 re-tune) writes the shipped Balanced defaults.
	it('migration 10 writes the shipped Balanced defaults (60 s / 50)', async () => {
		const { userCollections } = await import('./index');
		const migrate = userCollections.stores.migrationStrategies?.[10];
		if (!migrate) throw new Error('stores migration 10 missing');
		const migrated = migrate({});
		expect(migrated.sync_check_interval_ms).toBe(60_000);
		expect(migrated.sync_pull_batch_size).toBe(50);
	});
});

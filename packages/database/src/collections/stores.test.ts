describe('stores migration strategy', () => {
	// The 1.9 → 1.10 upgrade path: migration 10 (#559 knob contract, amended
	// pre-release by the #908 re-tune) writes the shipped Balanced defaults.
	it('migration 10 writes the shipped Balanced defaults (60 s / 50)', async () => {
		const { userCollections } = await import('./index');
		const migrate = userCollections.stores.migrationStrategies?.[10];
		if (!migrate) throw new Error('stores migration 10 missing');
		const migrated = migrate({}, undefined as never);
		expect(migrated.sync_check_interval_ms).toBe(60_000);
		expect(migrated.sync_pull_batch_size).toBe(50);
	});

	// Migration 12 (#717 sound toggle, amended pre-release with the theme /
	// volume / per-event fields — schema v12 never shipped).
	it('migration 12 writes the scan-sound defaults', async () => {
		const { userCollections } = await import('./index');
		const migrate = userCollections.stores.migrationStrategies?.[12];
		if (!migrate) throw new Error('stores migration 12 missing');
		const migrated = migrate({}, undefined as never);
		expect(migrated.barcode_scanning_sound_enabled).toBe(false);
		expect(migrated.barcode_scanning_sound_theme).toBe('classic');
		expect(migrated.barcode_scanning_sound_volume).toBe(0.15);
		expect(migrated.barcode_scanning_sound_success_enabled).toBe(true);
		expect(migrated.barcode_scanning_sound_failure_enabled).toBe(true);
		expect(migrated.barcode_scanning_sound_haptic_enabled).toBe(true);
	});

	it('migration 13 initializes receipt labels', async () => {
		const { userCollections } = await import('./index');
		const migrate = userCollections.stores.migrationStrategies?.[13];
		if (!migrate) throw new Error('stores migration 13 missing');
		const migrated = migrate({}, undefined as never);
		expect(migrated.receipt_i18n).toEqual({});
	});
});

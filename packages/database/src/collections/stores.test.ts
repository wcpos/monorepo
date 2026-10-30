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

	// v18 adds the per-store `scale` override (roadmap#357). It is a pass-through:
	// an absent value means Auto, which is what the schema defaults to and what
	// resolveStep falls back to, so no document is rewritten to gain it.
	it('migration 18 passes a version-17 document through with no scale, which reads as auto', async () => {
		const { userCollections } = await import('./index');
		const { storesLiteral } = await import('./schemas/stores');
		const migrate = userCollections.stores.migrationStrategies?.[18];
		if (!migrate) throw new Error('stores migration 18 missing');
		const oldStore = { localID: 'store-1', theme: 'dark' };

		const migrated = migrate(oldStore as never, undefined as never);

		expect(migrated).toBe(oldStore);
		expect((migrated as { scale?: string }).scale).toBeUndefined();
		expect(storesLiteral.properties.scale.default).toBe('auto');
		expect(storesLiteral.version).toBeGreaterThanOrEqual(18);
	});

	// Two v18 schemas were published to `@next` (#2796's eight icon families, then
	// #3099's three). RxDB pins the schema hash per version, so every dev-next
	// database that had opened the first refused the second with DB6. v19 migrates
	// either v18: a family #3099 dropped becomes the default set, a kept one stays.
	it.each(['fontawesome', 'tabler-2', 'lucide', 'iconoir', 'solar'])(
		'migration 19 reads the dropped family %s as the default set',
		async (dropped) => {
			const { userCollections } = await import('./index');
			const { storesLiteral } = await import('./schemas/stores');
			const migrate = userCollections.stores.migrationStrategies?.[19];
			if (!migrate) throw new Error('stores migration 19 missing');

			const migrated = migrate({ localID: 'store-1', icons: dropped } as never, undefined as never);

			// The literal family v19 wrote, not the schema default: v20 moved that to `auto`.
			expect((migrated as { icons?: string }).icons).toBe('tabler');
			expect(storesLiteral.version).toBeGreaterThanOrEqual(19);
		}
	);

	it.each(['tabler', 'hugeicons', 'phosphor'])('migration 19 keeps the family %s', async (kept) => {
		const { userCollections } = await import('./index');
		const migrate = userCollections.stores.migrationStrategies?.[19];
		if (!migrate) throw new Error('stores migration 19 missing');

		const migrated = migrate({ localID: 'store-1', icons: kept } as never, undefined as never);

		expect((migrated as { icons?: string }).icons).toBe(kept);
	});

	it('migration 19 writes the default set on a store that never chose a family', async () => {
		const { userCollections } = await import('./index');
		const migrate = userCollections.stores.migrationStrategies?.[19];
		if (!migrate) throw new Error('stores migration 19 missing');
		const oldStore = { localID: 'store-1', theme: 'dark' };

		const migrated = migrate(oldStore as never, undefined as never);

		expect(migrated).toBe(oldStore);
		expect((migrated as { icons?: string }).icons).toBe('tabler');
	});

	// v20: `auto` joins the enum and becomes the default (the family follows the theme,
	// decision 45). Nothing stored becomes invalid, so the migration is a pass-through;
	// the bump exists because the schema hash moved, which is what took dev-next down
	// at v18 (#3099 → #3109).
	it.each(['auto', 'tabler', 'hugeicons', 'phosphor'])(
		'migration 20 passes the family %s through unchanged',
		async (family) => {
			const { userCollections } = await import('./index');
			const migrate = userCollections.stores.migrationStrategies?.[20];
			if (!migrate) throw new Error('stores migration 20 missing');
			const oldStore = { localID: 'store-1', icons: family };

			const migrated = migrate(oldStore as never, undefined as never);

			expect(migrated).toBe(oldStore);
			expect((migrated as { icons?: string }).icons).toBe(family);
		}
	);

	it('v20 reads an unset family as auto and is the current version', async () => {
		const { userCollections } = await import('./index');
		const { storesLiteral } = await import('./schemas/stores');
		const migrate = userCollections.stores.migrationStrategies?.[20];
		if (!migrate) throw new Error('stores migration 20 missing');

		const migrated = migrate({ localID: 'store-1', theme: 'dark' } as never, undefined as never);

		expect((migrated as { icons?: string }).icons).toBeUndefined();
		expect(storesLiteral.properties.icons.enum).toEqual([
			'auto',
			'tabler',
			'hugeicons',
			'phosphor',
		]);
		expect(storesLiteral.properties.icons.default).toBe('auto');
		expect(storesLiteral.version).toBe(20);
		expect(userCollections.stores.migrationStrategies?.[21]).toBeUndefined();
	});

	// The scale step is a device preference beside the theme: a login or a cashier
	// sync must never overwrite the step a merchant set on this screen.
	it('does not treat scale as a server-owned field', async () => {
		const { SERVER_OWNED_STORE_FIELDS } = await import('./schemas/stores');

		expect(SERVER_OWNED_STORE_FIELDS as readonly string[]).not.toContain('scale');
		expect(SERVER_OWNED_STORE_FIELDS as readonly string[]).not.toContain('icons');
		expect(SERVER_OWNED_STORE_FIELDS as readonly string[]).not.toContain('theme');
	});

	it('migration 16 preserves existing store data', async () => {
		const { userCollections } = await import('./index');
		const migrate = userCollections.stores.migrationStrategies?.[16];
		if (!migrate) throw new Error('stores migration 16 missing');
		const oldStore = { localID: 'store-1', name: 'Main Street' };

		expect(migrate(oldStore, undefined as never)).toBe(oldStore);
	});
});

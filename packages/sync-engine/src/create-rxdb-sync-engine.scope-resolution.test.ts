import { describe, expect, it } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createRxdbSyncEngine, type RxdbSyncEnginePorts } from './create-rxdb-sync-engine';
import { memoryEngineStorage } from './testing';

setPremiumFlag();

const SITE = 'https://lab.example.test';
const SYNC_BASE = `${SITE}/wp-json/wcpos/v2`;
let uniqueCashier = 0;

function engineWith(overrides: Partial<RxdbSyncEnginePorts> = {}) {
	uniqueCashier += 1;
	return createRxdbSyncEngine(
		{
			site: { syncBaseUrl: SYNC_BASE, wpJsonRoot: `${SITE}/wp-json` },
			storage: memoryEngineStorage(),
			mode: 'manual',
			fetcher: async () =>
				new Response(JSON.stringify([]), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				}),
			...overrides,
		},
		{ site: SITE, storeId: 1, cashierId: `scope-resolution-${uniqueCashier}` }
	);
}

/**
 * #1559. There used to be two ways to answer "which scope database do I read
 * from?", and four call sites composed them by hand as `engine.active() ??
 * (await engine.ready)`. `ready` is boot-pinned — assigned once from the initial
 * `switchScope` and never replaced — so that fallback is right in one situation
 * and wrong in another, with nothing at the call site to tell them apart:
 *
 *   - before the first switch completes, `active()` is null and the boot scope
 *     IS the answer;
 *   - after the active scope is torn down, `active()` is null again and the boot
 *     scope is a store the cashier may have left long ago, whose database has
 *     just been closed.
 *
 * `whenActive()` is the single seam that answers only the first. These tests
 * fail against the old composition: swap the implementation back to
 * `active() ?? (await readyScope)` and "rejects once no scope is active" goes
 * red with the boot scope in hand.
 */
describe('resolving the scope to read from', () => {
	it('waits out the boot barrier and answers with the scope being opened', async () => {
		const engine = engineWith();
		try {
			// Called BEFORE the initial open settles: `active()` is still null here,
			// and the fallback to the boot scope is the correct reading.
			expect(engine.active()).toBeNull();

			const scope = await engine.whenActive();

			expect(scope.database).toBe(engine.active()!.database);
			expect(scope.scopeId).toBe(engine.active()!.scopeId);
		} finally {
			await engine.dispose();
		}
	});

	it('answers with the CURRENT scope after a store switch, never the boot scope', async () => {
		const engine = engineWith();
		try {
			const bootScope = await engine.whenActive();

			const switched = await engine.scope.switch({
				site: SITE,
				storeId: 2,
				cashierId: `scope-resolution-${uniqueCashier}`,
			});
			expect(switched.scopeId).not.toBe(bootScope.scopeId);

			const scope = await engine.whenActive();

			expect(scope.scopeId).toBe(switched.scopeId);
			expect(scope.database).toBe(switched.database);
			expect(scope.database).not.toBe(bootScope.database);
		} finally {
			await engine.dispose();
		}
	});

	/**
	 * The one that used to hand back a CLOSED database. `dispose()` closes every
	 * scope database and leaves nothing active; the old expression skipped
	 * straight past the null `active()` to the long-since-resolved `ready` and
	 * returned the boot scope, so a caller went on to read (and write) through a
	 * database that had been closed underneath it.
	 */
	it('rejects once no scope is active, rather than serving the boot scope', async () => {
		const engine = engineWith();
		const bootScope = await engine.whenActive();
		await engine.dispose();

		expect(engine.active()).toBeNull();
		await expect(engine.whenActive()).rejects.toThrow(/no active store scope/i);

		// Pins the failure mode, not just the throw: whatever `whenActive()` does
		// after teardown, it must not be "resolve with the boot scope".
		const resolved = await engine.whenActive().then(
			(scope) => scope,
			() => null
		);
		expect(resolved).not.toBe(bootScope);
		expect(resolved).toBeNull();
	});

	/**
	 * The type is the fix. `ready` no longer carries a scope, so `active() ??
	 * (await ready)` cannot be written at all — the boot-scope read is
	 * untypeable rather than merely discouraged.
	 */
	it('exposes `ready` as a timing signal that carries no scope', async () => {
		const engine = engineWith();
		try {
			await expect(engine.ready).resolves.toBeUndefined();
		} finally {
			await engine.dispose();
		}
	});

	/**
	 * The second path to the same symptom, stated rather than left implied
	 * (#1559's open question). `StoreScopeManager.switchTo` holds the OUTGOING
	 * scope in `active` until after `drainGuardedWrites(outgoing)`, so a read
	 * taken mid-switch gets the store the cashier is leaving without the old
	 * `??` ever firing. That is correct by design: the switch is atomic, and
	 * until it lands the outgoing database is still open and still draining, so
	 * it genuinely is the scope in effect — exactly as a read a tick earlier
	 * would have been.
	 */
	it('reports the OUTGOING scope while a switch is still in flight (by design)', async () => {
		const engine = engineWith();
		try {
			const bootScope = await engine.whenActive();

			const switching = engine.scope.switch({
				site: SITE,
				storeId: 3,
				cashierId: `scope-resolution-${uniqueCashier}`,
			});
			const midSwitch = await engine.whenActive();
			expect(midSwitch.scopeId).toBe(bootScope.scopeId);

			const switched = await switching;
			await expect(engine.whenActive()).resolves.toMatchObject({
				scopeId: switched.scopeId,
			});
		} finally {
			await engine.dispose();
		}
	});
});

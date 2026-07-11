import { describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { memoryEngineStorage } from './testing';
import { createRxdbSyncEngine, type EngineScopeEvent } from './create-rxdb-sync-engine';

setPremiumFlag();

vi.mock('./scheduler/rx-pos-bootstrap-seeder', () => ({
	seedPosBootstrapLanes: vi.fn(async () => {
		throw new Error('seed exploded');
	}),
}));

describe('bootstrap failure honesty', () => {
	it('keeps ready usable while exposing degradation through status, telemetry and the view event', async () => {
		const diagnostics = vi.fn();
		const engine = createRxdbSyncEngine(
			{
				site: {
					syncBaseUrl: 'https://example.test/wp-json/wc-rxdb-sync/v1',
					wpJsonRoot: 'https://example.test/wp-json',
				},
				storage: memoryEngineStorage(),
				mode: 'manual',
				diagnostics,
			},
			{ site: 'https://example.test', storeId: 1, cashierId: `bootstrap-failure-${Date.now()}` }
		);
		const events: EngineScopeEvent[] = [];
		engine.onScopeEvent((event) => events.push(event));

		const scope = await engine.ready;

		expect(scope.database).toBeDefined();
		expect(engine.status()).toMatchObject({
			gatedBy: 'bootstrap-failed',
			bootstrapFailed: { [scope.scopeId]: 'seed exploded' },
		});
		expect(diagnostics).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'engine.pos-bootstrap-error', level: 'warn' })
		);
		expect(events).toContainEqual({
			type: 'bootstrap-failed',
			scopeId: scope.scopeId,
			detail: 'seed exploded',
		});
		await engine.dispose();
	});
});

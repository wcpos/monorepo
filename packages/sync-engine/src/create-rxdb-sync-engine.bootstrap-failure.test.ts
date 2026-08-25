import { describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { memoryEngineStorage } from './testing';
import {
	createRxdbSyncEngine,
	type EngineEvent,
	type EngineFetcher,
	type EngineStatus,
} from './create-rxdb-sync-engine';

setPremiumFlag();

const stubFetcher: EngineFetcher = async () => {
	throw new Error('no network in this test');
};

vi.mock('./scheduler/rx-pos-bootstrap-seeder', () => ({
	seedPosBootstrapLanes: vi.fn(async () => {
		throw new Error('seed exploded');
	}),
}));

describe('bootstrap failure honesty', () => {
	it('keeps ready usable while exposing degradation through status, telemetry and events', async () => {
		const diagnostics = vi.fn();
		const engine = createRxdbSyncEngine(
			{
				site: {
					syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
					wpJsonRoot: 'https://example.test/wp-json',
				},
				storage: memoryEngineStorage(),
				fetcher: stubFetcher,
				mode: 'manual',
				diagnostics,
			},
			{ site: 'https://example.test', storeId: 1, cashierId: `bootstrap-failure-${Date.now()}` }
		);
		const events: EngineEvent[] = [];
		engine.events((event) => events.push(event));
		const statuses: EngineStatus[] = [];
		engine.statusChanges((status) => statuses.push(status));

		const scope = await engine.whenActive();

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
		await vi.waitFor(() =>
			expect(statuses.at(-1)?.bootstrapFailed).toEqual({ [scope.scopeId]: 'seed exploded' })
		);
		await engine.dispose();
	});
});

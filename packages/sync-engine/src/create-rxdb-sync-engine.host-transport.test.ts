import { describe, expect, it, vi } from 'vitest';

import { createRxdbSyncEngine, type EngineHostTransport } from './index';
import { memoryEngineStorage } from './testing';

describe('RxdbSyncEngine host transport reflection', () => {
	it('reflects the configured fetcher and sync base URL through a frozen read-only view', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		const fetcher = vi.fn(async () => new Response('{}'));
		const syncBaseUrl = 'https://example.test/wp-json/wcpos/v1/sync';
		const engine = createRxdbSyncEngine(
			{
				site: { syncBaseUrl, wpJsonRoot: 'https://example.test/wp-json/' },
				storage: memoryEngineStorage(),
				fetcher,
				mode: 'manual',
			},
			{
				site: 'https://example.test',
				storeId: 1,
				cashierId: `host-transport-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
			}
		);

		const transport: EngineHostTransport = engine.hostTransport();

		expect(transport).toEqual({ syncBaseUrl, fetcher });
		expect(Object.isFrozen(transport)).toBe(true);

		await engine.ready;
		await engine.dispose();
	});
});

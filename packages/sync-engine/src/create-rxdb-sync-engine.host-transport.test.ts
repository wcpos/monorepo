import { describe, expect, it, vi } from 'vitest';

import { createRxdbSyncEngine } from './index';
import { memoryEngineStorage } from './testing';

import type { EngineHostTransport } from './create-rxdb-sync-engine';

describe('RxdbSyncEngine host transport reflection', () => {
	it('reflects the configured fetcher and sync base URL through a frozen read-only view', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		const fetcher = vi.fn(async () => new Response('{}'));
		const syncBaseUrl = 'https://example.test/wp-json/wcpos/v2';
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

		expect(transport.syncBaseUrl).toBe(syncBaseUrl);
		expect(Object.isFrozen(transport)).toBe(true);

		// NOT the configured function by identity: the engine hands back its own
		// wrapper so a host-adjacent consumer's traffic — same site, same server —
		// also feeds the server-pressure monitor (#846). The configured fetcher is
		// still the one that runs, with the same arguments and the same response.
		expect(transport.fetcher).not.toBe(fetcher);
		const init = { method: 'GET' } as const;
		const response = await transport.fetcher('https://example.test/probe', init);
		expect(fetcher).toHaveBeenCalledWith('https://example.test/probe', init);
		expect(await response.text()).toBe('{}');

		await engine.ready;
		await engine.dispose();
	});
});

import { describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { memoryEngineStorage } from './testing';

const coverageState = vi.hoisted(() => ({
	calls: 0,
	closeAttempts: 0,
}));

vi.mock('@wcpos/sync-core', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@wcpos/sync-core')>();

	return {
		...actual,
		StoreScopeManager: class extends actual.StoreScopeManager {
			override closeScope(scopeId: string): Promise<void> {
				coverageState.closeAttempts += 1;
				if (coverageState.closeAttempts > 50) {
					return Promise.reject(new Error('bounded disposal-wedge test escape'));
				}
				return super.closeScope(scopeId);
			}
		},
	};
});

vi.mock('./local-coverage/local-coverage', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./local-coverage/local-coverage')>();

	return {
		...actual,
		createLocalCoverage: vi.fn((...args: Parameters<typeof actual.createLocalCoverage>) => {
			coverageState.calls += 1;
			if (coverageState.calls === 1) {
				throw new Error('local coverage construction failed');
			}
			return actual.createLocalCoverage(...args);
		}),
	};
});

const { createRxdbSyncEngine } = await import('./create-rxdb-sync-engine');

setPremiumFlag();

describe('createRxdbSyncEngine disposal after setup failure', () => {
	it('settles disposal and permits reopening after local coverage construction fails', async () => {
		const identity = {
			site: 'https://lab.example.test',
			storeId: 999,
			cashierId: 'coverage-setup-failure',
		};
		const ports = {
			site: {
				syncBaseUrl: `${identity.site}/wp-json/wcpos/v2`,
				wpJsonRoot: `${identity.site}/wp-json`,
			},
			storage: memoryEngineStorage(),
			mode: 'manual' as const,
		};
		const first = createRxdbSyncEngine(ports, identity);

		await expect(first.ready).rejects.toThrow(/local coverage construction failed/);

		const disposal = first.dispose().then(
			() => 'settled' as const,
			() => 'hung' as const
		);
		const boundedFlush = (async () => {
			for (let turn = 0; turn < 50; turn += 1) {
				await Promise.resolve();
			}
			return 'hung' as const;
		})();

		expect(await Promise.race([disposal, boundedFlush])).toBe('settled');

		const second = createRxdbSyncEngine(ports, identity);
		await expect(second.ready).resolves.toBeDefined();
		await expect(second.dispose()).resolves.toBeUndefined();
	});
});

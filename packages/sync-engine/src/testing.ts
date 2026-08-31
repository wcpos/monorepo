/**
 * `@wcpos/sync-engine/testing` — the in-memory adapter kit
 * (ADR 0018). Everything a harness needs to drive the engine through its
 * PUBLIC handle with no real storage, network, or connectivity: memory
 * storage wiring, a memory string store for the checkpoints port, and a
 * scripted connectivity signal. The fake sync servers stay in
 * `@wcpos/sync-core/testing` (they fake the SERVER, not an engine
 * port) — harnesses compose both kits.
 */

import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';

import { mintRemoteId, type RemoteId } from '@wcpos/sync-core';

import type { RxStorage } from 'rxdb';
import type { EngineConnectivity, EngineStringStore } from './create-rxdb-sync-engine';

export function remoteId(value: number): RemoteId {
	return mintRemoteId(value, 'test remote id');
}

// Host schema-canary fixtures. This is deliberately the exact sync-collection
// recipe the engine opens, without exposing package-private descriptors.
export { engineSyncCollectionCreators } from './collections/engine-collections';
export {
	createEngineHarness,
	type CapturedEngineTimers,
	type EngineHarness,
	type EngineHarnessOptions,
} from './engine-harness';

/**
 * Memory storage for the engine's `storage` port. z-schema-validated by
 * default — the same validator as the app's dev recipe (packages/database
 * adapters), which unlike Ajv rejects present-but-`undefined` keys; pass
 * `validate: false` for raw speed.
 */
export function memoryEngineStorage(options?: { validate?: boolean }): RxStorage<unknown, unknown> {
	const storage = getRxStorageMemory() as RxStorage<unknown, unknown>;
	if (options?.validate === false) {
		return storage;
	}
	return wrappedValidateZSchemaStorage({ storage }) as RxStorage<unknown, unknown>;
}

/** In-memory `EngineStringStore` with test-side visibility into the entries. */
export function memoryStringStore(): EngineStringStore & {
	entries(): ReadonlyMap<string, string>;
} {
	const values = new Map<string, string>();
	return {
		get: async (key) => values.get(key) ?? null,
		set: async (key, value) => {
			values.set(key, value);
		},
		remove: async (key) => {
			values.delete(key);
		},
		entries: () => values,
	};
}

/** Scripted connectivity for the `connectivity` port: `signal` is the port,
 * `set` is the test's hand on the dial. */
export function scriptedConnectivity(initial: EngineConnectivity = 'online'): {
	signal: () => EngineConnectivity;
	set(state: EngineConnectivity): void;
} {
	let state = initial;
	return {
		signal: () => state,
		set: (next) => {
			state = next;
		},
	};
}

export { type LocalCustomerDocument } from './collections/customer-schema';
export {
	existenceManifestDocument,
	existenceManifestSchema,
	type ExistenceManifestDocument,
} from './local-coverage/existence-manifest-schema';
export { orderBrowserQueryKey } from './scheduler';
export { searchLaneQueryKey } from './require-plane';
export {
	customerBrowseWindowQueryKeyFromDimensions,
	productBrowseWindowQueryKeyFromDimensions,
} from './scheduler';
// The coverage lane / query-total SCHEMAS are deliberately absent: they were here only so a
// consumer's tests could hand-build the engine's private tables. `engine.coverageChanges` now
// answers what those rows were being read for, and the engine's own tests reach the schemas
// through their real modules.
export {
	schedulerTaskStateKey,
	schedulerTaskStateSchema,
	type SchedulerTaskStateDocument,
} from './scheduler';

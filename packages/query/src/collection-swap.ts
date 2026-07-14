import { getLogger } from '@wcpos/utils/logger';

import { engineCollectionNameFor, isMappedCollection } from './engine-adapter/collection-map';

import type { Manager } from './manager';
import type { RxCollection, RxDatabase } from 'rxdb';

const swapLogger = getLogger(['wcpos', 'query', 'collection-swap']);

/**
 * Configuration for a collection swap. `storeDB` / `fastStoreDB` are accepted for
 * source compatibility with the pre-engine callers but are no longer used — the
 * engine owns collection lifecycle now (ADR 0023 increment 1b).
 */
export interface CollectionSwapConfig {
	manager: Manager<any>;
	collectionName: string;
	/** @deprecated increment-3 — no longer used; the engine owns the reset. */
	storeDB?: RxDatabase;
	/** @deprecated increment-3 — no longer used; the engine owns the reset. */
	fastStoreDB?: RxDatabase;
	timeout?: number;
}

export interface CollectionSwapResult {
	success: boolean;
	/** Time taken in milliseconds */
	duration: number;
	/** Name of the collection that was swapped */
	collectionName: string;
	/** Fresh collection instance (if successful) */
	collection?: RxCollection;
	/** Error message (if failed) */
	error?: string;
}

/**
 * Reset a collection to a fresh, empty state.
 *
 * Reimplemented over `engine.scope.resetCollection()` (ADR 0023 increment 1b),
 * preserving the public {@link CollectionSwapResult} shape Core consumes through
 * the barrel. The engine clears the collection's cursors atomically with the drop
 * and re-emits the same database; we then re-resolve the fresh collection and
 * cancel the manager's stale queries so components re-register on the next render.
 */
export async function swapCollection(config: CollectionSwapConfig): Promise<CollectionSwapResult> {
	const { manager, collectionName } = config;
	const startTime = performance.now();

	try {
		swapLogger.info(`Starting collection swap: ${collectionName}`, {
			context: { collectionName },
		});

		if (!isMappedCollection(collectionName)) {
			// logs / templates have no engine collection — nothing to reset.
			throw new Error(`Collection "${collectionName}" has no engine collection to reset`);
		}

		const engineName = engineCollectionNameFor(collectionName);

		// Cancel stale queries bound to the current engine collection instance.
		const staleCollection = manager.getCollection(collectionName) as RxCollection | undefined;
		if (staleCollection) {
			await manager.onCollectionReset(staleCollection);
		}

		const outcome = await manager.engine.scope.resetCollection(engineName);
		if (outcome === 'needs-confirmation') {
			throw new Error(`Reset of "${engineName}" needs confirmation (pending mutations)`);
		}

		const freshCollection = manager.getCollection(collectionName) as RxCollection | undefined;

		// Nudge re-registration for components keyed on the local reset$ bridge.
		const resetSubject = (manager.localDB as any).reset$;
		if (resetSubject && typeof resetSubject.next === 'function') {
			resetSubject.next({ name: collectionName });
		}

		const duration = performance.now() - startTime;
		swapLogger.info(`Collection swap complete: ${collectionName}`, {
			context: { collectionName, duration },
		});

		return {
			success: true,
			duration,
			collection: freshCollection,
			collectionName,
		};
	} catch (error: any) {
		const duration = performance.now() - startTime;
		swapLogger.error(`Collection swap failed: ${collectionName}`, {
			showToast: true,
			saveToDb: true,
			context: { collectionName, duration, error: error?.message },
		});
		return {
			success: false,
			duration,
			error: error?.message,
			collectionName,
		};
	}
}

/**
 * Swap multiple collections sequentially (e.g. variations + products).
 */
export async function swapCollections(
	configs: Omit<CollectionSwapConfig, 'collectionName'> & { collectionNames: string[] }
): Promise<CollectionSwapResult[]> {
	const { collectionNames, ...baseConfig } = configs;
	const results: CollectionSwapResult[] = [];

	for (const collectionName of collectionNames) {
		const result = await swapCollection({ ...baseConfig, collectionName });
		results.push(result);
		if (!result.success) {
			break;
		}
	}

	return results;
}

/** Demand declaration and reset-refill helpers for the compiled query demand face. */

import { getLogger } from '@wcpos/utils/logger';
import type {
	EngineRequirement,
	RequirementHandle,
	RxdbSyncEngine,
	SyncCollectionName,
} from '@wcpos/sync-engine';

import {
	type EngineCollectionName,
	engineCollectionNameFor,
	isMappedCollection,
} from './engine-adapter/collection-map';

const REFERENCE_ENGINE_COLLECTIONS: EngineCollectionName[] = [
	'categories',
	'tags',
	'brands',
	'coupons',
];

const requirementLogger = getLogger(['wcpos', 'query', 'requirement-bridge']);

/**
 * Declare a query's requirements against the engine, returning the live handles.
 * Rejections are swallowed here: demand is best-effort and self-heals on the next
 * declaration (UI requirements are re-declared every render).
 */
export function declareRequirements(
	engine: RxdbSyncEngine,
	requirements: EngineRequirement[]
): RequirementHandle[] {
	return requirements.map((requirement) => {
		const handle = engine.require(requirement);
		handle.ready.catch((error) => {
			if (requirement.kind === 'search') {
				requirementLogger.warn('Search requirement failed; continuing with local results', {
					context: {
						collection: requirement.collection,
						termLength: requirement.term?.length ?? 0,
						error,
					},
				});
			}
		});
		return handle;
	});
}

/** Binding-independent refill for collections a reset may have emptied with no binding
 * mounted over them. Mounted bindings replay themselves (coverageGeneration). */
export function resetRefillRequirements(collectionNames: string[]): EngineRequirement[] {
	const wanted = new Set(collectionNames);
	const resetEngineCollections = new Set<EngineCollectionName>(
		collectionNames
			.filter(isMappedCollection)
			.map((collectionName) => engineCollectionNameFor(collectionName))
	);
	const requirements: EngineRequirement[] = [];
	// Reset refill is the one path that must beat the dedupe window: the local collection was
	// just wiped, so serving "recently refreshed" residents would serve nothing. The UI
	// Compiled UI demand deliberately drops `forceRefresh` (#952), so
	// the refill declares its own forced refresh per reset reference collection.
	for (const collection of REFERENCE_ENGINE_COLLECTIONS) {
		if (!resetEngineCollections.has(collection)) continue;
		requirements.push({
			id: `${collection}:collection-reset`,
			collection,
			kind: 'refresh',
			forceRefresh: true,
			priority: 1000,
		});
	}
	if (wanted.has('taxes')) {
		requirements.push({
			id: 'taxRates:collection-reset',
			collection: 'taxRates',
			kind: 'refresh',
			priority: 1000,
		});
	}
	return requirements;
}

export async function runResetRefill(
	engine: RxdbSyncEngine,
	collectionNames: string[]
): Promise<void> {
	const requirements = resetRefillRequirements(collectionNames);
	const engineCollections = new Set<SyncCollectionName>(
		collectionNames
			.filter(isMappedCollection)
			.map((collectionName) => engineCollectionNameFor(collectionName))
	);
	// Variations count as a browse-seed trigger: the funnel usually resets
	// ['variations', 'products'] together, but a standalone variations reset (the Health
	// page's per-collection row) would otherwise declare no refill work at all. The seed
	// re-materializes the catalog surface; per-parent variation fetch stays on-demand.
	const seedProductBrowse =
		engineCollections.has('products') || engineCollections.has('variations');
	// Re-arm normal policy: the product/variation browse seed now, and the reference
	// collections through the forced refresh requirements built above — NOT through the
	// `reference-seed` maintenance lane, which gates on local residents and would skip a
	// collection the reset just emptied. Customers resume on demand plus idle trickle from
	// page 1 (not ticked while active), and orders wait for view demand or their periodic
	// window cadence.

	if (seedProductBrowse) await engine.sync('product-browse-window-seed');
	const handles = declareRequirements(engine, requirements);
	try {
		await Promise.all(handles.map((handle) => handle.ready.catch(() => undefined)));
	} finally {
		for (const handle of handles) handle.release();
	}
	await engine.sync('scheduler-drain');
}

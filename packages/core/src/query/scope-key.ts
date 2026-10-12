import * as React from 'react';

import { engineCollectionNameFor, type LegacyCollectionName, useQueryRuntime } from '@wcpos/query';
import type { RxdbSyncEngine, SyncCollectionName } from '@wcpos/sync-engine';

export function useCoverageGeneration(
	engine: RxdbSyncEngine,
	collection: SyncCollectionName
): number {
	const subscribe = React.useCallback(
		(notify: () => void) => engine.statusChanges(() => notify()),
		[engine]
	);
	const getSnapshot = React.useCallback(
		() => engine.status().collections[collection].coverageGeneration,
		[collection, engine]
	);
	return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// A number per engine, so a scope key can carry the engine's identity in a string.
const engineKeys = new WeakMap<RxdbSyncEngine, number>();
let nextEngineKey = 0;
export function engineKeyOf(engine: RxdbSyncEngine): number {
	let key = engineKeys.get(engine);
	if (key === undefined) {
		key = nextEngineKey++;
		engineKeys.set(engine, key);
	}
	return key;
}

/**
 * The scope a collection is read from now, as a string: the engine (a cross-site change brings a
 * new one) and the collection's coverage generation (a same-site `scope.switch()` keeps the engine
 * and changes its database in place, and bumps every collection's generation; a reset of the
 * collection bumps it too, and leaves it empty). The same identity `useAllTermsBinding` keys its
 * one-shot refresh to. A surface holding records across renders keys itself to this, so a scope
 * switch starts it afresh instead of showing the previous scope's records — and a query handle
 * carries it in its key, so a generation bump is a new handle declared before the old one releases.
 */
export function useScopeKey(collection: LegacyCollectionName): string {
	const { engine } = useQueryRuntime();
	const generation = useCoverageGeneration(engine, engineCollectionNameFor(collection));
	return `${engineKeyOf(engine)}:${generation}`;
}

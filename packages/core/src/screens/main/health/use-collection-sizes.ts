import * as React from 'react';

import { useQueryManager } from '@wcpos/query';

import { type CollectionKey, estimateCollectionBytes } from './database-logic';

const SAMPLE_LIMIT = 25;
/** Counts stream on every doc write; re-estimating on a trailing debounce keeps sampling cheap. */
const RECOMPUTE_DEBOUNCE_MS = 2_000;

export type CollectionSizes = Partial<Record<CollectionKey, number | null>>;

/**
 * Approximate per-collection on-disk bytes: serialized length of a small
 * sample × the live record count (see estimateCollectionBytes — the UI shows
 * these with "≈"). Recomputes on a debounce whenever counts move so the
 * column tracks clears/re-downloads without hammering the storage layer.
 */
export function useCollectionSizes(
	counts: Partial<Record<CollectionKey, number>>,
	keys: readonly CollectionKey[]
): CollectionSizes {
	const { engine } = useQueryManager();
	const [sizes, setSizes] = React.useState<CollectionSizes>({});

	// The counts snapshot the last estimate ran against — string key keeps the
	// effect dependency primitive and change-detection exact. The refs carry
	// the live values into the sampling effect without widening its dependency
	// list; they update in their own effect (declared first, so it runs first)
	// because the compiler forbids ref writes during render.
	const countsKey = keys.map((key) => `${key}:${counts[key] ?? 0}`).join('|');
	const countsRef = React.useRef(counts);
	const keysRef = React.useRef(keys);
	React.useEffect(() => {
		countsRef.current = counts;
		keysRef.current = keys;
	});

	React.useEffect(() => {
		// Effect (last resort per project.mdc): sampling reads RxDB documents —
		// an async external read with no observable seam for "serialized size".
		let cancelled = false;
		const timer = setTimeout(() => {
			void (async () => {
				let scope: ReturnType<typeof engine.active>;
				try {
					scope = engine.active();
				} catch {
					return; // engine disposed mid-debounce — nothing to sample
				}
				const database = scope?.database as { collections: Record<string, unknown> } | undefined;
				if (!database) return;
				const next: CollectionSizes = {};
				for (const key of keysRef.current) {
					// Failures isolate per collection: one bad sample nulls ITS cell
					// ("—") while every other estimate still lands — a shared catch
					// would keep stale sizes on screen after a reset.
					try {
						const count = countsRef.current[key] ?? 0;
						const collection = database.collections[key] as
							| {
									find(query: { limit: number }): {
										exec(): Promise<{ toJSON(): unknown }[]>;
									};
							  }
							| undefined;
						if (!collection || count === 0) {
							next[key] = null;
							continue;
						}
						const docs = await collection.find({ limit: SAMPLE_LIMIT }).exec();
						const lengths = docs.map((doc) => JSON.stringify(doc.toJSON()).length);
						next[key] = estimateCollectionBytes(count, lengths);
					} catch {
						next[key] = null;
					}
				}
				if (!cancelled) setSizes(next);
			})();
		}, RECOMPUTE_DEBOUNCE_MS);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [engine, countsKey]);

	return sizes;
}

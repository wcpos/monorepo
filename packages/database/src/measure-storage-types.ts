/**
 * One measured on-disk entry. Legacy filesystem entries use
 * `rxdb-<db>-<collection>-<version>` names. SQLite pools are opaque and cannot
 * be attributed per collection; `legacy` marks retired storage roots.
 */
export type StorageFootprintEntry = {
	name: string;
	bytes: number;
	/** Opaque pool: per-collection attribution is not available (#2242). */
	root?: 'sqlite';
	legacy?: boolean;
};

export type StorageFootprint = {
	entries: StorageFootprintEntry[];
	/**
	 * navigator.storage.estimate().usage where the platform has it (web) — the
	 * device-quota view that also sees caches/IndexedDB the entries can't.
	 * Null on platforms whose storage lives outside the renderer's estimate.
	 */
	estimateBytes: number | null;
	/** Chrome's non-standard `usageDetails` per-system split of the estimate; null elsewhere. */
	estimateDetails: Record<string, number> | null;
	/** Measured bytes of the app's image caches; null when the platform cannot measure them. */
	imageCacheBytes: number | null;
	/** Cache entries whose size the browser hides (cross-origin opaque responses). */
	opaqueCacheEntries: number;
};

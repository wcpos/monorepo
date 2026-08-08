/**
 * One measured on-disk entry. On every platform the RxDB storage layer writes
 * one directory per (database, collection, schemaVersion) triple named
 * `rxdb-<db>-<collection>-<version>` ('/' encoded as '__'), so entry names are
 * classifiable without knowing which backend produced them. `legacy` marks
 * pre-filesystem storage remnants (Electron's SQLite files, native's SQLite
 * directory) that no current-generation database accounts for.
 */
export type StorageFootprintEntry = {
	name: string;
	bytes: number;
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
};

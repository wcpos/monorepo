import type { SyncCollectionName } from '../collections/engine-collections';

/**
 * Catalogue collections whose refused change is reverted to server truth right
 * after it dead-letters (#1082) — the engine runs the revert, and the write
 * drain owes the dead letter's verdict when post-drain processing fails before
 * the revert can start.
 */
export const AUTO_REVERT_COLLECTIONS: ReadonlySet<string> = new Set([
	'products',
	'variations',
	'customers',
	'coupons',
] satisfies SyncCollectionName[]);

import { normalizeQuerySortField } from '@wcpos/query/query-state';

import type { CollectionKey } from '../../../../query';

export interface SortingChange {
	sortBy: string;
	sortDirection: 'asc' | 'desc';
}

/**
 * Maps a collection's persisted UI column ID to its query-state sort field.
 */
export function getSortField(collectionName: CollectionKey, columnId: string): string {
	return normalizeQuerySortField(collectionName, columnId) ?? columnId;
}

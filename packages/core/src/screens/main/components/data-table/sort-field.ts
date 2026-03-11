export interface SortingChange {
	sortBy: string;
	sortDirection: 'asc' | 'desc';
}

/**
 * Maps column IDs to the actual sort field name used in the database.
 * Price and total columns sort on indexed `sortable_` prefixed fields.
 */
export function getSortField(columnId: string): string {
	if (columnId === 'price' || columnId === 'total') {
		return `sortable_${columnId}`;
	}
	return columnId;
}

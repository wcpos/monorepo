export interface LegacySortingChange {
	sortBy: string;
	sortDirection: 'asc' | 'desc';
}

interface TanStackSortingEntry {
	id: string;
	desc: boolean;
}

type TanStackSortingState = TanStackSortingEntry[];

export type SortingChangeInput =
	| LegacySortingChange
	| TanStackSortingState
	| ((currentSorting: TanStackSortingState) => TanStackSortingState | LegacySortingChange);

function toTanStackSorting(currentSorting: LegacySortingChange): TanStackSortingState {
	return [
		{
			id: currentSorting.sortBy,
			desc: currentSorting.sortDirection === 'desc',
		},
	];
}

function fromTanStackSorting(
	sortingState: TanStackSortingState,
	fallback: LegacySortingChange
): LegacySortingChange {
	const activeSort = sortingState[0];
	if (!activeSort?.id) {
		return fallback;
	}

	return {
		sortBy: activeSort.id,
		sortDirection: activeSort.desc ? 'desc' : 'asc',
	};
}

function isLegacySortingChange(value: unknown): value is LegacySortingChange {
	return (
		typeof value === 'object' && value !== null && 'sortBy' in value && 'sortDirection' in value
	);
}

export function normalizeSortingChange(
	change: SortingChangeInput,
	currentSorting: LegacySortingChange
): LegacySortingChange {
	const resolved =
		typeof change === 'function' ? change(toTanStackSorting(currentSorting)) : change;

	if (Array.isArray(resolved)) {
		return fromTanStackSorting(resolved, currentSorting);
	}

	if (isLegacySortingChange(resolved)) {
		return resolved;
	}

	return currentSorting;
}

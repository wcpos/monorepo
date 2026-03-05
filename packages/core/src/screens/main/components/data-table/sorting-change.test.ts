/**
 * @jest-environment node
 */

import { type LegacySortingChange, normalizeSortingChange } from './sorting-change';

const currentSorting: LegacySortingChange = {
	sortBy: 'name',
	sortDirection: 'asc',
};

describe('normalizeSortingChange', () => {
	it('returns legacy sort payloads unchanged', () => {
		expect(
			normalizeSortingChange({ sortBy: 'name', sortDirection: 'asc' }, currentSorting)
		).toEqual({
			sortBy: 'name',
			sortDirection: 'asc',
		});
	});

	it('resolves tanstack updater callbacks into legacy payloads', () => {
		const updater = (currentTanStackSorting: { id: string; desc: boolean }[]) => [
			{ id: currentTanStackSorting[0].id, desc: !currentTanStackSorting[0].desc },
		];

		expect(normalizeSortingChange(updater, currentSorting)).toEqual({
			sortBy: 'name',
			sortDirection: 'desc',
		});
	});
});

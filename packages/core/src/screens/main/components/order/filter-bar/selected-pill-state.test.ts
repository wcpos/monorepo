import { getSelectedPillState } from './selected-pill-state';

describe('getSelectedPillState', () => {
	it('treats the pill as inactive when the selected id is cleared even if a stale entity remains', () => {
		const result = getSelectedPillState({
			selectedID: undefined,
			entity: { id: 1, first_name: 'Ada' },
			isLoading: false,
		});

		expect(result).toEqual({
			isActive: false,
			entity: null,
			isLoading: false,
		});
	});

	it('keeps the pill active while a selected id is still loading', () => {
		const result = getSelectedPillState({
			selectedID: 1,
			entity: { id: 1, __isLoading: true },
			isLoading: true,
		});

		expect(result).toEqual({
			isActive: true,
			entity: { id: 1, __isLoading: true },
			isLoading: true,
		});
	});
});

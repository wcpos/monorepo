import * as React from 'react';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import { useDocField } from '@wcpos/query';

import { isQuickFilterActive, quickFilterToQueryPatch } from './apply-quick-filter';
import { getPOSProductSort } from '../pos-product-sort';
import { useUISettings } from '../../../contexts/ui-settings';
import { useQueryState, useQueryStateActions } from '../../../../../query';

import type { QuickFilter } from './filter-bar-layout';
import type { FiltersOf } from '../../../../../query/query-state-types';

export function QuickFilterButton({ quickFilter }: { quickFilter: QuickFilter }) {
	const state = useQueryState<'products', { search: string; filters: FiltersOf<'products'> }>(
		(value) => ({ search: value.search, filters: value.filters })
	);
	const actions = useQueryStateActions<'products'>();
	const { uiSettings } = useUISettings('pos-products');
	const settingsSort = useDocField(uiSettings, (value) =>
		getPOSProductSort(value.sortBy, value.sortDirection)
	);
	const active = isQuickFilterActive(quickFilter, state);

	const reset = () => {
		actions.resetFilters();
		actions.clearSearch();
		actions.setSort(settingsSort.field, settingsSort.direction);
	};
	const handlePress = () => {
		if (active) return reset();
		const patch = quickFilterToQueryPatch(quickFilter);
		actions.resetFilters();
		for (const [field, value] of Object.entries(patch.filters)) {
			actions.setFilter(field as keyof FiltersOf<'products'>, value as never);
		}
		if (patch.search) actions.setSearch(patch.search);
		else actions.clearSearch();
		const sort = quickFilter.sort ?? settingsSort;
		actions.setSort(sort.field, sort.direction);
	};

	return (
		<ButtonPill
			size="xs"
			variant={active ? undefined : 'muted'}
			testID={`quick-filter-${quickFilter.id}`}
			onPress={handlePress}
		>
			<ButtonText decodeHtml>{quickFilter.label}</ButtonText>
		</ButtonPill>
	);
}

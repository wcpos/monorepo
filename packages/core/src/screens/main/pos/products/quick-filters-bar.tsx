import * as React from 'react';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { useDocField } from '@wcpos/query';

import { VALUELESS_QUICK_FILTER_KINDS } from './quick-filters';
import { useSlotValue } from '../../../../extensions/slots';
import { useUISettings } from '../../contexts/ui-settings';

import type { SlotEntryProps } from '../../../../extensions/slots';
import type { QuickFilter } from './quick-filters';

/** The taxonomy kinds and the array filter each one toggles an id inside. */
const TERM_FILTER_FIELDS = {
	category: 'categories',
	tag: 'tags',
	brand: 'brands',
} as const;

/**
 * The merchant-configured quick filters, as an entry in `pos.products.filter-bar.item`.
 *
 * It reaches the query only through the slot `api` — this component never sees the query
 * state store, only the `{ search, filters }` projection the host published.
 */
export function QuickFiltersBar({ data, api }: SlotEntryProps<'pos.products.filter-bar.item'>) {
	const { uiSettings } = useUISettings('pos-products');
	const configured = useDocField(uiSettings, (value) => value.quickFilters) as
		| QuickFilter[]
		| undefined;
	const { search, filters } = useSlotValue(data);

	// A kind that needs a value and has none was never finishable in the settings form;
	// rendering it would give the merchant a button that filters on nothing.
	const quickFilters = (configured ?? []).filter(
		(filter) => VALUELESS_QUICK_FILTER_KINDS.includes(filter.kind) || filter.value !== ''
	);

	const isActive = (filter: QuickFilter): boolean => {
		switch (filter.kind) {
			case 'category':
			case 'tag':
			case 'brand':
				return (filters[TERM_FILTER_FIELDS[filter.kind]] ?? []).includes(Number(filter.value));
			case 'featured':
				return filters.featured === true;
			case 'on_sale':
				return filters.on_sale === true;
			case 'stock_status':
				return filters.stock_status === filter.value;
			case 'search':
				return search === filter.value;
		}
	};

	const toggle = (filter: QuickFilter) => {
		const active = isActive(filter);
		switch (filter.kind) {
			case 'category':
			case 'tag':
			case 'brand': {
				const field = TERM_FILTER_FIELDS[filter.kind];
				const id = Number(filter.value);
				const current = filters[field] ?? [];
				void api.setFilter(field, active ? current.filter((term) => term !== id) : [...current, id]);
				return;
			}
			case 'featured':
			case 'on_sale':
				void (active ? api.clearFilter(filter.kind) : api.setFilter(filter.kind, true));
				return;
			case 'stock_status':
				void (active
					? api.clearFilter('stock_status')
					: api.setFilter('stock_status', filter.value));
				return;
			case 'search':
				void api.setSearch(active ? '' : filter.value);
		}
	};

	if (quickFilters.length === 0) return null;

	return (
		<HStack className="w-full flex-wrap">
			{quickFilters.map((filter) => (
				<ButtonPill
					key={filter.id}
					size="xs"
					variant={isActive(filter) ? undefined : 'muted'}
					testID={`quick-filter-${filter.id}`}
					onPress={() => toggle(filter)}
				>
					<ButtonText decodeHtml>{filter.label}</ButtonText>
				</ButtonPill>
			))}
		</HStack>
	);
}

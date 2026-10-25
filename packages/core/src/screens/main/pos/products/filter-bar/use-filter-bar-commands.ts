import { normalizeFilterBar } from './filter-bar-layout';
import { useUISettings } from '../../../contexts/ui-settings';

import type { BUILT_IN_PILL_IDS, FilterBarItem, QuickFilter } from './filter-bar-layout';

type BuiltInPillId = (typeof BUILT_IN_PILL_IDS)[number];

export function useFilterBarCommands() {
	const { modifyUI } = useUISettings('pos-products');
	const write = async (transform: (items: FilterBarItem[]) => FilterBarItem[]): Promise<void> => {
		await modifyUI('filterBar', (old) => transform(normalizeFilterBar(old)) as never);
	};
	return {
		showPill: (id: BuiltInPillId, show: boolean) =>
			write((items) =>
				items.map((item) => (item.type === 'pill' && item.id === id ? { ...item, show } : item))
			),
		dropQuickFilter: (id: string) => write((items) => items.filter((item) => item.id !== id)),
		changeQuickFilter: (quickFilter: QuickFilter) =>
			write((items) => items.map((item) => (item.id === quickFilter.id ? quickFilter : item))),
		addQuickFilter: (quickFilter: QuickFilter) =>
			write((items) =>
				items.some((item) => item.id === quickFilter.id)
					? items.map((item) => (item.id === quickFilter.id ? quickFilter : item))
					: [...items, quickFilter]
			),
	};
}

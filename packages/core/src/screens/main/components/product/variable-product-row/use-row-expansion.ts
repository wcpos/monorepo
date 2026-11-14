import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { map, of } from 'rxjs';

import { useQueryStateActions } from '../../../../../query';

import type { ExpandedState, RowData, TableFeatures, TableMeta } from '@tanstack/react-table';

type ExpandableRow = { childrenSearchCount?: number; parentSearchTerm?: string };
type ExpansionMeta = Pick<TableMeta<TableFeatures, RowData>, 'expanded$' | 'setRowExpanded'>;

const NONE_OPEN = of<ExpandedState>({});

/** Whether the row is open, from the table meta's `expanded$` (`true`: all are; none: none is). */
export function useRowExpanded(meta: ExpansionMeta | undefined, id: string) {
	const all$ = meta?.expanded$ ?? NONE_OPEN;
	const expanded$ = React.useMemo(
		() => all$.pipe(map((value) => value === true || !!value[id])),
		[all$, id]
	);
	return useObservableEagerState(expanded$);
}

/**
 * A variable product row's expansion, read from and written to the table meta (the
 * `setRowExpanded` bypass of TanStack's updater). Opening a row whose variations matched the
 * products search seeds the variations query with that term first. Call it inside the row's
 * `VariationRowProvider`: the actions are the row's variations query state.
 */
export function useRowExpansion(
	item: { id: string; original: ExpandableRow },
	table: { options: { meta?: ExpansionMeta } }
) {
	const meta = table.options.meta;
	const expanded = useRowExpanded(meta, item.id);
	const actions = useQueryStateActions<'variations'>();
	const original = item.original;
	const toggle = () => {
		if (!expanded && (original.childrenSearchCount ?? 0) > 0) {
			actions.setSearch(original.parentSearchTerm ?? '');
			actions.clearFilter('attributeMatches');
		}
		meta?.setRowExpanded?.(item.id, !expanded);
	};
	return { expanded, toggle };
}

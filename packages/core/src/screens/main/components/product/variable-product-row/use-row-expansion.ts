import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { map, type Observable } from 'rxjs';

import { useQueryStateActions } from '../../../../../query';

type ExpandableRow = { childrenSearchCount?: number; parentSearchTerm?: string };

/**
 * A variable product row's expansion, read from and written to the table meta (the
 * `setRowExpanded` bypass of TanStack's updater). Opening a row whose variations matched the
 * products search seeds the variations query with that term first. Call it inside the row's
 * `VariationRowProvider`: the actions are the row's variations query state.
 */
export function useRowExpansion(
	item: { id: string; original: unknown },
	table: { options: { meta?: unknown } }
) {
	const meta = table.options.meta as unknown as {
		expanded$: Observable<Record<string, boolean>>;
		setRowExpanded?: (id: string, expanded: boolean) => void;
	};
	const expanded$ = React.useMemo(
		() => meta.expanded$.pipe(map((value) => !!value[item.id])),
		[meta.expanded$, item.id]
	);
	const expanded = useObservableEagerState(expanded$);
	const actions = useQueryStateActions<'variations'>();
	const original = item.original as ExpandableRow;
	const toggle = () => {
		if (!expanded && (original.childrenSearchCount ?? 0) > 0) {
			actions.setSearch(original.parentSearchTerm ?? '');
			actions.clearFilter('attributeMatches');
		}
		meta.setRowExpanded?.(item.id, !expanded);
	};
	return { expanded, toggle };
}

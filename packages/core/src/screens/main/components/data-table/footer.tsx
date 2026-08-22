import * as React from 'react';

import { useObservableEagerState, useObservableState } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { useQueryStateActions } from '../../../../query';
import { useCollectionReset } from '../../hooks/use-collection-reset';
import { SyncButton } from '../sync-button';

import type { CollectionKey } from '../../hooks/use-collection';
import type { Observable } from 'rxjs';

interface CommonProps {
	children?: React.ReactNode;
	count: number;
}

export type BindingDataTableFooterProps = CommonProps & {
	collectionName: CollectionKey;
	active$: Observable<boolean>;
	total$: Observable<number | null>;
	sync: () => Promise<void>;
};

type FooterContentProps = CommonProps &
	Pick<BindingDataTableFooterProps, 'active$' | 'sync' | 'total$'> & {
		clearAndSync: () => Promise<void>;
	};

/**
 *
 */
function FooterContent({
	children,
	count,
	active$,
	total$,
	sync,
	clearAndSync,
}: FooterContentProps) {
	const loading = useObservableEagerState(active$);
	const total = useObservableState(total$, null);
	const t = useT();

	return (
		<HStack className="border-border bg-footer rounded-b-lg border-t p-2">
			<HStack className="flex-1 justify-start *:flex-1">{children}</HStack>
			<HStack className="justify-end gap-0">
				<Text testID="data-table-count" className="text-xs">
					{/* No denominator unless something vouches for one (binding.total$). Falling
					    back to the loaded-row count printed "Showing 20 of 20" on a page of 20
					    and told the cashier that was all their orders.
					    Grouped like the Store Health › Database page prints the same number —
					    one source of truth means the FORMATTING agrees too, or "62,438" and
					    "62438" read as two different numbers. The hidden markers below stay
					    raw digits: E2E asserts on them. */}
					{total === null
						? t('common.showing_n', { shown: count.toLocaleString() })
						: t('common.showing_of', {
								shown: count.toLocaleString(),
								total: total.toLocaleString(),
							})}
				</Text>
				<Text testID="data-table-loaded-count" className="hidden">
					{count}
				</Text>
				<Text testID="data-table-total-count" className="hidden">
					{total === null ? '' : total}
				</Text>
				<SyncButton sync={sync} clearAndSync={clearAndSync} active={loading} />
			</HStack>
		</HStack>
	);
}

export function DataTableFooter({ collectionName, ...props }: BindingDataTableFooterProps) {
	const { clearAndSync } = useCollectionReset(collectionName);
	const { clearSearch, resetFilters } = useQueryStateActions();
	const resetQueryAndCollection = React.useCallback(() => {
		clearSearch();
		resetFilters();
		return clearAndSync();
	}, [clearAndSync, clearSearch, resetFilters]);

	return <FooterContent {...props} clearAndSync={resetQueryAndCollection} />;
}

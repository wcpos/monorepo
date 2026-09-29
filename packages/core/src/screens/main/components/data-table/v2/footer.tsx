import * as React from 'react';

import { useObservableEagerState, useObservableState } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../../contexts/translations';
import { useQueryStateActions } from '../../../../../query';
import { SyncButton } from '../../sync-button';
import { useCollectionReset } from '../../../hooks/use-collection-reset';

import type { BindingDataTableFooterProps } from '../footer';

export function DataTableFooter({
	collectionName,
	active$,
	total$,
	sync,
	count,
	children,
}: BindingDataTableFooterProps) {
	const loading = useObservableEagerState(active$);
	const total = useObservableState(total$, null);
	const { clearAndSync } = useCollectionReset(collectionName);
	const actions = useQueryStateActions();
	const t = useT();
	return (
		<HStack className="border-border min-h-ctl items-center border-t px-2">
			<HStack className="min-w-0 flex-1 *:min-w-0 *:flex-1">{children}</HStack>
			<HStack className="shrink-0 gap-0">
				<Text testID="data-table-count" className="text-muted-foreground text-sm">
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
					{total ?? ''}
				</Text>
				<SyncButton
					sync={sync}
					active={loading}
					clearAndSync={() => {
						actions.clearSearch();
						actions.resetFilters();
						return clearAndSync();
					}}
				/>
			</HStack>
		</HStack>
	);
}

import * as React from 'react';

import { useObservableEagerState, useObservableState } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../contexts/translations';
import { useQueryStateActions } from '../../../query';
import { SyncButton } from '../components/sync-button';
import { useCollectionReset } from '../hooks/use-collection-reset';

import type { useCollectionBinding } from '../../../query';

type TaxRatesBinding = ReturnType<typeof useCollectionBinding<'tax-rates'>>;

type TaxRatesFooterProps = Pick<TaxRatesBinding, 'active$' | 'sync' | 'total$' | 'totalSource$'> & {
	count: number;
};

/**
 *
 */
export function TaxRatesFooter({
	count,
	active$,
	total$,
	totalSource$,
	sync,
}: TaxRatesFooterProps) {
	const { clearAndSync } = useCollectionReset('taxes');
	const { clearSearch, resetFilters } = useQueryStateActions<'tax-rates'>();
	const resetQueryAndCollection = React.useCallback(() => {
		clearSearch();
		resetFilters();
		return clearAndSync();
	}, [clearAndSync, clearSearch, resetFilters]);
	const active = useObservableEagerState(active$);
	const total = useObservableState(total$, 0);
	const totalSource = useObservableState(totalSource$, 'local');
	const t = useT();

	return (
		<HStack className="border-border bg-footer justify-end gap-0 border-t p-2">
			<Text className="text-xs">{t('common.showing_of', { shown: count, total })}</Text>
			{totalSource === 'local' ? (
				<Text className="text-muted-foreground ml-1 text-[10px]">
					{t('common.showing_local_items')}
				</Text>
			) : null}
			<SyncButton sync={sync} clearAndSync={resetQueryAndCollection} active={active} />
		</HStack>
	);
}

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

type TaxRatesFooterProps = Pick<TaxRatesBinding, 'active$' | 'sync' | 'total$'> & {
	count: number;
};

/**
 *
 */
export function TaxRatesFooter({ count, active$, total$, sync }: TaxRatesFooterProps) {
	const { clearAndSync } = useCollectionReset('taxes');
	const { clearSearch, resetFilters } = useQueryStateActions<'tax-rates'>();
	const resetQueryAndCollection = React.useCallback(() => {
		clearSearch();
		resetFilters();
		return clearAndSync();
	}, [clearAndSync, clearSearch, resetFilters]);
	const active = useObservableEagerState(active$);
	const total = useObservableState(total$, null);
	const t = useT();

	return (
		<HStack className="border-border bg-footer justify-end gap-0 border-t p-2">
			<Text className="text-xs">
				{/* Only print a denominator something vouches for — see QueryBinding.total$. */}
				{total === null
					? t('common.showing_n', { shown: count.toLocaleString() })
					: t('common.showing_of', {
							shown: count.toLocaleString(),
							total: total.toLocaleString(),
						})}
			</Text>
			<SyncButton sync={sync} clearAndSync={resetQueryAndCollection} active={active} />
		</HStack>
	);
}

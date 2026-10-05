import * as React from 'react';

import { useObservableEagerState, useObservableState } from 'observable-hooks';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../../contexts/translations';
import { useQueryStateActions } from '../../../../../query';
import { TaxBasedOn } from '../../../components/product/tax-based-on';
import { SyncButton } from '../../../components/sync-button';
import { useTaxSettings } from '../../../contexts/tax-rates';
import { useCollectionReset } from '../../../hooks/use-collection-reset';

import type { BindingDataTableFooterProps } from '../../../components/data-table/footer';

export function ProductsFooter({
	collectionName,
	active$,
	total$,
	sync,
	count,
	children,
}: BindingDataTableFooterProps) {
	const loading = useObservableEagerState(active$);
	const total = useObservableState(total$, null);
	const { calcTaxes } = useTaxSettings();
	const { clearAndSync } = useCollectionReset(collectionName);
	const actions = useQueryStateActions();
	const t = useT();
	return (
		// Same caption row as the data-table footer: on the ground, no rule, card-aligned text.
		<HStack className="min-h-ctl items-center px-5">
			{/* Keep the tax label shrinkable and counts at their natural width. */}
			<HStack className="min-w-0 flex-1 *:min-w-0 *:flex-1">
				{children ?? (calcTaxes ? <TaxBasedOn /> : null)}
			</HStack>
			<HStack className="shrink-0 gap-0">
				{/* No denominator unless binding.total$ vouches for one; hidden markers stay raw. */}
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

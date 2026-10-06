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

type ProductsFooterProps = BindingDataTableFooterProps & {
	/**
	 * A total the caller already holds as state (the browse root's, attributed to its query):
	 * shown in the SAME commit as `count`. A total handed as a stream lands one commit late —
	 * `useObservableState` keeps its state across the stream's identity change and subscribes to
	 * the replacement after commit — so a return to the root with a changed catalogue painted the
	 * new count over the old denominator for a frame. `total$` is still read (hooks run
	 * unconditionally) and ignored while this is given.
	 */
	total?: number | null;
};

export function ProductsFooter({
	collectionName,
	active$,
	total$,
	sync,
	count,
	children,
	total: heldTotal,
}: ProductsFooterProps) {
	const loading = useObservableEagerState(active$);
	const streamTotal = useObservableState(total$, null);
	const total = heldTotal !== undefined ? heldTotal : streamTotal;
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

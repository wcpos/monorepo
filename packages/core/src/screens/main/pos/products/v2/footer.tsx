import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../../contexts/translations';
import { useQueryStateActions } from '../../../../../query';
import { TaxBasedOn } from '../../../components/product/tax-based-on';
import { SyncButton } from '../../../components/sync-button';
import { useTaxSettings } from '../../../contexts/tax-rates';
import { useCollectionReset } from '../../../hooks/use-collection-reset';

import type { DataTableFooterProps } from '../../../components/data-table/v2/footer';

/** The footer contract every table footer takes (`DataTableFooterProps`): values only. */
export type ProductsFooterProps = DataTableFooterProps;

/**
 * The products caption row, values in: the table hands them from its handles, a browse level or
 * the variations grid from its own (`HandleProductsFooter`). The tax notice unless given children.
 */
export function ProductsFooter({
	collectionName,
	active: loading,
	total,
	sync,
	count,
	children,
}: ProductsFooterProps) {
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
				{/* No denominator unless the snapshot's total vouches for one; hidden markers stay raw. */}
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

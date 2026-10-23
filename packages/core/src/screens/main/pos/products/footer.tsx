import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { useQueryStateActions } from '../../../../query';
import { TaxBasedOn } from '../../components/product/tax-based-on';
import { SyncButton } from '../../components/sync-button';
import { useTaxSettings } from '../../contexts/tax-rates';
import { useCollectionReset } from '../../hooks/use-collection-reset';

import type { DataTableFooterProps } from '../../components/data-table/footer';

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
	drawnCount,
	children,
}: ProductsFooterProps) {
	const { calcTaxes } = useTaxSettings();
	const { clearAndSync } = useCollectionReset(collectionName);
	const actions = useQueryStateActions();
	const t = useT();
	return (
		// Same caption row as the data-table footer: on the ground, no rule, its content's height (the
		// `xs` sync button, 6 units); its mount aligns the text with the card's cells (`CaptionRowInset`).
		<HStack className="items-center">
			{/* The caption slot fills the row; its child keeps its own width (shrinkable, never grown),
			    so the tax trigger is pressable on its text and icons alone, not across the footer. */}
			<HStack className="min-w-0 flex-1 *:min-w-0 *:shrink">
				{children ?? (calcTaxes ? <TaxBasedOn /> : null)}
			</HStack>
			<HStack className="shrink-0 gap-0">
				{/* No denominator unless the snapshot's total vouches for one; hidden markers stay raw. */}
				<Text testID="data-table-count" className="text-muted-foreground text-sm">
					{total === null
						? t('common.showing_n', { shown: drawnCount.toLocaleString() })
						: t('common.showing_of', {
								shown: drawnCount.toLocaleString(),
								total: total.toLocaleString(),
							})}
				</Text>
				<Text testID="data-table-loaded-count" className="hidden">
					{drawnCount}
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

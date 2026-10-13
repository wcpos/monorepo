import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../../contexts/translations';
import { useQueryStateActions } from '../../../../../query';
import { SyncButton } from '../../sync-button';
import { useCollectionReset } from '../../../hooks/use-collection-reset';

import type { CollectionKey } from '../../../hooks/use-collection';

/**
 * What a table footer is handed: VALUES, read by its owner from the query handles in the same
 * commit as the rows it counts. A stream's value lands one commit after the rows, and the footer
 * printed the new count over the old denominator for a frame; no footer subscribes to one.
 */
export type DataTableFooterProps = {
	collectionName: CollectionKey;
	/** The rows drawn. */
	count: number;
	/** The engine is pulling the collection now (the live handle's `active`): the sync button turns. */
	active: boolean;
	/** The drawn rows' denominator, or null when nothing vouches for one ("Showing N"). */
	total: number | null;
	sync: () => Promise<void>;
	children?: React.ReactNode;
};

/** The table's caption row: values in, read by the table from its handles (`DataTableFooterProps`). */
export function DataTableFooter({
	collectionName,
	active: loading,
	total,
	sync,
	count,
	children,
}: DataTableFooterProps) {
	const { clearAndSync } = useCollectionReset(collectionName);
	const actions = useQueryStateActions();
	const t = useT();
	return (
		// A caption row on the ground under the card: no rule of its own, text aligned with the
		// card's cell padding (gutter 8 + cell 12).
		<HStack testID="data-table-caption-row" className="min-h-ctl items-center px-5">
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

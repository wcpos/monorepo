import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

import { rateCount } from './rate-rows';
import { useT } from '../../../contexts/translations';
import { useQueryHandleFields, useQueryStateActions } from '../../../query';
import { SyncButton } from '../components/sync-button';
import { useCollectionReset } from '../hooks/use-collection-reset';

import type { QueryHandle } from '../../../query';

type TaxRatesFooterProps = {
	/** The store total across classes, not one tab's rows. */
	count: number;
	/** The live handle the modal owns: the sync button acts on it and spins with it. */
	handle: QueryHandle;
	/** The handle whose rates are drawn, so the total describes the `count` beside it. */
	shown: QueryHandle;
};

/**
 * The left slot of the panel's one bottom bar (Close is the right): the count and the sync
 * button. It renders inside the `DialogFooter`; there is no second bar.
 */
export function TaxRatesFooter({ count, handle, shown }: TaxRatesFooterProps) {
	const { clearAndSync } = useCollectionReset('taxes');
	const { clearSearch, resetFilters } = useQueryStateActions<'tax-rates'>();
	const resetQueryAndCollection = React.useCallback(() => {
		clearSearch();
		resetFilters();
		return clearAndSync();
	}, [clearAndSync, clearSearch, resetFilters]);
	const { active } = useQueryHandleFields(handle, ['active']);
	const { ready, total } = useQueryHandleFields(shown, ['total']);
	// Only print a denominator something vouches for: nothing does before the read has
	// answered, and `total` is null when nothing vouches for one.
	const vouched = ready ? total : null;
	const t = useT();

	return (
		<HStack className="gap-1">
			<Text className="text-muted-foreground text-sm">{rateCount(count, vouched, t)}</Text>
			<SyncButton sync={handle.sync} clearAndSync={resetQueryAndCollection} active={active} />
		</HStack>
	);
}

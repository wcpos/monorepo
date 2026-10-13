import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../contexts/translations';
import { useQueryHandleFields, useQueryStateActions } from '../../../query';
import { SyncButton } from '../components/sync-button';
import { useCollectionReset } from '../hooks/use-collection-reset';

import type { QueryHandle } from '../../../query';

type TaxRatesFooterProps = {
	count: number;
	/** The live handle the modal owns: the sync button acts on it and spins with it. */
	handle: QueryHandle;
	/** The handle whose rates are drawn, so the total describes the `count` beside it. */
	shown: QueryHandle;
};

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
		<HStack className="border-border justify-end gap-0 border-t p-2">
			<Text className="text-xs">
				{vouched === null
					? t('common.showing_n', { shown: count.toLocaleString() })
					: t('common.showing_of', {
							shown: count.toLocaleString(),
							total: vouched.toLocaleString(),
						})}
			</Text>
			<SyncButton sync={handle.sync} clearAndSync={resetQueryAndCollection} active={active} />
		</HStack>
	);
}

import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';
import { useIsPhone } from '@wcpos/components/lib/device';
import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';

import { appliesCount, rateCount } from './rate-rows';
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
	/**
	 * Opened from the "Tax based on" panel: how many of the store's rates its address matched,
	 * and that address's country. Null when opened from anywhere else.
	 */
	applies?: { n: number; country: string } | null;
};

/**
 * The left slot of the panel's one bottom bar (Close is the right): the count and the sync
 * button. It renders inside the `DialogFooter`; there is no second bar.
 */
export function TaxRatesFooter({ count, handle, shown, applies }: TaxRatesFooterProps) {
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
	const isPhone = useIsPhone();

	return (
		// Off a phone the footer is a row: this slot takes its free room and wraps the label inside
		// it, so a long count never pushes the sync button out or Close (`shrink-0`) over. A phone
		// stacks the footer, where `basis-0` would collapse the slot to nothing in Yoga's column.
		<HStack className={cn('min-w-0 gap-1', !isPhone && 'shrink grow basis-0')}>
			<Text className="text-muted-foreground min-w-0 shrink text-sm">
				{[
					rateCount(count, vouched, t),
					applies ? appliesCount(applies.n, applies.country, t) : null,
				]
					.filter(Boolean)
					.join(' · ')}
			</Text>
			<SyncButton sync={handle.sync} clearAndSync={resetQueryAndCollection} active={active} />
		</HStack>
	);
}

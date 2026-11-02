import * as React from 'react';

import { Button } from '@wcpos/components/button';
import { ChipRow } from '@wcpos/components/chip-row';

import { useQueryState, useQueryStateActions } from '../../../../query';
import { useT } from '../../../../contexts/translations';
import { DateRangePill } from './date-range-pill';
import { DiscountTypePill } from './discount-type-pill';
import { StatusPill } from './status-pill';

export function FilterBar() {
	const { filters } = useQueryState<'coupons'>();
	const { resetFilters } = useQueryStateActions<'coupons'>();
	const t = useT();
	return (
		<ChipRow>
			<StatusPill />
			<DiscountTypePill />
			<DateRangePill />
			{Object.keys(filters).length >= 2 && (
				<Button variant="ghost" testID="coupons-filter-clear-all" onPress={() => resetFilters()}>
					{t('coupons.clear_all')}
				</Button>
			)}
		</ChipRow>
	);
}

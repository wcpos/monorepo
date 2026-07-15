import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';

import { DateRangePill } from './date-range-pill';
import { DiscountTypePill } from './discount-type-pill';
import { StatusPill } from './status-pill';

export function FilterBar() {
	return (
		<HStack className="w-full flex-wrap">
			<StatusPill />
			<DiscountTypePill />
			<DateRangePill />
		</HStack>
	);
}

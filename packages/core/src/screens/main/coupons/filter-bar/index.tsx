import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';
import type { Query } from '@wcpos/query';

import { DateRangePill } from './date-range-pill';
import { DiscountTypePill } from './discount-type-pill';
import { StatusPill } from './status-pill';

type CouponCollection = import('@wcpos/database').CouponCollection;

interface Props {
	query: Query<CouponCollection>;
}

export function FilterBar({ query }: Props) {
	return (
		<HStack className="w-full flex-wrap">
			<StatusPill query={query} />
			<DiscountTypePill query={query} />
			<DateRangePill query={query} />
		</HStack>
	);
}

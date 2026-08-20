import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { NO_USAGE_LIMIT } from '../../components/coupon/usage-limit';

export function Usage({ row }: CellContext<{ record: EngineRecord<'coupons'> }, 'usage_count'>) {
	const fields = useRecordField(row.original.record, ({ payload }) => ({
		usageCount: payload.usage_count ?? 0,
		usageLimit: payload.usage_limit,
	}));

	// A limit of 0 means "no limit" (same as null) — WooCommerce stores a cleared limit as 0
	// and coupon-validation.ts treats `usage_limit > 0` as the only real limit. Only render
	// "count / limit" for a positive limit; this also covers the offline/optimistic window
	// before the server echoes the cleared value back as null.
	const hasLimit = fields.usageLimit != null && fields.usageLimit > NO_USAGE_LIMIT;
	const display = hasLimit
		? `${fields.usageCount} / ${fields.usageLimit}`
		: String(fields.usageCount);

	return <Text className="text-center">{display}</Text>;
}

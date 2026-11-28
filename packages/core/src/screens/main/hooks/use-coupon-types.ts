import * as React from 'react';

import { useDocField } from '@wcpos/query';

import { ExtraDataContext } from '../contexts/extra-data/context';

/** Store-credit contract §(a) (coupon types a plugin declares): a missing or bad declaration means today's refusal. */
export function storeCalculatedCouponTypes(value: unknown): ReadonlySet<string> {
	const types = new Set<string>();
	if (!value || typeof value !== 'object') return types;
	const envelope = value as { schema?: unknown; coupon_types?: unknown };
	if (envelope.schema !== 1 || !Array.isArray(envelope.coupon_types)) return types;
	for (const entry of envelope.coupon_types) {
		if (!entry || typeof entry !== 'object') continue;
		const { type, calc, offline } = entry;
		if (
			typeof type === 'string' &&
			type !== '' &&
			!['percent', 'fixed_cart', 'fixed_product'].includes(type) &&
			calc === 'store' &&
			offline === 'none'
		) {
			types.add(type);
		}
	}
	return types;
}

export function useStoreCalculatedCouponTypes(): ReadonlySet<string> {
	const context = React.useContext(ExtraDataContext);
	const value = useDocField(context?.extraData ?? null, (document) => document.couponTypes);
	return React.useMemo(() => storeCalculatedCouponTypes(value), [value]);
}

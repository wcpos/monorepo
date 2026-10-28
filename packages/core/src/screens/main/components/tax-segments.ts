import * as React from 'react';

import type { Segment } from '@wcpos/components/segmented-control';

import { useT } from '../../../contexts/translations';

/** Woo's two-way tax choices as `FormSegmentedControl` segments; the values are the wire slugs. */
export function useTaxSegments() {
	const t = useT();
	return React.useMemo(() => {
		const two = (...pairs: [string, string][]) =>
			pairs.map(([value, key]) => ({ value, label: t(key) })) as [Segment, Segment];
		return {
			status: two(['taxable', 'common.taxable'], ['none', 'common.none']),
			display: two(['single', 'common.as_a_single_total'], ['itemized', 'common.itemized']),
			inclExcl: two(['incl', 'common.including_tax'], ['excl', 'common.excluding_tax']),
		};
	}, [t]);
}

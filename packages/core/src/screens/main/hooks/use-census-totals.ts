import * as React from 'react';

import { useQueryRuntime } from '@wcpos/query';
import type { CensusTotals } from '@wcpos/sync-engine';

const EMPTY_CENSUS_TOTALS: CensusTotals = {
	orders: null,
	products: null,
	variations: null,
	customers: null,
	taxRates: null,
	categories: null,
	brands: null,
	tags: null,
	coupons: null,
};

export function useCensusTotals(): CensusTotals {
	const { engine } = useQueryRuntime();
	const [totals, setTotals] = React.useState<CensusTotals>(EMPTY_CENSUS_TOTALS);

	React.useEffect(() => {
		// The engine census is an external subscription and must follow the active engine lifecycle.
		return engine.censusChanges(setTotals);
	}, [engine]);

	return totals;
}

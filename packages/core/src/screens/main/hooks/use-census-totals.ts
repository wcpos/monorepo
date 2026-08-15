import * as React from 'react';

import { useQueryRuntime } from '@wcpos/query';
import { type CensusTotals, SYNC_COLLECTION_NAMES } from '@wcpos/sync-engine';

const EMPTY_CENSUS_TOTALS = Object.fromEntries(
	SYNC_COLLECTION_NAMES.map((name) => [name, null])
) as CensusTotals;

export function useCensusTotals(): CensusTotals {
	const { engine } = useQueryRuntime();
	const [totals, setTotals] = React.useState<CensusTotals>(EMPTY_CENSUS_TOTALS);

	React.useEffect(() => {
		// The engine census is an external subscription and must follow the active engine lifecycle.
		return engine.censusChanges(setTotals);
	}, [engine]);

	return totals;
}

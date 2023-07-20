import * as React from 'react';

import groupBy from 'lodash/groupBy';
import { useObservableSuspense } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Tabs from '@wcpos/components/src/tabs';

import TaxRatesFooter from './footer';
import TaxRateTable from './rate-table';
import { useTaxRates } from '../contexts/tax-rates';

/**
 *
 */
export const TaxRatesTabs = () => {
	const [index, setIndex] = React.useState(0);
	const { resource } = useTaxRates();
	const rates = useObservableSuspense(resource);

	/**
	 *
	 */
	const routes = React.useMemo(() => {
		const ratesByClass = groupBy(rates, 'class');
		const defaultOrder = ['standard', 'reduced-rate', 'zero-rate'];

		// sort by default order
		const sortedGroupedTaxRates = [];

		// For each class in the default order, if it exists in the groups, add it to the sorted groups
		defaultOrder.forEach((taxClass) => {
			if (ratesByClass[taxClass]) {
				sortedGroupedTaxRates.push({
					class: taxClass,
					rates: ratesByClass[taxClass],
				});
				delete ratesByClass[taxClass];
			}
		});

		// For each remaining group, add it to the sorted groups
		for (const taxClass in ratesByClass) {
			sortedGroupedTaxRates.push({
				class: taxClass,
				rates: ratesByClass[taxClass],
			});
		}

		// now create the tabs
		return sortedGroupedTaxRates.map((group) => ({
			key: group.class,
			title: group.class,
			Component: <TaxRateTable rates={group.rates} />,
		}));
	}, [rates]);

	/**
	 *
	 */
	const renderScene = React.useCallback(({ route }) => {
		return <Box paddingTop="small">{route.Component}</Box>;
	}, []);

	/**
	 * TODO - add empty state
	 */
	return (
		<Box space="large">
			{Array.isArray(rates) && rates.length > 0 ? (
				<Tabs
					navigationState={{
						index,
						routes,
					}}
					renderScene={renderScene}
					onIndexChange={setIndex}
				/>
			) : null}
			<TaxRatesFooter count={rates.length} />
		</Box>
	);
};

export default TaxRatesTabs;

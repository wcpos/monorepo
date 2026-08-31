import * as React from 'react';

import get from 'lodash/get';
import groupBy from 'lodash/groupBy';
import { useObservableSuspense } from 'observable-hooks';

import { Suspense } from '@wcpos/components/suspense';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import type { EngineRecord } from '@wcpos/query';
import { useDocField } from '@wcpos/query';

import { TaxRatesFooter } from './footer';
import { TaxRateTable } from './rate-table';
import { useCollectionBinding, useQueryState } from '../../../query';
import { useExtraData } from '../contexts/extra-data';

import type { TaxRateData } from '../contexts/tax-rates';

interface TaxClass {
	name: string;
	slug: string;
}

interface QueryResult {
	hits: { record: EngineRecord<'taxRates'> }[];
}

type TaxRatesBinding = ReturnType<typeof useCollectionBinding<'tax-rates'>>;

/**
 *
 */
/** Creator above, reader below its own boundary — see `tax-rates.tsx` for why. */
export function TaxRatesTabs() {
	const state = useQueryState<'tax-rates'>();
	const binding = useCollectionBinding('tax-rates', state);

	return (
		<Suspense>
			<TaxRatesTabsContent binding={binding} />
		</Suspense>
	);
}

function TaxRatesTabsContent({ binding }: { binding: TaxRatesBinding }) {
	const result = useObservableSuspense(binding.resource) as QueryResult;
	const rates = result.hits.map((hit) => hit.record.payload);
	const { extraData } = useExtraData();
	const taxClasses = useDocField(extraData, (value) => value.taxClasses) as TaxClass[] | undefined;
	const [value, setValue] = React.useState(get(taxClasses, [0, 'slug'], ''));

	/**
	 *
	 */
	const grouped = React.useMemo(() => {
		const ratesByClass = groupBy(rates, 'class');

		return (taxClasses || []).map((taxClass: TaxClass) => ({
			name: taxClass.name,
			slug: taxClass.slug,
			rates: ratesByClass[taxClass.slug] || [],
		}));
	}, [rates, taxClasses]);

	/**
	 * TODO - add empty state
	 */
	return (
		<>
			<Tabs value={value} onValueChange={setValue}>
				<TabsList className="w-full flex-row">
					{grouped.map((group: { slug: string; name: string; rates: TaxRateData[] }) => (
						<TabsTrigger key={group.slug} value={group.slug}>
							<Text>{group.name}</Text>
						</TabsTrigger>
					))}
				</TabsList>
				{grouped.map((group: { slug: string; name: string; rates: TaxRateData[] }) => (
					<TabsContent key={group.slug} value={group.slug}>
						<TaxRateTable rates={group.rates} />
					</TabsContent>
				))}
			</Tabs>
			<TaxRatesFooter
				count={rates.length}
				active$={binding.active$}
				total$={binding.total$}
				sync={binding.sync}
			/>
		</>
	);
}

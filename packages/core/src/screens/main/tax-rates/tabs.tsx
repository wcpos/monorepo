import * as React from 'react';

import get from 'lodash/get';
import groupBy from 'lodash/groupBy';
import { useObservableEagerState, useObservableSuspense } from 'observable-hooks';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import type { Query } from '@wcpos/query';

import { TaxRatesFooter } from './footer';
import { TaxRateTable } from './rate-table';
import { useExtraData } from '../contexts/extra-data';

import type { Observable } from 'rxjs';

type TaxRateDocument = import('@wcpos/database').TaxRateDocument;

interface TaxClass {
	name: string;
	slug: string;
}

interface QueryResult {
	hits: { document: TaxRateDocument }[];
}

interface TaxRatesTabsProps {
	query: Query<import('rxdb').RxCollection>;
}

/**
 *
 */
export const TaxRatesTabs = ({ query }: TaxRatesTabsProps) => {
	const result = useObservableSuspense(query.resource) as QueryResult;
	const rates = result.hits.map(({ document }: { document: TaxRateDocument }) => document);
	const { extraData } = useExtraData();
	const taxClasses = useObservableEagerState(
		(extraData as unknown as Record<string, Observable<TaxClass[]>>).taxClasses$
	);
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
					{grouped.map((group: { slug: string; name: string; rates: TaxRateDocument[] }) => (
						<TabsTrigger key={group.slug} value={group.slug}>
							<Text>{group.name}</Text>
						</TabsTrigger>
					))}
				</TabsList>
				{grouped.map((group: { slug: string; name: string; rates: TaxRateDocument[] }) => (
					<TabsContent key={group.slug} value={group.slug}>
						<TaxRateTable rates={group.rates} />
					</TabsContent>
				))}
			</Tabs>
			<TaxRatesFooter count={rates.length} query={query} />
		</>
	);
};

export default TaxRatesTabs;

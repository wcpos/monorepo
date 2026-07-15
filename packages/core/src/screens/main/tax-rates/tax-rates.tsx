import * as React from 'react';

import get from 'lodash/get';
import groupBy from 'lodash/groupBy';
import { useObservableEagerState, useObservableSuspense } from 'observable-hooks';

import {
	Modal,
	ModalBody,
	ModalClose,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalTitle,
} from '@wcpos/components/modal';
import { ScrollableTabsList, Tabs, TabsContent, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';

import { TaxRatesFooter } from './footer';
import { TaxRateTable } from './rate-table';
import { useT } from '../../../contexts/translations';
import { useCollectionBinding, useQueryState } from '../../../query';
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

export function TaxRates() {
	const state = useQueryState<'tax-rates'>();
	const binding = useCollectionBinding('tax-rates', state);
	const result = useObservableSuspense(binding.resource) as QueryResult;
	const rates = result.hits.map(({ document }: { document: TaxRateDocument }) => document);
	const { extraData } = useExtraData();
	const taxClasses = useObservableEagerState(
		(extraData as unknown as Record<string, Observable<TaxClass[]>>).taxClasses$
	);
	const [value, setValue] = React.useState(get(taxClasses, [0, 'slug'], ''));
	const t = useT();

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
	 *
	 */
	return (
		<Modal>
			<ModalContent size="2xl">
				<ModalHeader>
					<ModalTitle>
						<Text>{t('tax_rates.tax_rates')}</Text>
					</ModalTitle>
				</ModalHeader>
				<ModalBody>
					<Tabs value={value} onValueChange={setValue} orientation="horizontal">
						<ScrollableTabsList>
							{grouped.map((group: { slug: string; name: string; rates: TaxRateDocument[] }) => (
								<TabsTrigger key={group.slug} value={group.slug}>
									<Text>{group.name}</Text>
								</TabsTrigger>
							))}
						</ScrollableTabsList>
						{grouped.map((group: { slug: string; name: string; rates: TaxRateDocument[] }) => (
							<TabsContent key={group.slug} value={group.slug}>
								<TaxRateTable rates={group.rates} />
							</TabsContent>
						))}
					</Tabs>
					<TaxRatesFooter
						count={rates.length}
						active$={binding.active$}
						total$={binding.total$}
						totalSource$={binding.totalSource$}
						sync={binding.sync}
					/>
				</ModalBody>
				<ModalFooter>
					<ModalClose>{t('common.close')}</ModalClose>
				</ModalFooter>
			</ModalContent>
		</Modal>
	);
}

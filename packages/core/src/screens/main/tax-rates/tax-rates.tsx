import * as React from 'react';

import get from 'lodash/get';
import groupBy from 'lodash/groupBy';
import { useObservableSuspense } from 'observable-hooks';

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
import type { EngineRecord } from '@wcpos/query';
import { useDocField } from '@wcpos/query';

import { TaxRatesFooter } from './footer';
import { TaxRateTable } from './rate-table';
import { useT } from '../../../contexts/translations';
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

export function TaxRates() {
	const state = useQueryState<'tax-rates'>();
	const binding = useCollectionBinding('tax-rates', state);
	const result = useObservableSuspense(binding.resource) as QueryResult;
	const rates = result.hits.map((hit) => hit.record.payload);
	const { extraData } = useExtraData();
	const taxClasses = useDocField(extraData, (value) => value.taxClasses) as TaxClass[] | undefined;
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
							{grouped.map((group: { slug: string; name: string; rates: TaxRateData[] }) => (
								<TabsTrigger key={group.slug} value={group.slug}>
									<Text>{group.name}</Text>
								</TabsTrigger>
							))}
						</ScrollableTabsList>
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
				</ModalBody>
				<ModalFooter>
					<ModalClose>{t('common.close')}</ModalClose>
				</ModalFooter>
			</ModalContent>
		</Modal>
	);
}

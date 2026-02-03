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
import { useExtraData } from '../contexts/extra-data';

interface Props {
	query: any;
}

export const TaxRates = ({ query }: Props) => {
	const result = useObservableSuspense(query.resource);
	const rates = result.hits.map(({ document }) => document);
	const { extraData } = useExtraData();
	const taxClasses = useObservableEagerState(extraData.taxClasses$);
	const [value, setValue] = React.useState(get(taxClasses, [0, 'slug'], ''));
	const t = useT();

	/**
	 *
	 */
	const grouped = React.useMemo(() => {
		const ratesByClass = groupBy(rates, 'class');

		return (taxClasses || []).map((taxClass) => ({
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
						<Text>{t('Tax Rates')}</Text>
					</ModalTitle>
				</ModalHeader>
				<ModalBody>
					<Tabs value={value} onValueChange={setValue} orientation="horizontal">
						<ScrollableTabsList>
							{grouped.map((group) => (
								<TabsTrigger key={group.slug} value={group.slug}>
									<Text>{group.name}</Text>
								</TabsTrigger>
							))}
						</ScrollableTabsList>
						{grouped.map((group) => (
							<TabsContent key={group.slug} value={group.slug}>
								<TaxRateTable rates={group.rates} />
							</TabsContent>
						))}
					</Tabs>
					<TaxRatesFooter count={rates.length} query={query} />
				</ModalBody>
				<ModalFooter>
					<ModalClose>{t('Close')}</ModalClose>
				</ModalFooter>
			</ModalContent>
		</Modal>
	);
};

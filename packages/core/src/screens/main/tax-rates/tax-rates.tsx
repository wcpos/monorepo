import * as React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';
import groupBy from 'lodash/groupBy';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import {
	Dialog,
	DialogBody,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { ScrollableTabsList, Tabs, TabsContent, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import type { EngineRecord, QueryHandle } from '@wcpos/query';
import { useDocField } from '@wcpos/query';

import { TaxRatesFooter } from './footer';
import { TaxRateTable } from './rate-table';
import { useT } from '../../../contexts/translations';
import {
	useCollectionQueryHandle,
	useDrawnHandle,
	useQuerySnapshot,
	useQueryState,
} from '../../../query';
import { useExtraData } from '../contexts/extra-data';

import type { TaxRateData } from '../contexts/tax-rates';

interface TaxClass {
	name: string;
	slug: string;
}

interface QueryResult {
	hits: { record: EngineRecord<'taxRates'> }[];
}

/**
 * The handle is acquired HERE; the reader below sits inside its own `Suspense`. The owner's
 * retain is an effect, so it must commit for the read to start: an owner that also read would
 * suspend uncommitted, nothing would retain the handle, and the fallback would never leave.
 * Identity by key holds only once a handle has started, so that would hide wherever another
 * owner holds the key (the POS tax provider holds this Tier-0 key): the reader would get the
 * started handle. The modal's boundary in `index.tsx` is above this component and its reset
 * cannot reach the handle, so the error boundary is ours.
 */
export function TaxRates() {
	const state = useQueryState<'tax-rates'>();
	const handle = useCollectionQueryHandle('tax-rates', state);

	return (
		<ErrorBoundary onReset={() => handle.retry()} resetKeys={[handle]}>
			<Suspense>
				<TaxRatesContent handle={handle} />
			</Suspense>
		</ErrorBoundary>
	);
}

function TaxRatesContent({ handle }: { handle: QueryHandle }) {
	// A changed handle (a scope bump from clear-and-sync) keeps the current rates on screen
	// until it answers, instead of swapping the revealed modal for its fallback.
	const shown = useDrawnHandle(handle);
	// The answer only: the footer reads `active` and `total` itself.
	const result = useQuerySnapshot(shown, []).result as QueryResult;
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
		<Dialog route>
			<DialogContent side="right" size="2xl">
				<DialogHeader>
					<DialogTitle>
						<Text>{t('tax_rates.tax_rates')}</Text>
					</DialogTitle>
				</DialogHeader>
				<View className="min-h-0 flex-1">
					<Tabs
						className="min-h-0 flex-1"
						value={value}
						onValueChange={setValue}
						orientation="horizontal"
					>
						<ScrollableTabsList className="mx-4 flex-row">
							{grouped.map((group: { slug: string; name: string; rates: TaxRateData[] }) => (
								<TabsTrigger key={group.slug} value={group.slug}>
									<Text>{group.name}</Text>
								</TabsTrigger>
							))}
						</ScrollableTabsList>
						{grouped.map((group: { slug: string; name: string; rates: TaxRateData[] }) => (
							<TabsContent key={group.slug} value={group.slug} className="min-h-0 flex-1">
								<DialogBody>
									<TaxRateTable rates={group.rates} />
								</DialogBody>
							</TabsContent>
						))}
					</Tabs>
					<TaxRatesFooter count={rates.length} handle={handle} shown={shown} />
				</View>
				<DialogFooter>
					<DialogClose>{t('common.close')}</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

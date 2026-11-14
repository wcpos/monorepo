import * as React from 'react';
import { View } from 'react-native';

import { useLocalSearchParams } from 'expo-router';
import get from 'lodash/get';
import groupBy from 'lodash/groupBy';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { useIsPhone } from '@wcpos/components/lib/device';
import {
	ScrollableTabsList,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import type { EngineRecord, QueryHandle } from '@wcpos/query';
import { useDocField } from '@wcpos/query';

import { TaxRatesFooter } from './footer';
import { isApplied, matchedRateIds, parseAppliesAddress } from './rate-rows';
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
	// Sent by the "Tax based on" panel's View all: the address tax is based on. The marks are
	// matched here against the CURRENT rates, so a sync or a clear-and-refresh re-evaluates them.
	const params = useLocalSearchParams<{
		applies?: string;
		country?: string;
		state?: string;
		city?: string;
		postcode?: string;
	}>();
	// Keyed on the fields, not on the params object's identity.
	const { applies: sent, country, state, city, postcode } = params;
	const address = React.useMemo(
		() => parseAppliesAddress({ applies: sent, country, state, city, postcode }),
		[sent, country, state, city, postcode]
	);
	const appliesTo = React.useMemo(
		() => (address ? matchedRateIds(rates, address) : null),
		[rates, address]
	);
	const applies =
		address && appliesTo
			? {
					n: rates.filter((rate) => isApplied(appliesTo, rate)).length,
					country: address.country,
				}
			: null;

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

	const isPhone = useIsPhone();
	const triggers = grouped.map((group) => (
		<TabsTrigger
			key={group.slug}
			value={group.slug}
			label={`${group.name} ${group.rates.length}`}
			className="gap-1"
		>
			<Text>{group.name}</Text>
			{/* The count is its own Text, outside the class name, and stays quiet on the active tab. */}
			<Text className="text-muted-foreground font-normal tabular-nums">{group.rates.length}</Text>
		</TabsTrigger>
	));

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
						{isPhone ? (
							// A phone folds the strip into a Select; `label` is what its options read.
							<View className="mx-4">
								<TabsList asSelect testID="tax-rates-class-select">
									{triggers}
								</TabsList>
							</View>
						) : (
							// Scroll arrows for a store with more classes than the panel is wide.
							<ScrollableTabsList
								className="mx-4 flex-row"
								previousLabel={t('common.previous_tab')}
								nextLabel={t('common.next_tab')}
							>
								{triggers}
							</ScrollableTabsList>
						)}
						{grouped.map((group: { slug: string; name: string; rates: TaxRateData[] }) => (
							<TabsContent key={group.slug} value={group.slug} className="min-h-0 flex-1">
								<DialogBody>
									<TaxRateTable rates={group.rates} appliesTo={appliesTo} />
								</DialogBody>
							</TabsContent>
						))}
					</Tabs>
				</View>
				{/* One bottom bar: the count and sync left, Close right (a phone stacks it, Close on top). */}
				<DialogFooter
					close
					aside={
						<TaxRatesFooter
							shownCount={rates.length}
							handle={handle}
							shown={shown}
							applies={applies}
						/>
					}
				/>
			</DialogContent>
		</Dialog>
	);
}

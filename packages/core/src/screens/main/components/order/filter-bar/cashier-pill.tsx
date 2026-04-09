import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import {
	Combobox,
	ComboboxContent,
	ComboboxInput,
	ComboboxTrigger,
} from '@wcpos/components/combobox';
import { Suspense } from '@wcpos/components/suspense';
import type { CustomerCollection, CustomerDocument } from '@wcpos/database';
import { Query, useQuery } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { useT } from '../../../../../contexts/translations';
import { useCustomerNameFormat } from '../../../hooks/use-customer-name-format';
import { CustomerList } from '../../customer-select';
import { getSelectedPillState } from './selected-pill-state';

const uiLogger = getLogger(['wcpos', 'ui', 'filter']);
const CASHIER_FILTER_DEBUG_TAG = '[cashier-filter-debug]';

interface CashierPillProps {
	query: Query<CustomerCollection>;
	resource: ObservableResource<CustomerDocument>;
	cashierID?: number;
}

type CashierWithLoadingMarker = CustomerDocument & { __isLoading?: boolean };

/**
 * Cashier Search
 */
function CashierSearch() {
	const t = useT();
	const [search, setSearch] = React.useState('');

	/**
	 * Query for cashiers
	 */
	const query = useQuery({
		queryKeys: ['customers', 'cashier-select'],
		collectionName: 'customers',
		initialParams: {
			sort: [{ last_name: 'asc' }],
			selector: {
				role: { $in: ['administrator', 'shop_manager', 'cashier'] },
			},
		},
		greedy: true,
	});

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(value: string) => {
			setSearch(value);
			query?.debouncedSearch(value);
		},
		[query]
	);

	/**
	 *
	 */
	return (
		<>
			<ComboboxInput
				placeholder={t('common.search_cashiers')}
				value={search}
				onChangeText={onSearch}
			/>
			<Suspense>
				<CustomerList query={query} withGuest={false} />
			</Suspense>
		</>
	);
}

/**
 *
 */
export function CashierPill({ query, resource, cashierID }: CashierPillProps) {
	let cashier = useObservableSuspense(resource);
	const { format } = useCustomerNameFormat();
	const t = useT();
	const isCashierLoading = (cashier as CashierWithLoadingMarker | null)?.__isLoading;

	React.useEffect(() => {
		uiLogger.info(`${CASHIER_FILTER_DEBUG_TAG} cashier pill state`, {
			context: {
				cashierID,
				selectedCashier: query.getMetaDataElemMatchValue('_pos_user'),
				selectedStore: query.getMetaDataElemMatchValue('_pos_store'),
				selector: query.currentRxQuery?.mangoQuery?.selector,
			},
		});
	}, [cashierID, query]);

	/**
	 * @FIXME - if the customers are cleared, it's possible that the cashier will be null
	 */
	if (!cashier && cashierID) {
		cashier = { id: cashierID } as CustomerDocument;
	}

	const pillState = getSelectedPillState({
		selectedID: cashierID,
		entity: cashier,
		isLoading: !!isCashierLoading,
	});

	const handleRemove = React.useCallback(() => {
		uiLogger.info(`${CASHIER_FILTER_DEBUG_TAG} cashier remove pressed`, {
			context: {
				cashierID,
				beforeSelector: query.currentRxQuery?.mangoQuery?.selector,
			},
		});

		query.removeElemMatch('meta_data', { key: '_pos_user' }).exec();

		uiLogger.info(`${CASHIER_FILTER_DEBUG_TAG} cashier remove applied`, {
			context: {
				cashierIDAfter: query.getMetaDataElemMatchValue('_pos_user'),
				storeIDAfter: query.getMetaDataElemMatchValue('_pos_store'),
				afterSelector: query.currentRxQuery?.mangoQuery?.selector,
			},
		});
	}, [cashierID, query]);

	/**
	 * value is always a string when dealing with comboboxes
	 *
	 * @NOTE - meta_data is used for _pos_user and _pos_store, so we need multipleElemMatch
	 */
	return (
		<Combobox
			onValueChange={(option) => {
				if (!option) return;
				uiLogger.debug('value', { context: { value: option.value } });
				query
					.removeElemMatch('meta_data', { key: '_pos_user' }) // clear any previous value
					.where('meta_data')
					.multipleElemMatch({ key: '_pos_user', value: String(option.value) })
					.exec();
			}}
		>
			<ComboboxTrigger asChild>
				<ButtonPill
					size="xs"
					leftIcon="userCrown"
					variant={pillState.isActive ? undefined : 'muted'}
					removable={pillState.isActive}
					onRemove={handleRemove}
				>
					<ButtonText>
						{pillState.isLoading
							? t('common.loading')
							: pillState.entity
								? format(pillState.entity)
								: t('common.select_cashier')}
					</ButtonText>
				</ButtonPill>
			</ComboboxTrigger>
			<ComboboxContent>
				<CashierSearch />
			</ComboboxContent>
		</Combobox>
	);
}

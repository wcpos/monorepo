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

import { useT } from '../../../../../contexts/translations';
import { useCustomerNameFormat } from '../../../hooks/use-customer-name-format';
import { CustomerList } from '../../customer-select';

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
	const isActive = cashierID !== null && cashierID !== undefined;

	/**
	 * @FIXME - if the customers are cleared, it's possible that the cashier will be null
	 */
	if (!cashier && isActive) {
		cashier = { id: cashierID } as CustomerDocument;
	}
	const cashierEntity = isActive ? cashier : null;
	const isLoading = isActive && !!isCashierLoading;

	const handleRemove = React.useCallback(() => {
		query.removeElemMatch('meta_data', { key: '_pos_user' }).exec();
	}, [query]);

	/**
	 * value is always a string when dealing with comboboxes
	 *
	 * @NOTE - meta_data is used for _pos_user and _pos_store, so we need multipleElemMatch
	 */
	return (
		<Combobox
			onValueChange={(option) => {
				if (!option) return;
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
					variant={isActive ? undefined : 'muted'}
					removable={isActive}
					onRemove={handleRemove}
				>
					<ButtonText>
						{isLoading
							? t('common.loading')
							: cashierEntity
								? format(cashierEntity)
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

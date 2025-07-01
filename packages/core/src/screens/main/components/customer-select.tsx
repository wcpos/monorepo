import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { Avatar } from '@wcpos/components/avatar';
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
	ComboboxTrigger,
	ComboboxValue,
	useComboboxRootContext,
} from '@wcpos/components/combobox';
import type { ComboboxRootProps } from '@wcpos/components/combobox';
import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { CustomerCollection, CustomerDocument } from '@wcpos/database';
import { useQuery } from '@wcpos/query';

import { useT } from '../../../contexts/translations';

export function CustomerSelect({
	withGuest,
	disabled,
	...props
}: ComboboxRootProps & { withGuest?: boolean }) {
	const t = useT();

	/**
	 *
	 */
	return (
		<Combobox {...props}>
			<ComboboxTrigger disabled={disabled}>
				<ComboboxValue placeholder={t('Select Customer', { _tags: 'core' })} />
			</ComboboxTrigger>
			<ComboboxContent>
				<CustomerSearch withGuest={withGuest} />
			</ComboboxContent>
		</Combobox>
	);
}

export function CustomerSearch({ withGuest = false }: { withGuest?: boolean }) {
	const t = useT();
	const [search, setSearch] = React.useState('');

	/**
	 * Query for cashiers
	 */
	const query = useQuery({
		queryKeys: ['customers', 'customer-select'],
		collectionName: 'customers',
		initialParams: {
			sort: [{ last_name: 'asc' }],
		},
		infiniteScroll: true,
	});

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(value: string) => {
			setSearch(value);
			query.debouncedSearch(value);
		},
		[query]
	);

	/**
	 * Clear the search when unmounting
	 */
	React.useEffect(() => {
		return () => query.search('');
	}, [query]);

	/**
	 *
	 */
	return (
		<>
			<ComboboxInput
				placeholder={t('Search Customers', { _tags: 'core' })}
				value={search}
				onChangeText={onSearch}
			/>
			<Suspense>
				<CustomerList query={query} withGuest={withGuest} />
			</Suspense>
		</>
	);
}

export function CustomerList({ query, withGuest }: { query: any; withGuest: boolean }) {
	const result = useObservableSuspense(query.resource);
	const t = useT();

	/**
	 *
	 */
	const data = React.useMemo(
		() =>
			withGuest
				? [{ id: 'guest', document: { id: 0 } }, ...result.hits.filter((hit) => hit.id !== 'guest')]
				: result.hits,
		[result.hits, withGuest]
	);

	return (
		<ComboboxList
			data={data}
			shouldFilter={false}
			onEndReached={() => {
				if (query?.infiniteScroll) {
					query.loadMore();
				}
			}}
			renderItem={({ item }) => <CustomerSelectItem customer={item.document} />}
			estimatedItemSize={44}
			ListEmptyComponent={
				<ComboboxEmpty>{t('No customers found', { _tags: 'core' })}</ComboboxEmpty>
			}
		/>
	);
}

function CustomerSelectItem({ customer }: { customer: CustomerDocument }) {
	const t = useT();

	if (customer.id === 0) {
		return (
			<HStack className="items-center">
				<Avatar
					source="https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"
					recyclingKey="guest"
				/>
				<Text className="flex-1">{t('Guest', { _tags: 'core' })}</Text>
			</HStack>
		);
	} else {
		return (
			<HStack className="items-start">
				<Avatar source={customer.avatar_url} recyclingKey={customer.uuid} />
				<VStack space="sm">
					<Text>
						{customer.first_name} {customer.last_name}
					</Text>

					<Text className="text-sm">{customer.email}</Text>
					{/* {(customer.billing.company || customer.billing.phone) && (
						<Text className="text-sm">
							{customer.billing.company}{' '}
							{customer.billing.phone ? `• ${customer.billing.phone}` : ''}
						</Text>
					)} */}
				</VStack>
			</HStack>
		);
	}
}

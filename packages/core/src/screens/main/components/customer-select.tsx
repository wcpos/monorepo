import * as React from 'react';

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
} from '@wcpos/components/combobox';
import type { ComboboxRootProps } from '@wcpos/components/combobox';
import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { EngineRecord } from '@wcpos/query';
import { GUEST_CUSTOMER_ID, isGuestCustomer } from '@wcpos/sync-core';

import { useT } from '../../../contexts/translations';
import {
	useDrawnHandle,
	useGuardedExtension,
	useQuerySnapshot,
	useSearchSelect,
} from '../../../query';
import { useCustomerNameFormat } from '../hooks/use-customer-name-format/use-customer-name-format';
import { getCustomerInitials, GuestAvatar } from './user-avatar/customer-avatar';

import type { SearchSelect } from '../../../query';
import type { CustomerData } from '../hooks/use-customer-name-format/helpers';

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
			<ComboboxTrigger testID="customer-select-trigger" disabled={disabled}>
				<ComboboxValue placeholder={t('common.select_customer')} />
			</ComboboxTrigger>
			<ComboboxContent>
				<CustomerSearch withGuest={withGuest} />
			</ComboboxContent>
		</Combobox>
	);
}

export function CustomerSearch({ withGuest = false }: { withGuest?: boolean }) {
	const t = useT();
	const select = useSearchSelect('customer');
	const { setSearch } = select;

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(value: string) => {
			setSearch(value);
		},
		[setSearch]
	);

	/**
	 *
	 */
	return (
		<>
			<ComboboxInput
				placeholder={t('common.search_customers')}
				value={select.search}
				onChangeText={onSearch}
			/>
			<Suspense>
				<CustomerList select={select} withGuest={withGuest} />
			</Suspense>
		</>
	);
}

interface CustomerHit {
	id: string;
	record: EngineRecord<'customers'>;
}

interface CustomerListItem {
	id: string;
	recordUUID: string;
	customer: CustomerData;
}

type CustomerListProps = {
	withGuest: boolean;
	select: SearchSelect;
};

export function CustomerList({ select, withGuest }: CustomerListProps) {
	// Drawn, not live: a typed search's new handle answers while the previous options stay.
	const shown = useDrawnHandle(select.handle);
	const settling = shown !== select.handle;
	const snapshot = useQuerySnapshot(shown, ['pending', 'exhausted']);
	const result = snapshot as unknown as {
		hits: CustomerHit[];
	};
	const t = useT();
	const handleEndReached = useGuardedExtension(
		select.extendLimit,
		result.hits.length,
		select.limit,
		// The rows drawn may be the previous search's: a full old page must not page the new
		// search before its first page answers, so settling counts as pending.
		{ pending: snapshot.pending || settling, exhausted: snapshot.exhausted }
	);

	/**
	 *
	 */
	const data = React.useMemo(() => {
		const customers = result.hits
			.filter((hit: CustomerHit) => hit.id !== 'guest')
			.map(({ id, record }): CustomerListItem => ({
				id,
				recordUUID: record.uuid,
				customer: record.payload,
			}));
		return withGuest
			? [
					{
						id: 'guest',
						recordUUID: 'guest',
						customer: { id: GUEST_CUSTOMER_ID },
					},
					...customers,
				]
			: customers;
	}, [result.hits, withGuest]);

	return (
		<ComboboxList
			data={data as unknown as import('@wcpos/components/combobox').Option[]}
			shouldFilter={false}
			onEndReached={handleEndReached}
			onEndReachedThreshold={0.1}
			renderItem={({ item }) => {
				const hit = item as unknown as CustomerListItem;
				return (
					<ComboboxItem
						testID={`customer-select-option-${
							isGuestCustomer(hit.customer.id) ? 'guest' : hit.customer.id
						}`}
						value={String(hit.customer.id)}
						label={String(hit.customer.id)}
						item={hit.customer}
					>
						<CustomerSelectItem customer={hit.customer} recyclingKey={hit.recordUUID} />
					</ComboboxItem>
				);
			}}
			estimatedItemSize={44}
			ListEmptyComponent={<ComboboxEmpty>{t('common.no_customers_found')}</ComboboxEmpty>}
		/>
	);
}

function CustomerSelectItem({
	customer,
	recyclingKey,
}: {
	customer: CustomerData;
	recyclingKey: string;
}) {
	const t = useT();
	const { format } = useCustomerNameFormat();

	if (isGuestCustomer(customer.id)) {
		return (
			<HStack className="items-center">
				<GuestAvatar />
				<Text className="flex-1">{t('common.guest')}</Text>
			</HStack>
		);
	} else {
		return (
			<HStack className="items-start">
				<Avatar
					source={customer.avatar_url}
					fallback={getCustomerInitials(customer)}
					recyclingKey={recyclingKey}
				/>
				<VStack space="xs">
					<Text>{format(customer)}</Text>

					<Text className="text-secondary text-sm">{customer.email}</Text>
				</VStack>
			</HStack>
		);
	}
}

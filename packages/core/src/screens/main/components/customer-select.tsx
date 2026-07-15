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
} from '@wcpos/components/combobox';
import type { ComboboxRootProps } from '@wcpos/components/combobox';
import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { CustomerDocument } from '@wcpos/database';

import { useT } from '../../../contexts/translations';
import { useSearchSelect } from '../../../query';
import { useCustomerNameFormat } from '../hooks/use-customer-name-format/use-customer-name-format';

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
	const binding = useSearchSelect('customer');

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(value: string) => {
			binding.setSearch(value);
		},
		[binding.setSearch]
	);

	/**
	 *
	 */
	return (
		<>
			<ComboboxInput
				placeholder={t('common.search_customers')}
				value={binding.search}
				onChangeText={onSearch}
			/>
			<Suspense>
				<CustomerList resource={binding.resource} withGuest={withGuest} />
			</Suspense>
		</>
	);
}

interface CustomerHit {
	id: string;
	document: CustomerDocument;
}

type CustomerListProps = {
	withGuest: boolean;
	resource: ReturnType<typeof useSearchSelect>['resource'];
};

export function CustomerList({ resource, withGuest }: CustomerListProps) {
	const result = useObservableSuspense(resource) as { hits: CustomerHit[] };
	const t = useT();

	/**
	 *
	 */
	const data = React.useMemo(
		() =>
			withGuest
				? [
						{ id: 'guest', document: { id: 0 } as CustomerDocument },
						...result.hits.filter((hit: CustomerHit) => hit.id !== 'guest'),
					]
				: result.hits,
		[result.hits, withGuest]
	);

	return (
		<ComboboxList
			data={data as unknown as import('@wcpos/components/combobox').Option[]}
			shouldFilter={false}
			renderItem={({ item }) => {
				const hit = item as unknown as CustomerHit;
				return (
					<ComboboxItem
						value={String(hit.document.id)}
						label={String(hit.document.id)}
						item={hit.document}
					>
						<CustomerSelectItem customer={hit.document} />
					</ComboboxItem>
				);
			}}
			estimatedItemSize={44}
			ListEmptyComponent={<ComboboxEmpty>{t('common.no_customers_found')}</ComboboxEmpty>}
		/>
	);
}

function CustomerSelectItem({ customer }: { customer: CustomerDocument }) {
	const t = useT();
	const { format } = useCustomerNameFormat();

	if (customer.id === 0) {
		return (
			<HStack className="items-center">
				<Avatar
					source="https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"
					recyclingKey="guest"
				/>
				<Text className="flex-1">{t('common.guest')}</Text>
			</HStack>
		);
	} else {
		return (
			<HStack className="items-start">
				<Avatar source={customer.avatar_url} recyclingKey={customer.uuid} />
				<VStack space="xs">
					<Text>{format(customer)}</Text>

					<Text className="text-secondary text-sm">{customer.email}</Text>
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

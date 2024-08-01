import * as React from 'react';

import defaults from 'lodash/defaults';

import { useQuery } from '@wcpos/query';
import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { Command, CommandInput, CommandEmpty } from '@wcpos/tailwind/src/command';
import { Label } from '@wcpos/tailwind/src/label';
import { Popover, PopoverTrigger, PopoverContent } from '@wcpos/tailwind/src/popover';
import { Suspense } from '@wcpos/tailwind/src/suspense';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { CustomerList } from './list';
import { useT } from '../../../../contexts/translations';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

interface CustomerSelectProps {
	onSelectCustomer: (customer: CustomerDocument) => void;
	autoFocus?: boolean;
	value?: CustomerDocument;
	onBlur?: () => void;
	size?: 'small' | 'normal';
	initialParams?: any;
	queryKey?: string;
	placeholder?: string;
	withGuest?: boolean;
	label?: string;
}

/**
 *
 */
export const CustomerSelect = ({
	onSelectCustomer,
	value,
	initialParams,
	queryKey = 'select',
	placeholder,
	withGuest,
	label,
}: CustomerSelectProps) => {
	const t = useT();
	const [search, setSearch] = React.useState('');

	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['customers', queryKey],
		collectionName: 'customers',
		initialParams: defaults(
			{
				sortBy: 'last_name',
				sortDirection: 'asc',
			},
			initialParams
		),
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
	 * Reset search when unmounting
	 */
	React.useEffect(() => {
		return () => {
			onSearch('');
		};
	}, [onSearch]);

	/**
	 *
	 */
	return (
		<VStack>
			{label && <Label nativeID="customer">{label}</Label>}
			<Popover>
				<PopoverTrigger asChild>
					<Button variant="outline">
						<ButtonText>Test</ButtonText>
					</Button>
				</PopoverTrigger>
				<PopoverContent className="p-0">
					<Command shouldFilter={false}>
						<CommandInput
							placeholder={t('Search Customers', { _tags: 'core' })}
							value={search}
							onValueChange={onSearch}
						/>
						<CommandEmpty>{t('No customer found', { _tags: 'core' })}</CommandEmpty>
						<Suspense>
							<CustomerList query={query} onSelect={onSelectCustomer} withGuest={withGuest} />
						</Suspense>
					</Command>
				</PopoverContent>
			</Popover>
		</VStack>
	);
};

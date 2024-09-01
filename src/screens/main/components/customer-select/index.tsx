import * as React from 'react';

import defaults from 'lodash/defaults';

import { Command, CommandInput, CommandEmpty, CommandButton } from '@wcpos/components/src/command';
import { Popover, PopoverTrigger, PopoverContent } from '@wcpos/components/src/popover';
import { Suspense } from '@wcpos/components/src/suspense';
import { Text } from '@wcpos/components/src/text';
import { useQuery } from '@wcpos/query';

import { CustomerList } from './list';
import { useT } from '../../../../contexts/translations';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

interface CustomerSelectProps {
	value?: CustomerDocument;
	onChange?: (customer: CustomerDocument) => void;
	onBlur?: () => void;
	initialParams?: any;
	queryKey?: string;
	placeholder?: string;
	withGuest?: boolean;
	label?: string;
	emit?: 'id' | 'document';
}

/**
 *
 */
export const CustomerSelect = React.forwardRef<HTMLElement, CustomerSelectProps>(
	(
		{
			value,
			onChange,
			initialParams,
			queryKey = 'select',
			placeholder,
			withGuest,
			label,
			emit = 'id',
		},
		ref
	) => {
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
		const handleSelectCustomer = React.useCallback(
			(customer: CustomerDocument) => {
				if (onChange) {
					if (emit === 'id') {
						onChange(customer.id);
					} else {
						onChange(customer);
					}
				}
			},
			[emit, onChange]
		);

		/**
		 *
		 */
		return (
			<Popover>
				<PopoverTrigger asChild>
					<CommandButton>
						<Text>{t('Select Customer', { _tags: 'core' })}</Text>
					</CommandButton>
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
							<CustomerList query={query} onSelect={handleSelectCustomer} withGuest={withGuest} />
						</Suspense>
					</Command>
				</PopoverContent>
			</Popover>
		);
	}
);

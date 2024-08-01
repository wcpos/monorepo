import * as React from 'react';

import defaults from 'lodash/defaults';

import Popover from '@wcpos/components/src/popover';
import { useQuery } from '@wcpos/query';

import Menu from './menu';
import SearchInput, { SearchInputProps } from './search-input';
import { useT } from '../../../../contexts/translations';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

interface CustomerSelectProps {
	onSelectCustomer: (customer: CustomerDocument) => void;
	autoFocus?: boolean;
	value?: CustomerDocument;
	onBlur?: () => void;
	size?: 'small' | 'normal';
	style?: SearchInputProps['style'];
	initialParams?: any;
	queryKey?: string;
	placeholder?: string;
	withGuest?: boolean;
}

/**
 *
 */
const CustomerSelect = ({
	onSelectCustomer,
	autoFocus = false,
	value,
	onBlur = () => {},
	size = 'normal',
	style,
	initialParams,
	queryKey = 'select',
	placeholder,
	withGuest,
}: CustomerSelectProps) => {
	const [opened, setOpened] = React.useState(false);
	const t = useT();

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
		(search) => {
			query.debouncedSearch(search);
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
		<Popover
			opened={opened}
			onClose={() => {
				/**
				 * If popover closes, go back to selected customer
				 */
				onSelectCustomer(value);
				setOpened(false);
			}}
			withArrow={false}
			matchWidth
			withinPortal={false}
		>
			<Popover.Target>
				<SearchInput
					placeholder={placeholder ? placeholder : t('Search Customers', { _tags: 'core' })}
					onSearch={onSearch}
					autoFocus={autoFocus}
					setOpened={setOpened}
					opened={opened}
					selectedCustomer={value}
					onBlur={onBlur}
					size={size}
					style={style}
				/>
			</Popover.Target>
			<Popover.Content style={{ paddingLeft: 0, paddingRight: 0, maxHeight: 300 }}>
				<Menu query={query} onChange={onSelectCustomer} withGuest={withGuest} />
			</Popover.Content>
		</Popover>
	);
};

export default CustomerSelect;

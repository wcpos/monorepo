import * as React from 'react';

import Popover from '@wcpos/components/src/popover';

import Menu from './menu';
import SearchInput from './search-input';
import { useQuery } from '../../hooks/use-query';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

interface CustomerSelectProps {
	onSelectCustomer: (customer: CustomerDocument) => void;
	autoFocus?: boolean;
	value?: CustomerDocument;
	onBlur?: () => void;
	size?: 'small' | 'normal';
	style?: React.CSSProperties;
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
}: CustomerSelectProps) => {
	const [opened, setOpened] = React.useState(false);

	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['customers', 'select'],
		collectionName: 'customers',
		initialQuery: {
			sortBy: 'last_name',
			sortDirection: 'asc',
		},
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
					// placeholder={placeholder}
					onSearch={onSearch}
					autoFocus={autoFocus}
					setOpened={setOpened}
					selectedCustomer={value}
					onBlur={onBlur}
					size={size}
					style={style}
				/>
			</Popover.Target>
			<Popover.Content style={{ paddingLeft: 0, paddingRight: 0, maxHeight: 300 }}>
				<Menu query={query} onChange={onSelectCustomer} />
			</Popover.Content>
		</Popover>
	);
};

export default CustomerSelect;

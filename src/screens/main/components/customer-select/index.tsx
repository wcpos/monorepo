import * as React from 'react';

import { useObservableState, useObservableSuspense } from 'observable-hooks';

import Popover from '@wcpos/components/src/popover';

import CustomerQueryWrapper from './query-wrapper';
import SearchInput from './search-input';
import { useStoreStateManager } from '../../contexts/store-state-manager';

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
	const manager = useStoreStateManager();

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(search) => {
			const query = manager.getQuery(['customers', 'select']);
			query.debouncedSearch(search);
		},
		[manager]
	);

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
				onSearch('');
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
				<CustomerQueryWrapper onChange={onSelectCustomer} />
			</Popover.Content>
		</Popover>
	);
};

export default CustomerSelect;

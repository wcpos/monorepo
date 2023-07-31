import * as React from 'react';

import Popover from '@wcpos/components/src/popover';

import CustomerQueryWrapper from './query-wrapper';
import SearchInput from './search-input';
import { useStoreStateManager } from '../../../../contexts/store-state-manager';

/**
 *
 */
const CustomerSelect = ({ onSelectCustomer, autoFocus = false, value }) => {
	const [opened, setOpened] = React.useState(false);
	const [selectedCustomer, setSelectedCustomer] = React.useState({ id: 0 });
	const manager = useStoreStateManager();

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(search) => {
			const query = manager.getQuery(['customers']);
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
				onSelectCustomer(selectedCustomer);
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
					selectedCustomer={selectedCustomer}
				/>
			</Popover.Target>
			<Popover.Content style={{ paddingLeft: 0, paddingRight: 0, maxHeight: 300 }}>
				<CustomerQueryWrapper onChange={onSelectCustomer} />
			</Popover.Content>
		</Popover>
	);
};

export default CustomerSelect;

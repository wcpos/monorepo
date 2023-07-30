import * as React from 'react';

import Popover from '@wcpos/components/src/popover';
import Suspense from '@wcpos/components/src/suspense';
import log from '@wcpos/utils/src/logger';

import CustomerQueryWrapper from './query-wrapper';
import SearchInput from './search-input';
import { useStoreStateManager } from '../../../../contexts/store-state-manager';
import { t } from '../../../../lib/translations';
import { Query } from '../../contexts/query';
import usePullDocument from '../../contexts/use-pull-document';
import useCollection from '../../hooks/use-collection';

/**
 *
 */
const CustomerSelect = ({ onSelectCustomer, autoFocus = false, value }) => {
	const [opened, setOpened] = React.useState(false);
	const [selectedCustomer, setSelectedCustomer] = React.useState({ id: 0 });
	const pullDocument = usePullDocument();
	const { collection } = useCollection('customers');
	const manager = useStoreStateManager();

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(search) => {
			debugger;
			const query = manager.getQuery(['customers']);
			query.debouncedSearch(search);
		},
		[manager]
	);

	// /**
	//  * HACK: get the selected customer from value and set it as selectedCustomer
	//  */
	// React.useEffect(() => {
	// 	async function getCustomer() {
	// 		try {
	// 			let selectedCustomer = await collection.findOneFix({ selector: { id: value } }).exec();
	// 			if (!selectedCustomer && value !== 0) {
	// 				selectedCustomer = await pullDocument(value, collection);
	// 			}
	// 			if (selectedCustomer) {
	// 				setSelectedCustomer(selectedCustomer);
	// 			}
	// 		} catch (error) {
	// 			log.error(error);
	// 		}
	// 	}

	// 	if (value) {
	// 		getCustomer();
	// 	}
	// }, [collection, pullDocument, value]);

	/**
	 *
	 */
	return (
		<Popover
			opened={opened}
			//onOpen={() => setOpened(true)}
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

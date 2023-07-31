import * as React from 'react';

import Popover from '@wcpos/components/src/popover';
import Suspense from '@wcpos/components/src/suspense';
import log from '@wcpos/utils/src/logger';

import CustomerSelectMenu from './menu';
import SearchInput from './search-input';

/**
 *
 */
const CustomerSelectSearch = ({ onSelectCustomer, autoFocus = false, value }) => {
	const [opened, setOpened] = React.useState(false);
	const [selectedCustomer, setSelectedCustomer] = React.useState({ id: 0 });

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
					autoFocus={autoFocus}
					setOpened={setOpened}
					selectedCustomer={selectedCustomer}
				/>
			</Popover.Target>
			<Popover.Content style={{ paddingLeft: 0, paddingRight: 0, maxHeight: 300 }}>
				<CustomerSelectMenu onChange={onSelectCustomer} />
			</Popover.Content>
		</Popover>
	);
};

export default CustomerSelectSearch;
